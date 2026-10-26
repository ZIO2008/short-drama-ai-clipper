import { clipCandidateLabel } from '../../../shared/clip-candidate-label.js'
import type { ClipCandidate, ClipEpisodeStatus, EpisodeAsset } from '../../../shared/contracts.js'

export const MIN_CLIP_DURATION = 0.1
export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)
export const roundTenth = (value: number): number => Math.round(value * 10) / 10
export const labelEpisode = (episode: EpisodeAsset): string => `第 ${String(episode.episodeNo ?? episode.sortOrder + 1).padStart(2, '0')} 集`
export const timecode = (seconds: number): string => {
  const milliseconds = Math.round(seconds * 1000)
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000)
  const wholeSeconds = Math.floor((milliseconds % 60_000) / 1000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`
}

export const setSurfaceText = (node: HTMLElement, title: string, detail?: string): void => {
  node.replaceChildren()
  const heading = node.ownerDocument.createElement('b')
  heading.textContent = title
  node.append(heading)
  if (detail) { const copy = node.ownerDocument.createElement('span'); copy.textContent = detail; node.append(copy) }
}

const episodeStatusCopy = (status: ClipEpisodeStatus['productionStatus']): { icon: string; detail: string } => ({
  ready_to_generate: { icon: '', detail: '未生成候选' }, generating: { icon: 'run', detail: '正在生成候选' },
  pending_confirmation: { icon: 'ready', detail: '待确认候选' }, confirmed: { icon: 'done', detail: '已确认候选' },
  exporting: { icon: 'run', detail: '正在导出' }, exported: { icon: 'done', detail: '已导出' },
  failed: { icon: 'missing', detail: '候选处理失败' }, missing_media: { icon: 'missing', detail: '媒体缺失 · 需重新定位' }
})[status]

export const displayCandidateStatus = (status: ClipCandidate['status']): string => ({ pending_review: '待确认', editing: '待确认', confirmed: '已确认', exporting: '导出中', exported: '已导出', failed: '异常' })[status]

export const renderMissingClipMedia = (frame: HTMLElement, current: EpisodeAsset | null, missing: boolean, dimensions: string): void => {
  frame.classList.toggle('clip-media-missing', missing)
  frame.querySelector('.clip-missing-message')?.remove()
  if (!missing || !current) return
  const message = frame.ownerDocument.createElement('div')
  message.className = 'clip-missing-message'
  message.setAttribute('role', 'status')
  const heading = frame.ownerDocument.createElement('b')
  heading.textContent = `${labelEpisode(current)}源媒体不可读`
  const detail = frame.ownerDocument.createElement('span')
  detail.textContent = `保留最后已知 ${dimensions === '画幅读取中' ? '源画幅' : dimensions} 画幅。请重新定位源文件后继续审片。`
  message.append(heading, detail)
  frame.append(message)
}

export const renderEpisodeRail = (rail: HTMLElement, railMeta: HTMLElement | null, episodes: readonly EpisodeAsset[], selectedEpisodeId: string | null, statuses: ReadonlyMap<string, ClipEpisodeStatus>, statusesState: 'loading' | 'loaded' | 'error', generating: ReadonlySet<string>): void => {
  rail.replaceChildren()
  if (railMeta) railMeta.textContent = `${episodes.length} 集`
  for (const item of episodes) {
    const button = rail.ownerDocument.createElement('button')
    button.className = `r5-episode${item.id === selectedEpisodeId ? ' active' : ''}`
    button.type = 'button'; button.dataset.clipEpisodeId = item.id; button.setAttribute('aria-pressed', String(item.id === selectedEpisodeId))
    const state = statuses.get(item.id)
    const view = generating.has(item.id) ? { icon: 'run', detail: '正在生成候选' } : state ? episodeStatusCopy(state.productionStatus) : statusesState === 'error' ? { icon: 'missing', detail: '状态读取失败' } : { icon: 'run', detail: '正在读取状态' }
    button.innerHTML = `<i class="${view.icon}"></i><span class="num">${String(item.episodeNo ?? item.sortOrder + 1).padStart(2, '0')}</span><span><b>${labelEpisode(item)}</b><small>${view.detail}</small></span>`
    rail.append(button)
  }
}

export const renderCandidateSwitcher = (switcher: HTMLElement | null, candidates: readonly ClipCandidate[], selectedCandidateId: string | null, page: number): number => {
  if (!switcher) return page
  const grid = switcher.querySelector<HTMLElement>('.r5-candidate-switch-grid')
  const pageLabel = switcher.querySelector<HTMLElement>('[data-inline-candidate-page-label]')
  const pageWindow = switcher.querySelector<HTMLElement>('[data-inline-candidate-window]')
  const previous = switcher.querySelector<HTMLButtonElement>('[data-inline-candidate-page="prev"]')
  const next = switcher.querySelector<HTMLButtonElement>('[data-inline-candidate-page="next"]')
  if (!grid || !pageLabel || !pageWindow || !previous || !next) return page
  const pageSize = 4; const pageCount = Math.max(1, Math.ceil(candidates.length / pageSize)); const normalized = clamp(page, 0, pageCount - 1)
  const start = normalized * pageSize; const windowItems = candidates.slice(start, start + pageSize)
  grid.replaceChildren()
  for (const item of windowItems) {
    const button = switcher.ownerDocument.createElement('button')
    button.className = 'r5-candidate-switch'; button.type = 'button'; button.dataset.inlineCandidate = item.id; button.dataset.candidateStatus = item.status; button.setAttribute('aria-pressed', String(item.id === selectedCandidateId))
    const marker = switcher.ownerDocument.createElement('i'); const identifier = switcher.ownerDocument.createElement('b'); const status = switcher.ownerDocument.createElement('small')
    identifier.textContent = clipCandidateLabel(item); identifier.title = item.id; status.textContent = `${displayCandidateStatus(item.status)} · ${(item.endSeconds - item.startSeconds).toFixed(1)}s`
    button.append(marker, identifier, status); grid.append(button)
  }
  pageLabel.textContent = `共 ${candidates.length} 条`; pageWindow.textContent = candidates.length === 0 ? '0 / 0' : `${start + 1}–${start + windowItems.length} / ${candidates.length}`
  previous.disabled = normalized === 0; next.disabled = normalized >= pageCount - 1
  return normalized
}
