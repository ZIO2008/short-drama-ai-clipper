import { describe, expect, it } from 'vitest'
import { aggregateTaskStatus, decideAfterFailure } from './task-retry-policy.js'
import { buildTaskReport } from './task-report-service.js'

describe('task retry and report rules', () => {
  it('allows exactly one automatic retry', () => {
    expect(decideAfterFailure(0)).toEqual({ status: 'pending', retryCount: 1, shouldRetry: true })
    expect(decideAfterFailure(1)).toEqual({ status: 'failed', retryCount: 1, shouldRetry: false })
  })

  it('uses the unified partial status for mixed success and failure', () => {
    expect(aggregateTaskStatus(['succeeded', 'failed'])).toBe('partial')
    expect(buildTaskReport([
      { id: 'success', status: 'exported', reason: null },
      { id: 'reduced', status: 'reduced', reason: '尾部缩减' },
      { id: 'skipped', status: 'skipped', reason: '缺集' },
      { id: 'failed', status: 'failed', reason: '编码失败' }
    ])).toEqual({
      total: 4,
      succeeded: 1,
      reduced: 1,
      skipped: 1,
      failed: 1,
      status: 'partial',
      reasons: [
        { itemId: 'reduced', status: 'reduced', reason: '尾部缩减' },
        { itemId: 'skipped', status: 'skipped', reason: '缺集' },
        { itemId: 'failed', status: 'failed', reason: '编码失败' }
      ]
    })
  })
})
