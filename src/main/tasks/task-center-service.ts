import type Database from 'better-sqlite3'
import type { TaskReportItem, TaskSummary } from '../../shared/contracts.js'

type TaskIdRow = { id: string; type: string }
type TaskSummaryRow = TaskSummary & { checkpoint: string | null; costJson: string }

export class TaskCenterService {
  constructor(private readonly database: Database.Database) {}

  list(): TaskSummary[] {
    return this.database.prepare(`
      SELECT
        task.id, task.drama_id AS dramaId,
        drama.name AS dramaName,
        task.type,
        CASE task.status WHEN 'partially_completed' THEN 'partial' ELSE task.status END AS status,
        task.progress_current AS progressCurrent,
        task.progress_total AS progressTotal,
        task.checkpoint,
        task.cost_json AS costJson,
        task.created_at AS createdAt,
        task.updated_at AS updatedAt
      FROM production_tasks task
      JOIN dramas drama ON drama.id = task.drama_id
      WHERE task.type IN ('original_clip', 'multi_episode', 'ai_remix')
      ORDER BY task.updated_at DESC
    `).all().map((row) => {
      const task = row as TaskSummaryRow
      let checkpointStage: string | undefined; let checkpointReason: string | null = null; let startedAt: string | null = null; let elapsedMs: number | undefined; let activeSince: string | null = null; let decisionDeadlineAt: string | null = null
      try {
        const checkpoint = JSON.parse(task.checkpoint ?? '{}') as { stage?: unknown; reason?: unknown; startedAt?: unknown; decisionDeadlineAt?: unknown; executor?: { stage?: unknown; reason?: unknown; startedAt?: unknown; decisionDeadlineAt?: unknown } }
        const active = checkpoint.executor ?? checkpoint
        const stage = active.stage
        checkpointStage = typeof stage === 'string' ? stage : undefined
        checkpointReason = typeof active.reason === 'string' ? active.reason : null
        startedAt = typeof active.startedAt === 'string' ? active.startedAt : null
        startedAt = typeof checkpoint.startedAt === 'string' ? checkpoint.startedAt : startedAt
        elapsedMs = typeof (checkpoint as { elapsedMs?: unknown }).elapsedMs === 'number' ? (checkpoint as { elapsedMs: number }).elapsedMs : undefined
        activeSince = typeof (checkpoint as { activeSince?: unknown }).activeSince === 'string' ? (checkpoint as { activeSince: string }).activeSince : null
        decisionDeadlineAt = typeof active.decisionDeadlineAt === 'string' ? active.decisionDeadlineAt : null
      } catch { checkpointStage = undefined }
      // The renderer's legacy elapsed formatter receives a start timestamp only.
      // Convert the persisted active-time ledger into an equivalent timestamp so
      // paused intervals never inflate the visible duration.
      if (elapsedMs !== undefined) {
        const liveMs = activeSince && task.status === 'running' ? Math.max(0, Date.now() - new Date(activeSince).getTime()) : 0
        const endMs = activeSince && task.status === 'running' ? Date.now() : new Date(task.updatedAt ?? Date.now()).getTime()
        startedAt = new Date(endMs - elapsedMs - liveMs).toISOString()
      }
      let estimatedCost = 0; let actualCost = 0; let processingRegion: string | null = null
      try {
        const cost = JSON.parse(task.costJson) as { estimated?: unknown; actual?: unknown; region?: unknown }
        estimatedCost = typeof cost.estimated === 'number' ? cost.estimated : 0
        actualCost = typeof cost.actual === 'number' ? cost.actual : 0
        processingRegion = typeof cost.region === 'string' ? cost.region : null
      } catch { /* Invalid historical cost snapshots are shown as zero, never as a crash. */ }
      const { checkpoint: _checkpoint, costJson: _costJson, ...summary } = task
      return {
        ...summary,
        ...(checkpointStage ? { checkpointStage } : {}),
        ...(checkpointReason ? { checkpointReason } : {}),
        ...(startedAt ? { startedAt } : {}),
        ...(elapsedMs !== undefined ? { elapsedMs } : {}),
        ...(activeSince ? { activeSince } : {}),
        ...(decisionDeadlineAt ? { decisionDeadlineAt } : {}),
        ...(estimatedCost ? { estimatedCost } : {}),
        ...(actualCost ? { actualCost } : {}),
        ...(processingRegion ? { processingRegion } : {})
      }
    })
  }

  report(taskIdInput: unknown): TaskReportItem[] {
    const taskId = typeof taskIdInput === 'string' ? taskIdInput.trim() : ''
    if (!taskId) throw new Error('任务标识无效。')
    return this.database.prepare(`SELECT item.id, item.planned_range AS plannedRange, item.actual_range AS actualRange, item.status, item.reason, material.path AS outputPath FROM task_items item JOIN production_tasks task ON task.id = item.task_id LEFT JOIN generated_materials material ON material.task_item_id = item.id WHERE item.task_id = ? AND task.type IN ('original_clip', 'multi_episode', 'ai_remix') ORDER BY item.created_at, item.id`).all(taskId) as TaskReportItem[]
  }

  retryFailedItems(taskIdInput: unknown): TaskSummary[] {
    const taskId = typeof taskIdInput === 'string' ? taskIdInput.trim() : ''
    if (!taskId) throw new Error('任务标识无效。')

    const task = this.database.prepare('SELECT id, type FROM production_tasks WHERE id = ?').get(taskId) as TaskIdRow | undefined
    if (!task) throw new Error('任务不存在或已被删除。')
    if (task.type === 'original_clip') throw new Error('原剧切片必须使用真实导出重试服务。')

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
