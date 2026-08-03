import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { ProjectLibraryIntegrityService } from './project-library-integrity-service.js'

const databases: Database.Database[] = []
afterEach(() => { for (const database of databases.splice(0)) database.close() })

describe('ProjectLibraryIntegrityService', () => {
  it('reports legacy duplicate project names without mutating their data', () => {
    const database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    databases.push(database)
    migrateDatabase(database)
    database.exec('DROP TRIGGER trg_dramas_name_unique_insert')
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('d1', '历史剧目', now, now)
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('d2', ' 历史剧目 ', now, now)

    expect(new ProjectLibraryIntegrityService(database).inspect()).toMatchObject({ duplicateDramaNames: 1, foreignKeyViolations: 0, crossProjectReferences: 0, warningCount: 1 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM dramas').get()).toEqual({ count: 2 })
  })

  it('reports legacy foreign-key and cross-project material corruption without changing it', () => {
    const database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    databases.push(database)
    migrateDatabase(database)
    const now = new Date().toISOString()

    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('d1', '项目一', now, now)
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('d2', '项目二', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('t1', 'd1', 'clip', '{}', 'completed', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('t2', 'd2', 'clip', '{}', 'completed', now, now)
    database.prepare('INSERT INTO task_items (id, task_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('i2', 't2', 'completed', now, now)

    // Simulate data written before project-library guards existed.
    database.pragma('foreign_keys = OFF')
    database.exec('DROP TRIGGER trg_generated_materials_same_drama_insert')
    const insertMaterial = database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    insertMaterial.run('m-cross-drama', 'd2', 't1', null, 'cross-drama.mp4', now, now)
    insertMaterial.run('m-cross-item', 'd1', 't1', 'i2', 'cross-item.mp4', now, now)
    insertMaterial.run('m-orphan-task', 'd1', 'missing-task', null, 'orphan.mp4', now, now)

    const materialsBefore = database.prepare('SELECT id, drama_id, task_id, task_item_id, path FROM generated_materials ORDER BY id').all()
    const foreignKeysBefore = database.prepare('SELECT * FROM pragma_foreign_key_check').all()

    expect(new ProjectLibraryIntegrityService(database).inspect()).toEqual({
      foreignKeyViolations: 1,
      duplicateDramaNames: 0,
      crossProjectReferences: 2,
      warningCount: 3
    })
    expect(database.prepare('SELECT id, drama_id, task_id, task_item_id, path FROM generated_materials ORDER BY id').all()).toEqual(materialsBefore)
    expect(database.prepare('SELECT * FROM pragma_foreign_key_check').all()).toEqual(foreignKeysBefore)
  })
})
