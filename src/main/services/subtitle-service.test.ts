import { describe, expect, it } from 'vitest'
import { compareSubtitleCues, findCuesForRange, formatSrt, formatVtt, parseSubtitleText } from './subtitle-service.js'

describe('subtitle service', () => {
  it('parses SRT cues and intersects a clip range', () => {
    const cues = parseSubtitleText('1\n00:00:01,000 --> 00:00:02,000\nhello\n\n2\n00:00:03,000 --> 00:00:04,500\nworld')
    expect(cues).toHaveLength(2); expect(findCuesForRange(cues, 1.5, 3.2)).toHaveLength(2)
  })

  it('parses short WebVTT timestamps without an hour component', () => {
    expect(parseSubtitleText('WEBVTT\n\n00:01.000 --> 00:02.500\nhello')).toEqual([{ index: 1, startSeconds: 1, endSeconds: 2.5, text: 'hello' }])
  })

  it('exports portable SRT and marks only mismatched overlapping OCR/ASR cues for review', () => {
    const asr = parseSubtitleText('1\n00:00:01,000 --> 00:00:03,000\n你回来了\n\n2\n00:00:04,000 --> 00:00:05,000\n别走')
    const ocr = parseSubtitleText('1\n00:00:01,500 --> 00:00:03,000\n你回来了\n\n2\n00:00:04,000 --> 00:00:05,000\n不要走')
    expect(formatSrt(asr)).toContain('00:00:01,000 --> 00:00:03,000')
    expect(formatVtt(asr)).toContain('WEBVTT\n\n00:00:01.000 --> 00:00:03.000')
    expect(compareSubtitleCues(asr, ocr)).toEqual(expect.arrayContaining([expect.objectContaining({ asrIndex: 1, ocrIndex: 1, needsReview: false }), expect.objectContaining({ asrIndex: 2, ocrIndex: 2, needsReview: true })]))
  })

  it('requires review for an otherwise matching subtitle when either evidence source is low confidence', () => {
    expect(compareSubtitleCues([{ index: 1, startSeconds: 1, endSeconds: 2, text: '回来', confidence: 0.5 }], [{ index: 1, startSeconds: 1, endSeconds: 2, text: '回来', confidence: 0.99 }])).toEqual([expect.objectContaining({ needsReview: true, asrConfidence: 0.5, ocrConfidence: 0.99 })])
  })

  it('reports every evidence-side outcome instead of dropping unmatched cues', () => {
    const comparisons = compareSubtitleCues([{ index: 1, startSeconds: 1, endSeconds: 2, text: '一致' }, { index: 2, startSeconds: 4, endSeconds: 5, text: '只有声音' }], [{ index: 1, startSeconds: 1, endSeconds: 2, text: '一致' }, { index: 2, startSeconds: 7, endSeconds: 8, text: '只有画面' }])
    expect(comparisons.map(({ conclusion }) => conclusion)).toEqual(expect.arrayContaining(['consistent', 'asr_only', 'ocr_only']))
  })
})
