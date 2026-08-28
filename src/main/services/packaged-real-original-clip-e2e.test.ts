import { describe, expect, it } from 'vitest'
import { packagedRealOriginalClipE2eResultPath } from './packaged-real-original-clip-e2e.js'

describe('packagedRealOriginalClipE2eResultPath', () => {
  it('does not activate without an explicit absolute result path', () => {
    expect(packagedRealOriginalClipE2eResultPath()).toBeNull()
  })
})
