import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { TaskCenterService } from './task-center-service.js'

const databases: Database.Database[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

const setup = (): { database: Database.Database; service: TaskCenterService } => {
  const database = new Database(':memory:')
  databases.push(database)
  database.pragma('foreign_keys = ON')
  migrateDatabase(database)
  const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('drama-1', '测试剧目', now, now)
  database.prepare(`
    INSERT INTO production_tasks
      (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('task-1', 'drama-1', 'multi_episode', '{}', 'partially_completed', 2, 3, now, now)
  database.prepare(`
    INSERT INTO task_items
      (id, task_id, status, retry_count, reason, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'item-1', 'task-1', 'succeeded', 0, null, now, now,
    'item-2', 'task-1', 'exported', 0, null, now, now,
    'item-3', 'task-1', 'failed', 2, '编码失败', now, now
  )
  return { database, service: new TaskCenterService(database) }
}

describe('TaskCenterService', () => {
  it('lists persisted tasks with drama identity and progress', () => {
    const { service } = setup()
    expect(service.list()).toEqual([{
      id: 'task-1', dramaName: '测试剧目', type: 'multi_episode', status: 'partial',
      progressCurrent: 2, progressTotal: 3
    }])
  })

  it('resets only failed items and preserves completed progress', () => {
    const { database, service } = setup()
    expect(service.retryFailedItems('task-1')[0]?.status).toBe('pending')
    const items = database.prepare(`
      SELECT id, status, retry_count AS retryCount, reason
      FROM task_items WHERE task_id = ? ORDER BY id
    `).all('task-1')
    expect(items).toEqual([
      { id: 'item-1', status: 'succeeded', retryCount: 0, reason: null },
      { id: 'item-2', status: 'exported', retryCount: 0, reason: null },
      { id: 'item-3', status: 'pending', retryCount: 0, reason: null }
    ])
    expect(service.list()[0]?.progressCurrent).toBe(2)
  })

  it('rejects unknown tasks and tasks without failed items', () => {
    const { database, service } = setup()
    expect(() => service.retryFailedItems('missing')).toThrow('任务不存在')
    database.prepare('UPDATE task_items SET status = ? WHERE status = ?').run('succeeded', 'failed')
    expect(() => service.retryFailedItems('task-1')).toThrow('没有可重试')
  })
})
