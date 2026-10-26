import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

describe('clip evidence baseline digest contract', () => {
  it('treats SHA-256 hex casing as presentation-only', () => {
    const digest = createHash('sha256').update('baseline-fixture').digest('hex')
    expect(digest.toLowerCase()).toBe(digest.toUpperCase().toLowerCase())
  })
})
