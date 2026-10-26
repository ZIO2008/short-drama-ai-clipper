// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { bindSubtitleStaticDetailPreview } from './SubtitleStaticDetailPreviewBridge.js'
import { episodes, renderSubtitleRuntimeSurface as renderSurface } from './subtitle-runtime-test-helpers.js'

describe('bindSubtitleStaticDetailPreview', () => {
  it('keeps the prototype 16:9 canvas when the source video is portrait', () => {
    const testDocument = renderSurface()
    const portraitEpisode = { ...episodes[0], videoWidth: 1080, videoHeight: 1920 }
    const frame = testDocument.querySelector<HTMLElement>('.r5-frame')!
    frame.style.aspectRatio = '1080 / 1920'

    bindSubtitleStaticDetailPreview({ document: testDocument, episodes: [portraitEpisode] })
    testDocument.dispatchEvent(new CustomEvent('subtitle-static-detail:opened', { detail: { episodeId: portraitEpisode.id, kind: 'view' } }))

    expect(frame.style.aspectRatio).toBe('')
    expect(testDocument.querySelector<HTMLVideoElement>('video[data-subtitle-preview]')?.style.objectFit).toBe('contain')
  })

  it('keeps the derived monitor episode label aligned with the selected source video', () => {
    const testDocument = renderSurface()
    const derivedLabel = testDocument.createElement('div')
    derivedLabel.className = 'subtitle-monitor-meta subtitle-monitor-meta-bottom'
    derivedLabel.innerHTML = '<span>第 01 集 · 源片 16:9 · OCR 固定区域</span><span>区域覆盖 92%</span>'
    testDocument.querySelector('#subtitleDetailAsset .r5-frame')?.insertAdjacentElement('afterend', derivedLabel)

    const secondEpisode = { ...episodes[0], id: 'episode-2', episodeNo: 2, sourcePath: 'D:\\episode-02.mp4' }
    bindSubtitleStaticDetailPreview({ document: testDocument, episodes: [episodes[0], secondEpisode] })
    testDocument.dispatchEvent(new CustomEvent('subtitle-static-detail:opened', { detail: { episodeId: 'episode-1', kind: 'view' } }))

    expect(derivedLabel.querySelector('span')?.textContent).toContain('第 01 集')
    testDocument.dispatchEvent(new CustomEvent('subtitle-static-detail:opened', { detail: { episodeId: 'episode-2', kind: 'view' } }))
    expect(derivedLabel.querySelector('span')?.textContent).toContain('第 02 集')
  })

  it('replaces the prototype range state with one video playhead that seeks the current source', () => {
    const testDocument = renderSurface()
    const preview = testDocument.querySelector<HTMLElement>('.r5-sub-preview')!
    preview.querySelector('.r5-timeline')?.insertAdjacentHTML('beforebegin', '<div data-subtitle-transport><button data-subtitle-step="-5" type="button"></button><button data-subtitle-play type="button" aria-pressed="false"></button><button data-subtitle-step="5" type="button"></button><time class="subtitle-transport-time" data-subtitle-transport-time></time><time class="subtitle-transport-time"></time><span data-subtitle-transport-status></span></div>')
    bindSubtitleStaticDetailPreview({ document: testDocument, episodes })
    testDocument.dispatchEvent(new CustomEvent('subtitle-static-detail:opened', { detail: { episodeId: 'episode-1', kind: 'view' } }))

    const video = testDocument.querySelector<HTMLVideoElement>('video[data-subtitle-preview]')!
    const track = testDocument.querySelector<HTMLElement>('.r5-timeline .r5-track')!
    Object.defineProperty(video, 'duration', { value: 30, configurable: true })
    Object.defineProperty(video, 'currentTime', { value: 12, writable: true, configurable: true })
    Object.defineProperty(track, 'getBoundingClientRect', { value: () => ({ left: 0, width: 100 }), configurable: true })
    video.dispatchEvent(new Event('loadedmetadata'))
    video.dispatchEvent(new Event('timeupdate'))

    expect(video.src).toBe('shortdrama-media://local/D%3A%5Cepisode-01.mp4')
    expect(testDocument.getElementById('subtitleMonitorEpisode')?.textContent).toContain('第 01 集')
    expect(track.querySelector('.r5-range')).toBeNull()
    expect(track.querySelector('.r5-anchor')).toBeNull()
    expect(track.querySelector('[data-subtitle-timeline-playhead]')?.getAttribute('style')).toContain('left: 40%')
    expect(track.getAttribute('role')).toBe('slider')
    expect(testDocument.querySelector('.r5-timecode')?.textContent).toBe('00:00:12.000')

    track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 50 }))
    expect(video.currentTime).toBe(15)
    track.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 75 }))
    expect(video.currentTime).toBe(22.5)
    track.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    track.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }))
    expect(video.currentTime).toBe(21.5)
    track.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Home' }))
    expect(video.currentTime).toBe(0)
    track.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }))
    expect(video.currentTime).toBe(30)

    const transport = testDocument.querySelector<HTMLElement>('[data-subtitle-transport]')!
    transport.querySelector<HTMLElement>('[data-subtitle-step="-5"]')?.click()
    expect(video.currentTime).toBe(25)
    transport.querySelector<HTMLElement>('[data-subtitle-step="5"]')?.click()
    expect(video.currentTime).toBe(30)
    expect(transport.querySelector('[data-subtitle-transport-time]')?.textContent).toBe('00:30.000')
    expect(transport.querySelectorAll('.subtitle-transport-time')[1]?.textContent).toBe('00:30.000')

    testDocument.dispatchEvent(new CustomEvent('subtitle-evidence:locate', { bubbles: true, detail: { startSeconds: 4 } }))
    expect(video.currentTime).toBe(4)
    expect(transport.querySelector('[data-subtitle-transport-status]')?.textContent).toBe('定位后停留')
  })

  it('lets the runtime play button control both video and timeline after replacing prototype listeners', () => {
    const testDocument = renderSurface()
    const preview = testDocument.querySelector<HTMLElement>('.r5-sub-preview')!
    preview.querySelector('.r5-timeline')?.insertAdjacentHTML('beforebegin', '<div data-subtitle-transport><button data-subtitle-play type="button" aria-pressed="false"></button><span data-subtitle-transport-status></span></div>')
    const prototypeTransport = preview.querySelector<HTMLElement>('[data-subtitle-transport]')!
    let prototypeClicks = 0
    prototypeTransport.addEventListener('click', () => { prototypeClicks += 1 })

    bindSubtitleStaticDetailPreview({ document: testDocument, episodes })
    testDocument.dispatchEvent(new CustomEvent('subtitle-static-detail:opened', { detail: { episodeId: 'episode-1', kind: 'view' } }))

    const video = testDocument.querySelector<HTMLVideoElement>('video[data-subtitle-preview]')!
    const playButton = testDocument.querySelector<HTMLButtonElement>('[data-subtitle-play]')!
    Object.defineProperty(video, 'duration', { value: 30, configurable: true })
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true, configurable: true })
    let paused = true
    Object.defineProperty(video, 'paused', { configurable: true, get: () => paused })
    video.play = vi.fn(() => { paused = false; video.dispatchEvent(new Event('play')); return Promise.resolve() })
    video.pause = vi.fn(() => { paused = true; video.dispatchEvent(new Event('pause')) })

    playButton.click()
    expect(video.play).toHaveBeenCalledTimes(1)
    expect(prototypeClicks).toBe(0)
    expect(playButton.getAttribute('aria-pressed')).toBe('true')

    video.currentTime = 5
    video.dispatchEvent(new Event('timeupdate'))
    expect(testDocument.querySelector('.r5-timecode')?.textContent).toBe('00:00:05.000')

    playButton.click()
    expect(video.pause).toHaveBeenCalledTimes(1)
    expect(playButton.getAttribute('aria-pressed')).toBe('false')
  })

  it('emits the actual video position for the right evidence bridge on time updates and pause', () => {
    const testDocument = renderSurface()
    bindSubtitleStaticDetailPreview({ document: testDocument, episodes })
    testDocument.dispatchEvent(new CustomEvent('subtitle-static-detail:opened', { detail: { episodeId: 'episode-1', kind: 'view' } }))
    const video = testDocument.querySelector<HTMLVideoElement>('video[data-subtitle-preview]')!
    Object.defineProperty(video, 'duration', { value: 30, configurable: true })
    Object.defineProperty(video, 'currentTime', { value: 6.5, writable: true, configurable: true })
    const positions: Array<{ seconds: number; isPlaying: boolean }> = []
    testDocument.addEventListener('subtitle-preview:position', (event) => positions.push((event as CustomEvent<{ seconds: number; isPlaying: boolean }>).detail))

    video.dispatchEvent(new Event('timeupdate'))
    video.dispatchEvent(new Event('pause'))

    expect(positions.at(-1)).toEqual({ seconds: 6.5, isPlaying: false })
    expect(positions.some((position) => position.seconds === 6.5)).toBe(true)
  })
})
