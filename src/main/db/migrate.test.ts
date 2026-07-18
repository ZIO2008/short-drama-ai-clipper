import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from './migrate.js'

const databases: Database.Database[] = []

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close()
  }
})

describe('migrateDatabase', () => {
  it('creates the P0 schema once and supports repeat startup', () => {
    const database = new Database(':memory:')
    databases.push(database)

    migrateDatabase(database)
    migrateDatabase(database)

    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>
    expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining(['app_logs', 'dramas', 'episodes', 'notifications', 'production_tasks', 'schema_migrations', 'secret_records']))
    expect(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 6 })
  })

  it('adds Phase 1 tables and indexes to an existing v1 database', () => {
    const database = new Database(':memory:')
    databases.push(database)
    database.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE dramas (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE production_tasks (
        id TEXT PRIMARY KEY,
        drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        config_snapshot TEXT NOT NULL,
        status TEXT NOT NULL,
        progress_current INTEGER NOT NULL DEFAULT 0,
        progress_total INTEGER NOT NULL DEFAULT 0,
        checkpoint TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        drama_id TEXT REFERENCES dramas(id) ON DELETE SET NULL,
        task_id TEXT REFERENCES production_tasks(id) ON DELETE SET NULL,
        task_item_id TEXT,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        action_target TEXT,
        read_at TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-07-18T00:00:00.000Z');
      INSERT INTO dramas (id, name, created_at, updated_at) VALUES ('drama-1', '旧剧目', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z');
      INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, created_at, updated_at)
      VALUES ('task-1', 'drama-1', 'stitch', '{}', 'queued', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z');
      INSERT INTO notifications (
        id, drama_id, task_id, severity, title, summary, created_at, updated_at
      ) VALUES (
        'notice-1', 'drama-1', 'task-1', 'warning', '旧通知', '保留这条记录',
        '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z'
      );
    `)

    migrateDatabase(database)

    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>
    const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name").all() as Array<{ name: string }>
    expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining(['app_logs', 'secret_records']))
    expect(indexes.map(({ name }) => name)).toEqual(expect.arrayContaining(['idx_logs_created', 'idx_notifications_read_created']))
    expect(database.prepare('SELECT version FROM schema_migrations WHERE version = 5').get()).toEqual({ version: 5 })
    expect(database.prepare('SELECT cost_json, status FROM production_tasks WHERE id = ?').get('task-1')).toEqual({ cost_json: '{}', status: 'queued' })
    expect(database.prepare('PRAGMA table_info(notifications)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'event_key' })]))
    expect(database.prepare('SELECT summary, event_key, occurred_at FROM notifications WHERE id = ?').get('notice-1')).toEqual({
      summary: '保留这条记录', event_key: null, occurred_at: '2026-07-18T00:00:00.000Z'
    })
  })
})
