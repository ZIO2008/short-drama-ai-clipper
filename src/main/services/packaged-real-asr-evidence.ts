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
import { credentialValuesFromStoredValue } from '../../shared/provider-auth-schema.js'
import { anchorCandidateRanges, readAnchorReadiness } from './clip-anchor-readiness.js'
import { ClipEvidencePackageService } from './clip-evidence-package-service.js'
import { DefaultAsrSubtitleService } from './default-asr-subtitle-service.js'
import { LocalOcrSubtitleService, resolveLocalOcrPython, resolveTemporalOcrRunner } from './local-ocr-subtitle-service.js'
import { ProviderProfileService } from './provider-profile-service.js'
import { SubtitleEvidenceService } from './subtitle-evidence-service.js'
import { assertFrozenBaselineManifest, resolveFrozenMediaPath } from './packaged-real-asr-evidence-guard.js'

type Sample = { id: string; relativePath: string; sha256: string }
type Manifest = { mediaRoot: string; publicDevelopmentSet: Sample[] }
type Profile = { id: string; capability: string; region: string; provider: string; endpoint: string | null; model: string | null; secretRef: string; timeoutMs: number | null; pricing: string | null }
type Secret = { id: string; encryptedValue: Buffer; createdAt: string; updatedAt: string }
export type PackagedRealAsrEvidenceSummary = {
  sampleId: string
  mediaSha256: string
  ocrCueCount: number
  asrCueCount: number
  resultFormat: number
  sentenceMaxLength: number
  packageStatus: 'ready'
  semanticEventCount: number
  blockedConflictCount: number
  usableAnchorCount: number
  candidateRangeCount: number
  sourceDatabaseWrites: 0
}
export type PackagedRealAsrEvidenceFailureStage = 'setup' | 'media' | 'ocr' | 'asr' | 'evidence'
export type PackagedRealAsrEvidenceFailureSummary = { status: 'failed'; reason: 'isolated-asr-evidence-failed'; stage: PackagedRealAsrEvidenceFailureStage; sourceDatabaseWrites: 0 }
export class PackagedRealAsrEvidenceError extends Error {
  constructor(readonly stage: PackagedRealAsrEvidenceFailureStage) { super('isolated ASR evidence failed') }
}
export const packagedRealAsrEvidenceFailureSummary = (stage: PackagedRealAsrEvidenceFailureStage): PackagedRealAsrEvidenceFailureSummary => ({ status: 'failed', reason: 'isolated-asr-evidence-failed', stage, sourceDatabaseWrites: 0 })

const allowedSamples = new Set(['dev-01', 'dev-02'])
const forbiddenOverrides = ['SHORTDRAMA_LOCAL_OCR_PYTHON', 'SHORTDRAMA_LOCAL_OCR_RUNNER', 'SHORTDRAMA_LOCAL_OCR_RUNNER_BINARY'] as const
// The runner itself caps an isolated OCR pass at 420 seconds. Allow its
// bounded completion/error path plus cleanup instead of rejecting known long
// episodes before an OCR/ASR conflict can be evaluated.
const OCR_TIMEOUT_MS = 450_000
const argument = (name: string): string | null => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]?.trim() || null }
const sha256 = async (path: string): Promise<string> => createHash('sha256').update(await readFile(path)).digest('hex')

export const packagedRealAsrEvidenceResultPath = (): string | null => {
  const path = argument('--real-asr-evidence-result')
  if (!path) return null
  if (!isAbsolute(path) || !path.toLowerCase().endsWith('.json')) throw new Error('真实 ASR 验收结果必须写入一个绝对 .json 路径。')
  return resolve(path)
}

const runOcrWithinTimeout = async (command: string, args: readonly string[]) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS)
  try {
    return await runMediaProcess(command, args, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const assertCredentialShape = (database: Database.Database, secretRef: string, location: string): void => {
  try {
    const values = credentialValuesFromStoredValue(new SecretService(database).readPlaintextForMainProcess(secretRef), 'tencent-cloud-secret-pair')
    if (values?.secretId && values.secretKey) return
  } catch { /* Credential content must never be emitted. */ }
  throw new Error(`${location}中的腾讯云 ASR 凭据无法解密或不符合 SecretId + SecretKey 格式。`)
}

const copyTencentConfiguration = (sourcePath: string, target: Database.Database): void => {
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true })
  try {
    const profile = source.prepare("SELECT id, capability, region, provider, endpoint, model, secret_ref AS secretRef, timeout_ms AS timeoutMs, pricing_json AS pricing FROM provider_profiles WHERE capability = 'asr' AND provider = '腾讯云 ASR' ORDER BY updated_at DESC LIMIT 1").get() as Profile | undefined
    if (!profile?.secretRef) throw new Error('当前应用未保存腾讯云 ASR 默认方案。')
    const secret = source.prepare('SELECT id, encrypted_value AS encryptedValue, created_at AS createdAt, updated_at AS updatedAt FROM secret_records WHERE id = ?').get(profile.secretRef) as Secret | undefined
    if (!secret) throw new Error('当前应用的腾讯云 ASR 凭据记录不存在。')
    assertCredentialShape(source, profile.secretRef, '当前 EXE 数据库')
    target.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(secret.id, secret.encryptedValue, secret.createdAt, secret.updatedAt)
    target.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(profile.id, profile.capability, profile.region, profile.provider, profile.endpoint, profile.model, profile.secretRef, profile.pricing, profile.timeoutMs, new Date().toISOString(), new Date().toISOString())
    assertCredentialShape(target, profile.secretRef, '隔离数据库')
  } finally { source.close() }
}

