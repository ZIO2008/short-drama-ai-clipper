import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { AssetHealthService } from './asset-health-service.js'

describe('AssetHealthService', () => {
  it('reports missing files, gaps and updates episode status', () => {
    const db = new Database(':memory:'); db.pragma('foreign_keys = ON'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'D', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('e1', 'd', 1, 0, 'missing.mp4', 'ready', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('e3', 'd', 3, 1, 'missing.mov', 'ready', now, now)
    const health = new AssetHealthService(db).inspect('d'); expect(health.missing).toHaveLength(2); expect(health.missingEpisodeNumbers).toEqual([2]); expect(db.prepare('SELECT status FROM episodes WHERE id = ?').get('e1')).toEqual({ status: 'missing' }); db.close()
  })
})
