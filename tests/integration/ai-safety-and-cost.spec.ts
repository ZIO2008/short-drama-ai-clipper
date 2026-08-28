import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../src/main/db/migrate.js'
import { NarrationService } from '../../src/main/ai/narration-service.js'

const databases: Database.Database[] = []
afterEach(() => { for (const database of databases.splice(0)) database.close() })

const setup = (): { database: Database.Database; service: NarrationService } => {
  const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); databases.push(database); migrateDatabase(database)
  const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '安全验收剧', now, now)
  database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)').run('episode', 'drama', 1, 1, 'episode.mp4', 'ready', now, now)
  return { database, service: new NarrationService(database, 'unused-for-safety-tests') }
}

describe('P1/P2 AI safety and cost integration', () => {
  it('does not turn absent evidence into an unsupported narration asset', async () => {
    const { database, service } = setup()
    const { taskId } = service.create({ dramaId: 'drama', episodeStart: 1, episodeEnd: 1, mode: 'standard', durationMinSeconds: 30, durationMaxSeconds: 60, maxDrafts: 1, controlledMode: 'low-confidence' })
    await expect(service.run(taskId)).resolves.toMatchObject({ outcome: 'no-recommendation', segments: [] })
    expect(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'narration_assets'").get()).toEqual({ count: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM generated_materials').get()).toEqual({ count: 0 })
    expect(service.get(taskId).cost).toMatchObject({ mode: 'controlled', region: 'local', provider: 'controlled' })
  })

  it('rejects non-generic voice identifiers and blocks a cost-limit request before any task exists', () => {
    const { database, service } = setup(); const now = new Date().toISOString()
    database.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('tts', 'tts', 'cn', 'provider', 'https://example.com', 'general-mandarin', 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321', '{"perRequest":5}', 30_000, now, now)
    expect(() => service.create({ dramaId: 'drama', episodeStart: 1, episodeEnd: 1, mode: 'standard', durationMinSeconds: 30, durationMaxSeconds: 60, maxDrafts: 1, voice: 'celebrity-clone', costLimit: 10 })).toThrow()
    expect(() => service.create({ dramaId: 'drama', episodeStart: 1, episodeEnd: 1, mode: 'standard', durationMinSeconds: 30, durationMaxSeconds: 60, maxDrafts: 1, costLimit: 1 })).toThrow('超过本次上限')
    expect(database.prepare('SELECT COUNT(*) AS count FROM production_tasks').get()).toEqual({ count: 0 })
  })
})
