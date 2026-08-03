import type Database from 'better-sqlite3'
import { z } from 'zod'
import { NotificationService } from '../services/notification-service.js'
import { TaskQueue } from '../tasks/task-queue.js'
import { decideAiDuration } from './ai-duration-policy.js'
import { createControlledRemixExecutor } from './controlled-remix-executor.js'
import { LocalEvidenceService } from './local-evidence-service.js'

const taskIdSchema = z.string().uuid()
const decisionSchema = z.enum(['continue', 'stop'])

type RemixConfig = {
  maxDrafts: number
  episodeStart: number
  episodeEnd: number
  durationMinSeconds: number
  durationMaxSeconds: number
}

export type AiRemixCheckpoint = {
  version: 1
  stage: 'evidence' | 'over-target' | 'awaiting-decision' | 'force-stopped' | 'drafts'
  startedAt: string | null
  decisionDeadlineAt?: string
  extensionGranted?: boolean
  recoveryCount?: number
  outcome?: 'no-recommendation' | 'drafts-ready'
  reason?: string | null
  drafts: Array<{ draftId: string; evidenceId: string; summary: string; startSeconds: number | null; endSeconds: number | null; confidence: number | null; editingAngle?: string; hookReason?: string; coreStoryRange?: string; episodeStart?: number; episodeEnd?: number; expectedDurationSeconds?: number }>
}

export type AiRemixTaskSnapshot = {
  id: string
  dramaId: string
  status: string
  config: RemixConfig
  cost: { estimated: number; actual: number; mode: 'controlled' | 'configured'; region: string; provider: string; costLimit: number }
  checkpoint: AiRemixCheckpoint
  createdAt: string
  updatedAt: string
}

type TaskRow = {
  id: string
  dramaId: string
  status: string
  configSnapshot: string
  checkpoint: string | null
  costJson: string
  createdAt: string
  updatedAt: string
}

const emptyCheckpoint = (): AiRemixCheckpoint => ({ version: 1, stage: 'evidence', startedAt: null, drafts: [] })

export class AiTaskLifecycleService {
  private readonly localEvidence: LocalEvidenceService
  private readonly monitors = new Map<string, ReturnType<typeof setInterval>>()

  constructor(
    private readonly database: Database.Database,
    private readonly queue: TaskQueue,
    private readonly notifications: NotificationService,
    private readonly now = () => new Date()
  ) { this.localEvidence = new LocalEvidenceService(database) }

  get(taskIdInput: unknown): AiRemixTaskSnapshot {
    return this.toSnapshot(this.getRow(taskIdSchema.parse(taskIdInput)))
  }

  async run(taskIdInput: unknown): Promise<AiRemixTaskSnapshot> {
    const taskId = taskIdSchema.parse(taskIdInput)
    const before = this.getRow(taskId)
    if (before.status === 'completed') return this.toSnapshot(before)
    this.ensureStarted(before)
    if (this.applyDuration(taskId).checkpoint.stage === 'awaiting-decision') return this.get(taskId)
    if (this.get(taskId).checkpoint.stage === 'force-stopped') return this.get(taskId)
    this.startMonitoring(taskId)
    try {
      await this.localEvidence.prepare({ dramaId: before.dramaId, ...this.parseConfig(before.configSnapshot) })
      if (!this.canExecuteAfterDuration(taskId)) return this.get(taskId)
      await this.queue.run(taskId, createControlledRemixExecutor(this.database))
    } finally { this.stopMonitoring(taskId) }
    return this.get(taskId)
  }

