export type QueueMode = 'background' | 'speed'

export type TaskItemStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'succeeded'
  | 'exported'
  | 'reduced'
  | 'skipped'
  | 'failed'
  | 'cancelled'
  | 'pending_review'
  | 'editing'
  | 'confirmed'
  | 'exporting'
  | 'blocked'
  | 'unknown'

export type TaskFinalStatus = 'completed' | 'partial' | 'failed' | 'cancelled'

export type TaskExecutionItem = {
  id: string
  taskId: string
  plannedRange: unknown | null
  actualRange: unknown | null
  status: TaskItemStatus
  retryCount: number
  reason: string | null
}

export type TaskExecutionContext = {
  signal: AbortSignal
  attempt: number
  mode: QueueMode
  checkpoint: unknown | null
}

export type TaskItemResult = {
  status?: 'succeeded' | 'reduced' | 'skipped'
  reason?: string | null
  actualRange?: unknown
  checkpoint?: unknown
}

export type TaskExecutor = (
  item: TaskExecutionItem,
  context: TaskExecutionContext
) => Promise<TaskItemResult | void>

export type RecoverableTask = {
  id: string
  status: 'pending' | 'running' | 'paused'
  progressCurrent: number
  progressTotal: number
}

export type TaskRunOptions = {
  mode?: QueueMode
}
