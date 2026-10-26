import { describe, expect, it } from 'vitest'
import { hasExactSampleIds } from './phase29-acceptance-contract.mjs'

describe('Phase 29 acceptance contract', () => {
  it('requires exactly one positive and one negative multimodal sample', () => {
    expect(hasExactSampleIds([{ sampleId: 'dev-04' }, { sampleId: 'dev-03' }], ['dev-03', 'dev-04'])).toBe(true)
    expect(hasExactSampleIds([{ sampleId: 'dev-04' }, { sampleId: 'dev-04' }], ['dev-03', 'dev-04'])).toBe(false)
    expect(hasExactSampleIds([{ sampleId: 'dev-04' }], ['dev-03', 'dev-04'])).toBe(false)
    expect(hasExactSampleIds([{ sampleId: 'dev-03' }, { sampleId: 'dev-04' }, { sampleId: 'dev-05' }], ['dev-03', 'dev-04'])).toBe(false)
  })
})
