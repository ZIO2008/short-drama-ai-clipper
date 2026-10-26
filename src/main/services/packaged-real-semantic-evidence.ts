import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { migrateDatabase } from '../db/migrate.js'
import { resolveMediaBinary, runMediaProcess } from '../media/ffmpeg-runner.js'
import { fingerprintMediaSource } from '../media/media-source-fingerprint.js'
import { probeMedia } from '../media/media-probe.js'
import { SecretService } from '../security/secret-service.js'
import { DeepSeekConfigurationTestService } from './deepseek-configuration-test-service.js'
import { OpenAiCompatibleClipSemanticAdapter } from './openai-compatible-clip-semantic-adapter.js'
import { OriginalClipService } from './original-clip-service.js'
import { ProviderProfileService } from './provider-profile-service.js'
import { DefaultAsrSubtitleService } from './default-asr-subtitle-service.js'
import { LocalOcrSubtitleService, resolveLocalOcrPython, resolveTemporalOcrRunner } from './local-ocr-subtitle-service.js'
import { SubtitleEvidenceService } from './subtitle-evidence-service.js'
import { assertFrozenBaselineManifest, resolveFrozenMediaPath } from './packaged-real-asr-evidence-guard.js'
import { TaskCenterService } from '../tasks/task-center-service.js'
import { assertHiddenAcceptanceUnused, readSealedPhase29AcceptanceLedger } from './phase29-acceptance-matrix.js'

type Sample = { id: string; relativePath: string; sha256: string; sceneCards: string[] }
type Manifest = { mediaRoot: string; publicDevelopmentSet: Sample[]; hiddenAcceptanceSet: Sample[] }
type Profile = { id: string; capability: string; region: string; provider: string; endpoint: string | null; model: string | null; secretRef: string | null; timeoutMs: number | null; pricing: string | null }
type Secret = { id: string; encryptedValue: Buffer; createdAt: string; updatedAt: string }

export type PackagedRealSemanticEvidenceSummary = {
  sampleId: string
  mediaSha256: string
  ocrCueCount: number
  asrCueCount: number
  packageStatus: 'ready'
  generationStatus: 'reviewing'
  candidateCount: number
  qualifiedCount: number
  qualifiedWithLimitCount: number
  blockedCount: number
  sourceDatabaseWrites: 0
  e2e?: { candidateConfirmed: true; exportStatus: 'completed'; materialLinked: true; reportItemCount: number; sourceShaUnchanged: true }
}

export type PackagedRealSemanticEvidenceFailureStage = 'setup' | 'ocr' | 'asr' | 'semantic-generation' | 'summary' | 'confirmation' | 'export' | 'report'

export type PackagedRealSemanticFailureCode = 'provider-authentication' | 'provider-insufficient-balance' | 'provider-address' | 'provider-model' | 'provider-rate-limit' | 'provider-server' | 'provider-network-or-timeout' | 'provider-response-invalid-schema' | 'provider-response-invalid-window' | 'provider-response-invalid-event-map' | 'provider-response-invalid-time-order' | 'provider-response-invalid-continuity' | 'provider-response-invalid-candidate-limit' | 'provider-response-invalid' | 'candidate-not-qualified' | 'export-media-process' | 'export-verification' | 'export-output' | 'task-state-invalid' | 'unknown'
export type FrozenSemanticQualificationCounts = { candidateCount: number; qualifiedCount: number; qualifiedWithLimitCount: number; blockedCount: number }

export class PackagedRealSemanticEvidenceError extends Error {
  constructor(readonly stage: PackagedRealSemanticEvidenceFailureStage, readonly code: PackagedRealSemanticFailureCode = 'unknown', readonly qualificationCounts?: FrozenSemanticQualificationCounts) {
    super(`isolated semantic evidence failed during ${stage}`)
  }
}

const allowedSamples = new Set(['dev-01', 'dev-02', 'hidden-01'])
const forbiddenOverrides = ['SHORTDRAMA_LOCAL_OCR_PYTHON', 'SHORTDRAMA_LOCAL_OCR_RUNNER', 'SHORTDRAMA_LOCAL_OCR_RUNNER_BINARY'] as const
const OCR_TIMEOUT_MS = 450_000
const GENERATION_TIMEOUT_MS = 720_000
const argument = (name: string): string | null => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]?.trim() || null }
const sha256 = async (path: string): Promise<string> => createHash('sha256').update(await readFile(path)).digest('hex')

