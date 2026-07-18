import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { LogService } from './log-service.js'
describe('LogService', () => { it('removes sensitive fields before persistence', () => { const db = new Database(':memory:'); migrateDatabase(db); new LogService(db).write('info', 'test', { apiKey: 'secret', count: 1 }); expect(db.prepare('SELECT details_json FROM app_logs').get()).toMatchObject({ details_json: '{"count":1}' }); db.close() }) })
