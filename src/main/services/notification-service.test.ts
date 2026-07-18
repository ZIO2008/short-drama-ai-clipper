import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { NotificationService } from './notification-service.js'

const databases: Database.Database[] = []

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close()
  }
})

const setupService = (): NotificationService => {
  const database = new Database(':memory:')
  databases.push(database)
  database.pragma('foreign_keys = ON')
  migrateDatabase(database)
  const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('drama-1', '测试剧目', now, now)
  database.prepare(`
    INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('task-1', 'drama-1', 'stitch', '{}', 'running', now, now)
  return new NotificationService(database)
}

describe('NotificationService', () => {
  it('aggregates the same task event into one unread notification', () => {
    const service = setupService()
    const input = {
      eventKey: 'task-1:completed', dramaId: 'drama-1', taskId: 'task-1', severity: 'success' as const,
      title: '多集拼接已完成', summary: '成功 19 项', actionTarget: 'tasks/task-1'
    }
    service.recordTaskEvent(input)
    service.recordTaskEvent({ ...input, summary: '成功 20 项' })

    const snapshot = service.list()
    expect(snapshot.unreadCount).toBe(1)
    expect(snapshot.items).toHaveLength(1)
    expect(snapshot.items[0]?.summary).toBe('成功 20 项')
    expect(snapshot.items[0]?.taskType).toBe('stitch')
    expect(snapshot.items[0]?.dramaName).toBe('测试剧目')
  })

  it('clears ordinary read notifications but protects unresolved decisions', () => {
    const service = setupService()
    const ordinary = service.recordTaskEvent({
      eventKey: 'task-1:failed', taskId: 'task-1', severity: 'error',
      title: '任务失败', summary: '磁盘空间不足', actionTarget: 'tasks/task-1'
    })
    const decision = service.recordTaskEvent({
      eventKey: 'task-1:decision', taskId: 'task-1', severity: 'decision',
      title: '任务需要决定', summary: '继续或停止', actionTarget: 'tasks/task-1'
    })
    service.markRead(ordinary.id)
    service.markRead(decision.id)

    expect(service.clearRead().items.map(({ id }) => id)).toEqual([decision.id])
    service.resolve(decision.id)
    expect(service.clearRead()).toEqual({ items: [], unreadCount: 0 })
  })

  it('marks all notifications read without deleting them', () => {
    const service = setupService()
    service.recordTaskEvent({
      eventKey: 'task-1:paused', taskId: 'task-1', severity: 'warning',
      title: '任务已暂停', summary: '等待用户继续', actionTarget: 'tasks/task-1'
    })
    const occurredAt = service.list().items[0]?.occurredAt
    const snapshot = service.markAllRead()
    expect(snapshot.unreadCount).toBe(0)
    expect(snapshot.items).toHaveLength(1)
    expect(snapshot.items[0]?.readAt).not.toBeNull()
    expect(snapshot.items[0]?.occurredAt).toBe(occurredAt)
  })
})