export const packagedRealSemanticEvidenceResultPath = (): string | null => {
  const path = argument('--real-semantic-evidence-result')
  if (!path) return null
  if (!isAbsolute(path) || !path.toLowerCase().endsWith('.json')) throw new Error('真实文本语义验收结果必须写入一个绝对 .json 路径。')
  return resolve(path)
}

const runOcrWithinTimeout = async (command: string, args: readonly string[]) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS)
  try { return await runMediaProcess(command, args, { signal: controller.signal }) } finally { clearTimeout(timeout) }
}

const copyProfileAndSecret = (source: Database.Database, target: Database.Database, capability: 'asr' | 'text-analysis', provider: string): void => {
  const profile = source.prepare('SELECT id, capability, region, provider, endpoint, model, secret_ref AS secretRef, timeout_ms AS timeoutMs, pricing_json AS pricing FROM provider_profiles WHERE capability = ? AND provider = ? ORDER BY updated_at DESC LIMIT 1').get(capability, provider) as Profile | undefined
  if (!profile?.secretRef || !profile.endpoint || !profile.model) throw new Error(`当前 EXE 未保存可用的 ${provider} 配置。`)
  const secret = source.prepare('SELECT id, encrypted_value AS encryptedValue, created_at AS createdAt, updated_at AS updatedAt FROM secret_records WHERE id = ?').get(profile.secretRef) as Secret | undefined
  if (!secret) throw new Error(`当前 EXE 的 ${provider} 密钥引用不存在。`)
  // Verify decryptability only inside the same packaged application identity.
  new SecretService(source).readPlaintextForMainProcess(profile.secretRef)
  target.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(secret.id, secret.encryptedValue, secret.createdAt, secret.updatedAt)
  target.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(profile.id, profile.capability, profile.region, profile.provider, profile.endpoint, profile.model, profile.secretRef, profile.pricing, profile.timeoutMs, new Date().toISOString(), new Date().toISOString())
  new SecretService(target).readPlaintextForMainProcess(profile.secretRef)
}

const copyRequiredProfiles = (sourcePath: string, target: Database.Database): void => {
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true })
  try {
    copyProfileAndSecret(source, target, 'asr', '腾讯云 ASR')
    copyProfileAndSecret(source, target, 'text-analysis', 'DeepSeek API')
  } finally { source.close() }
}

export const packagedRealSemanticFailureCode = (reason: string): PackagedRealSemanticFailureCode => {
  if (/HTTP 401|HTTP 403|认证|密钥/i.test(reason)) return 'provider-authentication'
  if (/HTTP 429|限流|rate/i.test(reason)) return 'provider-rate-limit'
  if (/HTTP 5\d\d|服务端|server/i.test(reason)) return 'provider-server'
  if (/网络|超时|network|timeout/i.test(reason)) return 'provider-network-or-timeout'
  if (/接缝|连续性/i.test(reason)) return 'provider-response-invalid-continuity'
  if (/时间顺序|起止锚点|倒置|起止.*无效/i.test(reason)) return 'provider-response-invalid-time-order'
  if (/窗口外|当前证据包之外|不属于当前证据包|候选引用.*分析窗口/i.test(reason)) return 'provider-response-invalid-window'
  if (/叙事事件|事件地图|事件来源|核心单元|核心范围|冻结窗口/i.test(reason)) return 'provider-response-invalid-event-map'
  if (/超过本轮请求.*上限|候选.*上限/i.test(reason)) return 'provider-response-invalid-candidate-limit'
  if (/HTTP 404|模型|model/i.test(reason)) return 'provider-model'
  if (/结构化|无效|锚点/i.test(reason)) return 'provider-response-invalid'
  if (/资格|候选|证据不足|未纳入/i.test(reason)) return 'candidate-not-qualified'
  return 'unknown'
}

export const packagedRealExportFailureCode = (error: unknown): PackagedRealSemanticFailureCode => {
  const reason = error instanceof Error ? error.message : ''
  if (/边界|时长|duration|frame|PTS|验证/i.test(reason)) return 'export-verification'
  if (/FFmpeg|ffmpeg|编码|media process|process exited/i.test(reason)) return 'export-media-process'
  if (/成果|输出|output|material/i.test(reason)) return 'export-output'
  return 'task-state-invalid'
}

