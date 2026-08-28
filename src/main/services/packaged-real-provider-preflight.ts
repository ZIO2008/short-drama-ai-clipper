import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { migrateDatabase } from '../db/migrate.js'
import { SecretService } from '../security/secret-service.js'
import { DeepSeekConfigurationTestService } from './deepseek-configuration-test-service.js'
import { ModelStudioConfigurationTestService } from './model-studio-configuration-test-service.js'
import { ProviderProfileService } from './provider-profile-service.js'
import { TencentAsrConfigurationTestService } from './tencent-asr-configuration-test-service.js'

type CapabilityResult = { status: 'success'; elapsedMs: number } | { status: 'failure'; category: string; elapsedMs: number }
type Profile = { id: string; capability: string; region: string; provider: string; endpoint: string | null; model: string | null; secretRef: string | null; timeoutMs: number | null; pricing: string | null }
type Secret = { id: string; encryptedValue: Buffer; createdAt: string; updatedAt: string }

export type PackagedRealProviderPreflightSummary = {
  asr: CapabilityResult
  textAnalysis: CapabilityResult
  multimodalReview: CapabilityResult
  sourceDatabaseWrites: 0
}

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1]?.trim() || null
}

export const packagedRealProviderPreflightResultPath = (): string | null => {
  const path = argument('--real-provider-preflight-result')
  if (!path) return null
  if (!isAbsolute(path) || !path.toLowerCase().endsWith('.json')) throw new Error('真实供应商预检结果必须写入一个绝对 .json 路径。')
  return resolve(path)
}

const defaultSourceDatabasePath = (): string => {
  const override = process.env.SHORTDRAMA_REAL_EVIDENCE_CONFIG_USER_DATA?.trim()
  if (override && !isAbsolute(override)) throw new Error('真实供应商预检只读配置来源目录必须为绝对路径。')
  return join(override ? resolve(override) : app.getPath('userData'), 'data', 'material-studio.sqlite')
}

type PreflightRuntime = {
  sourceDatabasePath?: () => string
  createTempDirectory?: () => Promise<string>
  removeTempDirectory?: (path: string) => Promise<void>
  fetchImpl?: typeof fetch
}

const copyProfile = (source: Database.Database, target: Database.Database, capability: string, provider: string): Profile | null => {
  const profile = source.prepare('SELECT id, capability, region, provider, endpoint, model, secret_ref AS secretRef, timeout_ms AS timeoutMs, pricing_json AS pricing FROM provider_profiles WHERE capability = ? AND provider = ? ORDER BY updated_at DESC LIMIT 1').get(capability, provider) as Profile | undefined
  if (!profile?.endpoint || !profile.secretRef) return null
  const secret = source.prepare('SELECT id, encrypted_value AS encryptedValue, created_at AS createdAt, updated_at AS updatedAt FROM secret_records WHERE id = ?').get(profile.secretRef) as Secret | undefined
  if (!secret) return null
  try { new SecretService(source).readPlaintextForMainProcess(profile.secretRef) } catch { return null }
  target.prepare('INSERT OR IGNORE INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(secret.id, secret.encryptedValue, secret.createdAt, secret.updatedAt)
  target.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(profile.id, profile.capability, profile.region, profile.provider, profile.endpoint, profile.model, profile.secretRef, profile.pricing, profile.timeoutMs, new Date().toISOString(), new Date().toISOString())
  try { new SecretService(target).readPlaintextForMainProcess(profile.secretRef) } catch { return null }
  return profile
}

const failure = (category: string): CapabilityResult => ({ status: 'failure', category, elapsedMs: 0 })
const summarize = (result: { status: string; elapsedMs: number; category?: string }): CapabilityResult => result.status === 'success'
  ? { status: 'success', elapsedMs: result.elapsedMs }
  : { status: 'failure', category: result.category ?? 'unexpected', elapsedMs: result.elapsedMs }

/** Runs three no-media provider probes from a read-only production configuration source. */
export const runPackagedRealProviderPreflight = async (runtime: PreflightRuntime = {}): Promise<PackagedRealProviderPreflightSummary> => {
  const createTempDirectory = runtime.createTempDirectory ?? (() => mkdtemp(join(tmpdir(), 'shortdrama-packaged-provider-preflight-')))
  const root = await createTempDirectory()
  let source: Database.Database | null = null
  let target: Database.Database | null = null
  try {
    const sourcePath = (runtime.sourceDatabasePath ?? defaultSourceDatabasePath)()
    if (!existsSync(sourcePath)) return { asr: failure('missing-profile'), textAnalysis: failure('missing-profile'), multimodalReview: failure('missing-profile'), sourceDatabaseWrites: 0 }
    source = new Database(sourcePath, { readonly: true, fileMustExist: true })
    target = new Database(join(root, 'preflight.sqlite'))
    target.pragma('foreign_keys = ON')
    migrateDatabase(target)
    const asrProfile = copyProfile(source, target, 'asr', '腾讯云 ASR')
    const textProfile = copyProfile(source, target, 'text-analysis', 'DeepSeek API')
    const multimodalProfile = copyProfile(source, target, 'multimodal-review', '阿里云百炼 / Model Studio')
    const profiles = new ProviderProfileService(target)
    const secrets = new SecretService(target)
    const asr = asrProfile
      ? summarize(await new TencentAsrConfigurationTestService(profiles, secrets, runtime.fetchImpl).test({ capability: 'asr', provider: '腾讯云 ASR', endpoint: asrProfile.endpoint, timeoutSeconds: Math.max(1, Math.round((asrProfile.timeoutMs ?? 60_000) / 1_000)) }))
      : failure('missing-profile-or-key')
    const textAnalysis = textProfile?.model
      ? summarize(await new DeepSeekConfigurationTestService(profiles, secrets, runtime.fetchImpl).test({ capability: 'text-analysis', provider: 'DeepSeek API', endpoint: textProfile.endpoint, model: textProfile.model, timeoutSeconds: Math.max(1, Math.round((textProfile.timeoutMs ?? 60_000) / 1_000)) }))
      : failure('missing-profile-or-key')
    const multimodalReview = multimodalProfile
      ? summarize(await new ModelStudioConfigurationTestService(profiles, secrets, runtime.fetchImpl).test({ capability: 'multimodal-review', provider: '阿里云百炼 / Model Studio', endpoint: multimodalProfile.endpoint, timeoutSeconds: Math.max(1, Math.round((multimodalProfile.timeoutMs ?? 60_000) / 1_000)) }))
      : failure('missing-profile-or-key')
    return { asr, textAnalysis, multimodalReview, sourceDatabaseWrites: 0 }
  } finally {
    source?.close()
    target?.close()
    await (runtime.removeTempDirectory ?? ((path) => rm(path, { recursive: true, force: true })))(root)
    if (existsSync(root)) throw new Error('真实供应商预检临时目录未清理。')
  }
}
