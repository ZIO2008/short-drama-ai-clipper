// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, EpisodeAsset, SubtitleOcrRegion } from '../../../shared/contracts.js'
import { bindSubtitleOcrRegionCalibration } from './SubtitleOcrRegionCalibrationBridge.js'

const region: SubtitleOcrRegion = { id: 'region-1', dramaId: 'd1', episodeId: null, scope: 'drama_default', x: 0.12, y: 0.67, width: 0.76, height: 0.18 }
const episodes: EpisodeAsset[] = [{ id: 'episode-1', episodeNo: 1, sortOrder: 1, sourcePath: 'D:\\episode-01.mp4', durationSeconds: 60, fps: 25, videoWidth: 1080, videoHeight: 1920, status: 'ready' }]

const renderSurface = (): Document => {
  const testDocument = document.implementation.createHTMLDocument('subtitle-region-calibration')
  testDocument.body.innerHTML = '<button data-subtitle-open-settings>字幕识别设置</button><section id="subtitleRecognitionSettingsModal" class="is-calibrating"><h2 id="subtitleRecognitionSettingsTitle">字幕区域校准</h2><button data-subtitle-close-settings>关闭</button><section data-subtitle-region-setting><span class="badge neutral" data-subtitle-region-badge>未校准</span><p data-subtitle-region-help></p><div data-subtitle-region-summary><span class="num"></span></div><button data-subtitle-start-calibration>开始校准</button></section><section data-subtitle-calibration-view data-state="adjust"><h3 data-subtitle-calibration-heading></h3><p data-subtitle-calibration-description></p><div data-subtitle-calibration-surface><div data-od-id="subtitle-region-smart-generated"></div><div data-subtitle-adjusted-box style="left:12%;top:67%;width:76%;height:18%"><span class="handle se"></span></div></div><div class="subtitle-calibration-timeline-head"><time data-subtitle-calibration-time></time><span class="helper"></span></div><div data-subtitle-calibration-track><span data-subtitle-calibration-progress></span><button data-subtitle-marker="12.4"></button></div><p data-subtitle-calibration-status></p><div class="subtitle-calibration-footer-actions"><button data-subtitle-redetect>重新检测</button><button data-subtitle-manual>手动框选</button><button data-subtitle-confirm>确认区域</button></div></section></section><div id="toast"></div>'
  return testDocument
}

