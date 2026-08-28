import { describe, expect, it } from 'vitest'
import { BASELINE_MANIFEST_SHA256, assertFrozenBaselineManifest, resolveFrozenMediaPath } from './packaged-real-asr-evidence-guard.js'

describe('packaged real ASR evidence guard', () => {
  it('accepts only the frozen Baseline v1 manifest hash', () => {
    expect(() => assertFrozenBaselineManifest(BASELINE_MANIFEST_SHA256.toUpperCase())).not.toThrow()
    expect(() => assertFrozenBaselineManifest('0'.repeat(64))).toThrow('manifest')
  })

  it('keeps registered relative media paths inside the frozen root', () => {
    expect(resolveFrozenMediaPath('D:/shortdrama-evidence-baseline/v1', 'public/dev-01.mp4')).toMatch(/shortdrama-evidence-baseline[\\/]v1[\\/]public[\\/]dev-01\.mp4$/)
  })

  it.each(['../outside.mp4', '..\\outside.mp4', 'D:/outside.mp4'])('rejects a media path outside the frozen root: %s', (path) => {
    expect(() => resolveFrozenMediaPath('D:/shortdrama-evidence-baseline/v1', path)).toThrow(/路径/)
  })
})
