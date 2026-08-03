import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
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