const installApi = (get = vi.fn().mockResolvedValue(region), set = vi.fn().mockResolvedValue(region), clear = vi.fn().mockResolvedValue(undefined)): void => {
  window.desktopApi = { getEffectiveSubtitleOcrRegion: get, setSubtitleOcrRegion: set, clearSubtitleOcrRegion: clear } as unknown as DesktopApi
}

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('bindSubtitleOcrRegionCalibration', () => {
  it('reads the saved drama-default region and restores the approved prototype summary', async () => {
    const testDocument = renderSurface(); installApi(); bindSubtitleOcrRegionCalibration({ document: testDocument, dramaId: 'd1', episodes })

    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-region-badge]')?.textContent).toBe('已校准'))
    expect(testDocument.querySelector('[data-subtitle-region-summary] .num')?.textContent).toBe('X 12% · Y 67% · W 76% · H 18%')
    expect(testDocument.querySelector('[data-subtitle-start-calibration]')?.textContent).toBe('重新校准')
  })

  it('persists the current normalized box while keeping the calibration view open', async () => {
    const set = vi.fn().mockResolvedValue(region)
    const testDocument = renderSurface(); installApi(vi.fn().mockResolvedValue(null), set); bindSubtitleOcrRegionCalibration({ document: testDocument, dramaId: 'd1', episodes })

    ;(testDocument.querySelector('[data-subtitle-confirm]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith('d1', null, { x: 0.12, y: 0.67, width: 0.76, height: 0.18 }))
    expect(testDocument.getElementById('subtitleRecognitionSettingsModal')?.classList.contains('is-calibrating')).toBe(true)
    expect(testDocument.getElementById('subtitleRecognitionSettingsTitle')?.textContent).toBe('字幕区域校准')
  })

  it('keeps the current adjustment available when persistence fails', async () => {
    const set = vi.fn().mockRejectedValue(new Error('disk unavailable'))
    const testDocument = renderSurface(); installApi(vi.fn().mockResolvedValue(null), set); bindSubtitleOcrRegionCalibration({ document: testDocument, dramaId: 'd1', episodes })

    ;(testDocument.querySelector('[data-subtitle-confirm]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.querySelector('[data-subtitle-calibration-status]')?.textContent).toContain('保存失败'))
    expect(testDocument.getElementById('subtitleRecognitionSettingsModal')?.classList.contains('is-calibrating')).toBe(true)
    expect((testDocument.querySelector('[data-subtitle-adjusted-box]') as HTMLElement).style.left).toBe('12%')
  })

  it('saves and clears an episode override when calibration started from that episode detail', async () => {
    const episodeRegion: SubtitleOcrRegion = { ...region, episodeId: 'episode-1', scope: 'episode_override' }
    const set = vi.fn().mockResolvedValue(episodeRegion)
    const clear = vi.fn().mockResolvedValue(undefined)
    const testDocument = renderSurface(); (testDocument.querySelector('[data-subtitle-open-settings]') as HTMLButtonElement).dataset.subtitleEpisodeId = 'episode-1'; installApi(vi.fn().mockResolvedValue(episodeRegion), set, clear); bindSubtitleOcrRegionCalibration({ document: testDocument, dramaId: 'd1', episodes })

    ;(testDocument.querySelector('[data-subtitle-open-settings]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(testDocument.querySelector<HTMLButtonElement>('[data-subtitle-clear-episode-override]')?.hidden).toBe(false))
    ;(testDocument.querySelector('[data-subtitle-confirm]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith('d1', 'episode-1', { x: 0.12, y: 0.67, width: 0.76, height: 0.18 }))
    await Promise.resolve()
    ;(testDocument.querySelector('[data-subtitle-clear-episode-override]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(clear).toHaveBeenCalledWith('d1', 'episode-1'))
    expect(testDocument.querySelector('[data-subtitle-region-summary] .num')?.textContent).toContain('机器自动选择')
  })

  it('accepts the current episode context from the settings bridge event', async () => {
    const episodeRegion: SubtitleOcrRegion = { ...region, episodeId: 'episode-1', scope: 'episode_override' }
    const testDocument = renderSurface(); installApi(vi.fn().mockResolvedValue(episodeRegion)); bindSubtitleOcrRegionCalibration({ document: testDocument, dramaId: 'd1', episodes })

    testDocument.dispatchEvent(new CustomEvent('subtitle-recognition-settings:opened', { detail: { episodeId: 'episode-1' } }))
    await vi.waitFor(() => expect(testDocument.querySelector<HTMLButtonElement>('[data-subtitle-clear-episode-override]')?.hidden).toBe(false))
  })

  it('returns to the settings home when the close control is used during calibration', () => {
    const testDocument = renderSurface(); installApi(); bindSubtitleOcrRegionCalibration({ document: testDocument, dramaId: 'd1', episodes })

    ;(testDocument.querySelector('[data-subtitle-close-settings]') as HTMLButtonElement).click()
    expect(testDocument.getElementById('subtitleRecognitionSettingsModal')?.classList.contains('is-calibrating')).toBe(false)
    expect(testDocument.getElementById('subtitleRecognitionSettingsTitle')?.textContent).toBe('字幕识别设置')
  })

  it('replaces the demo frame with the first readable episode and synchronizes the real timeline', () => {
    const testDocument = renderSurface(); installApi(); bindSubtitleOcrRegionCalibration({ document: testDocument, dramaId: 'd1', episodes })
    const video = testDocument.querySelector<HTMLVideoElement>('video[data-subtitle-calibration-preview]')
    const track = testDocument.querySelector<HTMLElement>('[data-subtitle-calibration-track]')
    expect(video?.src).toContain('shortdrama-media://local/D%3A%5Cepisode-01.mp4')
    expect(testDocument.querySelector<HTMLElement>('[data-od-id="subtitle-region-smart-generated"]')?.hidden).toBe(true)
    expect(testDocument.querySelector<HTMLElement>('[data-subtitle-marker]')?.hidden).toBe(true)
    expect(testDocument.querySelector('.subtitle-calibration-timeline-head .helper')?.textContent).toBe('暂无已检测字幕画面')
    Object.defineProperty(video!, 'duration', { configurable: true, value: 100 })
    Object.defineProperty(video!, 'currentTime', { configurable: true, writable: true, value: 0 })
    video!.dispatchEvent(new Event('loadedmetadata'))
    expect(video!.currentTime).toBe(1)
    vi.spyOn(track!, 'getBoundingClientRect').mockReturnValue({ left: 10, width: 200 } as DOMRect)
    track!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 110 }))
    expect(video!.currentTime).toBe(50)
    expect(testDocument.querySelector('[data-subtitle-calibration-time]')?.textContent).toBe('00:50.000')
  })

  it('does not turn the prototype re-detect button into a false successful detection', () => {
    const testDocument = renderSurface(); installApi(); bindSubtitleOcrRegionCalibration({ document: testDocument, dramaId: 'd1', episodes })
    ;(testDocument.querySelector('[data-subtitle-redetect]') as HTMLButtonElement).click()
    expect(testDocument.querySelector('[data-subtitle-calibration-status]')?.textContent).toContain('没有可用的真实字幕区域检测器')
  })
})