  async recover(taskIdInput: unknown): Promise<AiRemixTaskSnapshot> {
    const taskId = taskIdSchema.parse(taskIdInput)
    const task = this.getRow(taskId)
    const checkpoint = this.parseCheckpoint(task.checkpoint)
    if (checkpoint.stage === 'force-stopped') {
      if ((checkpoint.recoveryCount ?? 0) >= 1) throw new Error('该任务已达到强停后的恢复上限，请新建分析任务。')
      this.persistCheckpoint(task, { ...checkpoint, stage: 'evidence', startedAt: this.now().toISOString(), recoveryCount: (checkpoint.recoveryCount ?? 0) + 1 })
    }
    if (this.applyDuration(taskId).checkpoint.stage === 'awaiting-decision') return this.get(taskId)
    this.startMonitoring(taskId)
    try {
      await this.localEvidence.prepare({ dramaId: task.dramaId, ...this.parseConfig(task.configSnapshot) })
      if (!this.canExecuteAfterDuration(taskId)) return this.get(taskId)
      await this.queue.recover(taskId, createControlledRemixExecutor(this.database))
    } finally { this.stopMonitoring(taskId) }
    return this.get(taskId)
  }

  async retryFailed(taskIdInput: unknown): Promise<AiRemixTaskSnapshot> {
    const taskId = taskIdSchema.parse(taskIdInput)
    this.ensureStarted(this.getRow(taskId))
    if (!this.canExecuteAfterDuration(taskId)) return this.get(taskId)
    await this.queue.retryFailed(taskId, createControlledRemixExecutor(this.database))
    return this.get(taskId)
  }

  applyDuration(taskIdInput: unknown): AiRemixTaskSnapshot {
    const taskId = taskIdSchema.parse(taskIdInput)
    const task = this.getRow(taskId)
    const checkpoint = this.parseCheckpoint(task.checkpoint)
    if (task.status === 'completed' || checkpoint.stage === 'force-stopped' || checkpoint.stage === 'drafts') return this.toSnapshot(task)

    const startedAt = checkpoint.startedAt ?? task.createdAt
    const elapsedMs = Math.max(0, this.now().getTime() - new Date(startedAt).getTime())
    const duration = decideAiDuration(elapsedMs)
    if (duration === 'on-target') return this.toSnapshot(task)
    if (duration === 'over-target') return this.persistCheckpoint(task, { ...checkpoint, startedAt, stage: 'over-target' })
    if (duration === 'needs-decision' && checkpoint.extensionGranted) return this.persistCheckpoint(task, { ...checkpoint, startedAt, stage: 'over-target' })
    if (duration === 'needs-decision') return this.pauseForDecision(task, { ...checkpoint, startedAt })
    return this.forceStop(task, { ...checkpoint, startedAt })
  }

