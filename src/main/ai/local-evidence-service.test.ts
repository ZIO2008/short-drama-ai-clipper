import { describe, expect, it } from 'vitest'
import { buildEvidenceWindows } from './local-evidence-service.js'

describe('buildEvidenceWindows', () => {
  it('uses traceable subtitle windows that meet the requested duration and boosts conflict evidence', () => {
    const windows = buildEvidenceWindows([
      { index: 1, startSeconds: 0, endSeconds: 11, text: '你不能离开这里。' },
      { index: 2, startSeconds: 12, endSeconds: 24, text: '我已经知道真相了。' },
      { index: 3, startSeconds: 25, endSeconds: 35, text: '现在必须做出选择。' }
    ], 30, 60)
    expect(windows).toHaveLength(1)
    expect(windows[0]).toMatchObject({ startSeconds: 0, endSeconds: 35, confidence: 0.86, cueCount: 3 })
  })

  it('does not manufacture an under-length subtitle candidate', () => {
    expect(buildEvidenceWindows([{ index: 1, startSeconds: 0, endSeconds: 10, text: '短句' }], 30, 60)).toEqual([])
  })
})
