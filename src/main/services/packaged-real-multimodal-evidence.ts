import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { migrateDatabase } from '../db/migrate.js'
import { fingerprintMediaSource } from '../media/media-source-fingerprint.js'
import { isSourceFramePtsRange, readSourceVideoFramePts } from '../media/scene-anchor-pts-verifier.js'
import { SecretService } from '../security/secret-service.js'
import { buildClipReviewQuestion, extractBoundedReviewFrames, ClipMultimodalReviewService } from './clip-multimodal-review-service.js'
import { ClipEvidencePackageService } from './clip-evidence-package-service.js'
import { buildClipVisualFactCode, readClipVisualFactStatement } from './clip-visual-review-fact.js'
import { OpenAiCompatibleClipMultimodalReviewAdapter } from './openai-compatible-clip-semantic-adapter.js'
import { assertFrozenBaselineManifest, resolveFrozenMediaPath } from './packaged-real-asr-evidence-guard.js'
import { assertFrozenCandidateScope, readFrozenMultimodalScope, seedFrozenMultimodalCandidate } from './phase29-multimodal-scope.js'
import { ProviderProfileService } from './provider-profile-service.js'

type Sample = { id: string; relativePath: string; sha256: string; sceneCards: string[] }
type Manifest = { mediaRoot: string; publicDevelopmentSet: Sample[] }
type Profile = { id: string; capability: string; region: string; provider: string; endpoint: string | null; model: string | null; secretRef: string | null; timeoutMs: number | null; pricing: string | null }
type Secret = { id: string; encryptedValue: Buffer; createdAt: string; updatedAt: string }

type FrozenReviewIdentity = { sampleId: string; packageId: string; candidateId: string; snapshotId: string; evidenceId: string; factCode: string; startSeconds: number; endSeconds: number }
type ProviderSnapshot = { provider: string; model: string | null; modelRunId: string }
type FrameFact = { ptsSeconds: number; sha256: string; byteLength: number }
export type PackagedRealMultimodalEvidenceSummary = (FrozenReviewIdentity & { frameCount: number; frameFacts: FrameFact[]; providerSnapshot: ProviderSnapshot; visualFactEvidenceId: string; conclusion: 'supported'; sourceDatabaseWrites: 0 }) | (FrozenReviewIdentity & { frameCount: number; frameFacts: FrameFact[]; providerSnapshot: ProviderSnapshot; conclusion: 'blocked'; providerConclusion: 'not-supported' | 'unclear'; sourceDatabaseWrites: 0 })
export type PackagedRealMultimodalEvidenceFailureCode = 'missing-profile' | 'missing-key' | 'key-unreadable' | 'invalid-media' | 'not-supported' | 'unexpected-supported' | 'invalid-result' | 'provider-authentication' | 'provider-rate-limit' | 'provider-server' | 'provider-timeout' | 'provider-network' | 'provider-request-rejected' | 'provider-failed' | 'unknown'
export type PackagedRealMultimodalEvidenceFailureSummary = { status: 'failed'; reason: 'isolated-multimodal-evidence-failed'; code: PackagedRealMultimodalEvidenceFailureCode; elapsedMs: number; sourceDatabaseWrites: 0 }

export class PackagedRealMultimodalEvidenceError extends Error {
  constructor(readonly code: PackagedRealMultimodalEvidenceFailureCode) { super('isolated multimodal evidence failed') }
}

const argument = (name: string): string | null => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]?.trim() || null }
const ALLOWED_TEMPORARY_MODEL = 'qwen3.7-plus'
export const packagedRealMultimodalModelOverride = (): string | null => {
  const model = argument('--real-multimodal-model')
  if (model && model !== ALLOWED_TEMPORARY_MODEL) throw new Error('临时视频复核模型只允许 qwen3.7-plus。')
  return model
}
const sha256 = async (path: string): Promise<string> => createHash('sha256').update(await readFile(path)).digest('hex')
export const readonlyConfigurationDatabasePath = (): string => {
  const sourceUserData = process.env.SHORTDRAMA_REAL_EVIDENCE_CONFIG_USER_DATA?.trim()
  const userData = sourceUserData ? (isAbsolute(sourceUserData) ? resolve(sourceUserData) : (() => { throw new Error('真实视频复核验收只读配置来源目录必须为绝对路径。') })()) : app.getPath('userData')
  return join(userData, 'data', 'material-studio.sqlite')
}

export const packagedRealMultimodalEvidenceResultPath = (): string | null => {
  const path = argument('--real-multimodal-evidence-result')
  if (!path) return null
  if (!isAbsolute(path) || !path.toLowerCase().endsWith('.json')) throw new Error('真实视频复核验收结果必须写入一个绝对 .json 路径。')
  return resolve(path)
}

