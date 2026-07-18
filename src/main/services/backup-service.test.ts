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
    source.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('drama-1', 'Demo', new Date().toISOString(), new Date().toISOString())
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
