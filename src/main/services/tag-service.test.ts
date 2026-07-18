import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { TagService } from './tag-service.js'

const databases: Database.Database[] = []
afterEach(() => { for (const database of databases.splice(0)) database.close() })

describe('TagService', () => {
  it('tracks usage and reports impact before deletion', () => {
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database)
    const now = new Date().toISOString(); database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('drama-1', 'Demo', now, now)
    const service = new TagService(database); const tag = service.create('逆袭'); service.attach('drama-1', tag.id)
    expect(service.list()[0]?.usageCount).toBe(1)
    expect(service.delete(tag.id)).toEqual({ affectedDramas: 1 })
    expect(service.list()).toEqual([])
  })
})
