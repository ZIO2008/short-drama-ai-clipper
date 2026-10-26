import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { app } from 'electron'
import { migrateDatabase } from '../db/migrate.js'
import { SecretService } from '../security/secret-service.js'
import { ModelStudioConfigurationTestService } from './model-studio-configuration-test-service.js'
import { ProviderProfileService } from './provider-profile-service.js'

type Profile = { id: string; capability: string; region: string; provider: string; endpoint: string | null; model: string | null; secretRef: string | null; timeoutMs: number | null; pricing: string | null }
type Secret = { id: string; encryptedValue: Buffer; createdAt: string; updatedAt: string }

export type PackagedRealMultimodalProbeSummary = { providerConfigured: true; elapsedMs: number; sourceDatabaseWrites: 0 }
export type PackagedRealMultimodalProbeFailureCode = 'missing-profile' | 'missing-key' | 'key-unreadable' | 'invalid-configuration' | 'authentication' | 'address' | 'no-compatible-model' | 'rate-limit' | 'server' | 'timeout' | 'network' | 'unexpected'
export type PackagedRealMultimodalProbeFailureSummary = { status: 'failed'; reason: 'isolated-multimodal-probe-failed'; code: PackagedRealMultimodalProbeFailureCode; elapsedMs: number; sourceDatabaseWrites: 0 }

export class PackagedRealMultimodalProbeError extends Error {
  constructor(readonly code: PackagedRealMultimodalProbeFailureCode) { super('isolated multimodal probe failed') }
}

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1]?.trim() || null
}

export const packagedRealMultimodalProbeResultPath = (): string | null => {
  const path = argument('--real-multimodal-probe-result')
  if (!path) return null
  if (!isAbsolute(path) || !path.toLowerCase().endsWith('.json')) throw new Error('真实视频复核连通性结果必须写入一个绝对 .json 路径。')
  return resolve(path)
}

export const packagedRealMultimodalProbeFailureSummary = (code: PackagedRealMultimodalProbeFailureCode, startedAt: number): PackagedRealMultimodalProbeFailureSummary => ({
  status: 'failed', reason: 'isolated-multimodal-probe-failed', code, elapsedMs: Math.max(0, Date.now() - startedAt), sourceDatabaseWrites: 0,
})

const copyMultimodalProfileAndSecret = (sourcePath: string, target: Database.Database): Profile => {
  if (!existsSync(sourcePath)) throw new PackagedRealMultimodalProbeError('missing-profile')
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true })
  try {
    const profile = source.prepare("SELECT id, capability, region, provider, endpoint, model, secret_ref AS secretRef, timeout_ms AS timeoutMs, pricing_json AS pricing FROM provider_profiles WHERE capability = 'multimodal-review' AND provider = '阿里云百炼 / Model Studio' ORDER BY updated_at DESC LIMIT 1").get() as Profile | undefined
    if (!profile?.endpoint || !profile.model || !profile.secretRef) throw new PackagedRealMultimodalProbeError('missing-profile')
    const secret = source.prepare('SELECT id, encrypted_value AS encryptedValue, created_at AS createdAt, updated_at AS updatedAt FROM secret_records WHERE id = ?').get(profile.secretRef) as Secret | undefined
    if (!secret) throw new PackagedRealMultimodalProbeError('missing-key')
    try { new SecretService(source).readPlaintextForMainProcess(profile.secretRef) } catch { throw new PackagedRealMultimodalProbeError('key-unreadable') }
    target.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(secret.id, secret.encryptedValue, secret.createdAt, secret.updatedAt)
    target.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(profile.id, profile.capability, profile.region, profile.provider, profile.endpoint, profile.model, profile.secretRef, profile.pricing, profile.timeoutMs, new Date().toISOString(), new Date().toISOString())
    try { new SecretService(target).readPlaintextForMainProcess(profile.secretRef) } catch { throw new PackagedRealMultimodalProbeError('key-unreadable') }
    return profile
  } finally { source.close() }
}

/** Packaged-identity connectivity proof. It never loads media or creates candidates. */
export const runPackagedRealMultimodalProbe = async (): Promise<PackagedRealMultimodalProbeSummary> => {
  const root = await mkdtemp(join(tmpdir(), 'shortdrama-packaged-real-multimodal-probe-'))
  let database: Database.Database | null = null
  try {
    database = new Database(join(root, 'probe.sqlite'))
    database.pragma('foreign_keys = ON')
    migrateDatabase(database)
    const profile = copyMultimodalProfileAndSecret(join(app.getPath('userData'), 'data', 'material-studio.sqlite'), database)
    const profiles = new ProviderProfileService(database)
    const secrets = new SecretService(database)
    const result = await new ModelStudioConfigurationTestService(profiles, secrets).test({ capability: 'multimodal-review', provider: '阿里云百炼 / Model Studio', endpoint: profile.endpoint, timeoutSeconds: Math.max(1, Math.round((profile.timeoutMs ?? 60_000) / 1_000)) })
    if (result.status !== 'success') throw new PackagedRealMultimodalProbeError(result.category === 'missing-key' ? 'key-unreadable' : result.category)
    return { providerConfigured: true, elapsedMs: result.elapsedMs, sourceDatabaseWrites: 0 }
  } finally {
    try { database?.close() } finally {
      await rm(root, { recursive: true, force: true })
      if (existsSync(root)) throw new Error('真实视频复核连通性临时目录未清理。')
    }
  }
}
