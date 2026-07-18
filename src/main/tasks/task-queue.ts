import type Database from 'better-sqlite3'
import { TaskCheckpointService } from './task-checkpoint-service.js'
import { buildTaskReport, type TaskReport } from './task-report-service.js'
import { aggregateTaskStatus, decideAfterFailure } from './task-retry-policy.js'
import { TaskStore } from './task-store.js'
import type {
  QueueMode,
  RecoverableTask,
  TaskExecutionItem,
  TaskExecutor,
  TaskRunOptions
} from './task-types.js'

export type { QueueMode, TaskExecutor, TaskExecutionItem, TaskItemResult, TaskRunOptions } from './task-types.js'

export type TaskRunResult = {
  taskId: string
  status: ReturnType<typeof aggregateTaskStatus>
  report: TaskReport
}

type StopReason = 'cancel' | 'shutdown' | null
type ActiveExecution = {
  taskId: string
  paused: boolean
  stopReason: StopReason
  controllers: Map<string, AbortController>
  waiters: Set<() => void>
  executorCheckpoint: unknown | null
}

const RUNNABLE_STATUSES = new Set(['pending', 'running', 'paused'])

export class TaskQueue {
  private readonly store: TaskStore
  private readonly checkpoints: TaskCheckpointService
  private active: ActiveExecution | null = null

  constructor(
    private readonly database: Database.Database,
    private readonly speedConcurrency = 2
  ) {
    if (!Number.isInteger(speedConcurrency) || speedConcurrency < 1 || speedConcurrency > 4) {
      throw new Error('Speed concurrency must be an integer between 1 and 4')
    }
    this.store = new TaskStore(database)
    this.checkpoints = new TaskCheckpointService(database)
  }

  listRecoverableTasks(): RecoverableTask[] {
    return this.checkpoints.listRecoverableTasks()
  }

  run(taskId: string, executor: TaskExecutor, options: TaskRunOptions = {}): Promise<TaskRunResult> {
    return this.execute(taskId, executor, options.mode ?? 'background')
  }

  recover(taskId: string, executor: TaskExecutor, options: TaskRunOptions = {}): Promise<TaskRunResult> {
    const recoverable = this.listRecoverableTasks().some(({ id }) => id === taskId)
    if (!recoverable) throw new Error('该任务没有可恢复的未完成项。')
    return this.execute(taskId, executor, options.mode ?? 'background')
  }

  retryFailed(taskId: string, executor: TaskExecutor, options: TaskRunOptions = {}): Promise<TaskRunResult> {
    this.assertIdle(taskId)
    this.store.assertTask(taskId)
    const failedItemIds = new Set(this.store.resetFailedItems(taskId))
    return this.execute(taskId, executor, options.mode ?? 'background', failedItemIds)
  }

  pause(taskId: string): void {
    const active = this.requireActive(taskId)
    active.paused = true
    this.store.markTaskStatus(taskId, 'paused')
    this.checkpoints.saveProgress(taskId, active.executorCheckpoint)
  }

  resume(taskId: string): void {
    const active = this.requireActive(taskId)
    if (active.stopReason) throw new Error('Stopped tasks must be recovered with an executor')
    active.paused = false
    this.store.markTaskStatus(taskId, 'running')
    this.releaseWaiters(active)
  }

  cancel(taskId: string): void {
    this.store.assertTask(taskId)
    const active = this.active?.taskId === taskId ? this.active : null
    if (active) {
      active.stopReason = 'cancel'
      for (const controller of active.controllers.values()) controller.abort()
      this.releaseWaiters(active)
    }
    this.store.cancelRunnableItems(taskId)
    this.store.markTaskStatus(taskId, 'cancelled')
    this.checkpoints.saveProgress(taskId, active?.executorCheckpoint)
  }

  stopForShutdown(taskId: string): void {
    const active = this.requireActive(taskId)
    active.stopReason = 'shutdown'
    active.paused = false
    this.store.markTaskStatus(taskId, 'paused')
    for (const controller of active.controllers.values()) controller.abort()
    this.releaseWaiters(active)
    this.checkpoints.saveProgress(taskId, active.executorCheckpoint)
  }