export const packagedRealMultimodalEvidenceFailureSummary = (code: PackagedRealMultimodalEvidenceFailureCode, startedAt: number): PackagedRealMultimodalEvidenceFailureSummary => ({ status: 'failed', reason: 'isolated-multimodal-evidence-failed', code, elapsedMs: Math.max(0, Date.now() - startedAt), sourceDatabaseWrites: 0 })
export const packagedRealMultimodalEvidenceSuccessSummary = (identity: FrozenReviewIdentity, frameFacts: FrameFact[], providerSnapshot: ProviderSnapshot, visualFactEvidenceId: string): PackagedRealMultimodalEvidenceSummary => ({ ...identity, frameCount: frameFacts.length, frameFacts, providerSnapshot, visualFactEvidenceId, conclusion: 'supported', sourceDatabaseWrites: 0 })
export const packagedRealMultimodalEvidenceBlockedSummary = (identity: FrozenReviewIdentity, frameFacts: FrameFact[], providerSnapshot: ProviderSnapshot, providerConclusion: 'not-supported' | 'unclear'): PackagedRealMultimodalEvidenceSummary => ({ ...identity, frameCount: frameFacts.length, frameFacts, providerSnapshot, conclusion: 'blocked', providerConclusion, sourceDatabaseWrites: 0 })
export const packagedRealMultimodalEvidenceFailureCodeFor = (error: unknown): PackagedRealMultimodalEvidenceFailureCode => {
  const message = error instanceof Error ? error.message : ''
  const name = error instanceof Error ? error.name : ''
  if (/HTTP (401|403)/.test(message)) return 'provider-authentication'
  if (/HTTP 429/.test(message)) return 'provider-rate-limit'
  if (/HTTP 5\d\d/.test(message)) return 'provider-server'
  if (/HTTP 4\d\d/.test(message)) return 'provider-request-rejected'
  if (/timeout|超时/i.test(message) || name === 'AbortError' || name === 'TimeoutError') return 'provider-timeout'
  if (/network|fetch failed|网络/i.test(message)) return 'provider-network'
  if (/视频复核调用失败/.test(message)) return 'provider-failed'
  return 'unknown'
}

const copyProfileAndSecret = (sourcePath: string, target: Database.Database, modelOverride: string | null): void => {
  if (!existsSync(sourcePath)) throw new PackagedRealMultimodalEvidenceError('missing-profile')
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true })
  try {
    const profile = source.prepare("SELECT id, capability, region, provider, endpoint, model, secret_ref AS secretRef, timeout_ms AS timeoutMs, pricing_json AS pricing FROM provider_profiles WHERE capability = 'multimodal-review' AND provider = '阿里云百炼 / Model Studio' ORDER BY updated_at DESC LIMIT 1").get() as Profile | undefined
    if (!profile?.endpoint || !profile.model || !profile.secretRef) throw new PackagedRealMultimodalEvidenceError('missing-profile')
    const secret = source.prepare('SELECT id, encrypted_value AS encryptedValue, created_at AS createdAt, updated_at AS updatedAt FROM secret_records WHERE id = ?').get(profile.secretRef) as Secret | undefined
    if (!secret) throw new PackagedRealMultimodalEvidenceError('missing-key')
    try { new SecretService(source).readPlaintextForMainProcess(profile.secretRef) } catch { throw new PackagedRealMultimodalEvidenceError('key-unreadable') }
    target.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(secret.id, secret.encryptedValue, secret.createdAt, secret.updatedAt)
    target.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(profile.id, profile.capability, profile.region, profile.provider, profile.endpoint, modelOverride ?? profile.model, profile.secretRef, profile.pricing, profile.timeoutMs, new Date().toISOString(), new Date().toISOString())
    try { new SecretService(target).readPlaintextForMainProcess(profile.secretRef) } catch { throw new PackagedRealMultimodalEvidenceError('key-unreadable') }
  } finally { source.close() }
}

