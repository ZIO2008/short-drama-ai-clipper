// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { bindSubtitleStaticDetailReadOnly } from './SubtitleStaticDetailReadOnlyBridge.js'
import { bindSubtitleStaticDetailPreview } from './SubtitleStaticDetailPreviewBridge.js'
import { episodes, installSubtitleRuntimeApi as installApi, renderSubtitleRuntimeSurface as renderSurface } from './subtitle-runtime-test-helpers.js'

describe('bindSubtitleStaticDetailReadOnly', () => {
  it('only replaces the right evidence content after a static view detail opens', async () => {
    const testDocument = renderSurface()
    const evidence = testDocument.querySelector<HTMLElement>('.r5-evidence')!
    const preview = testDocument.querySelector<HTMLElement>('.r5-sub-preview')!
    const originalPreview = preview.innerHTML
    const listTracks = vi.fn().mockResolvedValue([{ id: 'import-1', dramaId: 'd1', episodeId: 'episode-1', assetId: 'asset-1', baseTrackId: null, sourceKind: 'import', label: 'Imported SRT', language: 'zh-CN', status: 'active', cueCount: 1, cost: {} }])
    installApi({ listSubtitleEvidenceTracks: listTracks, listSubtitleEvidenceCues: vi.fn().mockResolvedValue([{ id: 'cue-1', index: 1, startSeconds: 0, endSeconds: 2, text: '导入字幕只在 ASR（导入）列展示', confidence: null }]) })
    bindSubtitleStaticDetailReadOnly({ document: testDocument, dramaId: 'd1', episodes })

    testDocument.dispatchEvent(new CustomEvent('subtitle-static-detail:opened', { detail: { episodeId: 'episode-1', kind: 'view' } }))
    await vi.waitFor(() => expect(evidence.textContent).toContain('导入字幕只在 ASR（导入）列展示'))
    expect(evidence.textContent).toContain('第 01 集')
    expect(evidence.textContent).toContain('在线 ASR')
    expect(evidence.textContent).toContain('导入字幕')
    expect(evidence.querySelectorAll('[data-source="asr"]')).toHaveLength(0)
    expect(evidence.querySelectorAll('[data-source="import"]')).toHaveLength(1)
    expect(preview.innerHTML).toBe(originalPreview)
    expect(listTracks).toHaveBeenCalledWith('d1', 'episode-1')
  })

  it('does not replace the status template evidence area', async () => {
    const testDocument = renderSurface()
    const listTracks = vi.fn()
    installApi({ listSubtitleEvidenceTracks: listTracks })
    bindSubtitleStaticDetailReadOnly({ document: testDocument, dramaId: 'd1', episodes })

    testDocument.dispatchEvent(new CustomEvent('subtitle-static-detail:opened', { detail: { episodeId: 'episode-2', kind: 'status' } }))
    await Promise.resolve()
    expect(listTracks).not.toHaveBeenCalled()
  })

  it('reflects preview progress in the active right evidence area without reloading tracks', async () => {
    const testDocument = renderSurface()
    const listTracks = vi.fn().mockResolvedValue([{ id: 'asr-1', dramaId: 'd1', episodeId: 'episode-1', assetId: 'asset-1', baseTrackId: null, sourceKind: 'asr', label: 'ASR', language: 'zh-CN', status: 'active', cueCount: 1, cost: {} }])
    installApi({ listSubtitleEvidenceTracks: listTracks, listSubtitleEvidenceCues: vi.fn().mockResolvedValue([{ id: 'cue-1', index: 1, startSeconds: 1, endSeconds: 2, text: '真实 ASR', confidence: null }]) })
    bindSubtitleStaticDetailReadOnly({ document: testDocument, dramaId: 'd1', episodes })
    testDocument.dispatchEvent(new CustomEvent('subtitle-static-detail:opened', { detail: { episodeId: 'episode-1', kind: 'view' } }))
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-evidence-cue]')).not.toBeNull())

    testDocument.dispatchEvent(new CustomEvent('subtitle-preview:position', { detail: { seconds: 1.5, isPlaying: false } }))

    expect(testDocument.querySelector('[data-subtitle-evidence-cue]')?.classList.contains('is-current')).toBe(true)
    expect(testDocument.querySelector('.subtitle-evidence-window')?.classList.contains('is-current')).toBe(true)
    expect(listTracks).toHaveBeenCalledTimes(1)
  })

  it('seeks the real preview and synchronizes its playhead when a rendered evidence cue is clicked', async () => {
    const testDocument = renderSurface()
    installApi({
      listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([{ id: 'ocr-1', dramaId: 'd1', episodeId: 'episode-1', assetId: null, baseTrackId: null, sourceKind: 'ocr', label: 'OCR', language: 'zh-CN', status: 'active', cueCount: 1, cost: {} }]),
      listSubtitleEvidenceCues: vi.fn().mockResolvedValue([{ id: 'cue-1', index: 1, startSeconds: 4, endSeconds: 5.2, text: '点击后定位', confidence: null }])
    })
    bindSubtitleStaticDetailPreview({ document: testDocument, episodes })
    bindSubtitleStaticDetailReadOnly({ document: testDocument, dramaId: 'd1', episodes })
    testDocument.dispatchEvent(new CustomEvent('subtitle-static-detail:opened', { detail: { episodeId: 'episode-1', kind: 'view' } }))

    await vi.waitFor(() => expect(testDocument.querySelector<HTMLButtonElement>('[data-subtitle-evidence-cue]')).not.toBeNull())
    const video = testDocument.querySelector<HTMLVideoElement>('video[data-subtitle-preview]')!
    Object.defineProperty(video, 'duration', { value: 30, configurable: true })
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true })
    const cue = testDocument.querySelector<HTMLButtonElement>('[data-subtitle-evidence-cue]')!

    cue.click()

    expect(video.currentTime).toBe(4)
    expect(testDocument.querySelector('.r5-timecode')?.textContent).toBe('00:00:04.000')
    expect(testDocument.querySelector('[data-subtitle-timeline-playhead]')?.getAttribute('style')).toContain('left: 13.333')
    expect(cue.classList.contains('is-current')).toBe(true)
    expect(cue.getAttribute('aria-pressed')).toBe('true')
  })
})
