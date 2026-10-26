// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SubtitleAsset, SubtitleEvidenceTrack, SubtitleRecognitionRun } from '../../../shared/contracts.js'
import { bindSubtitleAssetRuntime } from './SubtitleAssetRuntimeBridge.js'
import { asr, episodes, imported, installSubtitleRuntimeApi as installApi, ocr, renderSubtitleRuntimeSurface as renderSurface } from './subtitle-runtime-test-helpers.js'
const globalAsset: SubtitleAsset = { id: 'legacy-global', dramaId: 'd1', episodeId: null, sourcePath: 'D:\\01.srt', format: 'srt', cueCount: 1, status: 'ready' }
const importedAsset: SubtitleAsset = { id: 'asset-1', dramaId: 'd1', episodeId: 'episode-1', sourcePath: 'D:\\01.srt', format: 'srt', cueCount: 1, status: 'ready' }

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

  it('does not project an unassigned legacy subtitle asset to every episode', async () => {
    const testDocument = renderSurface(); installApi({ listSubtitles: vi.fn().mockResolvedValue([globalAsset]), listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([]) }); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })

    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('未导入'))
    expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).not.toContain('待分集校验')
    const deleteButton = testDocument.querySelector('[data-subtitle-delete-episode="episode-1"]') as HTMLButtonElement
    expect(deleteButton.disabled).toBe(false)
    deleteButton.click()
    expect(testDocument.getElementById('toast')?.textContent).toBe('当前剧集没有可删除的导入字幕。')
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
    expect((testDocument.querySelector('video[data-subtitle-preview]') as HTMLVideoElement).src).toContain('shortdrama-media://local/D%3A%5Cepisode-01.mp4')
  })

  it('binds the selected episode to every settings entry in its detail modal', async () => {
    const testDocument = renderSurface()
    testDocument.getElementById('subtitleAssetModal')?.insertAdjacentHTML('afterbegin', '<button data-subtitle-open-settings>头部设置</button><div id="subtitleDetailAsset"><button data-subtitle-open-settings>详情设置</button></div>')
    installApi(); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())

    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    const settingsEntries = [...testDocument.getElementById('subtitleAssetModal')!.querySelectorAll<HTMLElement>('[data-subtitle-open-settings]')]
    expect(settingsEntries).not.toHaveLength(0)
    settingsEntries.forEach((entry) => expect(entry.dataset.subtitleEpisodeId).toBe('episode-1'))
  })

  it('opens the nonpersistent 90-cue pressure sample without reading or writing subtitle data', async () => {
    const removeSubtitle = vi.fn()
    const testDocument = renderSurface(); installApi({ removeSubtitle }); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-pressure-sample]')).not.toBeNull())
    vi.clearAllMocks()

    ;(testDocument.querySelector('[data-subtitle-open-pressure-sample]') as HTMLButtonElement).click()

    expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false')
    expect(testDocument.getElementById('subtitleAssetModal')?.dataset.subtitleStress).toBe('true')
    expect(testDocument.getElementById('subtitleAssetModalMeta')?.textContent).toContain('90 条字幕片段')
    expect(testDocument.querySelectorAll('.r5-evidence-row')).toHaveLength(90)
    expect(testDocument.querySelector('.r5-evidence')?.textContent).toContain('03:00.0')
    expect((testDocument.querySelector('.r5-modal-body') as HTMLElement).getAttribute('style')).toBeNull()
    expect((testDocument.getElementById('subtitleDetailAsset') as HTMLElement).getAttribute('style')).toBeNull()
    expect((testDocument.querySelector('.r5-evidence') as HTMLElement).getAttribute('style')).toBeNull()
    expect(window.desktopApi.listSubtitleEvidenceTracks).not.toHaveBeenCalled()
    expect(removeSubtitle).not.toHaveBeenCalled()
  })

  it('treats imported SRT as ASR text and never as OCR evidence', async () => {
    const listCues = vi.fn().mockResolvedValue([{ id: 'import-cue-1', index: 1, startSeconds: 12.4, endSeconds: 14, text: '导入的 ASR 文本', confidence: null }])
    const comparisons = vi.fn().mockResolvedValue([])
    const testDocument = renderSurface()
    installApi({ listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([imported]), listSubtitleEvidenceCues: listCues, getSubtitleEvidenceComparisons: comparisons })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('ASR（导入）'))
    vi.clearAllMocks()

    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.querySelector('.r5-evidence')?.textContent).toContain('导入的 ASR 文本'))
    expect(listCues).toHaveBeenCalledWith('import-1')
    expect(listCues).not.toHaveBeenCalledWith('ocr-1')
    expect(comparisons).not.toHaveBeenCalled()
    expect(testDocument.querySelector('.r5-evidence')?.textContent).toContain('ASR / 导入')
    expect(testDocument.querySelector('.r5-evidence')?.textContent).toContain('OCR')
  })

  it('keeps imported SRT visible beside an existing ASR track', async () => {
    const listCues = vi.fn().mockImplementation((trackId: string) => Promise.resolve([{ id: `${trackId}-cue-1`, index: 1, startSeconds: 12.4, endSeconds: 14, text: trackId === 'asr-1' ? '真实 ASR 文本' : '导入 SRT 文本', confidence: null }]))
    const comparisons = vi.fn().mockResolvedValue([])
    const testDocument = renderSurface()
    installApi({ listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([asr, imported]), listSubtitleEvidenceCues: listCues, getSubtitleEvidenceComparisons: comparisons })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('ASR（导入）'))
    vi.clearAllMocks()

    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.querySelector('.r5-evidence')?.textContent).toContain('导入 SRT 文本'))
    expect(listCues).toHaveBeenCalledWith('asr-1')
    expect(listCues).toHaveBeenCalledWith('import-1')
    expect(testDocument.querySelector('.r5-evidence')?.textContent).toContain('真实 ASR 文本')
    expect(comparisons).not.toHaveBeenCalled()
  })

  it('keeps a readable source video visible when the episode has not imported subtitles yet', async () => {
    const testDocument = renderSurface(); installApi({ listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([]) }); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())

    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.getElementById('subtitleDetailAsset')?.hidden).toBe(false))
    expect((testDocument.querySelector('video[data-subtitle-preview]') as HTMLVideoElement).src).toContain('shortdrama-media://local/D%3A%5Cepisode-01.mp4')
    expect(testDocument.getElementById('subtitleDetailEmpty')?.hidden).toBe(true)
  })

  it('rewrites the evidence heading for the selected episode instead of keeping prototype sample content', async () => {
    const testDocument = renderSurface(); installApi(); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-2"]')).not.toBeNull())

    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-2"]') as HTMLButtonElement).click()
    expect(testDocument.getElementById('subtitleMonitorEpisode')?.textContent).toBe('第 02 集 · 正在读取字幕证据')
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-evidence-head')?.textContent).toContain('第 02 集'))
    expect(testDocument.querySelector('.r5-evidence-head')?.textContent).not.toContain('第 01 集')
  })

  it('requires confirmation and deletes only the selected episode imported subtitle assets', async () => {
    const removeSubtitlesByEpisode = vi.fn().mockResolvedValue(1)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const testDocument = renderSurface(); installApi({ listSubtitles: vi.fn().mockResolvedValue([importedAsset]), removeSubtitlesByEpisode }); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-episode-id="episode-1"]')?.textContent).toContain('ASR + OCR'))

    ;(testDocument.querySelector('[data-subtitle-delete-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(removeSubtitlesByEpisode).toHaveBeenCalledWith('d1', 'episode-1'))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('不删除 SRT、视频、ASR 或 OCR'))
    expect(testDocument.getElementById('toast')?.textContent).toContain('导入字幕已删除')
  })

  it('re-reads real subtitle state after an atomic episode delete fails', async () => {
    const removeSubtitlesByEpisode = vi.fn().mockRejectedValue(new Error('database transaction rolled back'))
    const listSubtitles = vi.fn().mockResolvedValue([importedAsset])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const testDocument = renderSurface(); installApi({ listSubtitles, removeSubtitlesByEpisode }); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-episode-id="episode-1"]')?.textContent).toContain('ASR + OCR'))
    const initialReadCount = listSubtitles.mock.calls.length

    ;(testDocument.querySelector('[data-subtitle-delete-episode="episode-1"]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(removeSubtitlesByEpisode).toHaveBeenCalledWith('d1', 'episode-1'))
    await vi.waitFor(() => expect(listSubtitles.mock.calls.length).toBeGreaterThan(initialReadCount))
    expect(confirm).toHaveBeenCalledOnce()
    expect(testDocument.getElementById('toast')?.textContent).toContain('database transaction rolled back')
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
    const testDocument = renderSurface(); installApi({ listSubtitleEvidenceTracks: listTracks, extractIndependentLocalOcrSubtitleTrack: extract }); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))

    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(window.desktopApi.extractIndependentLocalOcrSubtitleTrack).toHaveBeenCalledWith({ dramaId: 'd1', episodeId: 'episode-1', language: 'chi_sim', regionMode: 'fixed-region' }))
    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('仅 OCR识别已完成'))
    expect(listTracks.mock.calls.length).toBeGreaterThan(1)
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModalMeta')?.textContent).toContain('ASR + OCR'))
    expect(window.desktopApi.listSubtitleEvidenceCues).toHaveBeenCalledWith('ocr-1')
  })

  it('runs independent OCR without treating imported SRT as OCR input', async () => {
    const extract = vi.fn().mockResolvedValue(ocr)
    const testDocument = renderSurface()
    installApi({ listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([imported]), extractIndependentLocalOcrSubtitleTrack: extract })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))

    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(extract).toHaveBeenCalledWith({ dramaId: 'd1', episodeId: 'episode-1', language: 'chi_sim', regionMode: 'fixed-region' }))
  })

  it('runs ASR only without starting either OCR path', async () => {
    const extractAsr = vi.fn().mockResolvedValue(asr)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const testDocument = renderSurface()
    installApi({ getSubtitleRecognitionSettings: vi.fn().mockResolvedValue({ recognitionMode: 'asr-only', scope: 'current', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' }), extractDefaultAsrSubtitleTrack: extractAsr })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(extractAsr).toHaveBeenCalledWith({ dramaId: 'd1', episodeId: 'episode-1', language: 'zh-CN', mode: 'audio-first' }))
    expect(window.desktopApi.extractIndependentLocalOcrSubtitleTrack).not.toHaveBeenCalled()
    expect(window.desktopApi.extractLocalOcrSubtitleTrack).not.toHaveBeenCalled()
  })

  it('runs ASR and independent OCR separately in dual-recognition mode', async () => {
    const generatedAsr = { ...asr, id: 'asr-new' }
    const extractAsr = vi.fn().mockResolvedValue(generatedAsr)
    const extractOcr = vi.fn().mockResolvedValue(ocr)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const testDocument = renderSurface()
    installApi({ getSubtitleRecognitionSettings: vi.fn().mockResolvedValue({ recognitionMode: 'asr-ocr', scope: 'current', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' }), extractDefaultAsrSubtitleTrack: extractAsr, extractIndependentLocalOcrSubtitleTrack: extractOcr })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(extractOcr).toHaveBeenCalledWith({ dramaId: 'd1', episodeId: 'episode-1', language: 'chi_sim', regionMode: 'fixed-region' }))
    expect(extractAsr.mock.invocationCallOrder[0]).toBeLessThan(extractOcr.mock.invocationCallOrder[0])
    expect(window.desktopApi.extractLocalOcrSubtitleTrack).not.toHaveBeenCalled()
  })

  it('uses explicitly selected readable episodes before the saved recognition scope', async () => {
    const readableEpisodes = [...episodes, { ...episodes[0], id: 'episode-3', episodeNo: 3, sourcePath: 'D:\\episode-03.mp4' }]
    const start = vi.fn().mockImplementation((input) => Promise.resolve({ id: 'run-1', dramaId: input.dramaId, status: 'running', settings: input.settings, episodeIds: input.episodeIds, total: input.episodeIds.length, completed: 0, failed: 0, currentEpisodeId: null, ocrRuntime: input.ocrRuntime ?? null, reason: null, items: input.episodeIds.map((episodeId: string) => ({ episodeId, status: 'pending', reason: null })), createdAt: '', updatedAt: '' }))
    const testDocument = renderSurface()
    installApi({ getSubtitleRecognitionSettings: vi.fn().mockResolvedValue({ recognitionMode: 'ocr-only', scope: 'all', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' }), startSubtitleRecognitionRun: start })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes: readableEpisodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-select-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-select-episode="episode-1"]') as HTMLInputElement).click()
    expect((testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).textContent).toBe('识别已选 1 集')
    expect((testDocument.querySelector('[data-subtitle-select-episode="episode-2"]') as HTMLInputElement).disabled).toBe(true)
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ dramaId: 'd1', episodeIds: ['episode-1'] })))
  })

  it('places the subtitle selection color rule inside the prototype iframe document', async () => {
    const testDocument = renderSurface(); installApi()
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })

    await vi.waitFor(() => expect(testDocument.getElementById('subtitle-selection-control-style')?.textContent).toContain('accent-color:var(--accent)'))
  })

  it('does not pretend to start OCR when the local engine is unavailable', async () => {
    const testDocument = renderSurface(); installApi({ getLocalOcrAvailability: vi.fn().mockResolvedValue({ available: false, executablePath: null, reason: '未安装 Tesseract' }) }); bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('未安装 Tesseract'))
    expect(window.desktopApi.extractIndependentLocalOcrSubtitleTrack).not.toHaveBeenCalled()
  })

  it('does not create a default OCR region or execute OCR when the fixed region is absent', async () => {
    const testDocument = renderSurface()
    installApi({ listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([asr]), getEffectiveSubtitleOcrRegion: vi.fn().mockResolvedValue(null) })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('未设置固定 OCR 区域'))
    expect(window.desktopApi.setSubtitleOcrRegion).not.toHaveBeenCalled()
    expect(window.desktopApi.extractIndependentLocalOcrSubtitleTrack).not.toHaveBeenCalled()
    expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('执行失败')
  })

  it('does not execute current-scope OCR for a selected episode with missing media or ASR', async () => {
    const testDocument = renderSurface(); installApi()
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-2"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-2"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('没有可处理的媒体'))
    expect(window.desktopApi.extractIndependentLocalOcrSubtitleTrack).not.toHaveBeenCalled()
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
    expect(window.desktopApi.extractIndependentLocalOcrSubtitleTrack).not.toHaveBeenCalled()
  })

  it('allows a manually calibrated OCR region instead of requiring the legacy fixed-bottom mode', async () => {
    const testDocument = renderSurface()
    installApi({ getSubtitleRecognitionSettings: vi.fn().mockResolvedValue({ recognitionMode: 'ocr-only', scope: 'current', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'episode-manual', differenceThreshold: 'standard', importStrategy: 'parallel' }) })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(window.desktopApi.extractIndependentLocalOcrSubtitleTrack).toHaveBeenCalledWith({ dramaId: 'd1', episodeId: 'episode-1', language: 'chi_sim', regionMode: 'fixed-region' }))
  })

  it('allows automatic OCR region selection without a saved drama calibration', async () => {
    const extract = vi.fn().mockResolvedValue(ocr)
    const testDocument = renderSurface()
    installApi({ getSubtitleRecognitionSettings: vi.fn().mockResolvedValue({ recognitionMode: 'ocr-only', scope: 'current', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'auto-region', differenceThreshold: 'standard', importStrategy: 'parallel' }), extractIndependentLocalOcrSubtitleTrack: extract })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))

    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(extract).toHaveBeenCalledWith({ dramaId: 'd1', episodeId: 'episode-1', language: 'chi_sim', regionMode: 'auto-region' }))
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
    installApi({ listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([asr]), extractIndependentLocalOcrSubtitleTrack: vi.fn().mockRejectedValue(new Error('frame extraction failed')) })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('待校验'))
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('执行失败'))
    expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).not.toContain('读取失败')
    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('frame extraction failed'))
    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel .helper')?.textContent).toContain('1 集执行失败'))
  })

  it('shows the real in-progress OCR state until the extraction promise settles', async () => {
    const extraction = deferred<SubtitleEvidenceTrack>()
    const testDocument = renderSurface()
    installApi({ listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([asr]), extractIndependentLocalOcrSubtitleTrack: vi.fn().mockReturnValue(extraction.promise) })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('待校验'))
    ;(testDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.getElementById('subtitleAssetModal')?.getAttribute('aria-hidden')).toBe('false'))
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('识别中'))
    extraction.resolve(ocr)
    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('仅 OCR识别已完成'))
  })

  it('does not reload a stale batch snapshot after each episode while a multi-episode run is still active', async () => {
    const secondExtraction = deferred<SubtitleEvidenceTrack>()
    const readableEpisodes = episodes.map((episode, index) => index === 0 ? episode : { ...episode, sourcePath: 'D:\\episode-02.mp4', durationSeconds: 40, fps: 25, videoWidth: 1920, videoHeight: 1080, status: 'ready' as const })
    const extract = vi.fn().mockImplementation(async (_input: { episodeId: string }) => _input.episodeId === 'episode-2' ? secondExtraction.promise : ocr)
    const getLatest = vi.fn()
    const testDocument = renderSurface()
    installApi({
      getSubtitleRecognitionSettings: vi.fn().mockResolvedValue({ recognitionMode: 'ocr-only', scope: 'all', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'auto-region', differenceThreshold: 'standard', importStrategy: 'parallel' }),
      extractIndependentLocalOcrSubtitleTrack: extract
    })
    const liveGetLatest = window.desktopApi.getLatestSubtitleRecognitionRun
    getLatest.mockImplementation(liveGetLatest)
    window.desktopApi.getLatestSubtitleRecognitionRun = getLatest
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes: readableEpisodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-generate]')).not.toBeNull())
    const initialReadCount = getLatest.mock.calls.length

    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(extract).toHaveBeenCalledTimes(2))
    expect(getLatest.mock.calls).toHaveLength(initialReadCount + 1)
    secondExtraction.resolve(ocr)
    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('仅 OCR识别已完成'))
  })

  it('keeps the in-progress state after leaving and returning to the subtitle page, then refreshes when it finishes', async () => {
    const extraction = deferred<SubtitleEvidenceTrack>()
    let completed = false
    const listTracks = vi.fn().mockImplementation(() => Promise.resolve(completed ? [asr, ocr] : [asr]))
    const firstDocument = renderSurface()
    installApi({ listSubtitleEvidenceTracks: listTracks, extractIndependentLocalOcrSubtitleTrack: vi.fn().mockImplementation(async () => { const track = await extraction.promise; completed = true; return track }) })
    bindSubtitleAssetRuntime({ document: firstDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(firstDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('待校验'))
    ;(firstDocument.querySelector('[data-subtitle-open-episode="episode-1"]') as HTMLButtonElement).click()
    ;(firstDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(firstDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('识别中'))

    const returnedDocument = renderSurface()
    installApi({ listSubtitleEvidenceTracks: listTracks })
    bindSubtitleAssetRuntime({ document: returnedDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(returnedDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('识别中'))

    extraction.resolve(ocr)

    await vi.waitFor(() => expect(returnedDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('待校验'))
    expect(returnedDocument.querySelector('#subtitleListPanel tbody')?.textContent).not.toContain('识别中')
  })

  it('shows an interrupted persisted batch and resumes only its unfinished episode after confirmation', async () => {
    const interrupted: SubtitleRecognitionRun = {
      id: 'interrupted-run', dramaId: 'd1', status: 'interrupted',
      settings: { recognitionMode: 'asr-only', scope: 'all', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' },
      episodeIds: ['episode-1', 'episode-2'], total: 2, completed: 1, failed: 0, currentEpisodeId: null, ocrRuntime: null,
      reason: '工具已关闭或重启', createdAt: '2026-08-05T07:00:00.000Z', updatedAt: '2026-08-05T07:01:00.000Z',
      items: [{ episodeId: 'episode-1', status: 'succeeded', reason: null }, { episodeId: 'episode-2', status: 'interrupted', reason: '工具已关闭或重启' }]
    }
    const resumed = { ...interrupted, status: 'running' as const, reason: null, items: [{ ...interrupted.items[0] }, { ...interrupted.items[1], status: 'pending' as const, reason: null }] }
    const extractAsr = vi.fn().mockResolvedValue(asr)
    const testDocument = renderSurface()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    installApi({
      getLatestSubtitleRecognitionRun: vi.fn().mockResolvedValue(interrupted),
      resumeSubtitleRecognitionRun: vi.fn().mockResolvedValue(resumed),
      markSubtitleRecognitionRunItemRunning: vi.fn().mockResolvedValue({ ...resumed, currentEpisodeId: 'episode-2', items: [{ ...resumed.items[0] }, { ...resumed.items[1], status: 'running' as const }] }),
      markSubtitleRecognitionRunItemSucceeded: vi.fn().mockResolvedValue({ ...resumed, completed: 2, items: [{ ...resumed.items[0] }, { ...resumed.items[1], status: 'succeeded' as const }] }),
      finishSubtitleRecognitionRun: vi.fn().mockResolvedValue({ ...resumed, status: 'completed' as const, completed: 2, items: [{ ...resumed.items[0] }, { ...resumed.items[1], status: 'succeeded' as const }] }),
      extractDefaultAsrSubtitleTrack: extractAsr,
      listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([])
    })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })

    await vi.waitFor(() => expect(testDocument.querySelector('#subtitleListPanel tbody')?.textContent).toContain('已中断'))
    expect(testDocument.querySelector('#subtitleListPanel .helper')?.textContent).toContain('已完成 1 / 2')
    expect(testDocument.querySelector('#subtitleListPanel .helper')?.textContent).toContain('第 02 集继续')
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(window.desktopApi.resumeSubtitleRecognitionRun).toHaveBeenCalledWith('interrupted-run'))
    await vi.waitFor(() => expect(extractAsr).toHaveBeenCalledWith({ dramaId: 'd1', episodeId: 'episode-2', language: 'zh-CN', mode: 'audio-first' }))
    expect(extractAsr).not.toHaveBeenCalledWith(expect.objectContaining({ episodeId: 'episode-1' }))
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('第 02 集'))
  })

  it('starts a missing-only OCR batch instead of resuming an interrupted batch from another runner', async () => {
    const interrupted: SubtitleRecognitionRun = {
      id: 'old-ocr-run', dramaId: 'd1', status: 'interrupted',
      settings: { recognitionMode: 'ocr-only', scope: 'all', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' },
      episodeIds: ['episode-1'], total: 1, completed: 0, failed: 0, currentEpisodeId: null,
      ocrRuntime: { buildId: 'old-runner', sha256: 'b'.repeat(64) }, reason: '工具已关闭或重启', createdAt: '', updatedAt: '',
      items: [{ episodeId: 'episode-1', status: 'interrupted', reason: '工具已关闭或重启' }]
    }
    const testDocument = renderSurface()
    installApi({ listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([asr]), getLatestSubtitleRecognitionRun: vi.fn().mockResolvedValue(interrupted) })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-generate]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(window.desktopApi.startSubtitleRecognitionRun).toHaveBeenCalledWith(expect.objectContaining({
      episodeIds: ['episode-1'], settings: expect.objectContaining({ scope: 'missing' }), ocrRuntime: expect.objectContaining({ buildId: 'test-runner' })
    })))
    expect(window.desktopApi.resumeSubtitleRecognitionRun).not.toHaveBeenCalled()
  })

  it('uses explicit episode selection when a newer OCR runner cannot resume the old batch', async () => {
    const interrupted: SubtitleRecognitionRun = {
      id: 'old-ocr-run', dramaId: 'd1', status: 'interrupted',
      settings: { recognitionMode: 'ocr-only', scope: 'all', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' },
      episodeIds: ['episode-1', 'episode-2'], total: 2, completed: 2, failed: 0, currentEpisodeId: null,
      ocrRuntime: { buildId: 'old-runner', sha256: 'b'.repeat(64) }, reason: '工具已关闭或重启', createdAt: '', updatedAt: '',
      items: [{ episodeId: 'episode-1', status: 'succeeded', reason: null }, { episodeId: 'episode-2', status: 'succeeded', reason: null }]
    }
    const start = vi.fn().mockImplementation((input) => Promise.resolve({ id: 'replacement-run', dramaId: input.dramaId, status: 'running', settings: input.settings, episodeIds: input.episodeIds, total: input.episodeIds.length, completed: 0, failed: 0, currentEpisodeId: null, ocrRuntime: input.ocrRuntime, reason: null, items: input.episodeIds.map((episodeId: string) => ({ episodeId, status: 'pending', reason: null })), createdAt: '', updatedAt: '' }))
    const testDocument = renderSurface()
    installApi({ getLatestSubtitleRecognitionRun: vi.fn().mockResolvedValue(interrupted), startSubtitleRecognitionRun: start })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-select-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-select-episode="episode-1"]') as HTMLInputElement).click()
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ episodeIds: ['episode-1'], settings: expect.objectContaining({ scope: 'missing' }) })))
    expect(window.desktopApi.resumeSubtitleRecognitionRun).not.toHaveBeenCalled()
  })

  it('retries only the failed OCR stage when ASR already succeeded in a partial batch', async () => {
    const partial: SubtitleRecognitionRun = {
      id: 'partial-run', dramaId: 'd1', status: 'partial',
      settings: { recognitionMode: 'asr-ocr', scope: 'all', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' },
      episodeIds: ['episode-1', 'episode-2'], total: 2, completed: 1, failed: 1, currentEpisodeId: null, ocrRuntime: { buildId: 'test-runner', sha256: 'a'.repeat(64) },
      reason: '第 01 集 OCR 失败', createdAt: '', updatedAt: '',
      items: [{ episodeId: 'episode-1', status: 'failed', reason: 'OCR 失败' }, { episodeId: 'episode-2', status: 'succeeded', reason: null }]
    }
    const extractAsr = vi.fn().mockResolvedValue(asr)
    const extractOcr = vi.fn().mockResolvedValue(ocr)
    const retried = { ...partial, status: 'running' as const, failed: 0, reason: null, items: [{ ...partial.items[0], status: 'pending' as const, reason: null }, partial.items[1]] }
    const testDocument = renderSurface()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    installApi({
      getLatestSubtitleRecognitionRun: vi.fn().mockResolvedValue(partial),
      getSubtitleRecognitionSettings: vi.fn().mockResolvedValue(partial.settings),
      retryFailedSubtitleRecognitionRun: vi.fn().mockResolvedValue(retried),
      markSubtitleRecognitionRunItemRunning: vi.fn().mockResolvedValue({ ...retried, currentEpisodeId: 'episode-1', items: [{ ...retried.items[0], status: 'running' as const }, retried.items[1]] }),
      markSubtitleRecognitionRunItemSucceeded: vi.fn().mockResolvedValue({ ...retried, completed: 2, items: [{ ...retried.items[0], status: 'succeeded' as const }, retried.items[1]] }),
      finishSubtitleRecognitionRun: vi.fn().mockResolvedValue({ ...retried, status: 'completed' as const, completed: 2, items: [{ ...retried.items[0], status: 'succeeded' as const }, retried.items[1]] }),
      listSubtitleEvidenceTracks: vi.fn().mockImplementation((_dramaId: string, episodeId: string) => Promise.resolve(episodeId === 'episode-1' ? [asr] : [asr, ocr])),
      extractDefaultAsrSubtitleTrack: extractAsr,
      extractIndependentLocalOcrSubtitleTrack: extractOcr
    })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-generate]')).not.toBeNull())

    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(extractOcr).toHaveBeenCalledWith({ dramaId: 'd1', episodeId: 'episode-1', language: 'chi_sim', regionMode: 'fixed-region' }))
    expect(extractAsr).not.toHaveBeenCalled()
    expect(window.desktopApi.retryFailedSubtitleRecognitionRun).toHaveBeenCalledWith('partial-run')
    expect(window.desktopApi.startSubtitleRecognitionRun).not.toHaveBeenCalled()
    expect(testDocument.getElementById('toast')?.textContent).toContain('已仅重试失败项')
  })

  it('starts a replacement batch when the failed batch uses a stale OCR runner', async () => {
    const partial: SubtitleRecognitionRun = {
      id: 'stale-partial-run', dramaId: 'd1', status: 'partial',
      settings: { recognitionMode: 'asr-ocr', scope: 'all', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' },
      episodeIds: ['episode-1', 'episode-2'], total: 2, completed: 1, failed: 1, currentEpisodeId: null, ocrRuntime: { buildId: 'old-runner', sha256: 'b'.repeat(64) },
      reason: 'old runner failure', createdAt: '', updatedAt: '',
      items: [{ episodeId: 'episode-1', status: 'failed', reason: 'OCR failure' }, { episodeId: 'episode-2', status: 'succeeded', reason: null }]
    }
    const start = vi.fn().mockImplementation((input) => Promise.resolve({ id: 'replacement-run', dramaId: input.dramaId, status: 'running', settings: input.settings, episodeIds: input.episodeIds, total: input.episodeIds.length, completed: 0, failed: 0, currentEpisodeId: null, ocrRuntime: input.ocrRuntime, reason: null, items: input.episodeIds.map((episodeId: string) => ({ episodeId, status: 'pending', reason: null })), createdAt: '', updatedAt: '' }))
    const extractOcr = vi.fn().mockResolvedValue(ocr)
    const testDocument = renderSurface()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    installApi({
      getLatestSubtitleRecognitionRun: vi.fn().mockResolvedValue(partial),
      getSubtitleRecognitionSettings: vi.fn().mockResolvedValue(partial.settings),
      startSubtitleRecognitionRun: start,
      retryFailedSubtitleRecognitionRun: vi.fn(),
      markSubtitleRecognitionRunItemRunning: vi.fn().mockResolvedValue({ ...partial, id: 'replacement-run', status: 'running' as const, items: [{ ...partial.items[0], status: 'running' as const }, partial.items[1]] }),
      markSubtitleRecognitionRunItemSucceeded: vi.fn().mockResolvedValue({ ...partial, id: 'replacement-run', status: 'running' as const, completed: 1, failed: 0, items: [{ ...partial.items[0], status: 'succeeded' as const }, partial.items[1]] }),
      finishSubtitleRecognitionRun: vi.fn().mockResolvedValue({ ...partial, id: 'replacement-run', status: 'completed' as const, completed: 1, failed: 0, items: [{ ...partial.items[0], status: 'succeeded' as const }, partial.items[1]] }),
      listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([asr]),
      extractIndependentLocalOcrSubtitleTrack: extractOcr
    })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-generate]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ episodeIds: ['episode-1'], ocrRuntime: expect.objectContaining({ buildId: 'test-runner' }) })))
    await vi.waitFor(() => expect(extractOcr).toHaveBeenCalledWith({ dramaId: 'd1', episodeId: 'episode-1', language: 'chi_sim', regionMode: 'fixed-region' }))
    expect(window.desktopApi.retryFailedSubtitleRecognitionRun).not.toHaveBeenCalled()
    expect(window.desktopApi.extractDefaultAsrSubtitleTrack).not.toHaveBeenCalled()
  })

  it('allows an explicitly selected episode to deliberately rerun both stages', async () => {
    const partial: SubtitleRecognitionRun = {
      id: 'partial-run', dramaId: 'd1', status: 'partial',
      settings: { recognitionMode: 'asr-ocr', scope: 'all', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' },
      episodeIds: ['episode-1', 'episode-2'], total: 2, completed: 1, failed: 1, currentEpisodeId: null, ocrRuntime: null,
      reason: '第 01 集 OCR 失败', createdAt: '', updatedAt: '',
      items: [{ episodeId: 'episode-1', status: 'failed', reason: 'OCR 失败' }, { episodeId: 'episode-2', status: 'succeeded', reason: null }]
    }
    const extractAsr = vi.fn().mockResolvedValue(asr)
    const extractOcr = vi.fn().mockResolvedValue(ocr)
    const testDocument = renderSurface()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    installApi({
      getLatestSubtitleRecognitionRun: vi.fn().mockResolvedValue(partial),
      getSubtitleRecognitionSettings: vi.fn().mockResolvedValue(partial.settings),
      listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([asr, ocr]),
      extractDefaultAsrSubtitleTrack: extractAsr,
      extractIndependentLocalOcrSubtitleTrack: extractOcr
    })
    bindSubtitleAssetRuntime({ document: testDocument, dramaId: 'd1', episodes })
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-select-episode="episode-1"]')).not.toBeNull())
    ;(testDocument.querySelector('[data-subtitle-select-episode="episode-1"]') as HTMLInputElement).click()
    ;(testDocument.querySelector('[data-subtitle-generate]') as HTMLButtonElement).click()

    await vi.waitFor(() => expect(extractAsr).toHaveBeenCalledWith({ dramaId: 'd1', episodeId: 'episode-1', language: 'zh-CN', mode: 'audio-first' }))
    expect(extractOcr).toHaveBeenCalledWith({ dramaId: 'd1', episodeId: 'episode-1', language: 'chi_sim', regionMode: 'fixed-region' })
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
