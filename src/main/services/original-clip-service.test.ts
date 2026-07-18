import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { OriginalClipService } from './original-clip-service.js'

describe('OriginalClipService', () => {
  it('creates and confirms a bounded candidate with traceable task item', () => {
    const db = new Database(':memory:'); db.pragma('foreign_keys = ON'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 10, 'ready', now, now)
    const service = new OriginalClipService(db); const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 }); expect(candidate.status).toBe('pending_review'); expect(service.confirmCandidate(candidate.id).status).toBe('confirmed'); expect(db.prepare('SELECT COUNT(*) AS count FROM production_tasks').get()).toEqual({ count: 1 }); db.close()
  })
  it('rejects ranges beyond known episode duration', () => { const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 2, 'ready', now, now); expect(() => new OriginalClipService(db).createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 })).toThrow('exceeds'); db.close() })
})
