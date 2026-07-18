import { describe, expect, it } from 'vitest'
import { aggregateTaskStatus, decideAfterFailure } from './task-retry-policy.js'
import { buildTaskReport } from './task-report-service.js'

describe('task retry and report rules', () => { it('retries once and then continues with partial status', () => { expect(decideAfterFailure(0).retryCount).toBe(1); expect(decideAfterFailure(1).status).toBe('failed'); expect(aggregateTaskStatus(['succeeded', 'failed'])).toBe('partial'); expect(buildTaskReport(['succeeded', 'failed']).status).toBe('partial') }) })