const assertDeepSeekProbe = async (profiles: ProviderProfileService, secrets: SecretService): Promise<void> => {
  const profile = profiles.list().find((item) => item.capability === 'text-analysis' && item.provider === 'DeepSeek API')
  if (!profile?.endpoint || !profile.model) throw new PackagedRealSemanticEvidenceError('setup', 'provider-model')
  const probe = await new DeepSeekConfigurationTestService(profiles, secrets).test({ capability: 'text-analysis', provider: 'DeepSeek API', endpoint: profile.endpoint, model: profile.model, timeoutSeconds: Math.max(1, Math.round((profile.timeoutMs ?? 60_000) / 1000)) })
  if (probe.status === 'success') return
  const code: Record<string, PackagedRealSemanticFailureCode> = {
    authentication: 'provider-authentication', 'insufficient-balance': 'provider-insufficient-balance', address: 'provider-address', model: 'provider-model', 'rate-limit': 'provider-rate-limit', server: 'provider-server', network: 'provider-network-or-timeout', timeout: 'provider-network-or-timeout', unexpected: 'provider-response-invalid', 'missing-key': 'provider-authentication', 'invalid-configuration': 'provider-address'
  }
  throw new PackagedRealSemanticEvidenceError('setup', code[probe.category] ?? 'unknown')
}

export const packagedSemanticValidationFailureCode = (value: unknown): PackagedRealSemanticFailureCode | null => value === 'schema' ? 'provider-response-invalid-schema' : value === 'window' ? 'provider-response-invalid-window' : value === 'event-map' ? 'provider-response-invalid-event-map' : value === 'time-order' ? 'provider-response-invalid-time-order' : value === 'continuity' ? 'provider-response-invalid-continuity' : value === 'candidate-limit' ? 'provider-response-invalid-candidate-limit' : null

export const assertFrozenSemanticQualification = (counts: FrozenSemanticQualificationCounts): void => {
  if (counts.candidateCount !== 1 || counts.qualifiedCount !== 0 || counts.qualifiedWithLimitCount !== 1 || counts.blockedCount !== 0) {
    throw new PackagedRealSemanticEvidenceError('summary', 'candidate-not-qualified', counts)
  }
}

export const assertProductionSemanticQualification = (counts: FrozenSemanticQualificationCounts): void => {
  if (counts.candidateCount !== 1 || counts.qualifiedCount + counts.qualifiedWithLimitCount !== 1 || counts.blockedCount !== 0) {
    throw new PackagedRealSemanticEvidenceError('summary', 'candidate-not-qualified', counts)
  }
}

const waitForGeneration = async (database: Database.Database, taskId: string): Promise<'reviewing'> => {
  const deadline = Date.now() + GENERATION_TIMEOUT_MS
  while (Date.now() < deadline) {
    const task = database.prepare('SELECT status, checkpoint FROM production_tasks WHERE id = ?').get(taskId) as { status: string; checkpoint: string | null } | undefined
    if (!task) throw new Error('真实文本语义验收任务未持久化。')
    if (task.status === 'reviewing') return 'reviewing'
    if (['failed', 'cancelled', 'interrupted'].includes(task.status)) {
      let reason = ''; let validationCode: unknown = null
      try { const checkpoint: unknown = JSON.parse(task.checkpoint ?? '{}'); reason = checkpoint && typeof checkpoint === 'object' && typeof (checkpoint as { reason?: unknown }).reason === 'string' ? (checkpoint as { reason: string }).reason : ''; validationCode = checkpoint && typeof checkpoint === 'object' ? (checkpoint as { semanticValidationCode?: unknown }).semanticValidationCode : null } catch { /* malformed checkpoint is a task-state failure */ }
      throw new PackagedRealSemanticEvidenceError('semantic-generation', task.status === 'failed' ? packagedSemanticValidationFailureCode(validationCode) ?? packagedRealSemanticFailureCode(reason) : 'task-state-invalid')
    }
    await new Promise<void>((done) => setTimeout(done, 250))
  }
  throw new PackagedRealSemanticEvidenceError('semantic-generation', 'provider-network-or-timeout')
}

