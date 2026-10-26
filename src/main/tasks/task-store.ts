import type Database from 'better-sqlite3'
import type { TaskExecutionItem, TaskItemResult, TaskItemStatus } from './task-types.js'

type ItemRow = {
  id: string
  taskId: string
  plannedRange: string | null
  actualRange: string | null
  status: string
  retryCount: number
  reason: string | null
}

const ITEM_STATUSES: readonly TaskItemStatus[] = [
  'pending', 'running', 'paused', 'succeeded', 'exported', 'reduced', 'skipped', 'failed', 'cancelled',
  'pending_review', 'editing', 'confirmed', 'exporting', 'blocked', 'unknown'
]

export class TaskStore {
  constructor(private readonly database: Database.Database) {}

  assertTask(taskId: string): void {
    const row = this.database.prepare('SELECT id FROM production_tasks WHERE id = ?').get(taskId)
    if (!row) throw new Error(`Task not found: ${taskId}`)
  }

  listItems(taskId: string): TaskExecutionItem[] {
    const rows = this.database.prepare(`
      SELECT id, task_id AS taskId, planned_range AS plannedRange,
        actual_range AS actualRange, status, retry_count AS retryCount, reason
      FROM task_items WHERE task_id = ? ORDER BY created_at, id
    `).all(taskId) as ItemRow[]
    return rows.map(toExecutionItem)
  }

  markTaskStarted(taskId: string): void {
    const now = new Date().toISOString()
    this.database.prepare(`
      UPDATE production_tasks
      SET status = 'running', progress_total = (
        SELECT COUNT(*) FROM task_items WHERE task_id = ?
      ), updated_at = ? WHERE id = ?
    `).run(taskId, now, taskId)
    this.refreshProgress(taskId)
  }

  markTaskStatus(taskId: string, status: string): void {
    this.database.prepare('UPDATE production_tasks SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), taskId)
  }

  markItemRunning(itemId: string): void {
    this.updateItem(itemId, 'running', null)
  }

  markItemRetry(itemId: string, retryCount: number, reason: string): void {
    const now = new Date().toISOString()
    this.database.prepare(`
      UPDATE task_items SET status = 'pending', retry_count = ?, reason = ?, updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(retryCount, reason, now, itemId)
  }

  markItemFailed(itemId: string, retryCount: number, reason: string): void {
    const now = new Date().toISOString()
    this.database.prepare(`
      UPDATE task_items SET status = 'failed', retry_count = ?, reason = ?, updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(retryCount, reason, now, itemId)
  }

  completeItem(itemId: string, result: TaskItemResult | void): void {
    const status = result?.status ?? 'succeeded'
    const actualRange = result && 'actualRange' in result && result.actualRange !== undefined
      ? JSON.stringify(result.actualRange)
      : null
    const now = new Date().toISOString()
    this.database.prepare(`
      UPDATE task_items
      SET status = ?, actual_range = COALESCE(?, actual_range), reason = ?, updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run(status, actualRange, result?.reason ?? null, now, itemId)
  }

  pauseRunningItem(itemId: string): void {
    this.database.prepare(`
      UPDATE task_items SET status = 'paused', reason = ?, updated_at = ?
      WHERE id = ? AND status = 'running'
    `).run('应用退出，等待恢复。', new Date().toISOString(), itemId)
  }

  cancelRunnableItems(taskId: string): void {
    this.database.prepare(`
      UPDATE task_items SET status = 'cancelled', reason = ?, updated_at = ?
      WHERE task_id = ? AND status IN ('pending', 'running', 'paused')
    `).run('任务已取消。', new Date().toISOString(), taskId)
    this.refreshProgress(taskId)
  }

  resetFailedItems(taskId: string): string[] {
    const failed = this.database.prepare(`
      SELECT id FROM task_items WHERE task_id = ? AND status = 'failed' ORDER BY created_at, id
    `).all(taskId) as Array<{ id: string }>
    if (failed.length === 0) throw new Error('该任务没有可重试的失败项。')
    const now = new Date().toISOString()
    this.database.prepare(`
      UPDATE task_items SET status = 'pending', retry_count = 0, reason = NULL, updated_at = ?
      WHERE task_id = ? AND status = 'failed'
    `).run(now, taskId)
    this.markTaskStatus(taskId, 'pending')
    this.refreshProgress(taskId)
    return failed.map(({ id }) => id)
  }

  refreshProgress(taskId: string): void {
    this.database.prepare(`
      UPDATE production_tasks SET progress_current = (
        SELECT COUNT(*) FROM task_items
        WHERE task_id = ? AND status IN ('succeeded', 'exported', 'reduced', 'skipped', 'failed', 'cancelled')
      ), updated_at = ? WHERE id = ?
    `).run(taskId, new Date().toISOString(), taskId)
  }

  private updateItem(itemId: string, status: TaskItemStatus, reason: string | null): void {
    this.database.prepare('UPDATE task_items SET status = ?, reason = ?, updated_at = ? WHERE id = ?')
      .run(status, reason, new Date().toISOString(), itemId)
  }
}

const toExecutionItem = (row: ItemRow): TaskExecutionItem => ({
  id: row.id,
  taskId: row.taskId,
  plannedRange: parseJson(row.plannedRange),
  actualRange: parseJson(row.actualRange),
  status: isItemStatus(row.status) ? row.status : 'unknown',
  retryCount: row.retryCount,
  reason: row.reason
})

const parseJson = (value: string | null): unknown | null => {
  if (value === null) return null
  try { return JSON.parse(value) as unknown } catch { return value }
}

const isItemStatus = (value: string): value is TaskItemStatus => ITEM_STATUSES.includes(value as TaskItemStatus)
