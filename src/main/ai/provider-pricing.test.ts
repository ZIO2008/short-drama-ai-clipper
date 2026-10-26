import { describe, expect, it } from 'vitest'
import { readPerRequestPrice } from './provider-pricing.js'

describe('readPerRequestPrice', () => {
  it('accepts a non-negative structured per-request price only', () => {
    expect(readPerRequestPrice('{"perRequest":1.25}')).toBe(1.25)
    expect(readPerRequestPrice('{"perRequest":-1}')).toBeNull()
    expect(readPerRequestPrice('1.25')).toBeNull()
  })
})