/** Explicit Phase 29 proof bound to a frozen package, candidate and scene unit. */
export const runPackagedRealMultimodalEvidence = async (sampleId: string): Promise<PackagedRealMultimodalEvidenceSummary> => {
  if (sampleId !== 'dev-03' && sampleId !== 'dev-04') throw new Error('只允许 --real-multimodal-evidence-sample dev-03 或 dev-04。')
  const modelOverride = packagedRealMultimodalModelOverride()
  const manifestPath = argument('--real-multimodal-evidence-manifest')
  if (!manifestPath || !isAbsolute(manifestPath) || !existsSync(resolve(manifestPath))) throw new Error('必须提供可读取的绝对 --real-multimodal-evidence-manifest。')
  const frozenManifestPath = resolve(manifestPath)
  const baselineManifestSha256 = (await sha256(frozenManifestPath)).toUpperCase()
  assertFrozenBaselineManifest(baselineManifestSha256)
  const manifest = JSON.parse(await readFile(frozenManifestPath, 'utf8')) as Manifest
  const sample = manifest.publicDevelopmentSet.find((item) => item.id === sampleId)
  if (!sample) throw new Error('指定样本不在 Baseline v1 公开开发集。')
  const scopeManifestPath = argument('--real-multimodal-scope-manifest')
  if (!scopeManifestPath || !isAbsolute(scopeManifestPath) || !existsSync(resolve(scopeManifestPath))) throw new Error('必须提供可读取的绝对 --real-multimodal-scope-manifest。')
  const scope = await readFrozenMultimodalScope(resolve(scopeManifestPath), baselineManifestSha256, sample)
  const sourcePath = resolveFrozenMediaPath(manifest.mediaRoot, sample.relativePath)
  if (await sha256(sourcePath) !== sample.sha256.toLowerCase()) throw new Error('隔离媒体 SHA-256 不匹配，拒绝执行。')
  const pts = readSourceVideoFramePts(sourcePath)
  if (!pts || !isSourceFramePtsRange(pts, scope.startSeconds, scope.endSeconds)) throw new PackagedRealMultimodalEvidenceError('invalid-media')
  const sourceFingerprint = fingerprintMediaSource(sourcePath)
  if (!sourceFingerprint) throw new PackagedRealMultimodalEvidenceError('invalid-media')
  const root = await mkdtemp(join(tmpdir(), 'shortdrama-packaged-real-multimodal-evidence-'))
  let database: Database.Database | null = null
  try {
    database = new Database(join(root, 'evidence.sqlite')); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    copyProfileAndSecret(readonlyConfigurationDatabasePath(), database, modelOverride)
    const profiles = new ProviderProfileService(database); const secrets = new SecretService(database)
    const packageRecord = seedFrozenMultimodalCandidate(database, { scope, sourcePath, sourceFingerprint, durationSeconds: pts.timestamps.at(-1)! })
    assertFrozenCandidateScope(database, scope)
    const statement = readClipVisualFactStatement(database, packageRecord.id, [scope.evidenceId])
    if (!statement || statement !== scope.statement || buildClipVisualFactCode(packageRecord.id, [scope.evidenceId], statement) !== scope.factCode) throw new PackagedRealMultimodalEvidenceError('invalid-result')
    const frames = await extractBoundedReviewFrames(sourcePath, scope.startSeconds, scope.endSeconds)
    if (!frames.length || frames.length > 12) throw new PackagedRealMultimodalEvidenceError('invalid-media')
    const result = await new ClipMultimodalReviewService(profiles, (secretRef) => { try { return secrets.getStatus(secretRef).exists } catch { return false } }, new OpenAiCompatibleClipMultimodalReviewAdapter(secrets)).review({ package: packageRecord, factCode: scope.factCode, evidenceIds: [scope.evidenceId], claimKinds: scope.claimKinds, reviewQuestion: buildClipReviewQuestion(statement, scope.claimKinds), frames })
    const packages = new ClipEvidencePackageService(database)
    const modelRunId = packages.recordMultimodalRun({ taskId: scope.taskId, package: packageRecord, provider: result.profile, inputIds: [scope.evidenceId], result: result.result, status: 'completed' })
    const identity = { sampleId, packageId: scope.packageId, candidateId: scope.candidateId, snapshotId: scope.snapshotId, evidenceId: scope.evidenceId, factCode: scope.factCode, startSeconds: scope.startSeconds, endSeconds: scope.endSeconds }
    const frameFacts = frames.map(({ ptsSeconds, sha256: frameSha256, byteLength }) => ({ ptsSeconds, sha256: frameSha256, byteLength }))
    const providerSnapshot = { provider: result.profile.provider, model: result.profile.model, modelRunId }
    if (sampleId === 'dev-04') {
      if (result.result.conclusion !== 'supported') throw new PackagedRealMultimodalEvidenceError('not-supported')
      const visualFactEvidenceId = packages.recordSupportedVisualFact({ package: packageRecord, taskId: scope.taskId, modelRunId, evidenceIds: [scope.evidenceId], claimKinds: scope.claimKinds, ranges: [{ evidenceId: scope.evidenceId, startSeconds: scope.startSeconds, endSeconds: scope.endSeconds, role: 'core' }], frames: frameFacts, reason: statement })
      return packagedRealMultimodalEvidenceSuccessSummary(identity, frameFacts, providerSnapshot, visualFactEvidenceId)
    }
    if (result.result.conclusion === 'supported') throw new PackagedRealMultimodalEvidenceError('unexpected-supported')
    return packagedRealMultimodalEvidenceBlockedSummary(identity, frameFacts, providerSnapshot, result.result.conclusion)
  } catch (error) {
    if (error instanceof PackagedRealMultimodalEvidenceError) throw error
    if (error instanceof Error && /视频复核返回无效/.test(error.message)) throw new PackagedRealMultimodalEvidenceError('invalid-result')
    throw new PackagedRealMultimodalEvidenceError(packagedRealMultimodalEvidenceFailureCodeFor(error))
  } finally {
    try { database?.close() } finally { await rm(root, { recursive: true, force: true }); if (existsSync(root)) throw new Error('真实视频复核验收临时目录未清理。') }
  }
}
