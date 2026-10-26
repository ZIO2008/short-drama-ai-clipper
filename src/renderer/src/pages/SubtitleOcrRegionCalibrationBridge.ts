import type { EpisodeAsset, SubtitleOcrRegion } from '../../../shared/contracts.js'
import { toMediaUrl } from '../components/MediaMonitor.js'
import { hasReadableMedia } from './subtitle-evidence-presentation.js'

type Props = { document: Document; dramaId: string; episodes: EpisodeAsset[] }
type Geometry = Pick<SubtitleOcrRegion, 'x' | 'y' | 'width' | 'height'>
type DragMode = 'move' | 'nw' | 'ne' | 'sw' | 'se'
type Drag = { mode: DragMode; startX: number; startY: number; base: Geometry }

const minimumWidth = 0.15
const minimumHeight = 0.05
const initialPreviewSeconds = 1

const percentage = (value: number): string => `${Math.round(value * 10000) / 100}%`
const geometryLabel = (region: Geometry): string => `X ${Math.round(region.x * 100)}% · Y ${Math.round(region.y * 100)}% · W ${Math.round(region.width * 100)}% · H ${Math.round(region.height * 100)}%`
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value))
const formatTime = (seconds: number): string => {
  const value = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0
  const minutes = Math.floor(value / 60)
  const remainder = Math.floor(value % 60)
  const milliseconds = Math.floor((value % 1) * 1000)
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

const announce = (document: Document, message: string): void => {
  const toast = document.getElementById('toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  window.setTimeout(() => toast.classList.remove('show'), 2200)
}

const currentGeometry = (document: Document): Geometry | null => {
  const box = document.querySelector<HTMLElement>('[data-subtitle-adjusted-box]')
  if (!box) return null
  const read = (name: 'left' | 'top' | 'width' | 'height'): number | null => {
    const value = Number.parseFloat(box.style[name])
    return Number.isFinite(value) ? value / 100 : null
  }
  const [x, y, width, height] = [read('left'), read('top'), read('width'), read('height')]
  if (x === null || y === null || width === null || height === null) return null
  return { x, y, width, height }
}

const applyGeometry = (document: Document, region: Geometry): void => {
  const box = document.querySelector<HTMLElement>('[data-subtitle-adjusted-box]')
  if (!box) return
  box.style.left = percentage(region.x)
  box.style.top = percentage(region.y)
  box.style.width = percentage(region.width)
  box.style.height = percentage(region.height)
  box.style.right = 'auto'
  box.style.bottom = 'auto'
  const values = document.querySelectorAll<HTMLElement>('.subtitle-calibration-coord b')
  if (values[0]) values[0].textContent = `${Math.round(region.x * 100)}% / ${Math.round(region.y * 100)}%`
  if (values[1]) values[1].textContent = `${Math.round(region.width * 100)}% / ${Math.round(region.height * 100)}%`
}

const applyRegionSummary = (document: Document, region: Geometry | null): void => {
  const setting = document.querySelector<HTMLElement>('[data-subtitle-region-setting]')
  if (!setting) return
  const confirmed = region !== null
  setting.classList.toggle('is-confirmed', confirmed)
  const badge = setting.querySelector<HTMLElement>('[data-subtitle-region-badge]')
  if (badge) {
    badge.textContent = confirmed ? '已校准' : '未校准'
    badge.className = `badge ${confirmed ? 'success' : 'neutral'}`
  }
  const help = setting.querySelector<HTMLElement>('[data-subtitle-region-help]')
  if (help) help.textContent = confirmed
    ? `已确认区域：${geometryLabel(region)}。区域外文字不会进入字幕 OCR。`
    : '尚未校准字幕区域。请选择代表画面后手动框选，再按剧目保存。'
  const summary = setting.querySelector<HTMLElement>('[data-subtitle-region-summary] .num')
  if (summary) summary.textContent = region ? geometryLabel(region) : '本集默认由机器自动选择字幕区域'
  const start = setting.querySelector<HTMLElement>('[data-subtitle-start-calibration]')
  if (start) start.textContent = confirmed ? '重新校准' : '开始校准'
  if (region) applyGeometry(document, region)
}

const resetSettingsTitle = (document: Document): void => {
  const title = document.getElementById('subtitleRecognitionSettingsTitle')
  if (title) title.textContent = '字幕识别设置'
}

const representativeEpisode = (episodes: EpisodeAsset[]): EpisodeAsset | null => (
  [...episodes].sort((left, right) => left.sortOrder - right.sortOrder || (left.episodeNo ?? Number.MAX_SAFE_INTEGER) - (right.episodeNo ?? Number.MAX_SAFE_INTEGER))[0] ?? null
)

const pointerMode = (target: Element): DragMode => {
  const handle = target.closest('.handle')
  if (handle?.classList.contains('nw')) return 'nw'
  if (handle?.classList.contains('ne')) return 'ne'
  if (handle?.classList.contains('sw')) return 'sw'
  if (handle?.classList.contains('se')) return 'se'
  return 'move'
}

const adjustedGeometry = (base: Geometry, mode: DragMode, dx: number, dy: number): Geometry => {
  if (mode === 'move') return { ...base, x: clamp(base.x + dx, 0, 1 - base.width), y: clamp(base.y + dy, 0, 1 - base.height) }
  if (mode === 'nw') {
    const x = clamp(base.x + dx, 0, base.x + base.width - minimumWidth)
    const y = clamp(base.y + dy, 0, base.y + base.height - minimumHeight)
    return { x, y, width: clamp(base.width - dx, minimumWidth, 1 - x), height: clamp(base.height - dy, minimumHeight, 1 - y) }
  }
  if (mode === 'ne') {
    const y = clamp(base.y + dy, 0, base.y + base.height - minimumHeight)
    return { x: base.x, y, width: clamp(base.width + dx, minimumWidth, 1 - base.x), height: clamp(base.height - dy, minimumHeight, 1 - y) }
  }
  if (mode === 'sw') {
    const x = clamp(base.x + dx, 0, base.x + base.width - minimumWidth)
    return { x, y: base.y, width: clamp(base.width - dx, minimumWidth, 1 - x), height: clamp(base.height + dy, minimumHeight, 1 - base.y) }
  }
  return { x: base.x, y: base.y, width: clamp(base.width + dx, minimumWidth, 1 - base.x), height: clamp(base.height + dy, minimumHeight, 1 - base.y) }
}

const calibrationPlayerStyleId = 'subtitle-calibration-player-style'

const ensureCalibrationPlayer = (document: Document): void => {
  const calibration = document.querySelector<HTMLElement>('[data-subtitle-calibration-view]')
  const calibrationActions = calibration?.querySelector<HTMLElement>('.subtitle-calibration-footer-actions')
  if (calibrationActions && !calibrationActions.querySelector('[data-subtitle-clear-episode-override]')) calibrationActions.insertAdjacentHTML('afterbegin', '<button class="btn btn-secondary" type="button" data-subtitle-clear-episode-override hidden>清除本集覆盖</button>')
  const preview = calibration?.querySelector<HTMLElement>('.subtitle-calibration-preview')
  if (!calibration || !preview || preview.dataset.subtitleCalibrationPlayerReady === 'true') return
  const candidate = calibration.querySelector<HTMLElement>('[data-od-id="subtitle-region-smart-generated"]')
  const adjustedBox = calibration.querySelector<HTMLElement>('[data-subtitle-adjusted-box]')
  const player = document.createElement('section')
  player.className = 'subtitle-calibration-player'
  player.innerHTML = '<div class="subtitle-monitor-meta subtitle-monitor-meta-top"><span>当前定位</span><time data-subtitle-calibration-time>00:00.000</time><span class="badge success" data-subtitle-calibration-confirmed hidden>已校准</span></div><div class="subtitle-calibration-video" data-subtitle-calibration-video><div class="subtitle-calibration-portrait-media" data-subtitle-calibration-surface data-od-id="subtitle-region-portrait-case"></div></div><div class="subtitle-monitor-meta subtitle-monitor-meta-bottom"><span data-subtitle-calibration-media-label>代表视频</span><span>区域校准</span></div><div class="subtitle-transport" data-subtitle-calibration-transport><button class="subtitle-transport-btn" type="button" data-subtitle-step="-5" aria-label="后退 5 秒" title="后退 5 秒">|&lt;</button><button class="subtitle-transport-play" type="button" data-subtitle-play aria-label="播放" aria-pressed="false">&#9654;</button><button class="subtitle-transport-btn" type="button" data-subtitle-step="5" aria-label="前进 5 秒" title="前进 5 秒">&gt;|</button><time class="subtitle-transport-time" data-subtitle-transport-time>00:00.000</time><span class="subtitle-transport-divider" aria-hidden="true">/</span><time class="subtitle-transport-time" data-subtitle-transport-duration>00:00.000</time><span class="subtitle-transport-status" data-subtitle-transport-status>定位后停留</span></div><section class="subtitle-calibration-timeline" data-od-id="subtitle-calibration-timeline"><div class="subtitle-calibration-timeline-head"><b>字幕校准时间线</b><span>单播放头</span><span class="helper">暂无已检测字幕画面</span></div><div class="subtitle-calibration-track" data-subtitle-calibration-track><i class="subtitle-calibration-progress" data-subtitle-calibration-progress></i></div></section>'
  const surface = player.querySelector<HTMLElement>('[data-subtitle-calibration-surface]')
  if (surface && candidate) surface.append(candidate)
  adjustedBox?.querySelector('.adjust-label')?.remove()
  if (surface && adjustedBox) surface.append(adjustedBox)
  preview.replaceChildren(player)
  preview.dataset.subtitleCalibrationPlayerReady = 'true'
  const actions = calibration.querySelector<HTMLElement>('.subtitle-calibration-footer-actions')
  if (actions && !actions.querySelector('[data-subtitle-clear-episode-override]')) actions.insertAdjacentHTML('afterbegin', '<button class="btn btn-secondary" type="button" data-subtitle-clear-episode-override hidden>清除本集覆盖</button>')

  if (document.getElementById(calibrationPlayerStyleId)) return
  const style = document.createElement('style')
  style.id = calibrationPlayerStyleId
  style.textContent = '#subtitleRecognitionSettingsModal .subtitle-calibration-preview{display:block;min-height:0;overflow:hidden;padding:12px 16px}#subtitleRecognitionSettingsModal .subtitle-calibration-player{display:grid;width:min(100%,860px);height:100%;min-height:0;margin:auto;grid-template-rows:24px minmax(0,1fr) 24px 48px 64px;gap:6px}#subtitleRecognitionSettingsModal .subtitle-calibration-video{position:relative;display:grid;place-items:center;width:auto!important;height:100%!important;min-width:0;min-height:0;max-width:100%;max-height:100%;aspect-ratio:16/9!important;justify-self:center;align-self:center;overflow:hidden;border:1px solid var(--r5-line);border-radius:6px;background:#000;box-shadow:0 2px 8px color-mix(in oklch,var(--bg),transparent 55%)}#subtitleRecognitionSettingsModal .subtitle-calibration-portrait-media{position:relative;overflow:hidden;background:#000;box-shadow:none}#subtitleRecognitionSettingsModal .subtitle-calibration-view[data-state] .subtitle-region-adjusted{display:block}#subtitleRecognitionSettingsModal .subtitle-monitor-meta{display:flex;align-items:center;min-width:0;padding:0 2px;color:var(--r5-muted);font-size:10px;line-height:1}#subtitleRecognitionSettingsModal .subtitle-monitor-meta-top{gap:8px;border-bottom:1px solid color-mix(in oklch,var(--r5-line) 72%,transparent)}#subtitleRecognitionSettingsModal .subtitle-monitor-meta-top time{color:var(--fg);font:11px var(--font-mono)}#subtitleRecognitionSettingsModal .subtitle-monitor-meta-top .badge{margin-left:2px}#subtitleRecognitionSettingsModal .subtitle-monitor-meta-bottom{justify-content:space-between;gap:12px}#subtitleRecognitionSettingsModal .subtitle-monitor-meta-bottom span:last-child{white-space:nowrap}#subtitleRecognitionSettingsModal .subtitle-transport{display:flex;align-items:center;gap:8px;min-height:48px;padding:4px 12px;border:1px solid var(--r5-line);border-radius:6px;background:var(--r5-panel-2)}#subtitleRecognitionSettingsModal .subtitle-transport-btn,#subtitleRecognitionSettingsModal .subtitle-transport-play{display:grid;place-items:center;border:1px solid var(--r5-line);border-radius:5px;background:var(--r5-panel);color:var(--fg);cursor:pointer}#subtitleRecognitionSettingsModal .subtitle-transport-btn{width:36px;height:36px;flex:0 0 36px;font:13px var(--font-mono)}#subtitleRecognitionSettingsModal .subtitle-transport-play{width:48px;height:42px;flex:0 0 48px;font-size:18px}#subtitleRecognitionSettingsModal .subtitle-transport-play.is-playing{border-color:var(--accent);color:var(--accent);background:color-mix(in oklch,var(--accent) 12%,var(--r5-panel))}#subtitleRecognitionSettingsModal .subtitle-transport-time,#subtitleRecognitionSettingsModal .subtitle-transport-divider{color:var(--fg);font:11px var(--font-mono);white-space:nowrap}#subtitleRecognitionSettingsModal .subtitle-transport-divider,#subtitleRecognitionSettingsModal .subtitle-transport-status{color:var(--r5-muted)}#subtitleRecognitionSettingsModal .subtitle-transport-status{margin-left:auto;font:10px var(--font-mono);white-space:nowrap}#subtitleRecognitionSettingsModal .subtitle-calibration-timeline{display:grid;width:100%;min-width:0;min-height:0;height:64px;grid-template-rows:auto minmax(20px,1fr);gap:6px;padding:6px 10px;box-sizing:border-box;border:1px solid var(--r5-line);border-radius:6px;background:var(--r5-panel-2)}#subtitleRecognitionSettingsModal .subtitle-calibration-timeline-head{display:flex;align-items:center;gap:8px;color:var(--r5-muted);font-size:10px}#subtitleRecognitionSettingsModal .subtitle-calibration-timeline-head b{color:var(--fg)}#subtitleRecognitionSettingsModal .subtitle-calibration-timeline-head .helper{margin-left:auto}#subtitleRecognitionSettingsModal .subtitle-calibration-track{position:relative;height:24px;align-self:end;overflow:visible;border-radius:3px;background:#202a32;cursor:pointer}#subtitleRecognitionSettingsModal .subtitle-calibration-progress{position:absolute;top:-3px;bottom:-3px;left:0;width:2px;background:#d7aa72;pointer-events:none;transform:translateX(-1px)}#subtitleRecognitionSettingsModal [data-subtitle-clear-episode-override][hidden]{display:none!important}#subtitleRecognitionSettingsModal .subtitle-transport-btn:hover,#subtitleRecognitionSettingsModal .subtitle-transport-play:hover{border-color:color-mix(in oklch,var(--accent) 62%,var(--r5-line));background:color-mix(in oklch,var(--accent) 8%,var(--r5-panel))}@media(max-width:860px){#subtitleRecognitionSettingsModal .subtitle-calibration-player{grid-template-rows:24px minmax(180px,1fr) 24px 48px 64px}#subtitleRecognitionSettingsModal .subtitle-transport-status{display:none}}'
  document.head.append(style)
}

export const bindSubtitleOcrRegionCalibration = ({ document, dramaId, episodes }: Props): void => {
  if (document.body.dataset.subtitleOcrRegionCalibrationBound === 'true') return
  document.body.dataset.subtitleOcrRegionCalibrationBound = 'true'
  ensureCalibrationPlayer(document)
  let savedRegion: SubtitleOcrRegion | null = null
  let readRequest = 0
  let saving = false
  let drag: Drag | null = null
  const episode = representativeEpisode(episodes)
  let calibrationEpisodeId: string | null = null
  let video: HTMLVideoElement | null = null
  let durationSeconds = episode?.durationSeconds ?? 0

  const calibration = document.querySelector<HTMLElement>('[data-subtitle-calibration-view]')
  const settingsModal = document.getElementById('subtitleRecognitionSettingsModal')
  const status = document.querySelector<HTMLElement>('[data-subtitle-calibration-status]')
  const monitor = document.querySelector<HTMLElement>('[data-subtitle-calibration-video]')
  const surface = document.querySelector<HTMLElement>('[data-subtitle-calibration-surface]')
  const track = document.querySelector<HTMLElement>('[data-subtitle-calibration-track]')
  const progress = document.querySelector<HTMLElement>('[data-subtitle-calibration-progress]')
  const time = document.querySelector<HTMLElement>('[data-subtitle-calibration-time]')
  const transport = document.querySelector<HTMLElement>('[data-subtitle-calibration-transport]')
  const playButton = transport?.querySelector<HTMLButtonElement>('[data-subtitle-play]')
  const transportTime = transport?.querySelector<HTMLElement>('[data-subtitle-transport-time]')
  const transportDuration = transport?.querySelector<HTMLElement>('[data-subtitle-transport-duration]')
  const transportStatus = transport?.querySelector<HTMLElement>('[data-subtitle-transport-status]')
  const calibrationConfirmed = document.querySelector<HTMLElement>('[data-subtitle-calibration-confirmed]')
  const markerHelper = document.querySelector<HTMLElement>('.subtitle-calibration-timeline-head .helper')
  const candidate = document.querySelector<HTMLElement>('[data-od-id="subtitle-region-smart-generated"]')
  const box = document.querySelector<HTMLElement>('[data-subtitle-adjusted-box]')
  let initialFrameRequested = false

  const currentEpisode = (): EpisodeAsset | null => {
    const selected = calibrationEpisodeId ? episodes.find((candidateEpisode) => candidateEpisode.id === calibrationEpisodeId) : null
    return selected ?? episode
  }

  const setStatus = (message: string): void => { if (status) status.textContent = message }
  const setConfirmed = (confirmed: boolean): void => { if (calibrationConfirmed) calibrationConfirmed.hidden = !confirmed }
  const updateScopeControl = (): void => {
    const clear = document.querySelector<HTMLButtonElement>('[data-subtitle-clear-episode-override]')
    if (clear) clear.hidden = !(calibrationEpisodeId && savedRegion?.scope === 'episode_override')
  }
  const exitCalibration = (): void => {
    settingsModal?.classList.remove('is-calibrating')
    resetSettingsTitle(document)
  }
  const actualDuration = (): number => video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : durationSeconds
  const syncTimeline = (): void => {
    const total = actualDuration()
    const current = video && Number.isFinite(video.currentTime) ? video.currentTime : 0
    const ratio = total > 0 ? clamp(current / total, 0, 1) : 0
    if (time) time.textContent = formatTime(current)
    if (progress) progress.style.left = `${ratio * 100}%`
    if (transportTime) transportTime.textContent = formatTime(current)
    if (transportDuration) transportDuration.textContent = formatTime(total)
    if (playButton) {
      const playing = Boolean(video && !video.paused)
      playButton.classList.toggle('is-playing', playing)
      playButton.setAttribute('aria-pressed', String(playing))
      playButton.setAttribute('aria-label', playing ? '暂停' : '播放')
      playButton.textContent = playing ? '||' : '▶'
      if (transportStatus) transportStatus.textContent = playing ? '播放中' : '定位后停留'
    }
    if (track) {
      track.setAttribute('role', 'slider')
      track.setAttribute('aria-label', '代表视频播放位置')
      track.setAttribute('aria-valuemin', '0')
      track.setAttribute('aria-valuemax', String(total))
      track.setAttribute('aria-valuenow', String(clamp(current, 0, total)))
      track.setAttribute('aria-valuetext', `${formatTime(current)} / ${formatTime(total)}`)
      track.tabIndex = 0
    }
  }
  const seek = (seconds: number): void => {
    if (!video || actualDuration() <= 0) return
    video.currentTime = clamp(seconds, 0, actualDuration())
    syncTimeline()
    setStatus(`当前画面 ${formatTime(video.currentTime)} · 可继续手动框选。`)
  }
  const fitSourceSurface = (): void => {
    if (!video || !monitor || !surface || video.videoWidth <= 0 || video.videoHeight <= 0) return
    const bounds = monitor.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const sourceRatio = video.videoWidth / video.videoHeight
    const monitorRatio = bounds.width / bounds.height
    const width = sourceRatio > monitorRatio ? bounds.width : bounds.height * sourceRatio
    const height = sourceRatio > monitorRatio ? bounds.width / sourceRatio : bounds.height
    surface.style.width = `${width}px`
    surface.style.height = `${height}px`
    surface.style.maxWidth = 'none'
    surface.style.aspectRatio = 'auto'
    surface.style.background = 'transparent'
  }
  const requestInitialFrame = (): void => {
    if (!video || initialFrameRequested) return
    initialFrameRequested = true
    if (actualDuration() > 0) video.currentTime = Math.min(initialPreviewSeconds, Math.max(0, actualDuration() - 0.05))
    fitSourceSurface()
    syncTimeline()
  }
  const togglePlayback = (): void => {
    if (!video) return
    try {
      const action = video.paused ? video.play() : (video.pause(), undefined)
      void Promise.resolve(action).catch(() => setStatus('代表视频无法播放。'))
    } catch { setStatus('代表视频无法播放。') }
  }
  const suppressDemoCandidate = (): void => {
    if (candidate) { candidate.hidden = true; candidate.style.display = 'none' }
    document.querySelectorAll<HTMLElement>('[data-subtitle-marker]').forEach((marker) => { marker.hidden = true; marker.style.display = 'none' })
    if (markerHelper) markerHelper.textContent = '暂无已检测字幕画面'
  }
  const presentLiveContext = (): void => {
    const selectedEpisode = currentEpisode()
    const selectedPlayableEpisode = selectedEpisode && hasReadableMedia(selectedEpisode) ? selectedEpisode : null
    suppressDemoCandidate()
    const heading = document.querySelector<HTMLElement>('[data-subtitle-calibration-heading]')
    const description = document.querySelector<HTMLElement>('[data-subtitle-calibration-description]')
    if (heading) heading.textContent = '字幕区域校准'
    if (description) description.textContent = selectedPlayableEpisode
      ? `当前使用第 ${String(selectedPlayableEpisode.episodeNo ?? '—').padStart(2, '0')} 集源视频。确认智能区域范围后，可进入手动框选微调。`
      : selectedEpisode
        ? `当前选择第 ${String(selectedEpisode.episodeNo ?? '—').padStart(2, '0')} 集，但该集源视频不可预览，无法进行字幕区域校准。`
        : '当前剧目没有分集视频，无法进行字幕区域校准。'
    if (selectedPlayableEpisode) setStatus(`正在载入第 ${String(selectedPlayableEpisode.episodeNo ?? '—').padStart(2, '0')} 集源视频。`)
    else if (selectedEpisode) setStatus(`第 ${String(selectedEpisode.episodeNo ?? '—').padStart(2, '0')} 集源视频不可预览，无法进行校准。`)
    else setStatus('当前剧目没有分集视频，无法进行字幕区域校准。')
  }

  if (surface) {
    surface.style.backgroundImage = 'none'
    surface.style.backgroundColor = '#000'
  }
  if (box && currentGeometry(document) === null) applyGeometry(document, { x: 0.12, y: 0.67, width: 0.76, height: 0.18 })
  document.querySelectorAll<HTMLElement>('[data-subtitle-calibration-video] .r5-window, [data-subtitle-calibration-video] .r5-figure, [data-subtitle-calibration-video] .r5-sub-region').forEach((element) => { element.hidden = true })
  suppressDemoCandidate()
  const loadEpisode = (nextEpisode: EpisodeAsset | null): void => {
    video?.remove()
    video = null
    initialFrameRequested = false
    durationSeconds = nextEpisode?.durationSeconds ?? 0
    const playable = nextEpisode && hasReadableMedia(nextEpisode) ? nextEpisode : null
    if (!playable || !surface) { syncTimeline(); presentLiveContext(); return }
    const nextVideo = document.createElement('video')
    video = nextVideo
    nextVideo.dataset.subtitleCalibrationPreview = 'true'
    nextVideo.dataset.episodeId = playable.id
    nextVideo.preload = 'auto'
    nextVideo.muted = true
    nextVideo.playsInline = true
    nextVideo.src = toMediaUrl(playable.sourcePath)
    nextVideo.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:1'
    surface.prepend(nextVideo)
    nextVideo.addEventListener('loadedmetadata', () => {
      if (video !== nextVideo) return
      if (Number.isFinite(nextVideo.duration) && nextVideo.duration > 0) durationSeconds = nextVideo.duration
      requestInitialFrame()
    })
    nextVideo.addEventListener('loadeddata', requestInitialFrame)
    nextVideo.addEventListener('canplay', () => {
      if (video !== nextVideo) return
      requestInitialFrame()
      fitSourceSurface()
      setStatus(`已载入第 ${String(playable.episodeNo ?? '—').padStart(2, '0')} 集源视频 · 点击监视器播放或暂停。`)
    })
    nextVideo.addEventListener('timeupdate', syncTimeline)
    nextVideo.addEventListener('seeked', syncTimeline)
    nextVideo.addEventListener('play', syncTimeline)
    nextVideo.addEventListener('pause', syncTimeline)
    nextVideo.addEventListener('error', () => {
      if (video !== nextVideo || !nextVideo.isConnected) return
      nextVideo.remove()
      video = null
      durationSeconds = 0
      syncTimeline()
      setStatus(`第 ${String(playable.episodeNo ?? '—').padStart(2, '0')} 集源视频无法预览，无法进行校准。`)
    })
    nextVideo.load()
  }
  loadEpisode(currentEpisode())
  if (monitor) {
    monitor.addEventListener('click', (event) => {
      const target = event.target
      if (target && typeof (target as { closest?: unknown }).closest === 'function' && (target as Element).closest('[data-subtitle-adjusted-box]')) return
      togglePlayback()
    })
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitSourceSurface).observe(monitor)
  }
  const seekAt = (clientX: number): void => {
    if (!track) return
    const bounds = track.getBoundingClientRect()
    if (bounds.width <= 0) return
    seek(((clientX - bounds.left) / bounds.width) * actualDuration())
  }
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!track || !target || typeof (target as { closest?: unknown }).closest !== 'function' || !(target as Element).closest('[data-subtitle-calibration-track]')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    seekAt(event.clientX)
  }, true)
  if (track) {
    let timelineDragging = false
    track.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); seekAt(event.clientX) })
    track.addEventListener('pointerdown', (event) => {
      timelineDragging = true
      try { track.setPointerCapture(event.pointerId) } catch { /* Pointer capture is unavailable in some environments. */ }
      event.preventDefault()
      event.stopPropagation()
      seekAt(event.clientX)
    })
    track.addEventListener('pointermove', (event) => { if (timelineDragging) seekAt(event.clientX) })
    track.addEventListener('pointerup', () => { timelineDragging = false })
    track.addEventListener('pointercancel', () => { timelineDragging = false })
    track.addEventListener('keydown', (event) => {
      const total = actualDuration()
      if (total <= 0) return
      if (event.key === 'ArrowLeft') { event.preventDefault(); seek((video?.currentTime ?? 0) - 1) }
      else if (event.key === 'ArrowRight') { event.preventDefault(); seek((video?.currentTime ?? 0) + 1) }
      else if (event.key === 'Home') { event.preventDefault(); seek(0) }
      else if (event.key === 'End') { event.preventDefault(); seek(total) }
    })
  }
  if (transport) {
    transport.addEventListener('click', (event) => {
      const target = event.target as Element
      const control = target.closest<HTMLElement>('[data-subtitle-step], [data-subtitle-play]')
      if (!control || !transport.contains(control)) return
      event.preventDefault()
      event.stopPropagation()
      const step = Number(control.dataset.subtitleStep)
      if (Number.isFinite(step)) { seek((video?.currentTime ?? 0) + step); return }
      togglePlayback()
    })
  }
  syncTimeline()

  const refresh = async (): Promise<void> => {
    const request = ++readRequest
    try {
      const region = await window.desktopApi.getEffectiveSubtitleOcrRegion(dramaId, calibrationEpisodeId)
      if (request !== readRequest || !document.body.isConnected) return
      savedRegion = region
      applyRegionSummary(document, region)
      setConfirmed(region !== null)
      updateScopeControl()
    } catch {
      if (request !== readRequest || !document.body.isConnected) return
      announce(document, '字幕区域读取失败，请重新打开设置重试。')
    }
  }

  const openForEpisode = (episodeId: string | null): void => {
    calibrationEpisodeId = episodeId
    exitCalibration()
    window.setTimeout(() => {
      loadEpisode(currentEpisode())
      window.setTimeout(() => { void refresh() }, 0)
    }, 0)
  }

  document.addEventListener('subtitle-recognition-settings:opened', (event) => {
    const detail = (event as CustomEvent<{ episodeId?: unknown }>).detail
    openForEpisode(typeof detail?.episodeId === 'string' && detail.episodeId.length > 0 ? detail.episodeId : null)
  })

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return
    const element = target as Element
    if (element.closest('[data-subtitle-open-settings]')) {
      openForEpisode(element.closest<HTMLButtonElement>('button')?.dataset.subtitleEpisodeId ?? null)
      return
    }
    if (element.closest('[data-subtitle-close-settings]') && settingsModal?.classList.contains('is-calibrating')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      exitCalibration()
      return
    }
    if (element.closest('[data-subtitle-start-calibration]')) {
      window.setTimeout(() => {
        presentLiveContext()
        if (savedRegion) applyGeometry(document, savedRegion)
      }, 0)
      return
    }
    if (element.closest('[data-subtitle-redetect]')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      suppressDemoCandidate()
      setStatus('当前没有可用的真实字幕区域检测器，未执行重新检测；可直接手动框选。')
      return
    }
    if (element.closest('[data-subtitle-manual]')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      window.setTimeout(() => {
        calibration?.setAttribute('data-state', 'adjust')
        applyGeometry(document, savedRegion ?? currentGeometry(document) ?? { x: 0.12, y: 0.67, width: 0.76, height: 0.18 })
        setStatus('手动框选已启用，可拖动边框与四角控制点。')
      }, 0)
      return
    }
    if (element.closest('[data-subtitle-clear-episode-override]')) {
      if (!calibrationEpisodeId) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (saving) return
      saving = true
      setStatus('正在清除当前集字幕区域覆盖。')
      void window.desktopApi.clearSubtitleOcrRegion(dramaId, calibrationEpisodeId).then(() => {
        savedRegion = null
        applyRegionSummary(document, null)
        setConfirmed(false)
        updateScopeControl()
        setStatus('本集已恢复机器选择；如存在剧目基线，将作为批量参考。')
        announce(document, '已清除本集覆盖，恢复机器选择。')
      }).catch(() => {
        setStatus('清除本集覆盖失败，请重试。')
        announce(document, '清除本集覆盖失败，请重试。')
      }).finally(() => { saving = false })
      return
    }
    if (!element.closest('[data-subtitle-confirm]')) return
    const geometry = currentGeometry(document)
    if (!geometry) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (saving) return
    saving = true
    const targetEpisodeId = calibrationEpisodeId
    setStatus(targetEpisodeId ? '正在保存当前集字幕区域覆盖。' : '正在按剧目保存字幕区域基线。')
    void window.desktopApi.setSubtitleOcrRegion(dramaId, targetEpisodeId, geometry).then((region) => {
      saving = false
      savedRegion = region
      applyRegionSummary(document, region)
      setConfirmed(true)
      updateScopeControl()
      announce(document, targetEpisodeId ? '当前集字幕区域覆盖已保存。' : '字幕区域基线已按剧目保存。')
    }).catch(() => {
      saving = false
      setStatus('保存失败，当前框选未丢失，可重新确认。')
      announce(document, '字幕区域保存失败，请检查后重试。')
    }).finally(() => { saving = false })
  }, true)

  document.addEventListener('pointerdown', (event) => {
    const target = event.target
    if (!box || !surface || !calibration || calibration.dataset.state !== 'adjust' || !target || typeof (target as { closest?: unknown }).closest !== 'function' || !(target as Element).closest('[data-subtitle-adjusted-box]')) return
    const base = currentGeometry(document)
    if (!base) return
    drag = { mode: pointerMode(target as Element), startX: event.clientX, startY: event.clientY, base }
    try { box.setPointerCapture(event.pointerId) } catch { /* Pointer capture is unavailable in some test environments. */ }
    event.preventDefault()
    event.stopImmediatePropagation()
  }, true)
  document.addEventListener('pointermove', (event) => {
    if (!drag || !surface) return
    const bounds = surface.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const region = adjustedGeometry(drag.base, drag.mode, (event.clientX - drag.startX) / bounds.width, (event.clientY - drag.startY) / bounds.height)
    applyGeometry(document, region)
    setStatus(`正在调整：${Math.round(region.width * 100)}% × ${Math.round(region.height * 100)}%。`)
    event.preventDefault()
    event.stopImmediatePropagation()
  }, true)
  document.addEventListener('pointerup', (event) => { if (drag) { drag = null; event.stopImmediatePropagation() } }, true)
  document.addEventListener('pointercancel', () => { drag = null }, true)

  void refresh()
}
