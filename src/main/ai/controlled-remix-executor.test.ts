import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { createControlledRemixExecutor } from './controlled-remix-executor.js'

describe('controlled remix executor', () => {
  it('stores only high-confidence evidence as draft plan', async () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString()
    db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', '测试', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)').run('episode-1', 'd', 1, 1, 'episode-1.mp4', 'ready', now, now)
    db.prepare('INSERT INTO production_tasks VALUES (?, ?, ?, ?, ?, 0, 1, NULL, ?, ?, ?)').run('t', 'd', 'ai_remix', JSON.stringify({ maxDrafts: 1, episodeStart: 1, episodeEnd: 1 }), 'pending', '{}', now, now)
    db.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, retry_count, reason, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 0, NULL, ?, ?)').run('i', 't', '{}', 'pending', now, now)
    db.prepare('INSERT INTO ai_evidence VALUES (?, ?, ?, ?, 1, 2, ?, ?, ?, ?, ?)').run('e', 'd', 'episode-1', 'scene', 0.9, '可信片段', '{}', now, now)
    const result = await createControlledRemixExecutor(db)({ id: 'i', taskId: 't', plannedRange: '{}', actualRange: null, status: 'pending', retryCount: 0, reason: null }, { signal: new AbortController().signal, attempt: 1, mode: 'background', checkpoint: null })
    expect(result?.status).toBe('succeeded'); expect(JSON.stringify(result?.checkpoint)).toContain('可信片段'); expect(db.prepare('SELECT COUNT(*) AS count FROM ai_drafts WHERE task_id = ?').get('t')).toEqual({ count: 1 }); db.close()
  })

  it('records no recommendation when there is no credible local evidence', async () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString()
    db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', '测试', now, now)
    db.prepare('INSERT INTO production_tasks VALUES (?, ?, ?, ?, ?, 0, 1, NULL, ?, ?, ?)').run('t', 'd', 'ai_remix', JSON.stringify({ maxDrafts: 3, episodeStart: 1, episodeEnd: 1 }), 'pending', '{}', now, now)
    db.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, retry_count, reason, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 0, NULL, ?, ?)').run('i', 't', '{}', 'pending', now, now)
    const result = await createControlledRemixExecutor(db)({ id: 'i', taskId: 't', plannedRange: '{}', actualRange: null, status: 'pending', retryCount: 0, reason: null }, { signal: new AbortController().signal, attempt: 1, mode: 'background', checkpoint: null })
    expect(JSON.stringify(result?.checkpoint)).toContain('[]')
    expect((db.prepare('SELECT checkpoint FROM production_tasks WHERE id = ?').get('t') as { checkpoint: string }).checkpoint).toContain('no-recommendation'); db.close()
  })

  it('keeps a low-confidence controlled provider result out of the draft list', async () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString()
    db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', '测试', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)').run('episode-1', 'd', 1, 1, 'episode-1.mp4', 'ready', now, now)
    db.prepare('INSERT INTO production_tasks VALUES (?, ?, ?, ?, ?, 0, 1, NULL, ?, ?, ?)').run('t', 'd', 'ai_remix', JSON.stringify({ maxDrafts: 1, episodeStart: 1, episodeEnd: 1, controlledMode: 'low-confidence' }), 'pending', '{}', now, now)
    db.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, retry_count, reason, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 0, NULL, ?, ?)').run('i', 't', '{}', 'pending', now, now)
    db.prepare('INSERT INTO ai_evidence VALUES (?, ?, ?, ?, 1, 40, ?, ?, ?, ?, ?)').run('e', 'd', 'episode-1', 'scene', 0.9, '可信片段', '{}', now, now)
    const result = await createControlledRemixExecutor(db)({ id: 'i', taskId: 't', plannedRange: '{}', actualRange: null, status: 'pending', retryCount: 0, reason: null }, { signal: new AbortController().signal, attempt: 1, mode: 'background', checkpoint: null })
    expect(result?.reason).toContain('置信度')
    expect(JSON.stringify(result?.checkpoint)).toContain('no-recommendation')
    db.close()
  })
})
