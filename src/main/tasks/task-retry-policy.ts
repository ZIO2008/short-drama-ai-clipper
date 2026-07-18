export type ItemStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'paused' | 'cancelled'
export type RetryDecision = { status: ItemStatus; retryCount: number; shouldContinue: boolean; reason: string }
export const decideAfterFailure = (retryCount: number): RetryDecision => retryCount < 1 ? { status: 'pending', retryCount: retryCount + 1, shouldContinue: true, reason: '自动重试一次' } : { status: 'failed', retryCount, shouldContinue: true, reason: '连续失败，继续后续项' }
export const aggregateTaskStatus = (statuses: readonly ItemStatus[]): 'pending' | 'running' | 'completed' | 'partial' | 'failed' | 'paused' | 'cancelled' => {
  if (statuses.some((status) => status === 'running')) return 'running'; if (statuses.some((status) => status === 'paused')) return 'paused'; if (statuses.length > 0 && statuses.every((status) => status === 'succeeded')) return 'completed'; if (statuses.some((status) => status === 'succeeded')) return 'partial'; if (statuses.some((status) => status === 'failed')) return 'failed'; if (statuses.some((status) => status === 'cancelled')) return 'cancelled'; return 'pending'
}
