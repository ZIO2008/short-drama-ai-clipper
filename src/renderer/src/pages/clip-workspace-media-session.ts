import type { ClipCandidate, EpisodeAsset } from '../../../shared/contracts.js'
import { toMediaUrl } from '../components/MediaMonitor.js'
import { clamp, timecode } from './clip-workspace-surface.js'

export type ReviewMode = 'source' | 'candidate' | 'context'
type SessionControls = { play: HTMLButtonElement; loop: HTMLButtonElement; speed: HTMLButtonElement; volume: HTMLButtonElement; speedPopover: HTMLElement; volumePopover: HTMLElement; sourceTime: HTMLElement; relativeTime: HTMLElement; volumeLabel: HTMLElement; volumeInput: HTMLInputElement; reviewButtons: HTMLButtonElement[]; reviewDescription: HTMLElement; boundaryState: HTMLElement }
type SessionCallbacks = { episode: () => EpisodeAsset | null; candidate: () => ClipCandidate | null; previewPoint: () => number; setPreviewPoint: (seconds: number) => void; isAvailable: (episode?: EpisodeAsset | null) => boolean; mediaFailure: (episodeId: string) => void; renderTimeline: (candidate: ClipCandidate) => void; render: () => void }

export class ClipWorkspaceMediaSession {
  private playing = false
  private loopEnabled = false
  private muted = false
  private volume = 0.8
  private playbackRate = 1
  private reviewMode: ReviewMode = 'candidate'
  constructor(private readonly document: Document, private readonly frame: HTMLElement, private readonly controls: SessionControls, private readonly callbacks: SessionCallbacks) {}

