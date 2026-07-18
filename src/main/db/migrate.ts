import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { INITIAL_SCHEMA } from './schema.js'

const SCHEMA_VERSION = 3

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
      applySchema(database)
      recordMigration(database, 2)
    }
    if (!hasMigration(database, 3)) {
      addColumnIfMissing(database, 'production_tasks', 'cost_json', "TEXT NOT NULL DEFAULT '{}'")
      recordMigration(database, 3)
    }
  })

  apply()
}

const hasMigration = (database: Database.Database, version: number): boolean => {
  return database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version) !== undefined
}

const applySchema = (database: Database.Database): void => {
  for (const statement of INITIAL_SCHEMA) {
    database.exec(statement)
  }
}

const recordMigration = (database: Database.Database, version: number): void => {
  database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString())
}

const addColumnIfMissing = (database: Database.Database, table: 'production_tasks', column: 'cost_json', definition: string): void => {
  const columns = database.prepare('PRAGMA table_info(production_tasks)').all() as Array<{ name: string }>
  if (!columns.some(({ name }) => name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}
