import { describe, expect, it } from 'vitest'
import { decideAiDuration } from './ai-duration-policy.js'

describe('AI duration policy', () => {
  it('enforces the 30/40/50 minute decision boundaries', () => {
    expect(decideAiDuration(29 * 60_000)).toBe('on-target')
    expect(decideAiDuration(30 * 60_000)).toBe('over-target')
    expect(decideAiDuration(40 * 60_000)).toBe('needs-decision')
    expect(decideAiDuration(50 * 60_000)).toBe('force-stop')
  })
})
