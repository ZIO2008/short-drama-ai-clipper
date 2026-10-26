import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { migrateDatabase } from '../src/main/db/migrate.js'
import { resolveMediaBinary, runMediaProcess } from '../src/main/media/ffmpeg-runner.js'
import { fingerprintMediaSource } from '../src/main/media/media-source-fingerprint.js'
import { SecretService } from '../src/main/security/secret-service.js'
import { ClipEvidencePackageService } from '../src/main/services/clip-evidence-package-service.js'
import { DefaultAsrSubtitleService } from '../src/main/services/default-asr-subtitle-service.js'
import { LocalOcrSubtitleService } from '../src/main/services/local-ocr-subtitle-service.js'
import { ProviderProfileService } from '../src/main/services/provider-profile-service.js'
import { SubtitleEvidenceService } from '../src/main/services/subtitle-evidence-service.js'

const projectRoot = resolve(import.meta.dirname, '..')
const manifestPath = join(projectRoot, 'docs', 'clip-evidence-baseline', 'manifest.v1.json')
const defaultSourceDatabasePath = join(app.getPath('appData'), 'ShortDramaMaterialStudio', 'data', 'material-studio.sqlite')
const allowedSampleIds = new Set(['dev-01', 'dev-02'])
const pinnedRunnerPath = join(projectRoot, 'tools', 'local-ocr', 'temporal_ocr_runner.py')
const pinnedPythonPath = join(projectRoot, 'tools', 'local-ocr', '.venv', 'Scripts', 'python.exe')
const forbiddenOcrOverrides = ['SHORTDRAMA_LOCAL_OCR_PYTHON', 'SHORTDRAMA_LOCAL_OCR_RUNNER', 'SHORTDRAMA_LOCAL_OCR_RUNNER_BINARY'] as const

type BaselineSample = { id: string; relativePath: string; sha256: string }
type Manifest = { mediaRoot: string; publicDevelopmentSet: BaselineSample[] }
type StoredTencentProfile = { id: string; capability: string; region: string; provider: string; endpoint: string | null; model: string | null; secretRef: string; timeoutMs: number | null; pricing: string | null }
type StoredSecret = { id: string; encryptedValue: Buffer; createdAt: string; updatedAt: string }
type StoredTencentCredentials = { version: 1; provider: 'tencent-cloud-asr'; secretId: string; secretKey: string }

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

const sourceDatabasePath = (): string => {
  const explicit = argument('--source-database')?.trim()
  if (!explicit) return defaultSourceDatabasePath
  const resolved = resolve(explicit)
  if (!existsSync(resolved)) throw new Error('指定的凭据来源数据库不存在。')
  return resolved
}

const sha256 = async (path: string): Promise<string> => createHash('sha256').update(await readFile(path)).digest('hex')

const assertTencentCredentialShape = (database: Database.Database, secretRef: string, location: '来源库' | '隔离库'): void => {
  try {
    const value: unknown = JSON.parse(new SecretService(database).readPlaintextForMainProcess(secretRef))
    const credentials = value as Partial<StoredTencentCredentials>
    if (credentials.version === 1 && credentials.provider === 'tencent-cloud-asr' && typeof credentials.secretId === 'string' && credentials.secretId.trim() && typeof credentials.secretKey === 'string' && credentials.secretKey.trim()) return
  } catch { /* do not disclose credential details */ }
  throw new Error(`${location}中的腾讯云 ASR 凭据无法解密或不符合 SecretId + SecretKey 格式。`)
}

const readStoredTencentConfiguration = (path: string): { profile: StoredTencentProfile; secret: StoredSecret } => {
  const source = new Database(path, { readonly: true, fileMustExist: true })
  try {
    const profile = source.prepare("SELECT id, capability, region, provider, endpoint, model, secret_ref AS secretRef, timeout_ms AS timeoutMs, pricing_json AS pricing FROM provider_profiles WHERE capability = 'asr' AND provider = '腾讯云 ASR' ORDER BY updated_at DESC LIMIT 1").get() as StoredTencentProfile | undefined
    if (!profile?.secretRef) throw new Error('当前应用未保存可用的腾讯云 ASR 配置。')
    const secret = source.prepare('SELECT id, encrypted_value AS encryptedValue, created_at AS createdAt, updated_at AS updatedAt FROM secret_records WHERE id = ?').get(profile.secretRef) as StoredSecret | undefined
    if (!secret) throw new Error('当前应用的腾讯云 ASR 凭据记录不存在。')
    assertTencentCredentialShape(source, profile.secretRef, '来源库')
    return { profile, secret }
  } finally {
    source.close()
  }
}

const insertIsolatedTencentConfiguration = (database: Database.Database, configuration: { profile: StoredTencentProfile; secret: StoredSecret }): void => {
  const { profile, secret } = configuration
  database.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(secret.id, secret.encryptedValue, secret.createdAt, secret.updatedAt)
  database.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(profile.id, profile.capability, profile.region, profile.provider, profile.endpoint, profile.model, profile.secretRef, profile.pricing, profile.timeoutMs, new Date().toISOString(), new Date().toISOString())
}