/** Explicit packaged-only proof path; it never loads production candidates or writes production data. */
export const runPackagedRealSemanticEvidence = async (sampleId: string, options: { completeWorkflow?: boolean } = {}): Promise<PackagedRealSemanticEvidenceSummary> => {
  if (!allowedSamples.has(sampleId)) throw new Error('只允许 --real-semantic-evidence-sample dev-01、dev-02 或 hidden-01。')
  for (const variable of forbiddenOverrides) if (process.env[variable]) throw new Error(`${variable} 必须为空。`)
  const manifestPath = argument('--real-semantic-evidence-manifest')
  if (!manifestPath || !existsSync(resolve(manifestPath))) throw new Error('必须提供可读取的 --real-semantic-evidence-manifest。')
  const frozenManifestPath = resolve(manifestPath)
  const baselineManifestSha256 = await sha256(frozenManifestPath)
  assertFrozenBaselineManifest(baselineManifestSha256)
  const manifest = JSON.parse(await readFile(frozenManifestPath, 'utf8')) as Manifest
  const sample = [...manifest.publicDevelopmentSet, ...manifest.hiddenAcceptanceSet].find((item) => item.id === sampleId)
  if (!sample) throw new Error('指定样本不在 Baseline v1 冻结验收集。')
  if (sampleId.startsWith('hidden-')) {
    const ledgerPath = argument('--phase29-acceptance-ledger')
    if (!ledgerPath || !isAbsolute(ledgerPath) || !existsSync(resolve(ledgerPath))) throw new Error('隐藏样本必须提供绝对 --phase29-acceptance-ledger。')
    const entries = await readSealedPhase29AcceptanceLedger(resolve(ledgerPath), baselineManifestSha256, manifest)
    assertHiddenAcceptanceUnused(entries, sampleId)
  }
  const sourcePath = resolveFrozenMediaPath(manifest.mediaRoot, sample.relativePath)
  if (await sha256(sourcePath) !== sample.sha256.toLowerCase()) throw new Error('隔离媒体 SHA-256 不匹配，拒绝执行。')

  const root = await mkdtemp(join(tmpdir(), 'shortdrama-packaged-real-semantic-'))
  const previousPaddleCache = process.env.PADDLE_PDX_CACHE_HOME
  process.env.PADDLE_PDX_CACHE_HOME = join(root, 'paddle-cache')
  let database: Database.Database | null = null
  let stage: PackagedRealSemanticEvidenceFailureStage = 'setup'
  try {
    database = new Database(join(root, 'baseline.sqlite'))
    database.pragma('foreign_keys = ON')
    migrateDatabase(database)
    copyRequiredProfiles(join(app.getPath('userData'), 'data', 'material-studio.sqlite'), database)
    const fingerprint = fingerprintMediaSource(sourcePath)
    if (!fingerprint) throw new Error('隔离媒体指纹不可用。')
    const media = await probeMedia(sourcePath)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('baseline-drama', '内部真实文本语义验收', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(sample.id, 'baseline-drama', 1, 0, sourcePath, fingerprint, media.durationSeconds, 'ready', now, now)
    const evidence = new SubtitleEvidenceService(database)
    const profiles = new ProviderProfileService(database)
    const secrets = new SecretService(database)
    await assertDeepSeekProbe(profiles, secrets)
    stage = 'ocr'
    const ocr = new LocalOcrSubtitleService(database, evidence, resolveLocalOcrPython, { resolveFfmpeg: () => resolveMediaBinary('ffmpeg'), resolvePythonRunner: resolveTemporalOcrRunner, run: runOcrWithinTimeout, createTempDirectory: () => mkdtemp(join(root, 'ocr-')), removeTempDirectory: (path) => rm(path, { recursive: true, force: true }), writeJson: (path, value) => writeFile(path, `${JSON.stringify(value)}\n`, 'utf8'), readJson: async (path) => JSON.parse(await readFile(path, 'utf8')) as unknown })
    const ocrTrack = await ocr.extractFixedRegionIndependently({ dramaId: 'baseline-drama', episodeId: sample.id, language: 'chi_sim', regionMode: 'auto-region' })
    stage = 'asr'
    const asrTrack = await new DefaultAsrSubtitleService(database, evidence, profiles, secrets).extract({ dramaId: 'baseline-drama', episodeId: sample.id, language: 'zh-CN', mode: 'audio-first' })
    evidence.compareAsrAndOcr(asrTrack.id, ocrTrack.id)
    if (asrTrack.cost.resultFormat !== 3 || asrTrack.cost.sentenceMaxLength !== 40 || ocrTrack.cueCount < 1 || asrTrack.cueCount < 1) throw new Error('真实 OCR/ASR 输入未达到文本语义验收前提。')
    const service = new OriginalClipService(database, undefined, { profiles, hasValidSecret: (secretRef) => { try { return secrets.getStatus(secretRef).exists } catch { return false } }, adapter: new OpenAiCompatibleClipSemanticAdapter(secrets) })
    stage = 'semantic-generation'
    const started = service.startIntelligentGeneration('baseline-drama', { episodeIds: [sample.id], candidatesPerEpisode: 1, targetDurationSeconds: 12, maxOverlapRatio: 0.25, allowRepeat: false })
    if (started.status !== 'running') throw new Error('真实文本语义验收未获得供应商执行槽位。')
    const generationStatus = await waitForGeneration(database, started.taskId)
    const packageStatus = database.prepare('SELECT status FROM clip_evidence_packages WHERE drama_id = ? AND episode_id = ? ORDER BY version DESC LIMIT 1').get('baseline-drama', sample.id) as { status: string } | undefined
    if (packageStatus?.status !== 'ready') throw new Error('真实文本语义验收未生成 ready 证据包。')
    const qualifications = database.prepare('SELECT qualification, COUNT(*) AS count FROM clip_candidate_snapshots WHERE task_id = ? GROUP BY qualification').all(started.taskId) as Array<{ qualification: string; count: number }>
    const qualificationCount = (qualification: string): number => qualifications.find((item) => item.qualification === qualification)?.count ?? 0
    const candidateCount = database.prepare('SELECT COUNT(*) AS count FROM task_items WHERE task_id = ?').get(started.taskId) as { count: number }
    const qualifiedCount = qualificationCount('qualified')
    const qualifiedWithLimitCount = qualificationCount('qualified_with_limit')
    const blockedCount = qualificationCount('blocked')
    stage = 'summary'
    const qualificationCounts = { candidateCount: candidateCount.count, qualifiedCount, qualifiedWithLimitCount, blockedCount }
    if (options.completeWorkflow) assertProductionSemanticQualification(qualificationCounts)
    else assertFrozenSemanticQualification(qualificationCounts)
    let e2e: PackagedRealSemanticEvidenceSummary['e2e']
    if (options.completeWorkflow) {
      const candidate = service.listCandidates('baseline-drama')[0]
      if (!candidate) throw new PackagedRealSemanticEvidenceError('summary', 'candidate-not-qualified')
      stage = 'confirmation'
      service.confirmCandidate(candidate.id)
      stage = 'export'
      await service.exportCandidate(candidate.id, join(root, 'exports'))
      stage = 'report'
      const task = database.prepare('SELECT task_id AS taskId FROM task_items WHERE id = ?').get(candidate.id) as { taskId: string } | undefined
      const material = database.prepare('SELECT id FROM generated_materials WHERE task_item_id = ? ORDER BY created_at DESC LIMIT 1').get(candidate.id) as { id: string } | undefined
      const batch = service.getLatestExportBatch('baseline-drama')
      const materialLinked = Boolean(material && batch?.items.some((item) => item.candidateId === candidate.id && item.materialId === material.id))
      const reportItemCount = task ? new TaskCenterService(database).report(task.taskId).length : 0
      if (!materialLinked || batch?.status !== 'completed' || reportItemCount < 1 || await sha256(sourcePath) !== sample.sha256.toLowerCase()) throw new PackagedRealSemanticEvidenceError('summary', 'task-state-invalid')
      e2e = { candidateConfirmed: true, exportStatus: 'completed', materialLinked: true, reportItemCount, sourceShaUnchanged: true }
    }
    return { sampleId, mediaSha256: sample.sha256.toLowerCase(), ocrCueCount: ocrTrack.cueCount, asrCueCount: asrTrack.cueCount, packageStatus: 'ready', generationStatus, candidateCount: candidateCount.count, qualifiedCount, qualifiedWithLimitCount, blockedCount, sourceDatabaseWrites: 0, ...(e2e ? { e2e } : {}) }
  } catch (error) {
    if (error instanceof PackagedRealSemanticEvidenceError) throw error
    throw new PackagedRealSemanticEvidenceError(stage, stage === 'export' ? packagedRealExportFailureCode(error) : stage === 'confirmation' || stage === 'report' ? 'task-state-invalid' : 'unknown')
  } finally {
    try { database?.close() } finally {
      if (previousPaddleCache === undefined) delete process.env.PADDLE_PDX_CACHE_HOME
      else process.env.PADDLE_PDX_CACHE_HOME = previousPaddleCache
      await rm(root, { recursive: true, force: true })
      if (existsSync(root)) throw new Error('真实文本语义临时目录未清理。')
    }
  }
}
