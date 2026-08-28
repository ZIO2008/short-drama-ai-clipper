import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./secret-store.js', () => ({
  canStoreSecrets: () => true,
  encryptSecret: () => Buffer.from('mocked-encrypted-bytes', 'utf8')
}))

import { INITIAL_SCHEMA } from '../db/schema.js'
import { SecretService } from './secret-service.js'

const databases: Database.Database[] = []

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close()
  }
})

describe('SecretService', () => {
  it('stores encrypted bytes, returns only a mask, and deletes the reference', () => {
    const database = new Database(':memory:')
    databases.push(database)
    for (const statement of INITIAL_SCHEMA) {
      database.exec(statement)
    }
    const service = new SecretService(database)

    const result = service.save({ value: 'super-secret-value' })
    const record = database.prepare('SELECT encrypted_value FROM secret_records WHERE id = ?').get(result.secretRef) as { encrypted_value: Buffer }

    expect(result.maskedValue).toBe('••••••••••••••alue')
    expect(record.encrypted_value.toString('utf8')).toBe('mocked-encrypted-bytes')
    expect(record.encrypted_value.toString('utf8')).not.toContain('super-secret-value')
    expect(service.getStatus(result.secretRef)).toEqual({ exists: true, maskedValue: '已配置', secretRef: result.secretRef })

    service.delete(result.secretRef)
    expect(service.getStatus(result.secretRef).exists).toBe(false)
  })

  it('stores a schema-validated credential package as one encrypted record', () => {
    const database = new Database(':memory:')
    databases.push(database)
    for (const statement of INITIAL_SCHEMA) database.exec(statement)
    const service = new SecretService(database)

    const result = service.saveProviderCredential({ credential: { version: 1, schema: 'tencent-cloud-secret-pair', values: { secretId: 'id-value', secretKey: 'key-value' } } })

    expect(result.maskedValue).toBe('已配置')
    expect(database.prepare('SELECT encrypted_value FROM secret_records WHERE id = ?').get(result.secretRef)).toBeTruthy()
    expect(() => service.saveProviderCredential({ credential: { version: 1, schema: 'tencent-cloud-secret-pair', values: { secretId: 'id-value' } } })).toThrow()
  })

  it('removes an unclaimed expired Model Studio provisional secret in the main process', () => {
    const database = new Database(':memory:')
    databases.push(database)
    for (const statement of INITIAL_SCHEMA) database.exec(statement)
    const service = new SecretService(database)
    const result = service.saveModelStudioProvisional({ secretRef: 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321', value: 'provisional-secret', capability: 'multimodal-review', ownerId: 'window-1' })

    expect(database.prepare('SELECT secret_ref FROM model_studio_provisional_secrets WHERE secret_ref = ?').get(result.secretRef)).toBeTruthy()
    expect(service.cleanupExpiredModelStudioProvisionals(new Date(Date.now() + 61_000))).toBe(1)
    expect(service.getStatus(result.secretRef).exists).toBe(false)
  })

  it('never lets a renderer-supplied reference overwrite or delete a profile-owned secret', () => {
    const database = new Database(':memory:')
    databases.push(database)
    for (const statement of INITIAL_SCHEMA) database.exec(statement)
    const service = new SecretService(database)
    const secretRef = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    service.save({ secretRef, value: 'saved-model-studio-secret' })
    database.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)').run('profile-id', 'multimodal-review', 'cn', '阿里云百炼 / Model Studio', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen3.7-flash', secretRef, 60_000, '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z')

    expect(() => service.save({ secretRef, value: 'attacker-replacement' })).toThrow('不能覆盖已保存密钥')
    expect(() => service.saveModelStudioProvisional({ secretRef, value: 'attacker-replacement', capability: 'multimodal-review', ownerId: 'window-1' })).toThrow('不能覆盖已保存密钥')
    expect(() => service.delete(secretRef)).toThrow('不能删除')
    expect(service.getStatus(secretRef).exists).toBe(true)
    expect(database.prepare('SELECT secret_ref FROM model_studio_provisional_secrets WHERE secret_ref = ?').get(secretRef)).toBeUndefined()
    expect(service.canUseForModelStudioConfiguration(secretRef, 'multimodal-review', 'window-1')).toBe(true)
    expect(service.canUseForModelStudioConfiguration(secretRef, 'text-analysis', 'window-1')).toBe(false)
  })

  it('allows Model Studio discovery only for a new provisional reference or its own saved profile', () => {
    const database = new Database(':memory:')
    databases.push(database)
    for (const statement of INITIAL_SCHEMA) database.exec(statement)
    const service = new SecretService(database)
    const provisionalRef = 'e2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    const unrelatedRef = 'f2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    service.saveModelStudioProvisional({ secretRef: provisionalRef, value: 'new-model-studio-secret', capability: 'text-analysis', ownerId: 'window-1' })
    service.save({ secretRef: unrelatedRef, value: 'deepseek-secret' })
    database.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)').run('deepseek-profile', 'text-analysis', 'global', 'DeepSeek API', 'https://api.deepseek.com', 'deepseek-chat', unrelatedRef, 60_000, '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z')

    expect(service.canUseForModelStudioConfiguration(provisionalRef, 'text-analysis', 'window-1')).toBe(true)
    expect(service.canUseForModelStudioConfiguration(unrelatedRef, 'text-analysis', 'window-1')).toBe(false)
  })

  it('rejects provisional references from another capability, another window, or after expiry before reading a key', () => {
    const database = new Database(':memory:')
    databases.push(database)
    for (const statement of INITIAL_SCHEMA) database.exec(statement)
    const service = new SecretService(database)
    const provisionalRef = 'f2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    service.saveModelStudioProvisional({ secretRef: provisionalRef, value: 'new-model-studio-secret', capability: 'text-analysis', ownerId: 'window-1' })

    expect(service.canUseForModelStudioConfiguration(provisionalRef, 'multimodal-review', 'window-1')).toBe(false)
    expect(service.canUseForModelStudioConfiguration(provisionalRef, 'text-analysis', 'window-2')).toBe(false)
    database.prepare("UPDATE model_studio_provisional_secrets SET expires_at = '2000-01-01T00:00:00.000Z' WHERE secret_ref = ?").run(provisionalRef)
    expect(service.canUseForModelStudioConfiguration(provisionalRef, 'text-analysis', 'window-1')).toBe(false)
    expect(service.getStatus(provisionalRef).exists).toBe(false)
  })
})