  private async execute(
    taskId: string,
    executor: TaskExecutor,
    mode: QueueMode,
    selectedIds?: ReadonlySet<string>
  ): Promise<TaskRunResult> {
    this.assertIdle(taskId)
    this.store.assertTask(taskId)
    const items = this.store.listItems(taskId).filter((item) =>
      RUNNABLE_STATUSES.has(item.status) && (!selectedIds || selectedIds.has(item.id)))
    const active: ActiveExecution = {
      taskId,
      paused: false,
      stopReason: null,
      controllers: new Map(),
      waiters: new Set(),
      executorCheckpoint: this.checkpoints.load(taskId)
    }
    this.active = active
    this.store.markTaskStarted(taskId)
    try {
      const concurrency = mode === 'background' ? 1 : Math.min(this.speedConcurrency, Math.max(items.length, 1))
      let nextIndex = 0
      const worker = async (): Promise<void> => {
        while (nextIndex < items.length) {
          if (mode === 'background') await yieldToEventLoop()
          if (!(await this.waitUntilRunnable(active))) return
          const item = items[nextIndex]
          nextIndex += 1
          if (!item) return
          await this.executeItem(active, item, executor, mode)
        }
      }
      await Promise.all(Array.from({ length: concurrency }, worker))
      return this.finishExecution(active)
    } finally {
      if (this.active === active) this.active = null
    }
  }

  private async executeItem(
    active: ActiveExecution,
    item: TaskExecutionItem,
    executor: TaskExecutor,
    mode: QueueMode
  ): Promise<void> {
    let retryCount = item.retryCount
    while (!active.stopReason) {
      this.store.markItemRunning(item.id)
      const controller = new AbortController()
      active.controllers.set(item.id, controller)
      try {
        const result = await executor(
          { ...item, status: 'running', retryCount },
          { signal: controller.signal, attempt: retryCount + 1, mode, checkpoint: active.executorCheckpoint }
        )
        if (active.stopReason === 'shutdown') this.store.pauseRunningItem(item.id)
        else if (!active.stopReason) {
          this.store.completeItem(item.id, result)
          if (result?.checkpoint !== undefined) active.executorCheckpoint = result.checkpoint
        }
        break
      } catch (error) {
        if (active.stopReason === 'shutdown') {
          this.store.pauseRunningItem(item.id)
          break
        }
        if (active.stopReason === 'cancel') break
        const reason = error instanceof Error ? error.message : '任务项执行失败。'
        const decision = decideAfterFailure(retryCount)
        retryCount = decision.retryCount
        if (!decision.shouldRetry) {
          this.store.markItemFailed(item.id, retryCount, reason)
          break
        }
        this.store.markItemRetry(item.id, retryCount, reason)
      } finally {
        active.controllers.delete(item.id)
      }
    }
    this.store.refreshProgress(active.taskId)
    this.checkpoints.saveProgress(active.taskId, active.executorCheckpoint)
  }

  private finishExecution(active: ActiveExecution): TaskRunResult {
    this.store.refreshProgress(active.taskId)
    const items = this.store.listItems(active.taskId)
    const report = buildTaskReport(items)
    const status = active.stopReason === 'shutdown'
      ? 'paused'
      : active.stopReason === 'cancel'
        ? 'cancelled'
        : aggregateTaskStatus(items.map(({ status: itemStatus }) => itemStatus))
    this.store.markTaskStatus(active.taskId, status)
    this.checkpoints.saveProgress(active.taskId, active.executorCheckpoint)
    return { taskId: active.taskId, status, report }
  }

  private waitUntilRunnable(active: ActiveExecution): Promise<boolean> {
    if (active.stopReason) return Promise.resolve(false)
    if (!active.paused) return Promise.resolve(true)
    return new Promise((resolve) => {
      const wake = (): void => resolve(!active.stopReason)
      active.waiters.add(wake)
    })
  }

  private releaseWaiters(active: ActiveExecution): void {
    const waiters = [...active.waiters]
    active.waiters.clear()
    for (const wake of waiters) wake()
  }

  private requireActive(taskId: string): ActiveExecution {
    if (!this.active || this.active.taskId !== taskId) throw new Error('Task is not running in this queue')
    return this.active
  }

  private assertIdle(taskId: string): void {
    if (this.active) throw new Error(this.active.taskId === taskId ? 'Task is already running' : 'Another task is already running')
  }
}

const yieldToEventLoop = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))
