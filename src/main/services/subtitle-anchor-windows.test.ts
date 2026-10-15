import { describe, expect, it } from 'vitest'
import { selectSubtitleAnchorWindows } from './subtitle-anchor-windows.js'

const cost = { resultFormat: 3, sentenceMaxLength: 40 }
const cue = (startSeconds: number, endSeconds: number) => ({ startSeconds, endSeconds })

describe('selectSubtitleAnchorWindows', () => {
  it.each(['ocr', 'import', 'asr', 'resolved'] as const)('recovers local %s anchors after long leading and interior gaps', (sourceKind) => {
    const result = selectSubtitleAnchorWindows({ sourceKind, cost, durationSeconds: 300, cues: [cue(100, 103), cue(110, 114), cue(200, 205)] })
    expect(result.windows.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds])).toEqual([[100, 114], [200, 205]])
    expect(result.windows.every(({ quality }) => quality.status === 'qualified')).toBe(true)
    expect(result.cues).toHaveLength(3)
  })

  it('drops only coarse ASR rows and splits the resulting unanchored gap', () => {
    const result = selectSubtitleAnchorWindows({ sourceKind: 'asr', cost, cues: [cue(0, 3), cue(3, 50), cue(50, 54)] })
    expect(result.cues).toEqual([cue(0, 3), cue(50, 54)])
    expect(result.windows).toHaveLength(2)
  })

  it('keeps exact twenty-second cues and gaps without expanding either boundary', () => {
    const result = selectSubtitleAnchorWindows({ sourceKind: 'asr', cost, cues: [cue(7, 27), cue(47, 57), cue(57, 67), cue(87.001, 88)] })
    expect(result.windows.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds])).toEqual([[7, 67], [87.001, 88]])
  })

  it.each([undefined, { resultFormat: 1 }, { resultFormat: 3, sentenceMaxLength: 41 }])('does not rehabilitate invalid ASR metadata %j', (metadata) => {
    expect(selectSubtitleAnchorWindows({ sourceKind: 'asr', cost: metadata, cues: [cue(100, 103)] })).toEqual({ cues: [], windows: [] })
  })

  it.each([cue(-1, 2), cue(5, 4), cue(5, 5), cue(NaN, 6), cue(5, Infinity), cue(60, 61)])('rejects the track containing invalid or out-of-source timing %j', (invalid) => {
    expect(selectSubtitleAnchorWindows({ sourceKind: 'ocr', durationSeconds: 60, cues: [cue(1, 4), invalid] })).toEqual({ cues: [], windows: [] })
  })

  it('rejects negligible coverage within a local interval', () => {
    expect(selectSubtitleAnchorWindows({ sourceKind: 'ocr', cues: [cue(100, 100.01), cue(110, 110.01), cue(120, 120.01)] }).windows).toEqual([])
  })

  it('rejects overlapping duplicate piles while preserving an independent good window', () => {
    const result = selectSubtitleAnchorWindows({ sourceKind: 'ocr', cues: [...Array.from({ length: 8 }, () => cue(1, 1.1)), cue(50, 54)] })
    expect(result.cues).toEqual([cue(50, 54)])
  })

  it('does not mutate source objects or timestamps while sorting windows', () => {
    const late = Object.freeze({ ...cue(100, 105), text: 'late', id: 2 })
    const early = Object.freeze({ ...cue(20, 25), text: 'early', id: 1 })
    const cues = Object.freeze([late, early])
    const result = selectSubtitleAnchorWindows({ sourceKind: 'ocr', cues })
    expect(result.cues[0]).toBe(early)
    expect(result.cues[1]).toBe(late)
    expect(cues).toEqual([late, early])
    expect(early.startSeconds).toBe(20)
    expect(result.windows[0].quality.maxGapSeconds).toBe(0)
  })

  it('preserves legitimate overlap and measures union coverage through the longest end', () => {
    const result = selectSubtitleAnchorWindows({ sourceKind: 'ocr', cues: [cue(100, 110), cue(102, 105), cue(108, 112)] })
    expect(result.cues).toHaveLength(3)
    expect(result.windows[0]).toMatchObject({ startSeconds: 100, endSeconds: 112, quality: { coveredSeconds: 12, coverageRatio: 1 } })
  })

  it('does not count duplicate ranges toward ASR density', () => {
    const result = selectSubtitleAnchorWindows({ sourceKind: 'asr', cost, cues: [cue(0, 20), cue(0, 20), cue(40, 60)] })
    expect(result.windows).toEqual([])
  })

  it('returns no anchors for an empty track or only coarse ASR', () => {
    expect(selectSubtitleAnchorWindows({ sourceKind: 'ocr', cues: [] })).toEqual({ cues: [], windows: [] })
    expect(selectSubtitleAnchorWindows({ sourceKind: 'asr', cost, cues: [cue(0, 30)] })).toEqual({ cues: [], windows: [] })
  })
})