  pause(): void { this.activeVideo()?.pause(); this.playing = false }
  release(): void {
    const current = this.activeVideo()
    if (!current) return
    current.pause(); current.removeAttribute('src'); current.load(); current.remove(); this.playing = false
  }
  seek(media: HTMLVideoElement, seconds: number): void {
    try { media.currentTime = seconds } catch {
      if (this.callbacks.episode()?.id !== media.dataset.episodeId || this.activeVideo() !== media) return
      this.callbacks.mediaFailure(media.dataset.episodeId ?? ''); this.release(); this.callbacks.render()
    }
  }
  video(current: EpisodeAsset): HTMLVideoElement {
    let node = this.activeVideo()
    if (node?.dataset.episodeId !== current.id) { this.release(); node = null }
    if (!node) {
      const episodeId = current.id; const preview = this.document.createElement('video')
      preview.dataset.originalClipPreview = 'true'; preview.preload = 'metadata'; preview.muted = this.muted; preview.volume = this.volume; preview.playbackRate = this.playbackRate
      preview.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:0'; preview.dataset.episodeId = episodeId
      preview.addEventListener('error', () => { if (this.callbacks.episode()?.id === episodeId && this.activeVideo() === preview) { this.callbacks.mediaFailure(episodeId); this.release(); this.callbacks.render() } })
      preview.addEventListener('loadedmetadata', () => { if (this.callbacks.episode()?.id === episodeId && this.activeVideo() === preview) this.seek(preview, this.callbacks.previewPoint()) })
      preview.addEventListener('timeupdate', () => this.onTimeUpdate(preview, episodeId))
      preview.addEventListener('ended', () => { if (this.callbacks.episode()?.id === episodeId && this.activeVideo() === preview) { this.playing = false; this.sync(this.callbacks.candidate(), true) } })
      this.frame.prepend(preview); node = preview
    }
    return node
  }
  load(current: EpisodeAsset): void { const media = this.video(current); const url = toMediaUrl(current.sourcePath!); if (media.dataset.sourceUrl !== url) { media.dataset.sourceUrl = url; media.src = url } }
  reviewBounds(candidate: ClipCandidate, duration: number): { start: number; end: number } {
    if (this.reviewMode === 'source') return { start: 0, end: duration }
    if (this.reviewMode === 'context') return { start: Math.max(0, candidate.startSeconds - 1), end: Math.min(duration, candidate.endSeconds + 1) }
    return { start: candidate.startSeconds, end: candidate.endSeconds }
  }
  sync(candidate: ClipCandidate | null, available: boolean): void {
    const { play, loop, speed, volume, speedPopover, volumePopover, sourceTime, relativeTime, volumeLabel, volumeInput, reviewButtons, reviewDescription, boundaryState } = this.controls
    const point = this.callbacks.previewPoint(); const relative = candidate && point >= candidate.startSeconds && point <= candidate.endSeconds ? timecode(point - candidate.startSeconds) : '—'
    sourceTime.textContent = available ? timecode(point) : '—'; relativeTime.textContent = available ? relative : '—'
    play.disabled = !available; play.setAttribute('aria-pressed', String(this.playing)); play.setAttribute('aria-label', this.playing ? '暂停' : '播放'); play.title = this.playing ? '暂停' : '播放'
    loop.disabled = !available; loop.setAttribute('aria-pressed', String(this.loopEnabled)); loop.setAttribute('aria-label', this.loopEnabled ? '关闭循环' : '开启循环'); loop.title = this.loopEnabled ? '关闭循环' : '开启循环'
    for (const control of [speed, volume, ...speedPopover.querySelectorAll<HTMLButtonElement>('button'), volumeInput]) control.disabled = !available
    speed.querySelector('.clip-speed-glyph')!.textContent = `${this.playbackRate}×`; volumeLabel.textContent = this.muted ? '已静音' : `音量 ${Math.round(this.volume * 100)}%`; volumeInput.value = String(Math.round(this.volume * 100))
    reviewButtons.forEach((button) => { button.disabled = !available; button.setAttribute('aria-pressed', String(button.dataset.clipReview === this.reviewMode)) })
    reviewDescription.textContent = this.reviewMode === 'source' ? '播放当前源分集，不修改候选边界。' : this.reviewMode === 'context' ? '从入点前 1 秒播放至出点后 1 秒，不修改候选边界。' : '只播放当前候选范围，不修改候选边界。'
    boundaryState.textContent = candidate ? `当前边界：${timecode(candidate.startSeconds)} — ${timecode(candidate.endSeconds)}` : '当前没有可审阅候选。'
    if (!available) this.closePopovers()
  }
  bind(): void {
    const { play, loop, speed, volume, speedPopover, volumePopover, volumeInput, reviewButtons } = this.controls
    play.addEventListener('click', () => this.toggle())
    loop.addEventListener('click', () => { this.loopEnabled = !this.loopEnabled; this.sync(this.callbacks.candidate(), Boolean(this.callbacks.episode() && this.callbacks.isAvailable())) })
    speed.addEventListener('click', () => this.closePopovers(speedPopover.classList.contains('is-open') ? undefined : speedPopover))
    volume.addEventListener('click', () => this.closePopovers(volumePopover.classList.contains('is-open') ? undefined : volumePopover))
    speedPopover.querySelectorAll<HTMLButtonElement>('[data-clip-speed]').forEach((button) => button.addEventListener('click', () => { const next = Number(button.dataset.clipSpeed); if (![0.5, 1, 1.5, 2].includes(next)) return; this.playbackRate = next; const media = this.activeVideo(); if (media) media.playbackRate = next; this.closePopovers(); this.sync(this.callbacks.candidate(), Boolean(this.callbacks.episode() && this.callbacks.isAvailable())) }))
    volumeInput.addEventListener('input', () => { this.volume = clamp(Number(volumeInput.value) / 100, 0, 1); this.muted = this.volume === 0; const media = this.activeVideo(); if (media) { media.volume = this.volume; media.muted = this.muted }; this.sync(this.callbacks.candidate(), Boolean(this.callbacks.episode() && this.callbacks.isAvailable())) })
    reviewButtons.forEach((button) => button.addEventListener('click', () => { const next = button.dataset.clipReview; const candidate = this.callbacks.candidate(); const episode = this.callbacks.episode(); if (!candidate || !episode || !this.callbacks.isAvailable(episode) || (next !== 'source' && next !== 'candidate' && next !== 'context')) return; this.pause(); this.reviewMode = next; const bounds = this.reviewBounds(candidate, episode.durationSeconds!); this.callbacks.setPreviewPoint(bounds.start); const media = this.activeVideo(); if (media) this.seek(media, bounds.start); this.sync(candidate, true) }))
    this.document.addEventListener('keydown', (event) => { if (event.key !== 'Escape') return; const open = speedPopover.classList.contains('is-open') ? speedPopover : volumePopover.classList.contains('is-open') ? volumePopover : null; if (!open) return; event.preventDefault(); this.closePopovers(); (open === speedPopover ? speed : volume).focus() })
  }
  toggle(): void {
    const current = this.callbacks.episode(); const candidate = this.callbacks.candidate()
    if (!current || !candidate || !this.callbacks.isAvailable(current)) return
    const media = this.video(current); if (this.playing) { this.pause(); this.sync(candidate, true); return }
    const bounds = this.reviewBounds(candidate, current.durationSeconds!); const point = this.callbacks.previewPoint() < bounds.start || this.callbacks.previewPoint() >= bounds.end ? bounds.start : this.callbacks.previewPoint()
    this.callbacks.setPreviewPoint(point); this.seek(media, point); media.muted = this.muted; media.volume = this.volume; media.playbackRate = this.playbackRate; this.playing = true; this.sync(candidate, true)
    void Promise.resolve(media.play()).catch(() => { this.playing = false; this.sync(candidate, true) })
  }
  private activeVideo(): HTMLVideoElement | null { return this.frame.querySelector<HTMLVideoElement>('video[data-original-clip-preview]') }
  private closePopovers(except?: HTMLElement): void { const { speed, volume, speedPopover, volumePopover } = this.controls; for (const popover of [speedPopover, volumePopover]) popover.classList.toggle('is-open', popover === except); speed.setAttribute('aria-expanded', String(speedPopover.classList.contains('is-open'))); volume.setAttribute('aria-expanded', String(volumePopover.classList.contains('is-open'))) }
  private onTimeUpdate(preview: HTMLVideoElement, episodeId: string): void {
    const candidate = this.callbacks.candidate(); const episode = this.callbacks.episode()
    if (episode?.id !== episodeId || this.activeVideo() !== preview || !candidate || !episode) return
    const bounds = this.reviewBounds(candidate, episode.durationSeconds ?? 0)
    if (this.playing && preview.currentTime >= bounds.end - 0.01) { if (this.loopEnabled) { this.seek(preview, bounds.start); this.callbacks.setPreviewPoint(bounds.start) } else { preview.pause(); this.playing = false; this.callbacks.setPreviewPoint(bounds.end) } } else this.callbacks.setPreviewPoint(clamp(preview.currentTime, 0, episode.durationSeconds ?? 0))
    this.callbacks.renderTimeline(candidate); this.sync(candidate, true)
  }
}