export const runPackagedRealAsrEvidence = async (sampleId: string): Promise<PackagedRealAsrEvidenceSummary> => {
  if (!allowedSamples.has(sampleId)) throw new Error('只允许 --real-asr-evidence-sample dev-01 或 dev-02。')
  for (const variable of forbiddenOverrides) if (process.env[variable]) throw new Error(`${variable} 必须为空。`)
  const manifestPath = argument('--real-asr-evidence-manifest')
  if (!manifestPath || !existsSync(resolve(manifestPath))) throw new Error('必须提供可读取的 --real-asr-evidence-manifest。')
  const frozenManifestPath = resolve(manifestPath)
  assertFrozenBaselineManifest(await sha256(frozenManifestPath))
  const manifest = JSON.parse(await readFile(frozenManifestPath, 'utf8')) as Manifest
  const sample = manifest.publicDevelopmentSet.find((item) => item.id === sampleId)
  if (!sample) throw new Error('指定样本不在 Baseline v1 公开开发集中。')
  const sourcePath = resolveFrozenMediaPath(manifest.mediaRoot, sample.relativePath)
  if (await sha256(sourcePath) !== sample.sha256.toLowerCase()) throw new Error('隔离媒体 SHA-256 不匹配，拒绝执行。')
  const root = await mkdtemp(join(tmpdir(), 'shortdrama-packaged-real-asr-'))
  const previousPaddleCache = process.env.PADDLE_PDX_CACHE_HOME
  process.env.PADDLE_PDX_CACHE_HOME = join(root, 'paddle-cache')
  let database: Database.Database | null = null
  let stage: PackagedRealAsrEvidenceFailureStage = 'setup'
  try {
    database = new Database(join(root, 'baseline.sqlite'))
    database.pragma('foreign_keys = ON')
    migrateDatabase(database)
    copyTencentConfiguration(join(app.getPath('userData'), 'data', 'material-studio.sqlite'), database)
    stage = 'media'
    const fingerprint = fingerprintMediaSource(sourcePath)
    if (!fingerprint) throw new Error('隔离媒体指纹不可用。')
    const now = new Date().toISOString()
    const media = await probeMedia(sourcePath)
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('baseline-drama', '内部真实 ASR 验收', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(sample.id, 'baseline-drama', 1, 0, sourcePath, fingerprint, media.durationSeconds, 'ready', now, now)
    const evidence = new SubtitleEvidenceService(database)
    const ocr = new LocalOcrSubtitleService(database, evidence, resolveLocalOcrPython, { resolveFfmpeg: () => resolveMediaBinary('ffmpeg'), resolvePythonRunner: resolveTemporalOcrRunner, run: runOcrWithinTimeout, createTempDirectory: () => mkdtemp(join(root, 'ocr-')), removeTempDirectory: (path) => rm(path, { recursive: true, force: true }), writeJson: (path, value) => writeFile(path, `${JSON.stringify(value)}\n`, 'utf8'), readJson: async (path) => JSON.parse(await readFile(path, 'utf8')) as unknown })
    stage = 'ocr'
    const ocrTrack = await ocr.extractFixedRegionIndependently({ dramaId: 'baseline-drama', episodeId: sample.id, language: 'chi_sim', regionMode: 'auto-region' })
    stage = 'asr'
    const asrTrack = await new DefaultAsrSubtitleService(database, evidence, new ProviderProfileService(database), new SecretService(database)).extract({ dramaId: 'baseline-drama', episodeId: sample.id, language: 'zh-CN', mode: 'audio-first' })
    stage = 'evidence'
    evidence.compareAsrAndOcr(asrTrack.id, ocrTrack.id)
    const readiness = readAnchorReadiness(database, new Map(), 'baseline-drama', sample.id, media.durationSeconds)
    const semanticEventCount = (database.prepare('SELECT COUNT(*) AS count FROM subtitle_semantic_events WHERE drama_id = ? AND episode_id = ?').get('baseline-drama', sample.id) as { count: number }).count
    const blockedConflictCount = (database.prepare("SELECT COUNT(*) AS count FROM subtitle_semantic_events WHERE drama_id = ? AND episode_id = ? AND conclusion = 'time-conflict'").get('baseline-drama', sample.id) as { count: number }).count
    const usableAnchorCount = readiness.anchors.filter((anchor) => !anchor.blocksAutomaticCandidate).length
    const candidateRangeCount = anchorCandidateRanges(readiness.anchors, media.durationSeconds, 12).length
    const packageRecord = new ClipEvidencePackageService(database).build('baseline-drama', sample.id)
    if (asrTrack.cost.resultFormat !== 3 || asrTrack.cost.sentenceMaxLength !== 40 || ocrTrack.cueCount < 1 || asrTrack.cueCount < 1 || packageRecord.status !== 'ready') throw new Error('真实 ASR/OCR 证据链未达到验收条件。')
    return { sampleId, mediaSha256: sample.sha256.toLowerCase(), ocrCueCount: ocrTrack.cueCount, asrCueCount: asrTrack.cueCount, resultFormat: asrTrack.cost.resultFormat, sentenceMaxLength: asrTrack.cost.sentenceMaxLength, packageStatus: 'ready', semanticEventCount, blockedConflictCount, usableAnchorCount, candidateRangeCount, sourceDatabaseWrites: 0 }
  } catch (error) {
    if (error instanceof PackagedRealAsrEvidenceError) throw error
    throw new PackagedRealAsrEvidenceError(stage)
  } finally {
    try { database?.close() } finally {
      if (previousPaddleCache === undefined) delete process.env.PADDLE_PDX_CACHE_HOME
      else process.env.PADDLE_PDX_CACHE_HOME = previousPaddleCache
      await rm(root, { recursive: true, force: true })
      if (existsSync(root)) throw new Error('真实 ASR 临时目录未清理。')
    }
  }
}
