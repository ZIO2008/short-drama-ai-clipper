import { describe, expect, it } from 'vitest'
import { analyzeSubtitleTimeQuality, isSafeSubtitleAnchor } from './subtitle-time-quality.js'

describe('subtitle-time-quality', () => {
  it('accepts a sentence-level ASR track only when its format metadata is present', () => {
    const quality = analyzeSubtitleTimeQuality({ sourceKind: 'asr', durationSeconds: 90, cost: { resultFormat: 3, sentenceMaxLength: 40 }, cues: [{ startSeconds: 1, endSeconds: 3 }, { startSeconds: 8, endSeconds: 11 }, { startSeconds: 16, endSeconds: 18 }, { startSeconds: 25, endSeconds: 28 }, { startSeconds: 35, endSeconds: 37 }] })
    expect(quality).toMatchObject({ status: 'qualified', reasonCode: 'qualified', cueCount: 5, validCueCount: 5, minimumCueCount: 5, averageCueDurationSeconds: 2.4, maxGapSeconds: 7 })
    expect(isSafeSubtitleAnchor(quality)).toBe(true)
  })

  it('blocks a formatted ASR track when its cue density cannot support automatic cut points', () => {
    const quality = analyzeSubtitleTimeQuality({ sourceKind: 'asr', durationSeconds: 90, cost: { resultFormat: 3, sentenceMaxLength: 40 }, cues: [{ startSeconds: 1, endSeconds: 3 }, { startSeconds: 8, endSeconds: 11 }, { startSeconds: 16, endSeconds: 18 }] })
    expect(quality).toMatchObject({ status: 'limited', reasonCode: 'sparse-asr-time-axis', cueCount: 3, minimumCueCount: 5 })
    expect(isSafeSubtitleAnchor(quality)).toBe(false)
  })

  it('blocks legacy ASR tracks instead of treating missing metadata as a valid timeline', () => {
    const quality = analyzeSubtitleTimeQuality({ sourceKind: 'asr', durationSeconds: 120, cues: [{ startSeconds: 0, endSeconds: 60.48 }, { startSeconds: 60.48, endSeconds: 120 }] })
    expect(quality).toMatchObject({ status: 'insufficient', reasonCode: 'missing-asr-metadata', maxCueDurationSeconds: 60.48 })
    expect(isSafeSubtitleAnchor(quality)).toBe(false)
  })

  it('reports overlap-safe coverage and rejects invalid timings without changing cue data', () => {
    const quality = analyzeSubtitleTimeQuality({ sourceKind: 'ocr', durationSeconds: 20, cues: [{ startSeconds: 1, endSeconds: 3 }, { startSeconds: 2, endSeconds: 5 }, { startSeconds: 8, endSeconds: 9 }, { startSeconds: 10, endSeconds: 9 }] })
    expect(quality).toMatchObject({ status: 'insufficient', reasonCode: 'invalid-timing', cueCount: 4, validCueCount: 3, invalidCueCount: 1, coveredSeconds: 5, maxGapSeconds: 3, coverageRatio: 0.25 })
  })

  it('blocks a cue-dense ASR track when its anchors are concentrated at the end of the episode', () => {
    const quality = analyzeSubtitleTimeQuality({ sourceKind: 'asr', durationSeconds: 120, cost: { resultFormat: 3, sentenceMaxLength: 40 }, cues: [100, 103, 106, 109, 112, 115].map((startSeconds) => ({ startSeconds, endSeconds: startSeconds + 1 })) })
    expect(quality).toMatchObject({ status: 'limited', reasonCode: 'sparse-asr-time-axis', minimumCueCount: 6, maxGapSeconds: 100, coverageRatio: 0.05 })
    expect(isSafeSubtitleAnchor(quality)).toBe(false)
  })

  it('blocks a track with enough cue rows but negligible total time coverage', () => {
    const quality = analyzeSubtitleTimeQuality({ sourceKind: 'ocr', durationSeconds: 60, cues: Array.from({ length: 8 }, () => ({ startSeconds: 1, endSeconds: 1.1 })) })
    expect(quality).toMatchObject({ status: 'limited', reasonCode: 'limited-cues', coverageRatio: 0.002 })
    expect(isSafeSubtitleAnchor(quality)).toBe(false)
  })
})
