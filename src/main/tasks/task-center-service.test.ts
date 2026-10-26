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
      id: 'task-1', dramaId: 'drama-1', dramaName: '测试剧目', type: 'multi_episode', status: 'partial',
      progressCurrent: 2, progressTotal: 3, createdAt: expect.any(String), updatedAt: expect.any(String)
    }])
  })

  it('includes P1 remix tasks but keeps deferred P2 tasks out of the task center', () => {
    const { database, service } = setup()
    const now = new Date().toISOString()
    database.prepare(`
      INSERT INTO production_tasks
        (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('ai-task-1', 'drama-1', 'ai_remix', '{}', 'paused', 0, 1, now, now)
    database.prepare(`
      INSERT INTO production_tasks
        (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('p2-task-1', 'drama-1', 'ai_narration', '{}', 'paused', 0, 1, now, now)

    expect(service.list().map((task) => task.id)).toEqual(expect.arrayContaining(['task-1', 'ai-task-1']))
    expect(service.list().map((task) => task.id)).not.toContain('p2-task-1')
    expect(service.report('p2-task-1')).toEqual([])
  })

  it('exposes the frozen original-clip task round as the authoritative generation order', () => {
    const { database, service } = setup(); const now = new Date().toISOString()
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)').run('clip-round-7', 'drama-1', 'original_clip', JSON.stringify({ generation: { episodeIds: ['episode-1'] }, taskRound: 7 }), 'failed', JSON.stringify({ taskRound: 6, reason: 'fixture' }), now, now)
    expect(service.list().find((task) => task.id === 'clip-round-7')).toMatchObject({ taskRound: 7, episodeIds: ['episode-1'] })
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

  it('returns every persisted window with its planned range, actual range and output path', () => {
    const { database, service } = setup()
    const now = new Date().toISOString()
    database.prepare('UPDATE task_items SET planned_range = ?, actual_range = ? WHERE id = ?')
      .run(JSON.stringify({ episodeNumbers: [1, 2, 3] }), JSON.stringify([1, 2]), 'item-1')
    database.prepare(`
      INSERT INTO generated_materials
        (id, drama_id, task_id, task_item_id, path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('material-1', 'drama-1', 'task-1', 'item-1', 'D:\\output\\result.mp4', now, now)

    expect(service.report('task-1')).toEqual([
      expect.objectContaining({
        id: 'item-1',
        plannedRange: JSON.stringify({ episodeNumbers: [1, 2, 3] }),
        actualRange: JSON.stringify([1, 2]),
        status: 'succeeded',
        outputPath: 'D:\\output\\result.mp4'
      }),
      expect.objectContaining({ id: 'item-2', status: 'exported', outputPath: null }),
      expect.objectContaining({ id: 'item-3', status: 'failed', reason: '编码失败', outputPath: null })
    ])
  })

  it('rejects unknown tasks and tasks without failed items', () => {
    const { database, service } = setup()
    expect(() => service.retryFailedItems('missing')).toThrow('任务不存在')
    database.prepare('UPDATE task_items SET status = ? WHERE status = ?').run('succeeded', 'failed')
    expect(() => service.retryFailedItems('task-1')).toThrow('没有可重试')
  })

  it('refuses the legacy status-only retry path for original clip tasks', () => {
    const { database, service } = setup()
    database.prepare('UPDATE production_tasks SET type = ? WHERE id = ?').run('original_clip', 'task-1')
    expect(() => service.retryFailedItems('task-1')).toThrow('真实导出重试服务')
    expect(database.prepare('SELECT status FROM task_items WHERE id = ?').get('item-3')).toEqual({ status: 'failed' })
  })
})