  async decide(taskIdInput: unknown, actionInput: unknown): Promise<AiRemixTaskSnapshot> {
    const taskId = taskIdSchema.parse(taskIdInput)
    const action = decisionSchema.parse(actionInput)
    const task = this.getRow(taskId)
    const checkpoint = this.parseCheckpoint(task.checkpoint)
    if (checkpoint.stage !== 'awaiting-decision') throw new Error('当前任务不需要耗时决策。')
    if (action === 'stop') return this.stopAtDecision(task, checkpoint)

    const now = this.now().toISOString()
    const next = { ...checkpoint, stage: 'over-target' as const, extensionGranted: true, decisionDeadlineAt: new Date(this.now().getTime() + 10 * 60_000).toISOString() }
    this.database.transaction(() => {
      this.database.prepare("UPDATE task_items SET status = 'pending', reason = NULL, updated_at = ? WHERE task_id = ? AND status = 'paused'").run(now, task.id)
      this.database.prepare("UPDATE production_tasks SET status = 'pending', checkpoint = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now, task.id)
    })()
    this.notifications.resolveEvent(`${task.id}:duration-decision`)
    this.notifications.recordTaskEvent({ eventKey: `${task.id}:duration-extended`, taskId: task.id, severity: 'info', title: 'AI 分析已获延长', summary: '任务最多再运行 10 分钟；到 50 分钟将自动停止并保留检查点。', actionTarget: `tasks/${task.id}` })
    try {
      this.queue.resume(task.id)
      this.startMonitoring(task.id)
      return this.get(task.id)
    } catch {
      return this.run(task.id)
    }
  }

  listEvidence(taskIdInput: unknown): Array<{ id: string; episodeId: string | null; sourceType: string; startSeconds: number | null; endSeconds: number | null; confidence: number | null; summary: string }> {
    const task = this.getRow(taskIdSchema.parse(taskIdInput))
    const config = this.parseConfig(task.configSnapshot)
    return this.database.prepare(`
      SELECT evidence.id, evidence.episode_id AS episodeId, evidence.source_type AS sourceType,
             evidence.start_seconds AS startSeconds, evidence.end_seconds AS endSeconds,
             evidence.confidence, evidence.summary
      FROM ai_evidence evidence
      LEFT JOIN episodes episode ON episode.id = evidence.episode_id
      WHERE evidence.drama_id = ?
        AND episode.episode_no BETWEEN ? AND ?
      ORDER BY evidence.confidence DESC, evidence.created_at DESC
    `).all(task.dramaId, config.episodeStart, config.episodeEnd) as Array<{ id: string; episodeId: string | null; sourceType: string; startSeconds: number | null; endSeconds: number | null; confidence: number | null; summary: string }>
  }

  private pauseForDecision(task: TaskRow, checkpoint: AiRemixCheckpoint): AiRemixTaskSnapshot {
    const now = this.now().toISOString()
    const next = { ...checkpoint, stage: 'awaiting-decision' as const, decisionDeadlineAt: new Date(this.now().getTime() + 10 * 60_000).toISOString() }
    try { this.queue.pause(task.id) } catch { /* The task may be between queue items; persist the pause below. */ }
    this.database.transaction(() => {
      this.database.prepare("UPDATE task_items SET status = 'paused', reason = ?, updated_at = ? WHERE task_id = ? AND status IN ('pending', 'running')").run('已达到 40 分钟，等待是否继续。', now, task.id)
      this.database.prepare("UPDATE production_tasks SET status = 'paused', checkpoint = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now, task.id)
    })()
    this.notifications.recordTaskEvent({ eventKey: `${task.id}:duration-decision`, taskId: task.id, severity: 'decision', title: 'AI 分析需要决策', summary: '已运行 40 分钟。可再等待 10 分钟，或现在停止并保留检查点。', actionTarget: `tasks/${task.id}` })
    return this.get(task.id)
  }

  private forceStop(task: TaskRow, checkpoint: AiRemixCheckpoint): AiRemixTaskSnapshot {
    const now = this.now().toISOString()
    const next = { ...checkpoint, stage: 'force-stopped' as const }
    try { this.queue.stopForShutdown(task.id) } catch { /* A completed queue is still stopped in durable task state below. */ }
    this.database.transaction(() => {
      this.database.prepare("UPDATE task_items SET status = 'paused', reason = ?, updated_at = ? WHERE task_id = ? AND status IN ('pending', 'running')").run('已达到 50 分钟上限，已停止并保留检查点。', now, task.id)
      this.database.prepare("UPDATE production_tasks SET status = 'paused', checkpoint = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now, task.id)
    })()
    this.notifications.resolveEvent(`${task.id}:duration-decision`)
    this.notifications.recordTaskEvent({ eventKey: `${task.id}:duration-force-stop`, taskId: task.id, severity: 'warning', title: 'AI 分析已停止', summary: '已达到 50 分钟上限。检查点已保存，可在任务中心恢复。', actionTarget: `tasks/${task.id}` })
    return this.get(task.id)
  }

  private stopAtDecision(task: TaskRow, checkpoint: AiRemixCheckpoint): AiRemixTaskSnapshot {
    const now = this.now().toISOString()
    const next = { ...checkpoint, stage: 'force-stopped' as const, reason: '用户在 40 分钟待决策时选择停止。' }
    try { this.queue.stopForShutdown(task.id) } catch { /* Persisted state handles an inactive queue. */ }
    this.database.transaction(() => {
      this.database.prepare("UPDATE task_items SET status = 'paused', reason = ?, updated_at = ? WHERE task_id = ? AND status IN ('pending', 'running')").run(next.reason, now, task.id)
      this.database.prepare("UPDATE production_tasks SET status = 'paused', checkpoint = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(next), now, task.id)
    })()
    this.notifications.resolveEvent(`${task.id}:duration-decision`)
    this.notifications.recordTaskEvent({ eventKey: `${task.id}:duration-stopped-by-user`, taskId: task.id, severity: 'info', title: 'AI 分析已按请求停止', summary: '已保存当前检查点；此任务可按恢复规则继续。', actionTarget: `tasks/${task.id}` })
    return this.get(task.id)
  }

  private persistCheckpoint(task: TaskRow, checkpoint: AiRemixCheckpoint): AiRemixTaskSnapshot {
    this.database.prepare('UPDATE production_tasks SET checkpoint = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(checkpoint), this.now().toISOString(), task.id)
    return this.get(task.id)
  }

  private ensureStarted(task: TaskRow): void {
    const checkpoint = this.parseCheckpoint(task.checkpoint)
    if (checkpoint.startedAt !== null) return
    this.persistCheckpoint(task, { ...checkpoint, startedAt: this.now().toISOString() })
  }

  private startMonitoring(taskId: string): void {
    this.stopMonitoring(taskId)
    const check = (): void => {
      const snapshot = this.applyDuration(taskId)
      if (snapshot.checkpoint.stage === 'awaiting-decision' || snapshot.checkpoint.stage === 'force-stopped' || snapshot.status === 'completed') this.stopMonitoring(taskId)
    }
    check()
    this.monitors.set(taskId, setInterval(check, 1_000))
  }

  private canExecuteAfterDuration(taskId: string): boolean {
    const snapshot = this.applyDuration(taskId)
    return snapshot.checkpoint.stage !== 'awaiting-decision' && snapshot.checkpoint.stage !== 'force-stopped' && snapshot.status !== 'paused'
  }

  private stopMonitoring(taskId: string): void {
    const monitor = this.monitors.get(taskId)
    if (monitor) clearInterval(monitor)
    this.monitors.delete(taskId)
  }

  private getRow(taskId: string): TaskRow {
    const task = this.database.prepare(`
      SELECT id, drama_id AS dramaId, status, config_snapshot AS configSnapshot,
             checkpoint, cost_json AS costJson, created_at AS createdAt, updated_at AS updatedAt
      FROM production_tasks WHERE id = ? AND type = 'ai_remix'
    `).get(taskId) as TaskRow | undefined
    if (!task) throw new Error('AI 二创任务不存在。')
    return task
  }

  private toSnapshot(task: TaskRow): AiRemixTaskSnapshot {
    return { id: task.id, dramaId: task.dramaId, status: task.status, config: this.parseConfig(task.configSnapshot), cost: this.parseCost(task.costJson), checkpoint: this.parseCheckpoint(task.checkpoint), createdAt: task.createdAt, updatedAt: task.updatedAt }
  }

  private parseConfig(value: string): RemixConfig { return JSON.parse(value) as RemixConfig }

  private parseCheckpoint(value: string | null): AiRemixCheckpoint {
    if (!value) return emptyCheckpoint()
    try {
      const parsed = JSON.parse(value) as { executor?: unknown } & Partial<AiRemixCheckpoint>
      const candidate = parsed.executor && typeof parsed.executor === 'object'
        ? parsed.executor as Partial<AiRemixCheckpoint>
        : parsed
      return { ...emptyCheckpoint(), ...candidate, drafts: Array.isArray(candidate.drafts) ? candidate.drafts : [] }
    } catch { return emptyCheckpoint() }
  }

  private parseCost(value: string): AiRemixTaskSnapshot['cost'] {
    try {
      const parsed = JSON.parse(value) as Partial<AiRemixTaskSnapshot['cost']>
      return { estimated: typeof parsed.estimated === 'number' ? parsed.estimated : 0, actual: typeof parsed.actual === 'number' ? parsed.actual : 0, mode: parsed.mode === 'configured' ? 'configured' : 'controlled', region: typeof parsed.region === 'string' ? parsed.region : 'local', provider: typeof parsed.provider === 'string' ? parsed.provider : 'controlled', costLimit: typeof parsed.costLimit === 'number' ? parsed.costLimit : 0 }
    } catch { return { estimated: 0, actual: 0, mode: 'controlled', region: 'local', provider: 'controlled', costLimit: 0 } }
  }
}
