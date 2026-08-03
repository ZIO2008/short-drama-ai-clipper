// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, EpisodeAsset, SubtitleEvidenceTrack } from '../../../shared/contracts.js'
import { bindSubtitleAssetRuntime } from './SubtitleAssetRuntimeBridge.js'

const episodes: EpisodeAsset[] = [
  { id: 'episode-1', episodeNo: 1, sortOrder: 1, sourcePath: 'D:\\episode-01.mp4', durationSeconds: 40, fps: 25, videoWidth: 1920, videoHeight: 1080, status: 'ready' },
  { id: 'episode-2', episodeNo: 2, sortOrder: 2, sourcePath: '', durationSeconds: null, fps: null, videoWidth: null, videoHeight: null, status: 'missing' }
]
const asr: SubtitleEvidenceTrack = { id: 'asr-1', dramaId: 'd1', episodeId: 'episode-1', assetId: null, baseTrackId: null, sourceKind: 'asr', label: 'ASR', language: 'zh-CN', status: 'active', cueCount: 1, cost: {} }
const ocr: SubtitleEvidenceTrack = { id: 'ocr-1', dramaId: 'd1', episodeId: 'episode-1', assetId: null, baseTrackId: null, sourceKind: 'ocr', label: 'OCR', language: 'zh-CN', status: 'active', cueCount: 1, cost: {} }

const renderSurface = (): Document => {
  const testDocument = document.implementation.createHTMLDocument('subtitle-runtime')
  testDocument.body.innerHTML = '<button data-subtitle-generate>一键生成字幕</button><section id="subtitleListPanel"><table><tbody><tr><td>原型样例</td></tr></tbody></table></section><section id="subtitleAssetModal" aria-hidden="true"><h2 id="subtitleAssetModalTitle"></h2><p id="subtitleAssetModalMeta"></p><div id="subtitleDetailAsset"><span id="subtitleMonitorEpisode"></span><aside class="r5-evidence"><div class="r5-evidence-head"><b>对齐差异与校验结论</b></div></aside></div><div id="subtitleDetailEmpty"><p id="subtitleDetailEmptyText"></p></div></section><div id="toast"></div>'
  return testDocument
}

