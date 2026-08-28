import Database from 'better-sqlite3'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { BackupService, shouldBackupBeforeUpgrade, shouldCreateDailyBackup } from './backup-service.js'

describe('BackupService', () => {
  it('creates an integrity-checked metadata backup, rotates to seven, and restores latest valid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'material-backup-'))
    const sourcePath = join(directory, 'source.sqlite')
    const targetPath = join(directory, 'restored.sqlite')
    const source = new Database(sourcePath)
    migrateDatabase(source)
    const now = new Date().toISOString()
    source.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('drama-1', 'Demo', now, now)
    source.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('episode-1', 'drama-1', 1, 0, 'D:\\private\\episode.mp4', 10, 'ready', now, now)
    source.prepare('INSERT INTO drama_import_preferences (drama_id, last_import_directory, updated_at) VALUES (?, ?, ?)').run('drama-1', 'D:\\private\\imports', now)
    source.prepare('INSERT INTO drama_covers (drama_id, source_kind, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('drama-1', 'uploaded', 'D:\\private\\cover.png', now, now)
    source.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('task-1', 'drama-1', 'original_clip', JSON.stringify({ outputDirectory: 'D:\\private\\exports', sourcePath: 'D:\\private\\episode.mp4' }), 'completed', 1, now, now)
    source.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('item-1', 'task-1', '{}', 'exported', now, now)
    source.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('material-1', 'drama-1', 'task-1', 'item-1', 'D:\\private\\exports\\clip.mp4', now, now)
    source.close()
    const service = new BackupService()
    try {
      for (let index = 0; index < 8; index += 1) await service.create(sourcePath, directory, `daily-${index}`)
      const backups = await readdir(directory)
      expect(backups.filter((file) => file.startsWith('material-studio-') && file.endsWith('.sqlite')).length).toBe(7)
      const latest = await service.findLatestValid(directory)
      expect(latest).not.toBeNull()
      const restored = await service.restoreLatestValid(directory, targetPath)
      expect(restored?.path).toBe(latest?.path)
      const restoredDb = new Database(targetPath, { readonly: true })
      expect((restoredDb.prepare('SELECT name FROM dramas WHERE id = ?').get('drama-1') as { name: string }).name).toBe('Demo')
      expect((restoredDb.prepare('SELECT source_path AS sourcePath FROM episodes WHERE id = ?').get('episode-1') as { sourcePath: string }).sourcePath).toBe('[redacted]')
      expect((restoredDb.prepare('SELECT path FROM generated_materials WHERE id = ?').get('material-1') as { path: string }).path).toBe('[redacted]')
      expect((restoredDb.prepare('SELECT config_snapshot AS configSnapshot FROM production_tasks WHERE id = ?').get('task-1') as { configSnapshot: string }).configSnapshot).not.toContain('D:\\private')
      restoredDb.close()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('provides daily and upgrade backup policy decisions', () => {
    expect(shouldCreateDailyBackup(null, new Date('2026-07-18T10:00:00Z'))).toBe(true)
    expect(shouldCreateDailyBackup('2026-07-18T08:00:00Z', new Date('2026-07-18T10:00:00Z'))).toBe(false)
    expect(shouldCreateDailyBackup('2026-07-17T00:00:00Z', new Date('2026-07-18T10:00:00Z'))).toBe(true)
    expect(shouldBackupBeforeUpgrade('1.0.0', '1.0.0')).toBe(false)
    expect(shouldBackupBeforeUpgrade('1.0.0', '1.0.1')).toBe(true)
  })
})