const main = async (): Promise<void> => {
  const sampleId = argument('--sample')?.trim()
  if (!sampleId || !allowedSampleIds.has(sampleId)) throw new Error('Usage: --sample dev-01|dev-02')
  await app.whenReady()
  for (const variable of forbiddenOcrOverrides) if (process.env[variable]) throw new Error(`${variable} must be unset for the pinned real ASR evidence run`)
  if (!existsSync(pinnedPythonPath) || !existsSync(pinnedRunnerPath)) throw new Error('固定本地 OCR 运行时不存在。')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Manifest
  const sample = manifest.publicDevelopmentSet.find((entry) => entry.id === sampleId)
  if (!sample) throw new Error('请求的样本未登记在 Baseline v1。')
  const sourcePath = join(manifest.mediaRoot, sample.relativePath)
  if (await sha256(sourcePath) !== sample.sha256.toLowerCase()) throw new Error('隔离媒体 SHA-256 不匹配，拒绝调用云端 ASR。')
  const configuration = readStoredTencentConfiguration(sourceDatabasePath())
  const folder = await mkdtemp(join(tmpdir(), 'shortdrama-real-asr-evidence-'))
  const previousPaddleCache = process.env.PADDLE_PDX_CACHE_HOME
  process.env.PADDLE_PDX_CACHE_HOME = join(folder, 'paddle-cache')
  let database: Database.Database | null = null
  let closeFailure: unknown = null
  try {
    database = new Database(join(folder, 'baseline.sqlite'))
    database.pragma('foreign_keys = ON')
    migrateDatabase(database)
    insertIsolatedTencentConfiguration(database, configuration)
    assertTencentCredentialShape(database, configuration.profile.secretRef, '隔离库')
    const now = new Date().toISOString()
    const fingerprint = fingerprintMediaSource(sourcePath)
    if (!fingerprint) throw new Error('隔离媒体无法建立指纹。')
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('baseline-drama', '内部真实 ASR 验收', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)').run(sample.id, 'baseline-drama', 1, 0, sourcePath, fingerprint, 'ready', now, now)
    const evidence = new SubtitleEvidenceService(database)
    const ocr = new LocalOcrSubtitleService(database, evidence, () => pinnedPythonPath, {
      resolveFfmpeg: () => resolveMediaBinary('ffmpeg'), resolvePythonRunner: () => pinnedRunnerPath, run: runMediaProcess,
      createTempDirectory: () => mkdtemp(join(tmpdir(), 'shortdrama-ocr-')), removeTempDirectory: (path) => rm(path, { recursive: true, force: true }),
      writeJson: (path, value) => writeFile(path, `${JSON.stringify(value)}\n`, 'utf8'), readJson: async (path) => JSON.parse(await readFile(path, 'utf8')) as unknown
    })
    const ocrTrack = await ocr.extractFixedRegionIndependently({ dramaId: 'baseline-drama', episodeId: sample.id, language: 'chi_sim', regionMode: 'auto-region' })
    const asrTrack = await new DefaultAsrSubtitleService(database, evidence, new ProviderProfileService(database), new SecretService(database)).extract({ dramaId: 'baseline-drama', episodeId: sample.id, language: 'zh-CN', mode: 'audio-first' })
    const comparisons = evidence.getComparisonResults(asrTrack.id, ocrTrack.id)
    const packageRecord = new ClipEvidencePackageService(database).build('baseline-drama', sample.id)
    const quality = (asrTrack.cost.timeQuality ?? {}) as Record<string, unknown>
    const result = {
      sampleId,
      mediaSha256: sample.sha256.toLowerCase(),
      asr: { cueCount: asrTrack.cueCount, resultFormat: asrTrack.cost.resultFormat, sentenceMaxLength: asrTrack.cost.sentenceMaxLength, timeQuality: quality },
      ocr: { cueCount: ocrTrack.cueCount },
      comparison: { total: comparisons.length, same: comparisons.filter((item) => item.conclusion === 'same').length, different: comparisons.filter((item) => item.conclusion === 'different').length, needsReview: comparisons.filter((item) => item.conclusion === 'needs_review').length },
      evidencePackage: { status: packageRecord.status, reason: packageRecord.reason },
      isolation: {
        sourceDatabaseWrites: 0,
        subtitleTracks: (database.prepare('SELECT COUNT(*) AS count FROM subtitle_tracks').get() as { count: number }).count,
        productionTasks: (database.prepare('SELECT COUNT(*) AS count FROM production_tasks').get() as { count: number }).count,
        exports: (database.prepare('SELECT COUNT(*) AS count FROM clip_export_batches').get() as { count: number }).count
      }
    }
    if (asrTrack.cost.resultFormat !== 3 || asrTrack.cost.sentenceMaxLength !== 40) throw new Error('真实 ASR 未返回规定的 ResultFormat=3 / SentenceMaxLength=40 元数据。')
    if (ocrTrack.cueCount < 1 || asrTrack.cueCount < 1 || packageRecord.status !== 'ready') throw new Error('真实证据链未达到可用状态。')
    if (result.isolation.productionTasks !== 0 || result.isolation.exports !== 0) throw new Error('验收过程越过了任务或导出边界。')
    console.log(`REAL_ASR_EVIDENCE_OK ${JSON.stringify(result)}`)
  } finally {
    try { database?.close() } catch (cause) { closeFailure = cause }
    if (previousPaddleCache === undefined) delete process.env.PADDLE_PDX_CACHE_HOME
    else process.env.PADDLE_PDX_CACHE_HOME = previousPaddleCache
    await rm(folder, { recursive: true, force: true })
    if (existsSync(folder)) throw new Error('隔离 ASR 验收目录未被清理。')
    if (closeFailure) throw closeFailure
    app.quit()
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '真实 ASR 验收失败。')
  app.exit(1)
})