const installApi = (overrides: Partial<DesktopApi> = {}): void => {
  window.desktopApi = {
    listSubtitles: vi.fn().mockResolvedValue([]),
    listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([asr, ocr]),
    getEffectiveSubtitleOcrRegion: vi.fn().mockResolvedValue({ id: 'region-1', dramaId: 'd1', episodeId: 'episode-1', scope: 'episode_override', x: 0.1, y: 0.72, width: 0.8, height: 0.2 }),
    getSubtitleQualityReport: vi.fn().mockResolvedValue({ evaluationCount: 0, referenceCharacters: 0, differingCharacters: 0, conflictCount: 0, evaluatedCueCount: 0, elapsedMs: 0, estimatedCost: 0, actualCost: 0, characterErrorRate: null, conflictRate: null }),
    listSubtitleEvidenceCues: vi.fn().mockResolvedValue([{ id: 'cue-1', index: 1, startSeconds: 12.4, endSeconds: 14, text: '真实字幕', confidence: 0.9 }]),
    getSubtitleEvidenceComparisons: vi.fn().mockResolvedValue([{ asrCueId: 'cue-1', ocrCueId: 'cue-2', timeOverlapSeconds: 1.6, textSimilarity: 0.9, asrConfidence: 0.9, ocrConfidence: null, conclusion: 'consistent' }]),
    getSubtitleRecognitionSettings: vi.fn().mockResolvedValue({ scope: 'current', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' }),
    getLocalOcrAvailability: vi.fn().mockResolvedValue({ available: true, executablePath: 'C:\\tesseract.exe', reason: null }),
    setSubtitleOcrRegion: vi.fn().mockResolvedValue({ id: 'region-1', dramaId: 'd1', episodeId: 'episode-1', scope: 'episode_override', x: 0.08, y: 0.72, width: 0.84, height: 0.2 }),
    extractLocalOcrSubtitleTrack: vi.fn().mockResolvedValue(ocr),
    ...overrides
  } as unknown as DesktopApi
}

const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((complete) => { resolve = complete })
  return { promise, resolve }
}

afterEach(() => { vi.restoreAllMocks() })

describe('bindSubtitleAssetRuntime', () => {
  it('replaces prototype rows with the current drama episodes and real states', async () => {
    const testDocument = renderSurface(); installApi(); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })

    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('待校验'))
    expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('第 01 集')
    expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('待校验')
    expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('媒体缺失')
    expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).not.toContain('原型样例')
  })

  it('loads only the selected episode detail and renders real evidence', async () => {
    const testDocument = renderSurface(); installApi(); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())

    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-evidence')?.textContent).toContain('真实字幕'))
    expect(testDocument.getElementById('subtitleAssetModalTitle')?.textContent).toBe('第 01 集字幕资产')
    expect(window.desktopApi.listSubtitleEvidenceCues).toHaveBeenCalledWith('asr-1')
    expect(window.desktopApi.listSubtitleEvidenceCues).toHaveBeenCalledWith('ocr-1')
  })

  it('renders a read error inside the existing ASR, OCR and conclusion evidence region', async () => {
    const testDocument = renderSurface()
    installApi({ listSubtitleEvidenceTracks: vi.fn().mockRejectedValue(new Error('evidence backend unavailable')) })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.querySelector('.r5-evidence')?.textContent).toContain('证据读取失败'))
    expect(testDocument.querySelector('.r5-evidence')?.textContent).toContain('evidence backend unavailable')
    expect(testDocument.getElementById('subtitleDetailAsset')?.hidden).toBe(false)
    expect(testDocument.getElementById('subtitleDetailEmpty')?.hidden).toBe(true)
    expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('读取失败')
  })

  it('runs local OCR only after real prerequisites are met and refreshes the list', async () => {
    let ocrCompleted = false
    const listTracks = vi.fn().mockImplementation(() => Promise.resolve(ocrCompleted ? [asr, ocr] : [asr]))
    const extract = vi.fn().mockImplementation(async () => { ocrCompleted = true; return ocr })
    const testDocument = renderSurface(); installApi({ listSubtitleEvidenceTracks: listTracks, extractLocalOcrSubtitleTrack: extract }); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))

    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(window.desktopApi.extractLocalOcrSubtitleTrack).toHaveBeenCalledWith({ asrTrackId: 'asr-1', language: 'chi_sim' }))
    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('本地 OCR 已完成'))
    expect(listTracks.mock.calls.length).toBeGreaterThan(1)
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModalMeta')?.textContent).toContain('ASR + OCR'))
    expect(window.desktopApi.listSubtitleEvidenceCues).toHaveBeenCalledWith('ocr-1')
  })

  it('does not pretend to start OCR when the local engine is unavailable', async () => {
    const testDocument = renderSurface(); installApi({ getLocalOcrAvailability: vi.fn().mockResolvedValue({ available: false, executablePath: null, reason: '未安装 Tesseract' }) }); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('未安装 Tesseract'))
    expect(window.desktopApi.extractLocalOcrSubtitleTrack).not.toHaveBeenCalled()
  })

  it('does not create a default OCR region or execute OCR when the fixed region is absent', async () => {
    const testDocument = renderSurface()
    installApi({ listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([asr]), getEffectiveSubtitleOcrRegion: vi.fn().mockResolvedValue(null) })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('待校验'))
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('未设置固定 OCR 区域'))
    expect(window.desktopApi.setSubtitleOcrRegion).not.toHaveBeenCalled()
    expect(window.desktopApi.extractLocalOcrSubtitleTrack).not.toHaveBeenCalled()
    expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('执行失败')
  })

  it('does not execute current-scope OCR for a selected episode with missing media or ASR', async () => {
    const testDocument = renderSurface(); installApi()
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-2"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-2"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('没有具备 ASR 轨的可处理剧集'))
    expect(window.desktopApi.extractLocalOcrSubtitleTrack).not.toHaveBeenCalled()
  })

  it('blocks unsupported automatic language detection instead of silently using Chinese OCR', async () => {
    const testDocument = renderSurface()
    installApi({ getSubtitleRecognitionSettings: vi.fn().mockResolvedValue({ scope: 'current', language: 'auto', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' }) })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('未实现自动语言检测'))
    expect(window.desktopApi.extractLocalOcrSubtitleTrack).not.toHaveBeenCalled()
  })

  it('keeps selected episode detail available while the full-drama list is slow', async () => {
    const fullList = deferred<SubtitleEvidenceTrack[]>()
    const listTracks = vi.fn((_: string, episodeId?: string | null) => episodeId ? Promise.resolve([asr, ocr]) : fullList.promise)
    const testDocument = renderSurface(); installApi({ listSubtitleEvidenceTracks: listTracks })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.querySelector('.r5-evidence')?.textContent).toContain('真实字幕'))
    expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('读取中')
    fullList.resolve([asr, ocr])
    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('待校验'))
  })

  it('marks an OCR execution error without treating it as a read error', async () => {
    const testDocument = renderSurface()
    installApi({ listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([asr]), extractLocalOcrSubtitleTrack: vi.fn().mockRejectedValue(new Error('frame extraction failed')) })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('待校验'))
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('执行失败'))
    expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).not.toContain('读取失败')
  })

  it('shows the real in-progress OCR state until the extraction promise settles', async () => {
    const extraction = deferred<SubtitleEvidenceTrack>()
    const testDocument = renderSurface()
    installApi({ listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([asr]), extractLocalOcrSubtitleTrack: vi.fn().mockReturnValue(extraction.promise) })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('待校验'))
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('识别中'))
    extraction.resolve(ocr)
    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('本地 OCR 已完成'))
  })

  it('closes a real detail modal through either its close control or Escape', async () => {
    const testDocument = renderSurface(); installApi(); testDocument.getElementById('subtitleAssetModal')?.insertAdjacentHTML('afterbegin', '<button data-subtitle-close-asset>close</button>'); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    ;(testDocument.querySelector('[data-subtitle-close-asset]') as HTMLButtonElement).click()
    expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('true')
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    testDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('true')
  })
})
