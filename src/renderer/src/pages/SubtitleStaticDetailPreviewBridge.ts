import type { EpisodeAsset } from '../../../shared/contracts.js'
import { toMediaUrl } from '../components/MediaMonitor.js'
import { formatEpisode, formatRatio, hasReadableMedia } from './subtitle-evidence-presentation.js'

type Props = { document: Document; episodes: EpisodeAsset[] }
type OpenDetail = { episodeId?: string; kind?: 'view' | 'status' }

const isOpenDetail = (value: unknown): value is OpenDetail => Boolean(value && typeof value === 'object')
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value))
const formatTime = (seconds: number): string => {
  const value = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor((value % 3600) / 60)
  const remainder = Math.floor(value % 60)
  const milliseconds = Math.floor((value % 1) * 1000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

const formatTransportTime = (seconds: number): string => formatTime(seconds).slice(3)

const setTransportStatus = (detailAsset: HTMLElement, status: string): void => {
  detailAsset.querySelector<HTMLElement>('[data-subtitle-transport-status]')?.replaceChildren(status)
}

const setEpisodeLabel = (detailAsset: HTMLElement, text: string): void => {
  detailAsset.querySelector<HTMLElement>('#subtitleMonitorEpisode')?.replaceChildren(text)
  detailAsset.querySelector<HTMLElement>('.subtitle-monitor-meta-bottom span:first-child')?.replaceChildren(text)
}

export const bindSubtitleStaticDetailPreview = ({ document, episodes }: Props): void => {
  if (document.body.dataset.subtitleStaticDetailPreviewBound === 'true') return
  document.body.dataset.subtitleStaticDetailPreviewBound = 'true'
  const episodeById = new Map(episodes.map((episode) => [episode.id, episode]))

  document.addEventListener('subtitle-static-detail:opened', (event) => {
    const detail = (event as CustomEvent<unknown>).detail
    if (!isOpenDetail(detail) || detail.kind !== 'view' || !detail.episodeId) return
    const episode = episodeById.get(detail.episodeId)
    const detailAsset = document.querySelector<HTMLElement>('#subtitleAssetModal #subtitleDetailAsset')
    if (!episode || !detailAsset) return
    renderPreview(document, detailAsset, episode)
  })
  document.addEventListener('subtitle-evidence:locate', (event) => {
    const startSeconds = (event as CustomEvent<{ startSeconds?: unknown }>).detail?.startSeconds
    if (typeof startSeconds !== 'number' || !Number.isFinite(startSeconds) || startSeconds < 0) return
    const video = document.querySelector<HTMLVideoElement>('#subtitleAssetModal video[data-subtitle-preview]')
    if (!video) return
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity
    if (startSeconds > duration) return
    video.currentTime = startSeconds
    video.dispatchEvent(new Event('seeked'))
    setTransportStatus(document.querySelector<HTMLElement>('#subtitleAssetModal #subtitleDetailAsset') ?? video.parentElement ?? document.body, '定位后停留')
  })
}

const renderPreview = (document: Document, detailAsset: HTMLElement, episode: EpisodeAsset): void => {
  const frame = detailAsset.querySelector<HTMLElement>('.r5-frame')
  const timecode = frame?.querySelector<HTMLElement>('.r5-timecode')
  if (!frame || !timecode || !detailAsset.querySelector<HTMLElement>('#subtitleMonitorEpisode')) return
  frame.querySelector<HTMLVideoElement>('video[data-subtitle-preview]')?.remove()
  if (!hasReadableMedia(episode)) {
    setEpisodeLabel(detailAsset, `${formatEpisode(episode.episodeNo)} · 源视频不可用`)
    return
  }

  // The copied prototype owns the 16:9 preview canvas; source media only changes its fit inside it.
  frame.style.removeProperty('aspect-ratio')
  setEpisodeLabel(detailAsset, `${formatEpisode(episode.episodeNo)} · 源片 ${formatRatio(episode)} · OCR 固定区域`)
  frame.querySelectorAll<HTMLElement>('.r5-window, .r5-figure, .r5-sub-region').forEach((element) => { element.hidden = true })
  frame.querySelectorAll<HTMLElement>('.r5-timecode, .r5-monitor-caption').forEach((element) => { element.style.zIndex = '2' })

  const video = document.createElement('video')
  video.dataset.subtitlePreview = 'true'
  video.dataset.episodeId = episode.id
  video.preload = 'metadata'
  video.muted = true
  video.playsInline = true
  video.src = toMediaUrl(episode.sourcePath)
  video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:1'
  frame.prepend(video)
  bindSinglePlayhead({ document, detailAsset, video, timecode, durationFallback: episode.durationSeconds ?? 0 })
  video.addEventListener('error', () => {
    if (!video.isConnected) return
    video.remove()
    frame.querySelectorAll<HTMLElement>('.r5-window, .r5-figure, .r5-sub-region').forEach((element) => { element.hidden = false })
    setEpisodeLabel(detailAsset, `${formatEpisode(episode.episodeNo)} · 源视频无法预览`)
  })
  video.addEventListener('click', () => { void (video.paused ? video.play() : Promise.resolve(video.pause())).catch(() => undefined) })
}

const bindSinglePlayhead = ({ document, detailAsset, video, timecode, durationFallback }: { document: Document; detailAsset: HTMLElement; video: HTMLVideoElement; timecode: HTMLElement; durationFallback: number }): void => {
  const track = detailAsset.querySelector<HTMLElement>('.r5-timeline .r5-track')
  if (!track) return
  track.querySelector('.r5-range')?.remove()
  track.querySelector('.r5-anchor')?.remove()
  const playhead = document.createElement('i')
  playhead.dataset.subtitleTimelinePlayhead = 'true'
  playhead.style.cssText = 'position:absolute;left:0;top:0;bottom:0;width:2px;background:#d7aa72;pointer-events:none'
  track.append(playhead)
  track.dataset.subtitleTimeline = 'playback'
  track.tabIndex = 0
  track.setAttribute('role', 'slider')
  track.setAttribute('aria-label', '字幕预览播放进度')

  const duration = (): number => Number.isFinite(video.duration) && video.duration > 0 ? video.duration : durationFallback
  const prototypeTransport = detailAsset.querySelector<HTMLElement>('[data-subtitle-transport]')
  const transport = prototypeTransport?.cloneNode(true) as HTMLElement | null
  if (prototypeTransport && transport) prototypeTransport.replaceWith(transport)
  const playButton = transport?.querySelector<HTMLButtonElement>('[data-subtitle-play]')
  const transportCurrentTime = transport?.querySelector<HTMLElement>('[data-subtitle-transport-time]')
  const transportDurationTime = transport?.querySelectorAll<HTMLElement>('.subtitle-transport-time')[1]
  const setPlaybackState = (playing: boolean): void => {
    if (playButton) {
      playButton.classList.toggle('is-playing', playing)
      playButton.setAttribute('aria-pressed', String(playing))
      playButton.setAttribute('aria-label', playing ? '暂停' : '播放')
      playButton.innerHTML = playing
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7v10M15 7v10"/></svg><span>暂停</span>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 8 6-8 6z"/></svg><span>播放</span>'
    }
    setTransportStatus(detailAsset, playing ? '播放中' : '已暂停')
  }
  const sync = (): void => {
    const total = duration()
    const current = Number.isFinite(video.currentTime) ? video.currentTime : 0
    const ratio = total > 0 ? clamp(current / total, 0, 1) : 0
    playhead.style.left = `${ratio * 100}%`
    timecode.textContent = formatTime(current)
    track.setAttribute('aria-valuemin', '0')
    track.setAttribute('aria-valuemax', String(total))
    track.setAttribute('aria-valuenow', String(clamp(current, 0, total)))
    track.setAttribute('aria-valuetext', `${formatTime(current)} / ${formatTime(total)}`)
    if (transportCurrentTime) transportCurrentTime.textContent = formatTransportTime(current)
    if (transportDurationTime) transportDurationTime.textContent = formatTransportTime(total)
    document.dispatchEvent(new CustomEvent('subtitle-preview:position', { detail: { seconds: current, isPlaying: !video.paused } }))
  }
  const seek = (seconds: number): void => {
    const total = duration()
    if (total <= 0) return
    video.currentTime = clamp(seconds, 0, total)
    sync()
  }
  const seekAt = (clientX: number): void => {
    const bounds = track.getBoundingClientRect()
    if (bounds.width <= 0) return
    seek(((clientX - bounds.left) / bounds.width) * duration())
  }
  let dragging = false
  track.addEventListener('pointerdown', (event) => {
    dragging = true
    seekAt(event.clientX)
    try { track.setPointerCapture(event.pointerId) } catch { /* Pointer capture is unavailable in some test environments. */ }
  })
  track.addEventListener('pointermove', (event) => { if (dragging) seekAt(event.clientX) })
  track.addEventListener('pointerup', () => { dragging = false })
  track.addEventListener('pointercancel', () => { dragging = false })
  track.addEventListener('keydown', (event) => {
    const total = duration()
    if (total <= 0) return
    if (event.key === 'ArrowLeft') { event.preventDefault(); seek(video.currentTime - 1) }
    else if (event.key === 'ArrowRight') { event.preventDefault(); seek(video.currentTime + 1) }
    else if (event.key === 'Home') { event.preventDefault(); seek(0) }
    else if (event.key === 'End') { event.preventDefault(); seek(total) }
  })
  transport?.addEventListener('click', (event) => {
    const target = event.target as Element
    const control = target.closest<HTMLElement>('[data-subtitle-step], [data-subtitle-play]')
    if (!control || !transport.contains(control)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    const step = Number(control.dataset.subtitleStep)
    if (Number.isFinite(step)) {
      seek(video.currentTime + step)
      if (video.paused) setTransportStatus(detailAsset, '定位后停留')
      return
    }
    try {
      const result = video.paused ? video.play() : (video.pause(), undefined)
      void Promise.resolve(result).catch(() => setTransportStatus(detailAsset, '无法播放'))
    } catch {
      setTransportStatus(detailAsset, '无法播放')
    }
  }, true)
  video.addEventListener('loadedmetadata', sync)
  video.addEventListener('timeupdate', sync)
  video.addEventListener('seeked', sync)
  video.addEventListener('play', () => { setPlaybackState(true); sync() })
  video.addEventListener('pause', () => { setPlaybackState(false); sync() })
  sync()
}
