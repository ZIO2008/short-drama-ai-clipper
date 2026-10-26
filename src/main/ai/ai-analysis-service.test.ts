import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { AiAnalysisService } from './ai-analysis-service.js'

const databases: Database.Database[] = []
afterEach(() => { for (const database of databases.splice(0)) database.close() })

describe('AiAnalysisService', () => {
  it('creates a controlled, checkpointed remix task and one pending item', () => {
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database)
    const now = new Date().toISOString(); database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '测试剧', now, now)
    for (const episodeNo of [1, 2]) database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)').run(`episode-${episodeNo}`, 'drama', episodeNo, episodeNo, `episode-${episodeNo}.mp4`, 'ready', now, now)
    const { taskId } = new AiAnalysisService(database).create({ dramaId: 'drama', maxDrafts: 3, episodeStart: 1, episodeEnd: 2, durationMinSeconds: 30, durationMaxSeconds: 60 })
    expect(database.prepare('SELECT type, status, checkpoint, cost_json AS costJson FROM production_tasks WHERE id = ?').get(taskId)).toMatchObject({ type: 'ai_remix', status: 'pending' })
    expect(database.prepare('SELECT COUNT(*) AS count FROM task_items WHERE task_id = ?').get(taskId)).toEqual({ count: 1 })
  })

  it('rejects invalid ranges without creating a partial task', () => {
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database)
    const now = new Date().toISOString(); database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '测试剧', now, now)
    expect(() => new AiAnalysisService(database).create({ dramaId: 'drama', maxDrafts: 1, episodeStart: 2, episodeEnd: 1, durationMinSeconds: 60, durationMaxSeconds: 30 })).toThrow('分析范围')
    expect(database.prepare('SELECT COUNT(*) AS count FROM production_tasks').get()).toEqual({ count: 0 })
  })

  it('rejects a missing episode inside the requested range', () => {
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database)
    const now = new Date().toISOString(); database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '测试剧', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)').run('episode-1', 'drama', 1, 1, 'episode-1.mp4', 'ready', now, now)
    expect(() => new AiAnalysisService(database).create({ dramaId: 'drama', maxDrafts: 1, episodeStart: 1, episodeEnd: 2, durationMinSeconds: 30, durationMaxSeconds: 60 })).toThrow('连续')
  })

  it('snapshots configured price and blocks a request that exceeds its cost limit', () => {
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database)
    const now = new Date().toISOString(); database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '测试剧', now, now)
    for (const episodeNo of [1, 2]) database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)').run(`episode-${episodeNo}`, 'drama', episodeNo, episodeNo, `episode-${episodeNo}.mp4`, 'ready', now, now)
    database.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('provider', 'text-analysis', 'cn', 'test-provider', 'https://example.com', 'test', 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321', '{"perRequest":1.25}', 30000, now, now)
    expect(() => new AiAnalysisService(database).create({ dramaId: 'drama', maxDrafts: 1, episodeStart: 1, episodeEnd: 2, durationMinSeconds: 30, durationMaxSeconds: 60, costLimit: 1 })).toThrow('超过本次上限')
    const { taskId } = new AiAnalysisService(database).create({ dramaId: 'drama', maxDrafts: 1, episodeStart: 1, episodeEnd: 2, durationMinSeconds: 30, durationMaxSeconds: 60, costLimit: 2 })
    expect((database.prepare('SELECT cost_json AS costJson FROM production_tasks WHERE id = ?').get(taskId) as { costJson: string }).costJson).toContain('test-provider')
  })
})
