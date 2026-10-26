import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { createModelStudioSelectionProof } from './model-studio-selection-proof.js'
import { ProviderProfileService } from './provider-profile-service.js'

describe('ProviderProfileService', () => {
  it('stores only validated opaque secret references and never a secret value', () => {
    const db = new Database(':memory:')
    migrateDatabase(db)
    const service = new ProviderProfileService(db)
    const secretRef = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    const id = service.save({ capability: 'asr', region: 'cn', provider: 'local', endpoint: 'https://example.com/api', model: 'model-v1', secretRef, timeoutMs: 30_000 })
    expect(service.list()[0]).toMatchObject({ id, secretRef, endpoint: 'https://example.com/api' })
    expect(JSON.stringify(db.prepare('SELECT * FROM provider_profiles').get())).not.toContain('plain-secret')
    expect(() => service.save({ capability: 'asr', region: 'cn', provider: 'local', secretRef: 'plain-secret' })).toThrow()
    expect(() => service.save({ capability: 'asr', region: 'cn', provider: 'local', endpoint: 'https://user:password@example.com' })).toThrow()
    db.close()
  })

  it('upserts one global default per capability and preserves an existing secret reference', () => {
    const db = new Database(':memory:')
    migrateDatabase(db)
    const service = new ProviderProfileService(db)
    const secretRef = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    const id = service.save({ capability: 'asr', region: 'local', provider: 'one', model: 'v1', secretRef })
    const sameId = service.save({ capability: 'asr', region: 'local', provider: 'two', model: 'v2' })
    expect(sameId).toBe(id)
    expect(service.list()).toHaveLength(1)
    expect(service.list()[0]).toMatchObject({ id, provider: 'two', model: 'v2', secretRef })
    db.close()
  })

  it('rejects a catalog model guidance value without replacing the existing profile or secret reference', () => {
    const db = new Database(':memory:')
    migrateDatabase(db)
    const service = new ProviderProfileService(db)
    const secretRef = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    expect(() => service.save({ capability: 'multimodal-review', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '请按开通模型填写', secretRef })).toThrow('模型仍是目录引导文案')
    expect(service.list()).toEqual([])
    db.close()
  })

  it('rejects a hand-entered Model Studio allowlist model without replacing the prior default', () => {
    const db = new Database(':memory:')
    migrateDatabase(db)
    const service = new ProviderProfileService(db)
    const secretRef = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    expect(() => service.save({ capability: 'text-analysis', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.7-flash', secretRef })).toThrow('必须由应用从已开通模型中自动选择')
    expect(service.list()).toEqual([])
    db.close()
  })

  it('rejects a hand-entered Model Studio ASR model without a consumed selection proof', () => {
    const db = new Database(':memory:')
    migrateDatabase(db)
    const service = new ProviderProfileService(db)
    const secretRef = 'e2719c5e-4a18-4f2a-9f8d-6d9877a4b321'

    expect(() => service.save({ capability: 'asr', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'paraformer-v2', secretRef })).toThrow('必须由应用从已开通模型中自动选择')
    expect(service.list()).toEqual([])
    db.close()
  })

  it('marks a proof-backed Model Studio ASR selection as automatic without changing its provisional secret', () => {
    const db = new Database(':memory:')
    migrateDatabase(db)
    const service = new ProviderProfileService(db)
    const secretRef = 'e2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    const now = new Date().toISOString()
    db.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(secretRef, Buffer.from('test'), now, now)
    db.prepare('INSERT INTO model_studio_provisional_secrets (secret_ref, capability, owner_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(secretRef, 'asr', 'window-1', new Date(Date.now() + 60_000).toISOString(), now)

    service.saveModelStudioSelection({ capability: 'asr', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'paraformer-v2', secretRef }, createModelStudioSelectionProof('paraformer-v2'))
    expect(service.list()).toEqual([expect.objectContaining({ capability: 'asr', model: 'paraformer-v2', modelSelectionSource: 'model-studio-automatic', secretRef })])
    expect(db.prepare('SELECT secret_ref FROM model_studio_provisional_secrets WHERE secret_ref = ?').get(secretRef)).toBeUndefined()
    db.close()
  })

  it('recognizes a zero-width Model Studio variant as protected and persists a verified selection canonically', () => {
    const db = new Database(':memory:')
    migrateDatabase(db)
    const service = new ProviderProfileService(db)
    const secretRef = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    const input = { capability: 'multimodal-review', region: 'cn', provider: '阿里云百炼 / Model Studio\u200B', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.7-flash', secretRef }

    expect(() => service.save(input)).toThrow('必须由应用从已开通模型中自动选择')
    const now = new Date().toISOString()
    db.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(secretRef, Buffer.from('test'), now, now)
    db.prepare('INSERT INTO model_studio_provisional_secrets (secret_ref, capability, owner_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(secretRef, 'multimodal-review', 'window-1', new Date(Date.now() + 60_000).toISOString(), now)
    service.saveModelStudioSelection(input, createModelStudioSelectionProof('qwen3.7-flash'))
    expect(service.list()).toEqual([expect.objectContaining({ provider: '阿里云百炼 / Model Studio', model: 'qwen3.7-flash', modelSelectionSource: 'model-studio-automatic', secretRef })])
    expect(db.prepare('SELECT secret_ref FROM model_studio_provisional_secrets WHERE secret_ref = ?').get(secretRef)).toBeUndefined()
    db.close()
  })

  it('keeps each capability default isolated from the other two capabilities', () => {
    const db = new Database(':memory:')
    migrateDatabase(db)
    const service = new ProviderProfileService(db)
    const asrSecret = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    const textSecret = 'af4e8d3f-f853-4f72-912d-531aa33319f0'
    const videoSecret = 'e5d0e2a3-0f75-4147-a057-665ca6689f41'
    service.save({ capability: 'asr', region: 'local', provider: 'ASR', endpoint: 'http://127.0.0.1:8080', secretRef: asrSecret })
    service.save({ capability: 'text-analysis', region: 'cn', provider: 'DeepSeek API', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', secretRef: textSecret, timeoutMs: 60_000 })
    service.save({ capability: 'multimodal-review', region: 'global', provider: 'Video API', endpoint: 'https://example.com/v1', model: 'vision', secretRef: videoSecret, timeoutMs: 90_000 })
    service.save({ capability: 'text-analysis', region: 'cn', provider: 'DeepSeek API', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat', timeoutMs: 30_000 })

    expect(service.list()).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'asr', provider: 'ASR', secretRef: asrSecret }),
      expect.objectContaining({ capability: 'text-analysis', endpoint: 'https://api.deepseek.com/v1', model: 'deepseek-chat', secretRef: textSecret, timeoutMs: 30_000 }),
      expect.objectContaining({ capability: 'multimodal-review', provider: 'Video API', secretRef: videoSecret, timeoutMs: 90_000 })
    ]))
    db.close()
  })

  it('normalizes legacy capability names when a user re-saves an existing profile', () => {
    const db = new Database(':memory:')
    migrateDatabase(db)
    const service = new ProviderProfileService(db)
    service.save({ capability: 'text_semantics', region: 'global', provider: 'Legacy name', endpoint: 'https://example.com', secretRef: 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321' })
    expect(service.list()).toEqual([expect.objectContaining({ capability: 'text-analysis' })])
    db.close()
  })

  it('rejects frozen P2 TTS profiles and hides legacy TTS records from the provider surface', () => {
    const db = new Database(':memory:')
    migrateDatabase(db)
    const service = new ProviderProfileService(db)
    expect(() => service.save({ capability: 'tts', region: 'cn', provider: 'Frozen TTS' })).toThrow()
    const now = new Date().toISOString()
    db.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'legacy-tts', 'tts', 'cn', 'Frozen TTS', null, null, null, null, null, now, now,
    )
    expect(service.list()).not.toEqual(expect.arrayContaining([expect.objectContaining({ capability: 'tts' })]))
    db.close()
  })
})
