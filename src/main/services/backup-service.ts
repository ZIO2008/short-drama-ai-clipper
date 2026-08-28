import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { sanitizePrivacyValue } from './privacy-sanitizer.js'

export type BackupSource = Database.Database | string
export type BackupInfo = { path: string; createdAt: string }

function safeReason(reason: string): string {
  const value = reason.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return value || 'manual'
}

function integrityCheck(path: string): boolean {
  const database = new Database(path, { readonly: true, fileMustExist: true })
  try {
    return database.pragma('integrity_check', { simple: true }) === 'ok'
  } finally {
    database.close()
  }
}

async function listBackupEntries(directory: string): Promise<Array<{ file: string; time: number }>> {
  const files = await readdir(directory).catch(() => [])
  const entries = await Promise.all(files.filter((file) => file.startsWith('material-studio-') && file.endsWith('.sqlite')).map(async (file) => {
    try {
      return { file, time: (await stat(join(directory, file))).mtimeMs }
    } catch {
      return null
    }
  }))
  return entries.filter((entry): entry is { file: string; time: number } => entry !== null)
}

export function shouldCreateDailyBackup(lastBackupAt: string | null, now = new Date()): boolean {
  if (!lastBackupAt) return true
  const last = new Date(lastBackupAt)
  if (Number.isNaN(last.getTime())) return true
  return new Date(last.getTime()).toDateString() !== now.toDateString()
}

export function shouldBackupBeforeUpgrade(lastVersion: string | null, currentVersion: string): boolean {
  return !lastVersion || lastVersion !== currentVersion
}

export class BackupService {
  async create(source: BackupSource, backupDirectory: string, reason: string, indexDatabase?: Database.Database): Promise<string> {
    await mkdir(backupDirectory, { recursive: true })
    const destination = join(backupDirectory, `material-studio-${Date.now()}-${randomUUID()}-${safeReason(reason)}.sqlite`)
    const temporary = `${destination}.partial`
    let opened: Database.Database | undefined
    try {
      const database = typeof source === 'string'
        ? (opened = new Database(source, { readonly: true, fileMustExist: true }))
        : source
      await database.backup(temporary)
      redactContent(temporary)
      if (!integrityCheck(temporary)) throw new Error('backup integrity check failed')
      await rename(temporary, destination)
      if (indexDatabase) {
        const now = new Date().toISOString()
        indexDatabase.prepare('INSERT INTO app_backups (id, path, reason, integrity_status, created_at, updated_at) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)').run(destination, reason, 'ok', now, now)
      }
      await this.rotate(backupDirectory, 7)
      return destination
    } finally {
      opened?.close()
      await rm(temporary, { force: true })
    }
  }

  async rotate(directory: string, keep = 7): Promise<void> {
    const entries = await listBackupEntries(directory)
    entries.sort((left, right) => right.time - left.time)
    await Promise.all(entries.slice(Math.max(keep, 0)).map(({ file }) => rm(join(directory, file), { force: true })))
  }

  async findLatestValid(directory: string): Promise<BackupInfo | null> {
    const entries = await listBackupEntries(directory)
    entries.sort((left, right) => right.time - left.time)
    for (const entry of entries) {
      const path = join(directory, entry.file)
      try {
        if (integrityCheck(path)) return { path, createdAt: new Date(entry.time).toISOString() }
      } catch {
        // Ignore corrupt or inaccessible candidates and continue with the next backup.
      }
    }
    return null
  }

  async restoreLatestValid(directory: string, targetPath: string): Promise<BackupInfo | null> {
    const latest = await this.findLatestValid(directory)
    if (!latest) return null
    await mkdir(dirname(targetPath), { recursive: true })
    const temporary = `${targetPath}.restore-partial`
    const source = new Database(latest.path, { readonly: true, fileMustExist: true })
    try {
      await source.backup(temporary)
      if (!integrityCheck(temporary)) throw new Error('restored database integrity check failed')
      await rm(targetPath, { force: true })
      await rename(temporary, targetPath)
      return latest
    } finally {
      source.close()
      await rm(temporary, { force: true })
    }
  }
}

/** Backups retain task/asset metadata but never retain user media paths or secret-bearing snapshots. */
function redactContent(path: string): void {
  const backup = new Database(path)
  try {
    backup.transaction(() => {
      backup.prepare("UPDATE episodes SET source_path = '[redacted]'").run()
      backup.prepare("UPDATE drama_import_preferences SET last_import_directory = '[redacted]'").run()
      backup.prepare("UPDATE drama_covers SET path = '[redacted]'").run()
      backup.prepare("UPDATE script_assets SET source_path = '[redacted]', extracted_text = NULL").run()
      backup.prepare("UPDATE script_asset_segments SET extracted_text = ''").run()
      backup.prepare("UPDATE subtitle_assets SET source_path = '[redacted]'").run()
      backup.prepare("UPDATE generated_materials SET path = '[redacted]'").run()
      backup.prepare("UPDATE app_backups SET path = '[redacted]'").run()
      const tasks = backup.prepare('SELECT id, config_snapshot AS configSnapshot FROM production_tasks').all() as Array<{ id: string; configSnapshot: string }>
      const updateTask = backup.prepare('UPDATE production_tasks SET config_snapshot = ? WHERE id = ?')
      for (const task of tasks) {
        try {
          const parsed: unknown = JSON.parse(task.configSnapshot)
          updateTask.run(JSON.stringify(sanitizePrivacyValue(parsed)), task.id)
        } catch {
          updateTask.run('[redacted]', task.id)
        }
      }
    })()
  } finally {
    backup.close()
  }
}
