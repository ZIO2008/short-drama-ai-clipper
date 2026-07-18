import type { TaskFinalStatus, TaskItemStatus } from './task-types.js'

export type RetryDecision = {
  status: 'pending' | 'failed'
  retryCount: number
  shouldRetry: boolean
}

export const decideAfterFailure = (retryCount: number): RetryDecision => retryCount < 1
  ? { status: 'pending', retryCount: retryCount + 1, shouldRetry: true }
  : { status: 'failed', retryCount, shouldRetry: false }

export const aggregateTaskStatus = (statuses: readonly TaskItemStatus[]):
  | 'pending'
  | 'running'
  | 'paused'
  | TaskFinalStatus => {
  if (statuses.some((status) => status === 'running')) return 'running'
  if (statuses.some((status) => status === 'paused')) return 'paused'
  if (statuses.some((status) => status === 'pending')) return 'pending'
  if (statuses.some((status) =>
    status === 'pending_review' || status === 'editing' || status === 'confirmed' ||
    status === 'exporting' || status === 'blocked' || status === 'unknown')) return 'pending'
  if (statuses.some((status) => status === 'cancelled')) return 'cancelled'
  const failed = statuses.filter((status) => status === 'failed').length
  if (failed === statuses.length && failed > 0) return 'failed'
  if (failed > 0) return 'partial'
  return statuses.length > 0 ? 'completed' : 'failed'
}
