import { describe, expect, it } from 'vitest'
import { alignSemanticEvents, type SemanticEvidenceCue } from './semantic-event-alignment-service.js'

const cue = (id: string, sourceKind: SemanticEvidenceCue['sourceKind'], startSeconds: number, endSeconds: number, text: string, evidenceNature: SemanticEvidenceCue['evidenceNature'] = sourceKind === 'import' ? 'visual_aligned' : sourceKind === 'ocr' ? 'visual_aligned' : 'audio_aligned'): SemanticEvidenceCue => ({ id, trackId: `${sourceKind}-track`, sourceKind, index: Number(id.replace(/\D/g, '')) || 1, startSeconds, endSeconds, text, evidenceNature })

describe('alignSemanticEvents', () => {
  it('aligns edited OCR sentence breaks with one continuous ASR sentence without rewriting either source', () => {
    const events = alignSemanticEvents([
      cue('o1', 'ocr', 1, 2.4, '我有一个苹果，很好吃。'),
      cue('o2', 'ocr', 2.45, 3.8, '你试试看。'),
      cue('a1', 'asr', 1.1, 3.9, '我有一个苹果很好吃你试试看。')
    ])
    expect(events).toEqual([expect.objectContaining({ visualCueIds: ['o1', 'o2'], asrCueIds: ['a1'], conclusion: 'aligned', cutStartSeconds: 1, cutEndSeconds: 3.8, ruleVersion: 'semantic-event-v1' })])
  })

  it('keeps OCR visual time as the cut boundary when matching ASR timing drifts', () => {
    const events = alignSemanticEvents([
      cue('o1', 'ocr', 10, 10.3, '我们回家吧'),
      cue('a1', 'asr', 12, 12.4, '我们回家吧')
    ])
    expect(events).toEqual([expect.objectContaining({ conclusion: 'aligned', cutStartSeconds: 10, cutEndSeconds: 10.3, asrCueIds: ['a1'], reason: expect.stringContaining('切点采用画面文字') })])
  })

  it('keeps an audio-aligned import on the audio chain instead of using it as a visual cut boundary', () => {
    const events = alignSemanticEvents([
      cue('i1', 'import', 1, 1.3, '回家吧', 'audio_aligned'),
      cue('o1', 'ocr', 3.5, 3.9, '回家吧')
    ])
    expect(events).toEqual([expect.objectContaining({ conclusion: 'aligned', visualCueIds: ['o1'], asrCueIds: ['i1'], cutStartSeconds: 3.5, cutEndSeconds: 3.9 })])
  })

  it('retains same-window sensitive-word differences as a content difference, not a rejected boundary', () => {
    const events = alignSemanticEvents([
      cue('o1', 'ocr', 4, 5.5, '他被霸凌了'),
      cue('a1', 'asr', 4.1, 5.6, '他被欺负了')
    ])
    expect(events).toEqual([expect.objectContaining({ conclusion: 'content-difference', cutStartSeconds: 4, cutEndSeconds: 5.5 })])
  })

  it('keeps ASR-only dialogue and visual-only text as separate valid events', () => {
    const events = alignSemanticEvents([
      cue('a1', 'asr', 1, 2, '别走'),
      cue('o1', 'ocr', 5, 6, '三天后')
    ])
    expect(events).toEqual([
      expect.objectContaining({ conclusion: 'asr-only', cutStartSeconds: 1, cutEndSeconds: 2 }),
      expect.objectContaining({ conclusion: 'visual-only', cutStartSeconds: 5, cutEndSeconds: 6 })
    ])
  })

  it('does not turn repeated text in distant scenes into a false time conflict', () => {
    const events = alignSemanticEvents([
      cue('o1', 'ocr', 1, 2, '别走'),
      cue('a1', 'asr', 20, 21, '别走')
    ])
    expect(events).toEqual([
      expect.objectContaining({ conclusion: 'visual-only', cutStartSeconds: 1, cutEndSeconds: 2 }),
      expect.objectContaining({ conclusion: 'asr-only', cutStartSeconds: 20, cutEndSeconds: 21 })
    ])
  })

  it('rejects incompatible import and OCR evidence instead of treating both as independent visual anchors', () => {
    const events = alignSemanticEvents([
      cue('i1', 'import', 1, 1.2, '你别走'),
      cue('o1', 'ocr', 3, 3.2, '你别走')
    ])
    expect(events).toEqual([expect.objectContaining({ conclusion: 'time-conflict', visualCueIds: ['i1', 'o1'], reason: expect.stringContaining('画面文字') })])
  })

  it('blocks matching visual evidence even when its incompatible timestamps are far apart', () => {
    const events = alignSemanticEvents([
      cue('i1', 'import', 1, 1.2, '不要离开'),
      cue('o1', 'ocr', 20, 20.2, '不要离开')
    ])
    expect(events).toEqual([expect.objectContaining({ conclusion: 'time-conflict', visualCueIds: ['i1', 'o1'] })])
  })

  it('does not let a matching ASR cue hide an incompatible pair of visual sources', () => {
    const events = alignSemanticEvents([
      cue('i1', 'import', 1, 1.2, '不要离开'),
      cue('o1', 'ocr', 5, 5.2, '不要离开'),
      cue('a1', 'asr', 1, 1.2, '不要离开')
    ])
    expect(events).toEqual([expect.objectContaining({ conclusion: 'time-conflict', visualCueIds: ['i1', 'o1'], asrCueIds: ['a1'] })])
  })

  it('blocks an incompatible OCR merged sentence against split imported and ASR sentences', () => {
    const events = alignSemanticEvents([
      cue('i1', 'import', 1, 1.2, '不要'),
      cue('i2', 'import', 1.25, 1.5, '离开'),
      cue('o1', 'ocr', 5, 5.4, '不要离开'),
      cue('a1', 'asr', 1, 1.5, '不要离开')
    ])
    expect(events).toEqual([expect.objectContaining({ conclusion: 'time-conflict', visualCueIds: ['i1', 'i2', 'o1'], asrCueIds: ['a1'] })])
  })

  it('allows more than three consecutive OCR cues to align with one ASR semantic event', () => {
    const events = alignSemanticEvents([
      cue('o1', 'ocr', 1, 1.4, '我有'), cue('o2', 'ocr', 1.45, 1.8, '一个'), cue('o3', 'ocr', 1.85, 2.2, '苹果'), cue('o4', 'ocr', 2.25, 2.6, '很好吃'),
      cue('a1', 'asr', 1, 2.7, '我有一个苹果很好吃')
    ])
    expect(events).toEqual([expect.objectContaining({ conclusion: 'aligned', visualCueIds: ['o1', 'o2', 'o3', 'o4'], asrCueIds: ['a1'] })])
  })
})
