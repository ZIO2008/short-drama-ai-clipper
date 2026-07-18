import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { TaskQueue } from './task-queue.js'

describe('TaskQueue', () => { it('retries one failed item and continues', async () => { const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'D', now, now); db.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('t', 'd', 'test', '{}', 'running', 1, now, now); let attempts = 0; await new TaskQueue(db).run('t', [{ id: 'i', run: async () => { attempts += 1; if (attempts === 1) throw new Error('once') } }]); expect(attempts).toBe(2); expect((db.prepare('SELECT status FROM production_tasks WHERE id = ?').get('t') as { status: string }).status).toBe('completed'); db.close() }) })
