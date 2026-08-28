// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { buildEvidenceWindows, renderThreeSourceEvidence, syncThreeSourceEvidencePlayback } from './subtitle-three-source-evidence.js'

const cue = (startSeconds: number, endSeconds: number, text: string) => ({ id: text, index: 0, startSeconds, endSeconds, text, confidence: null })

describe('buildEvidenceWindows', () => {
  it('groups only cues with real time overlap and keeps all three sources independent', () => {
    const windows = buildEvidenceWindows({
      asr: [cue(1.4, 2.3, '在线 ASR')],
      import: [cue(1.2, 2.1, '导入字幕')],
      ocr: [cue(4, 4.7, 'OCR 远离前两条')]
    })

    expect(windows).toHaveLength(2)
    expect(windows[0].cues.asr.map((item) => item.text)).toEqual(['在线 ASR'])
    expect(windows[0].cues.import.map((item) => item.text)).toEqual(['导入字幕'])
    expect(windows[0].cues.ocr).toHaveLength(0)
    expect(windows[1].cues.ocr.map((item) => item.text)).toEqual(['OCR 远离前两条'])
  })

  it('marks every real cue covering the current video position without changing a selected cue', () => {
    const evidence = document.createElement('section')
    renderThreeSourceEvidence(evidence, 1, {
      asr: [cue(1.4, 2.3, '在线 ASR')],
      import: [cue(1.2, 2.1, '导入字幕')],
      ocr: [cue(4, 4.7, 'OCR')]
    })
    const ocr = evidence.querySelector<HTMLElement>('[data-source="ocr"]')!
    ocr.click()

    syncThreeSourceEvidencePlayback(evidence, { seconds: 1.5, isPlaying: false })

    expect(evidence.querySelectorAll('[data-subtitle-evidence-cue].is-current')).toHaveLength(2)
    expect(evidence.querySelectorAll('.subtitle-evidence-window.is-current')).toHaveLength(1)
    expect(ocr.classList.contains('is-selected')).toBe(true)
    expect(ocr.classList.contains('is-current')).toBe(false)
    expect(evidence.querySelector('.subtitle-position-note')?.textContent).toContain('当前命中 2 条证据')
  })

  it('clears current markers when the video position has no cue while keeping the evidence scroll untouched', () => {
    const evidence = document.createElement('section')
    renderThreeSourceEvidence(evidence, 1, { asr: [cue(1, 2, '在线 ASR')], import: [], ocr: [] })
    const scroll = evidence.querySelector<HTMLElement>('.subtitle-evidence-scroll')!
    scroll.scrollTop = 18

    syncThreeSourceEvidencePlayback(evidence, { seconds: 8, isPlaying: true })

    expect(evidence.querySelectorAll('.is-current')).toHaveLength(0)
    expect(scroll.scrollTop).toBe(18)
    expect(evidence.querySelector('.subtitle-position-note')?.textContent).toContain('当前时刻没有字幕证据')
  })
})
