import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { ClipCandidateGenerationInput } from '../../shared/contracts.js'

type GenerationTimers = Map<string, ReturnType<typeof setTimeout>>

type GenerationLifecycleCallbacks = {
  runGeneration: (taskId: string, dramaId: string, input: ClipCandidateGenerationInput, taskRound: number) => void
}

/** Owns durable queueing, cancellation, and deadline transitions for intelligent generation. */
export class ClipGenerationLifecycle {
  private drainingQueue = false
  private shuttingDown = false

  constructor(
    private readonly database: Database.Database,
    private readonly controllers: Map<string, AbortController>,
    private readonly stageTimers: GenerationTimers,
    private readonly extensionTimers: GenerationTimers,
    private readonly callbacks: GenerationLifecycleCallbacks,
  ) {}

  resumePending(): void {
    this.expirePersistedDeadlines()
    const awaiting = this.database.prepare("SELECT id, json_extract(checkpoint, '$.extensionDeadlineAt') AS deadline FROM production_tasks WHERE type = 'original_clip' AND status = 'paused' AND json_extract(checkpoint, '$.stage') = 'awaiting-decision' AND json_extract(checkpoint, '$.extensionDeadlineAt') IS NOT NULL").all() as Array<{ id: string; deadline: string | null }>
    for (const task of awaiting) if (task.deadline) this.schedulePersistedDeadline(task.id, task.deadline, '候选生成的继续/停止决策窗口已到期，系统停止候选生成并保留检查点。')
    void this.drain().catch(() => undefined)
  }

  startQueued(taskId: string, dramaId: string, input: ClipCandidateGenerationInput, taskRound: number): void {
    this.callbacks.runGeneration(taskId, dramaId, input, taskRound)
  }

  async drain(): Promise<void> {
    if (this.drainingQueue || this.shuttingDown) return
    this.drainingQueue = true
    try {
      const active = this.database.prepare("SELECT 1 FROM production_tasks WHERE type = 'original_clip' AND status = 'running' AND json_extract(config_snapshot, '$.generation') IS NOT NULL LIMIT 1").get()
      if (active) return
      while (true) {
        const task = this.database.prepare("SELECT id, drama_id AS dramaId, config_snapshot AS configSnapshot FROM production_tasks WHERE type = 'original_clip' AND status = 'pending' AND json_extract(config_snapshot, '$.generation') IS NOT NULL ORDER BY created_at, id LIMIT 1").get() as { id: string; dramaId: string; configSnapshot: string } | undefined
        if (!task) return
        let config: { generation?: ClipCandidateGenerationInput; taskRound?: number } = {}
        try { config = JSON.parse(task.configSnapshot) as typeof config } catch { /* terminalized below */ }
        const taskRound = config.taskRound
        if (!config.generation || typeof taskRound !== 'number' || !Number.isInteger(taskRound) || taskRound < 1) {
          this.database.prepare("UPDATE production_tasks SET status = 'failed', checkpoint = ?, updated_at = ? WHERE id = ? AND status = 'pending'").run(JSON.stringify({ version: 1, stage: 'failed', reason: '历史候选生成任务缺少可恢复的冻结轮次；已终结该任务，后续队列可继续。' }), new Date().toISOString(), task.id)
          continue
        }
        const claimed = this.database.prepare("UPDATE production_tasks SET status = 'running', checkpoint = json_set(COALESCE(checkpoint, '{}'), '$.stage', 'text-semantics', '$.queuePosition', 0, '$.estimatedWaitMs', 0, '$.availableProviderSlots', 1, '$.reason', '已从持久队列取得一个供应商槽位，正在等待文本语义分析。'), updated_at = ? WHERE id = ? AND status = 'pending'").run(new Date().toISOString(), task.id)
        if (claimed.changes !== 1) continue
        try {
          const row = this.database.prepare('SELECT checkpoint FROM production_tasks WHERE id = ?').get(task.id) as { checkpoint: string | null }
          const checkpoint = JSON.parse(row.checkpoint ?? '{}') as { extensionGranted?: boolean; extensionDeadlineAt?: string; stage?: string }
          if (checkpoint.extensionDeadlineAt && (checkpoint.extensionGranted || checkpoint.stage === 'awaiting-decision')) this.schedulePersistedDeadline(task.id, checkpoint.extensionDeadlineAt, checkpoint.stage === 'awaiting-decision' ? '候选生成的继续/停止决策窗口已到期，系统停止候选生成并保留检查点。' : undefined)
        } catch { /* malformed historical checkpoint remains recoverable */ }
        this.startQueued(task.id, task.dramaId, config.generation, taskRound)
        return
      }
    } finally {
      this.drainingQueue = false
    }
  }

