import { describe, expect, it } from 'vitest'
import { clipCandidateLabel, clipExportBaseName, clipSequence } from './clip-candidate-label.js'

describe('shared clip identity', () => {
  it('uses the same padded number in the visible label and file', () => {
    const candidate = { id: 'abcdef123456', sequenceNumber: 1 }
    expect(clipCandidateLabel(candidate)).toBe('切片01')
    expect(clipExportBaseName('第{episode}集_切片{sequence}', 2, candidate)).toBe('第02集_切片01')
    expect(clipExportBaseName('中文_第{episode}集_切片{sequence}', 2, { ...candidate, sequenceNumber: 2 })).toBe('中文_第02集_切片02')
    expect(clipSequence(123)).toBe('123')
  })
  it('does not invent a number and leaves old templates compatible', () => {
    const candidate = { id: 'abcdef123456' }
    expect(clipCandidateLabel(candidate)).toBe('C-abcdef12')
    expect(() => clipExportBaseName('第{episode}集_切片{sequence}', 2, candidate)).toThrow('尚无可核验编号')
    expect(clipExportBaseName('clip_{episode}_{candidate}', 2, candidate)).toBe('clip_02_abcdef12')
    expect(clipSequence(0)).toBeNull(); expect(clipSequence(1.2)).toBeNull()
  })
})
