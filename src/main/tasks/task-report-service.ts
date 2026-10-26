import type { TaskFinalStatus, TaskItemStatus } from './task-types.js'

export type TaskReport = {
  total: number
  succeeded: number
  reduced: number
  skipped: number
  failed: number
  status: TaskFinalStatus
  reasons: Array<{ itemId: string; status: 'reduced' | 'skipped' | 'failed'; reason: string | null }>
}

export type ReportItem = { id: string; status: TaskItemStatus; reason: string | null }

export const buildTaskReport = (items: readonly ReportItem[]): TaskReport => {
  const succeeded = count(items, ['succeeded', 'exported'])
  const reduced = count(items, ['reduced'])
  const skipped = count(items, ['skipped', 'cancelled'])
  const failed = count(items, ['failed'])
  const completed = succeeded + reduced + skipped
  const status: TaskFinalStatus = items.some(({ status: value }) => value === 'cancelled')
    ? 'cancelled'
    : failed === 0 && completed === items.length && items.length > 0
      ? 'completed'
      : failed > 0 && completed > 0
        ? 'partial'
        : 'failed'
  return {
    total: items.length,
    succeeded,
    reduced,
    skipped,
    failed,
    status,
    reasons: items
      .filter((item): item is ReportItem & { status: 'reduced' | 'skipped' | 'failed' } =>
        item.status === 'reduced' || item.status === 'skipped' || item.status === 'failed')
      .map(({ id, status: itemStatus, reason }) => ({ itemId: id, status: itemStatus, reason }))
  }
}

const count = (items: readonly ReportItem[], statuses: readonly TaskItemStatus[]): number =>
  items.filter(({ status }) => statuses.includes(status)).length
