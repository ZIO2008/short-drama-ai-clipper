import type Database from 'better-sqlite3'
import type { TaskSummary } from '../../shared/contracts.js'

type TaskIdRow = { id: string }

export class TaskCenterService {
  constructor(private readonly database: Database.Database) {}

  list(): TaskSummary[] {
    return this.database.prepare(`
      SELECT
        task.id,
        drama.name AS dramaName,
        task.type,
        CASE task.status WHEN 'partially_completed' THEN 'partial' ELSE task.status END AS status,
        task.progress_current AS progressCurrent,
        task.progress_total AS progressTotal
      FROM production_tasks task
      JOIN dramas drama ON drama.id = task.drama_id
      ORDER BY task.updated_at DESC
    `).all() as TaskSummary[]
  }

  retryFailedItems(taskIdInput: unknown): TaskSummary[] {
    const taskId = typeof taskIdInput === 'string' ? taskIdInput.trim() : ''
    if (!taskId) throw new Error('任务标识无效。')

    const task = this.database.prepare('SELECT id FROM production_tasks WHERE id = ?').get(taskId) as TaskIdRow | undefined
    if (!task) throw new Error('任务不存在或已被删除。')

    const retry = this.database.transaction(() => {
      const now = new Date().toISOString()
      const result = this.database.prepare(`
        UPDATE task_items
        SET status = ?, retry_count = 0, reason = NULL, updated_at = ?
        WHERE task_id = ? AND status = ?
      `).run('pending', now, taskId, 'failed')
      if (result.changes === 0) throw new Error('该任务没有可重试的失败项。')

      const completed = this.database.prepare(`
        SELECT COUNT(*) AS count
        FROM task_items
        WHERE task_id = ? AND status IN (?, ?)
      `).get(taskId, 'succeeded', 'exported') as { count: number }
      this.database.prepare(`
        UPDATE production_tasks
        SET status = ?, progress_current = ?, updated_at = ?
        WHERE id = ?
      `).run('pending', completed.count, now, taskId)
    })

    retry()
    return this.list()
  }
}
