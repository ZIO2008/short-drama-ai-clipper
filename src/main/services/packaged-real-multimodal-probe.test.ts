import { describe, expect, it } from 'vitest'
import { packagedRealMultimodalProbeFailureSummary, packagedRealMultimodalProbeResultPath } from './packaged-real-multimodal-probe.js'

describe('packagedRealMultimodalProbeResultPath', () => {
  it('does not activate without the explicit result argument', () => {
    expect(packagedRealMultimodalProbeResultPath()).toBeNull()
  })

  it('keeps failed probes observable without provider content', () => {
    expect(packagedRealMultimodalProbeFailureSummary('authentication', Date.now() - 5)).toEqual(expect.objectContaining({ status: 'failed', reason: 'isolated-multimodal-probe-failed', code: 'authentication', sourceDatabaseWrites: 0 }))
    expect(packagedRealMultimodalProbeFailureSummary('authentication', Date.now() - 5).elapsedMs).toEqual(expect.any(Number))
    expect(packagedRealMultimodalProbeFailureSummary('key-unreadable', Date.now() - 5)).toEqual(expect.objectContaining({ code: 'key-unreadable', sourceDatabaseWrites: 0 }))
  })
})
