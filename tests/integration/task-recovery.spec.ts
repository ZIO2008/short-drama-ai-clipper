import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../src/main/db/migrate.js'
import { TaskQueue } from '../../src/main/tasks/task-queue.js'

const databases: Database.Database[] = []
afterEach(() => { for (const database of databases.splice(0)) database.close() })

describe('P0 task recovery integration', () => {
  it('restarts only unfinished items and preserves completed outputs', async () => {
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database); const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '集成测试剧目', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('task', 'drama', 'multi_episode', '{}', 'running', 1, 3, now, now)
    const insert = database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    for (const [id, status] of [['done', 'succeeded'], ['active', 'running'], ['waiting', 'pending']] as const) insert.run(id, 'task', '{}', status, now, now)
    const executed: string[] = []
    const result = await new TaskQueue(database).recover('task', async (item) => { executed.push(item.id) })
    expect(executed).toEqual(['active', 'waiting'])
    expect(result.status).toBe('completed')
    expect(database.prepare('SELECT status FROM task_items WHERE id = ?').get('done')).toEqual({ status: 'succeeded' })
  })
})
