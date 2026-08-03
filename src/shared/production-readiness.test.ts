import { describe, expect, it } from 'vitest'
import { isProductionReady } from './production-readiness.js'

describe('production readiness', () => {
  it('accepts both current ready assets and readable legacy available assets', () => {
    expect(isProductionReady('ready')).toBe(true)
    expect(isProductionReady('available')).toBe(true)
    expect(isProductionReady('missing')).toBe(false)
  })
})
