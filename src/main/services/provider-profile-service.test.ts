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
    const id = service.save({ capability: '字幕', region: 'cn', provider: 'local', endpoint: 'https://example.com/api', model: 'model-v1', secretRef, timeoutMs: 30_000 })
    expect(service.list()[0]).toMatchObject({ id, secretRef, endpoint: 'https://example.com/api' })
    expect(JSON.stringify(db.prepare('SELECT * FROM provider_profiles').get())).not.toContain('plain-secret')
    expect(() => service.save({ capability: '字幕', region: 'cn', provider: 'local', secretRef: 'plain-secret' })).toThrow()
    expect(() => service.save({ capability: '字幕', region: 'cn', provider: 'local', endpoint: 'https://user:password@example.com' })).toThrow()
    db.close()
  })
})