  persistCheckpoint(taskId: string, taskRound: number, startedAt: string, stage: 'text-semantics' | 'multimodal-review', reason: string, progressCurrent: number, progressTotal: number, resourceBudget: Record<string, number | null>, resourceUsage: Record<string, number>): void {
    const now = new Date().toISOString()
    const timeoutMs = Math.max(1_000, resourceBudget.providerTimeoutMs ?? 60_000)
    const estimatedRemainingMs = Math.max(0, progressTotal - progressCurrent) * timeoutMs
    const targetCompletedAt = new Date(Date.now() + Math.max(60_000, estimatedRemainingMs)).toISOString()
    const extensionMs = timeoutMs
    const previous = this.database.prepare('SELECT checkpoint FROM production_tasks WHERE id = ?').get(taskId) as { checkpoint: string | null } | undefined
    let previousCheckpoint: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(previous?.checkpoint ?? '{}')
      if (parsed && typeof parsed === 'object') previousCheckpoint = parsed as Record<string, unknown>
    } catch { /* invalid historical checkpoint */ }
    if (previousCheckpoint.stage === 'over-target' || previousCheckpoint.stage === 'awaiting-decision') return
    const extensionGranted = previousCheckpoint.extensionGranted === true
    const existingExtensionDeadlineAt = typeof previousCheckpoint.extensionDeadlineAt === 'string' ? previousCheckpoint.extensionDeadlineAt : null
    const priorTarget = typeof previousCheckpoint.targetCompletedAt === 'string' ? previousCheckpoint.targetCompletedAt : null
    if (!extensionGranted && priorTarget && new Date() >= new Date(priorTarget) && progressCurrent < progressTotal) {
      const decisionDeadlineAt = new Date(Date.now() + extensionMs).toISOString()
      this.controllers.get(taskId)?.abort(); this.controllers.delete(taskId)
      const paused = this.database.prepare("UPDATE production_tasks SET status = 'paused', checkpoint = ?, updated_at = ? WHERE id = ? AND status = 'running'").run(JSON.stringify({ version: 1, stage: 'awaiting-decision', reason: `${reason} 已达到本阶段目标时间；请在有限延期内选择继续或停止。`, round: taskId, taskRound, startedAt, elapsedMs: Math.max(0, Date.now() - new Date(startedAt).getTime()), targetCompletedAt, extensionDeadlineAt: decisionDeadlineAt, extensionMs, resourceBudget, resourceUsage }), new Date().toISOString(), taskId)
      if (paused.changes === 1) this.schedulePersistedDeadline(taskId, decisionDeadlineAt, '候选生成的继续/停止决策窗口已到期，系统停止候选生成并保留检查点。')
      return
    }
    const wait = estimatedRemainingMs >= 60_000 ? `${Math.ceil(estimatedRemainingMs / 60_000)} 分钟` : `${Math.ceil(estimatedRemainingMs / 1_000)} 秒`
    this.database.prepare('UPDATE production_tasks SET checkpoint = ?, progress_current = ?, progress_total = ?, updated_at = ? WHERE id = ? AND type = ? AND status = ?').run(JSON.stringify({ version: 1, stage, reason: `${reason} 保守预计剩余 ${wait}。`, round: taskId, taskRound, startedAt, activeSince: now, elapsedMs: Math.max(0, Date.now() - new Date(startedAt).getTime()), estimatedRemainingMs, targetCompletedAt, extensionDeadlineAt: extensionGranted ? existingExtensionDeadlineAt : new Date(new Date(targetCompletedAt).getTime() + timeoutMs).toISOString(), ...(extensionGranted ? { extensionGranted: true } : {}), resourceBudget, resourceUsage }), progressCurrent, progressTotal, now, taskId, 'original_clip', 'running')
    const priorTimer = this.stageTimers.get(taskId)
    if (priorTimer) clearTimeout(priorTimer)
    if (!extensionGranted && progressCurrent < progressTotal) this.stageTimers.set(taskId, setTimeout(() => {
      this.stageTimers.delete(taskId)
      const deadline = new Date(Date.now() + extensionMs).toISOString()
      const paused = this.database.prepare("UPDATE production_tasks SET status = 'paused', checkpoint = ?, updated_at = ? WHERE id = ? AND status = 'running'").run(JSON.stringify({ version: 1, stage: 'awaiting-decision', reason: `${reason} 已达到本阶段目标时间；请在有限延期内选择继续或停止。`, round: taskId, taskRound, startedAt, targetCompletedAt, extensionDeadlineAt: deadline, decisionDeadlineAt: deadline, extensionMs, resourceBudget, resourceUsage }), new Date().toISOString(), taskId)
      if (paused.changes === 1) {
        this.controllers.get(taskId)?.abort(); this.controllers.delete(taskId)
        this.schedulePersistedDeadline(taskId, deadline, '候选生成的继续/停止决策窗口已到期，系统停止候选生成并保留检查点。')
      }
    }, Math.max(1, new Date(targetCompletedAt).getTime() - Date.now())))
  }

  cancel(taskIdInput: unknown): void {
    const taskId = z.string().uuid().parse(taskIdInput)
    this.controllers.get(taskId)?.abort(); this.controllers.delete(taskId)
    this.clearTimers(taskId)
    const result = this.database.prepare("UPDATE production_tasks SET status = ?, checkpoint = ?, updated_at = ? WHERE id = ? AND type = ? AND status IN (?, ?)").run('cancelled', JSON.stringify({ version: 1, stage: 'cancelled', reason: '操作员取消候选生成。' }), new Date().toISOString(), taskId, 'original_clip', 'running', 'pending')
    if (!result.changes) throw new Error('候选生成任务不存在或已结束。')
    void this.drain().catch(() => undefined)
  }

  stopForShutdown(taskIdInput: unknown): void {
    this.shuttingDown = true
    const taskId = z.string().uuid().parse(taskIdInput)
    const task = this.database.prepare("SELECT status FROM production_tasks WHERE id = ? AND type = 'original_clip' AND json_extract(config_snapshot, '$.generation') IS NOT NULL").get(taskId) as { status: string } | undefined
    if (!task) throw new Error('候选生成任务不存在。')
    if (task.status === 'pending') return
    if (task.status !== 'running') return
    this.controllers.get(taskId)?.abort(); this.controllers.delete(taskId)
    this.clearTimers(taskId)
    this.database.prepare("UPDATE production_tasks SET status = 'interrupted', checkpoint = json_set(COALESCE(checkpoint, '{}'), '$.stage', 'interrupted', '$.reason', '应用关闭时中断了供应商调用；该请求不会自动重放，请重新生成。'), updated_at = ? WHERE id = ? AND status = 'running'").run(new Date().toISOString(), taskId)
  }

  decideDeadline(taskIdInput: unknown, action: 'continue' | 'stop'): void {
    const taskId = z.string().uuid().parse(taskIdInput)
    const row = this.database.prepare("SELECT status, checkpoint FROM production_tasks WHERE id = ? AND type = 'original_clip'").get(taskId) as { status: string; checkpoint: string | null } | undefined
    if (!row) throw new Error('候选生成任务不存在。')
    let checkpoint: Record<string, unknown> = {}
    try {
      const parsed: unknown = JSON.parse(row.checkpoint ?? '{}')
      if (parsed && typeof parsed === 'object') checkpoint = parsed as Record<string, unknown>
    } catch { /* invalid historical checkpoint */ }
    if (checkpoint.stage !== 'awaiting-decision') throw new Error('当前候选生成任务不在耗时决策状态。')
    const decisionDeadlineAt = typeof checkpoint.extensionDeadlineAt === 'string' ? checkpoint.extensionDeadlineAt : null
    if (!decisionDeadlineAt || new Date(decisionDeadlineAt).getTime() <= Date.now()) {
      this.database.prepare("UPDATE production_tasks SET status = 'cancelled', checkpoint = json_set(COALESCE(checkpoint, '{}'), '$.stage', 'cancelled', '$.reason', '候选生成的继续/停止决策窗口已到期，系统停止候选生成并保留检查点。'), updated_at = ? WHERE id = ? AND type = 'original_clip' AND status = 'paused'").run(new Date().toISOString(), taskId)
      throw new Error('候选生成的继续/停止决策窗口已到期，不能再操作。')
    }
    if (action === 'stop') {
      this.clearTimers(taskId)
      this.database.prepare("UPDATE production_tasks SET status = 'cancelled', checkpoint = ?, updated_at = ? WHERE id = ? AND status = 'paused'").run(JSON.stringify({ ...checkpoint, stage: 'cancelled', reason: '操作员在有限延期决策点选择停止候选生成。' }), new Date().toISOString(), taskId)
      return
    }
    if (checkpoint.extensionGranted === true) throw new Error('候选生成已使用唯一一次有限延期，不能再次继续。')
    const extensionMs = Math.max(1_000, Number(checkpoint.extensionMs ?? 60_000))
    const extensionDeadlineAt = new Date(Date.now() + extensionMs).toISOString()
    const resumed = this.database.prepare("UPDATE production_tasks SET status = 'pending', checkpoint = ?, updated_at = ? WHERE id = ? AND status = 'paused'").run(JSON.stringify({ ...checkpoint, stage: 'text-semantics', extensionGranted: true, decisionDeadlineAt: null, extensionDeadlineAt, reason: '操作员已同意一次有限延期；将从冻结配置重新排队。' }), new Date().toISOString(), taskId)
    if (resumed.changes !== 1) throw new Error('候选生成任务状态已变化，无法继续。')
    const stageTimer = this.stageTimers.get(taskId)
    if (stageTimer) clearTimeout(stageTimer)
    this.stageTimers.delete(taskId)
    this.schedulePersistedDeadline(taskId, extensionDeadlineAt)
    void this.drain().catch(() => undefined)
  }

  private expirePersistedDeadlines(): void {
    const now = new Date().toISOString()
    this.database.prepare("UPDATE production_tasks SET status = 'cancelled', checkpoint = json_set(COALESCE(checkpoint, '{}'), '$.stage', 'cancelled', '$.reason', CASE WHEN json_extract(checkpoint, '$.stage') = 'awaiting-decision' THEN '候选生成的继续/停止决策窗口已在应用重启期间到期，系统停止候选生成并保留检查点。' ELSE '唯一一次有限延期已在应用重启期间到期，系统停止候选生成并保留检查点。' END), updated_at = ? WHERE type = 'original_clip' AND status IN ('pending', 'paused', 'running', 'interrupted') AND (json_extract(checkpoint, '$.extensionGranted') = 1 OR json_extract(checkpoint, '$.stage') = 'awaiting-decision') AND json_extract(checkpoint, '$.extensionDeadlineAt') IS NOT NULL AND json_extract(checkpoint, '$.extensionDeadlineAt') <= ?").run(now, now)
  }

  private schedulePersistedDeadline(taskId: string, deadline: string, reason = '唯一一次有限延期已到期，系统停止候选生成并保留检查点。'): void {
    const existing = this.extensionTimers.get(taskId)
    if (existing) clearTimeout(existing)
    const delay = Math.max(1, new Date(deadline).getTime() - Date.now())
    this.extensionTimers.set(taskId, setTimeout(() => {
      this.controllers.get(taskId)?.abort(); this.controllers.delete(taskId)
      this.database.prepare("UPDATE production_tasks SET status = 'cancelled', checkpoint = json_set(COALESCE(checkpoint, '{}'), '$.stage', 'cancelled', '$.reason', ?), updated_at = ? WHERE id = ? AND type = 'original_clip' AND status IN ('pending', 'running', 'paused')").run(reason, new Date().toISOString(), taskId)
      this.extensionTimers.delete(taskId)
    }, delay))
  }

  private clearTimers(taskId: string): void {
    const stageTimer = this.stageTimers.get(taskId)
    if (stageTimer) clearTimeout(stageTimer)
    this.stageTimers.delete(taskId)
    const extensionTimer = this.extensionTimers.get(taskId)
    if (extensionTimer) clearTimeout(extensionTimer)
    this.extensionTimers.delete(taskId)
  }
}
