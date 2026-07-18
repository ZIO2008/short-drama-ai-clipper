import { describe, expect, it } from 'vitest'
import { findCuesForRange, parseSubtitleText } from './subtitle-service.js'

describe('subtitle service', () => {
  it('parses SRT cues and intersects a clip range', () => {
    const cues = parseSubtitleText('1\n00:00:01,000 --> 00:00:02,000\nhello\n\n2\n00:00:03,000 --> 00:00:04,500\nworld')
    expect(cues).toHaveLength(2); expect(findCuesForRange(cues, 1.5, 3.2)).toHaveLength(2)
  })
})
