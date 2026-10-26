import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { SecretStatus } from '../../shared/contracts.js'
import { createProviderCredentialPackage, providerAuthSchemaForId, type ProviderCredentialPackage } from '../../shared/provider-auth-schema.js'
import { isModelStudioProvider } from '../../shared/provider-catalog.js'
import { canStoreSecrets, decryptSecret, encryptSecret } from './secret-store.js'

const secretInputSchema = z.object({
  secretRef: z.string().uuid().optional(),
  value: z.string().trim().min(1).max(4096)
})

const providerCredentialInputSchema = z.object({
  secretRef: z.string().uuid().optional(),
  credential: z.object({
    version: z.literal(1),
    schema: z.enum(['api-key', 'tencent-cloud-secret-pair']),
    values: z.record(z.string(), z.string().trim().min(1).max(4096))
  }).strict()
})

const secretReferenceSchema = z.string().uuid()
const modelStudioCapabilitySchema = z.enum(['asr', 'text-analysis', 'multimodal-review'])
const modelStudioProvisionalInputSchema = secretInputSchema.extend({
  capability: modelStudioCapabilitySchema,
  ownerId: z.string().trim().min(1).max(100)
})
const modelStudioProvisionalCredentialInputSchema = providerCredentialInputSchema.extend({
  capability: modelStudioCapabilitySchema,
  ownerId: z.string().trim().min(1).max(100)
})

export class SecretService {
  private readonly provisionalTimers = new Map<string, ReturnType<typeof setTimeout>>()
  constructor(private readonly database: Database.Database) {
    const now = Date.now()
    const pending = database.prepare('SELECT secret_ref AS secretRef, expires_at AS expiresAt FROM model_studio_provisional_secrets').all() as Array<{ secretRef: string; expiresAt: string }>
    for (const provisional of pending) this.scheduleProvisionalCleanup(provisional.secretRef, Math.max(0, Date.parse(provisional.expiresAt) - now))
  }

  save(input: unknown): SecretStatus {
    const { secretRef, value } = secretInputSchema.parse(input)
    const id = secretRef ?? randomUUID()
    const now = new Date().toISOString()
    const encryptedValue = encryptSecret(value)

    this.database.transaction(() => {
      this.assertSecretRefIsUnused(id)
      this.database.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (@id, @encryptedValue, @createdAt, @updatedAt)').run({ id, encryptedValue, createdAt: now, updatedAt: now })
    })()

    return { exists: true, maskedValue: maskSecret(value), secretRef: id }
  }

  saveProviderCredential(input: unknown): SecretStatus {
    const { secretRef, credential } = providerCredentialInputSchema.parse(input)
    const id = secretRef ?? randomUUID()
    const now = new Date().toISOString()
    const serialized = JSON.stringify(createProviderCredentialPackage(providerAuthSchemaForId(credential.schema), credential.values) satisfies ProviderCredentialPackage)

    this.database.transaction(() => {
      this.assertSecretRefIsUnused(id)
      this.database.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (@id, @encryptedValue, @createdAt, @updatedAt)').run({ id, encryptedValue: encryptSecret(serialized), createdAt: now, updatedAt: now })
    })()

    return { exists: true, maskedValue: '已配置', secretRef: id }
  }

