import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { INITIAL_SCHEMA } from './schema.js'

export const openDatabase = (databasePath: string): Database.Database => {
  mkdirSync(dirname(databasePath), { recursive: true })

  const database = new Database(databasePath)
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  migrateDatabase(database)
  return database
}

export const migrateDatabase = (database: Database.Database): void => {
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
  const apply = database.transaction(() => {
    if (!hasMigration(database, 1)) {
      applySchema(database)
      recordMigration(database, 1)
    }
    if (!hasMigration(database, 2)) {
      applySchema(database, true)
      recordMigration(database, 2)
    }
    if (!hasMigration(database, 3)) {
      addColumnIfMissing(database, 'production_tasks', 'cost_json', "TEXT NOT NULL DEFAULT '{}'")
      recordMigration(database, 3)
    }
    if (!hasMigration(database, 4)) {
      addColumnIfMissing(database, 'notifications', 'event_key', 'TEXT')
      database.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_event_key ON notifications (event_key)')
      recordMigration(database, 4)
    }
    if (!hasMigration(database, 5)) {
      addColumnIfMissing(database, 'notifications', 'occurred_at', 'TEXT')
      database.exec('UPDATE notifications SET occurred_at = COALESCE(occurred_at, updated_at, created_at)')
      recordMigration(database, 5)
    }
    if (!hasMigration(database, 6)) {
      database.exec('CREATE TABLE IF NOT EXISTS script_asset_segments (id TEXT PRIMARY KEY, script_asset_id TEXT NOT NULL REFERENCES script_assets(id) ON DELETE CASCADE, episode_no INTEGER NOT NULL, title TEXT NOT NULL, extracted_text TEXT NOT NULL, episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (script_asset_id, episode_no))')
      recordMigration(database, 6)
    }
    if (!hasMigration(database, 7)) {
      database.exec('CREATE TABLE IF NOT EXISTS subtitle_assets (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL, source_path TEXT NOT NULL, format TEXT NOT NULL, cue_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
      recordMigration(database, 7)
    }
  })

  apply()
}

const hasMigration = (database: Database.Database, version: number): boolean => {
  return database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version) !== undefined
}

const applySchema = (database: Database.Database, skipNotificationEventIndex = false): void => {
  for (const statement of INITIAL_SCHEMA) {
    if (skipNotificationEventIndex && statement.includes('ux_notifications_event_key')) {
      continue
    }
    database.exec(statement)
  }
}

const recordMigration = (database: Database.Database, version: number): void => {
  database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString())
}

const addColumnIfMissing = (
  database: Database.Database,
  table: 'production_tasks' | 'notifications',
  column: 'cost_json' | 'event_key' | 'occurred_at',
  definition: string
): void => {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some(({ name }) => name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}
