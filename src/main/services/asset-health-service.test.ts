import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { AssetHealthService } from './asset-health-service.js'

describe('AssetHealthService', () => {
  it('reports missing files, gaps and updates episode status', () => {
    const db = new Database(':memory:'); db.pragma('foreign_keys = ON'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'D', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('e1', 'd', 1, 0, 'missing.mp4', 'ready', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('e3', 'd', 3, 1, 'missing.mov', 'ready', now, now)
    const health = new AssetHealthService(db).inspect('d'); expect(health.missing).toHaveLength(2); expect(health.missingEpisodeNumbers).toEqual([2]); expect(db.prepare('SELECT status FROM episodes WHERE id = ?').get('e1')).toEqual({ status: 'missing' }); db.close()
  })

  it('does not turn an existing probe failure into ready just because the file is readable', () => {
    const db = new Database(':memory:'); db.pragma('foreign_keys = ON'); migrateDatabase(db); const now = new Date().toISOString(); const folder = mkdtempSync(join(tmpdir(), 'asset-health-')); const corruptPath = join(folder, 'corrupt.mp4'); writeFileSync(corruptPath, 'not a real mp4')
    try {
      db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'D', now, now)
      db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('e1', 'd', 1, 0, corruptPath, 'probe_failed', now, now)
      const health = new AssetHealthService(db).inspect('d')
      expect(db.prepare('SELECT status FROM episodes WHERE id = ?').get('e1')).toEqual({ status: 'probe_failed' })
      expect(health.unreadable).toEqual([corruptPath])
      expect(health.issueCount).toBe(1)
    } finally {
      db.close()
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('keeps an unresolved episode number as a blocking, distinct health issue', () => {
    const db = new Database(':memory:'); db.pragma('foreign_keys = ON'); migrateDatabase(db); const now = new Date().toISOString(); const folder = mkdtempSync(join(tmpdir(), 'asset-health-number-')); const mediaPath = join(folder, 'episode.mp4'); writeFileSync(mediaPath, 'placeholder')
    try {
      db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'D', now, now)
      db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('e1', 'd', null, 0, mediaPath, 'needs_episode_number', now, now)
      const health = new AssetHealthService(db).inspect('d')
      expect(health.needsEpisodeNumber).toEqual([mediaPath]); expect(health.unreadable).toEqual([]); expect(health.issueCount).toBe(1)
      expect(db.prepare('SELECT status FROM episodes WHERE id = ?').get('e1')).toEqual({ status: 'needs_episode_number' })
    } finally { db.close(); rmSync(folder, { recursive: true, force: true }) }
  })
})