  saveModelStudioProvisional(input: unknown): SecretStatus {
    const { secretRef, value, capability, ownerId } = modelStudioProvisionalInputSchema.parse(input)
    const id = secretRef ?? randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 60_000).toISOString()
    const encryptedValue = encryptSecret(value)
    this.database.transaction(() => {
      this.assertSecretRefIsUnused(id)
      this.database.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, encryptedValue, now.toISOString(), now.toISOString())
      this.database.prepare('INSERT INTO model_studio_provisional_secrets (secret_ref, capability, owner_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(id, capability, ownerId, expiresAt, now.toISOString())
    })()
    this.scheduleProvisionalCleanup(id, 60_000)
    return { exists: true, maskedValue: maskSecret(value), secretRef: id }
  }

  saveModelStudioProvisionalCredential(input: unknown): SecretStatus {
    const { secretRef, credential, capability, ownerId } = modelStudioProvisionalCredentialInputSchema.parse(input)
    const id = secretRef ?? randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 60_000).toISOString()
    const encryptedValue = encryptSecret(JSON.stringify(createProviderCredentialPackage(providerAuthSchemaForId(credential.schema), credential.values) satisfies ProviderCredentialPackage))
    this.database.transaction(() => {
      this.assertSecretRefIsUnused(id)
      this.database.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, encryptedValue, now.toISOString(), now.toISOString())
      this.database.prepare('INSERT INTO model_studio_provisional_secrets (secret_ref, capability, owner_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(id, capability, ownerId, expiresAt, now.toISOString())
    })()
    this.scheduleProvisionalCleanup(id, 60_000)
    return { exists: true, maskedValue: '已配置', secretRef: id }
  }

  cleanupExpiredModelStudioProvisionals(now = new Date()): number {
    const refs = this.database.prepare('SELECT secret_ref AS secretRef FROM model_studio_provisional_secrets WHERE expires_at <= ?').all(now.toISOString()) as Array<{ secretRef: string }>
    if (!refs.length) return 0
    this.database.transaction(() => {
      for (const { secretRef } of refs) {
        this.database.prepare('DELETE FROM model_studio_provisional_secrets WHERE secret_ref = ?').run(secretRef)
        this.database.prepare('DELETE FROM secret_records WHERE id = ? AND NOT EXISTS (SELECT 1 FROM provider_profiles WHERE secret_ref = ?)').run(secretRef, secretRef)
      }
    })()
    for (const { secretRef } of refs) this.clearProvisionalTimer(secretRef)
    return refs.length
  }

  getStatus(secretRef: unknown): SecretStatus {
    const id = secretReferenceSchema.parse(secretRef)
    const record = this.database.prepare('SELECT id FROM secret_records WHERE id = ?').get(id) as { id: string } | undefined

    return { exists: record !== undefined, maskedValue: record ? '已配置' : null, secretRef: id }
  }

  delete(secretRef: unknown): void {
    const id = secretReferenceSchema.parse(secretRef)
    this.database.transaction(() => {
      this.assertSecretRefIsNotProfileReferenced(id)
      this.database.prepare('DELETE FROM model_studio_provisional_secrets WHERE secret_ref = ?').run(id)
      this.database.prepare('DELETE FROM secret_records WHERE id = ?').run(id)
    })()
    this.clearProvisionalTimer(id)
  }

  canUseForModelStudioConfiguration(secretRef: unknown, capability: unknown, ownerId: unknown): boolean {
    const parsedRef = secretReferenceSchema.safeParse(secretRef)
    const parsedCapability = modelStudioCapabilitySchema.safeParse(capability)
    if (!parsedRef.success || !parsedCapability.success) return false
    const provisional = this.database.prepare('SELECT capability, owner_id AS ownerId, expires_at AS expiresAt FROM model_studio_provisional_secrets WHERE secret_ref = ?').get(parsedRef.data) as { capability: string | null; ownerId: string | null; expiresAt: string } | undefined
    if (provisional) {
      if (Date.parse(provisional.expiresAt) <= Date.now()) {
        this.cleanupExpiredModelStudioProvisionals()
        return false
      }
      return provisional.capability === parsedCapability.data && provisional.ownerId === ownerId
    }
    const profiles = this.database.prepare('SELECT provider FROM provider_profiles WHERE secret_ref = ? AND capability = ?').all(parsedRef.data, parsedCapability.data) as Array<{ provider: string }>
    return profiles.some((profile) => isModelStudioProvider(profile.provider))
  }

  // No IPC handler exposes this method. It is for narrowly scoped main-process
  // work that must use a saved secret without returning it to the renderer.
  readPlaintextForMainProcess(secretRef: unknown): string {
    const id = secretReferenceSchema.parse(secretRef)
    const record = this.database.prepare('SELECT encrypted_value AS encryptedValue FROM secret_records WHERE id = ?').get(id) as { encryptedValue: Buffer } | undefined
    if (!record) throw new Error('未找到已保存的密钥。')
    return decryptSecret(record.encryptedValue)
  }

  isAvailable(): boolean {
    return canStoreSecrets()
  }

  private scheduleProvisionalCleanup(secretRef: string, delayMs: number): void {
    this.clearProvisionalTimer(secretRef)
    this.provisionalTimers.set(secretRef, setTimeout(() => {
      this.provisionalTimers.delete(secretRef)
      this.cleanupExpiredModelStudioProvisionals()
    }, delayMs + 10))
  }

  private clearProvisionalTimer(secretRef: string): void {
    const timer = this.provisionalTimers.get(secretRef)
    if (timer) clearTimeout(timer)
    this.provisionalTimers.delete(secretRef)
  }

  private assertSecretRefIsUnused(secretRef: string): void {
    if (this.database.prepare('SELECT 1 FROM secret_records WHERE id = ?').get(secretRef)) throw new Error('该密钥引用已存在，不能覆盖已保存密钥。')
  }

  private assertSecretRefIsNotProfileReferenced(secretRef: string): void {
    if (this.database.prepare('SELECT 1 FROM provider_profiles WHERE secret_ref = ?').get(secretRef)) throw new Error('该密钥正在被已保存方案引用，不能删除。')
  }
}

const maskSecret = (secret: string): string => {
  const visibleSuffix = secret.slice(-4)
  return `${'•'.repeat(Math.max(4, secret.length - visibleSuffix.length))}${visibleSuffix}`
}
