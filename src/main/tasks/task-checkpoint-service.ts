import type Database from 'better-sqlite3'
import type { RecoverableTask } from './task-types.js'

export type QueueCheckpoint = {
  version: 1
  completedItemIds: string[]
  executor: unknown | null
  savedAt: string
}

export class TaskCheckpointService {
  constructor(private readonly database: Database.Database) {}

  save(taskId: string, checkpoint: unknown): void {
    this.database.prepare('UPDATE production_tasks SET checkpoint = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(checkpoint), new Date().toISOString(), taskId)
  }

  saveProgress(taskId: string, executorCheckpoint: unknown = null): QueueCheckpoint {
    const completed = this.database.prepare(`
      SELECT id FROM task_items
      WHERE task_id = ? AND status IN ('succeeded', 'exported', 'reduced', 'skipped')
      ORDER BY created_at, id
    `).all(taskId) as Array<{ id: string }>
    const checkpoint: QueueCheckpoint = {
      version: 1,
      completedItemIds: completed.map(({ id }) => id),
      executor: executorCheckpoint,
      savedAt: new Date().toISOString()
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
}
