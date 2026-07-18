import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { LogService } from './log-service.js'

describe('LogService', () => {
  it('removes sensitive fields recursively before persistence', () => {
    const db = new Database(':memory:')
    migrateDatabase(db)
    new LogService(db).write('info', 'test', {
      apiKey: 'secret',
      nested: { token: 'hidden', keep: 1 },
      items: [{ password: 'hidden' }, { keep: 'ok' }],
      bearer: 'Bearer abcdefghijklmnop',
    })
    const row = db.prepare('SELECT details_json FROM app_logs').get() as { details_json: string }
    expect(JSON.parse(row.details_json)).toEqual({ nested: { keep: 1 }, items: [{}, { keep: 'ok' }] })
    db.close()
  })

  it('rotates logs older than thirty days and can clear the remainder', () => {
    const db = new Database(':memory:')
    migrateDatabase(db)
    const old = '2026-05-01T00:00:00.000Z'
    const current = '2026-06-20T00:00:00.000Z'
    db.prepare('INSERT INTO app_logs (id, level, event_type, details_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('old', 'info', 'old', '{}', old, old)
    db.prepare('INSERT INTO app_logs (id, level, event_type, details_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('new', 'info', 'new', '{}', current, current)
    const service = new LogService(db)
    expect(service.rotate(new Date('2026-06-20T00:00:00.000Z'))).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS count FROM app_logs').get() as { count: number }).count).toBe(1)
    expect(service.clear()).toBe(1)
    expect((db.prepare('SELECT COUNT(*) AS count FROM app_logs').get() as { count: number }).count).toBe(0)
    db.close()
  })
})
