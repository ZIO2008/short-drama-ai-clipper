import type Database from 'better-sqlite3'
import type { RecoverableTask } from './task-types.js'
import { aggregateTaskStatus } from './task-retry-policy.js'
import type { TaskItemStatus } from './task-types.js'

export type QueueCheckpoint = {
  version: 1
  completedItemIds: string[]
  executor: unknown | null
  savedAt: string
  startedAt?: string
  elapsedMs?: number
  activeSince?: string | null
}

export class TaskCheckpointService {
  constructor(private readonly database: Database.Database) {}

  save(taskId: string, checkpoint: unknown): void {
    this.database.prepare('UPDATE production_tasks SET checkpoint = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(checkpoint), new Date().toISOString(), taskId)
  }

  saveProgress(taskId: string, executorCheckpoint: unknown = null, timing?: { startedAt: string; elapsedMs: number; activeSince: string | null }): QueueCheckpoint {
    const completed = this.database.prepare(`
      SELECT id FROM task_items
      WHERE task_id = ? AND status IN ('succeeded', 'exported', 'reduced', 'skipped')
      ORDER BY created_at, id
    `).all(taskId) as Array<{ id: string }>
    const checkpoint: QueueCheckpoint = {
      version: 1,
      completedItemIds: completed.map(({ id }) => id),
      executor: executorCheckpoint,
      savedAt: new Date().toISOString(),
      ...(timing ?? {})
    }
    this.save(taskId, checkpoint)
    return checkpoint
  }

  load(taskId: string): unknown | null {
    const row = this.database.prepare('SELECT checkpoint FROM production_tasks WHERE id = ?').get(taskId) as
      | { checkpoint: string | null }
      | undefined
    if (!row?.checkpoint) return null
    try { return JSON.parse(row.checkpoint) as unknown } catch { return null }
  }

  pendingItems(taskId: string): Array<{ id: string; retryCount: number; status: string }> {
    return this.database.prepare(`
      SELECT id, retry_count AS retryCount, status FROM task_items
      WHERE task_id = ? AND status IN ('pending', 'running', 'paused')
      ORDER BY created_at, id
    `).all(taskId) as Array<{ id: string; retryCount: number; status: string }>
  }

  listRecoverableTasks(): RecoverableTask[] {
    return this.database.prepare(`
      SELECT id, status, progress_current AS progressCurrent, progress_total AS progressTotal
      FROM production_tasks task
      WHERE status IN ('pending', 'running', 'paused')
        AND EXISTS (
          SELECT 1 FROM task_items item
          WHERE item.task_id = task.id AND item.status IN ('pending', 'running', 'paused')
        )
      ORDER BY updated_at, id
    `).all() as RecoverableTask[]
  }

  normalizeInterruptedTasks(): number {
    const now = new Date().toISOString()
    const updateItems = this.database.prepare("UPDATE task_items SET status = 'paused', updated_at = ? WHERE status = 'running'")
    const runningTasks = this.database.prepare("SELECT id FROM production_tasks WHERE status = 'running'")
    const updateTask = this.database.prepare('UPDATE production_tasks SET status = ?, updated_at = ? WHERE id = ?')
    const transaction = this.database.transaction(() => {
      const itemResult = updateItems.run(now)
      for (const { id } of runningTasks.all() as Array<{ id: string }>) {
        const statuses = this.database.prepare('SELECT status FROM task_items WHERE task_id = ?').all(id) as Array<{ status: TaskItemStatus }>
        updateTask.run(aggregateTaskStatus(statuses.map(({ status }) => status)), now, id)
      }
      return itemResult.changes
    })
    return transaction()
  }
}
