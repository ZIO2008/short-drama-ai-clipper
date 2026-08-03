import type { ClipCandidate, ClipEpisodeStatus, EpisodeAsset } from '../../../shared/contracts.js'
import { toMediaUrl } from '../components/MediaMonitor.js'

type Props = { document: Document; dramaId: string; episodes: EpisodeAsset[]; initialCandidate?: ClipCandidate | null }
type DragMode = 'in' | 'out' | 'move' | 'preview'
type LoadState = 'loading' | 'loaded' | 'error'
type DragState = { mode: DragMode } | null

const MIN_DURATION = 0.1
const candidateSelectionEvent = 'shortdrama:select-original-clip-candidate'
const workspaceRefreshEvent = 'shortdrama:refresh-original-clip-workspace'
const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)
const roundTenth = (value: number): number => Math.round(value * 10) / 10
const label = (episode: EpisodeAsset): string => `第 ${String(episode.episodeNo ?? episode.sortOrder + 1).padStart(2, '0')} 集`
const timecode = (seconds: number): string => {
  const milliseconds = Math.round(seconds * 1000)
  const hours = Math.floor(milliseconds / 3_600_000)
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000)
  const wholeSeconds = Math.floor((milliseconds % 60_000) / 1000)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`
}
const setText = (node: HTMLElement, title: string, detail?: string): void => {
  node.replaceChildren()
  const heading = node.ownerDocument.createElement('b')
  heading.textContent = title
  node.append(heading)
  if (detail) { const copy = node.ownerDocument.createElement('span'); copy.textContent = detail; node.append(copy) }
}
const asElement = (target: EventTarget | null): Element | null => target !== null && typeof (target as Element).closest === 'function' ? target as Element : null
const statusCopy = (status: ClipEpisodeStatus['productionStatus']): { icon: string; detail: string } => ({
  ready_to_generate: { icon: '', detail: '未生成候选' }, generating: { icon: 'run', detail: '正在生成候选' },
  pending_confirmation: { icon: 'ready', detail: '待确认候选' }, confirmed: { icon: 'done', detail: '已确认候选' },
  exporting: { icon: 'run', detail: '正在导出' }, exported: { icon: 'done', detail: '已导出' },
  failed: { icon: 'missing', detail: '候选处理失败' }, missing_media: { icon: 'missing', detail: '媒体缺失 · 需重新定位' }
})[status]
const displayCandidateStatus = (status: ClipCandidate['status']): string => ({ pending_review: '待确认', editing: '待确认', confirmed: '已确认', exporting: '导出中', exported: '已导出', failed: '异常' })[status]
const isEditable = (candidate: ClipCandidate | null): candidate is ClipCandidate => candidate !== null && (candidate.status === 'pending_review' || candidate.status === 'editing')

export const selectOriginalClipWorkspaceCandidate = (document: Document, candidate: ClipCandidate): void => {
  const EventConstructor = document.defaultView?.CustomEvent ?? CustomEvent
  document.dispatchEvent(new EventConstructor<ClipCandidate>(candidateSelectionEvent, { detail: candidate }))
}

export const refreshOriginalClipWorkspace = (document: Document): void => {
  document.dispatchEvent(new Event(workspaceRefreshEvent))
}

export const bindOriginalClipWorkspaceRuntime = ({ document, dramaId, episodes: sourceEpisodes, initialCandidate = null }: Props): void => {
  const screen = document.getElementById('screen-clip')
  if (!screen || screen.dataset.originalClipRuntimeBound === 'true') return
  screen.dataset.originalClipRuntimeBound = 'true'
  const episodes = [...sourceEpisodes].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
  const rail = screen.querySelector<HTMLElement>('.r5-episodes')
  const railMeta = screen.querySelector<HTMLElement>('.r5-episodes')?.previousElementSibling?.querySelector<HTMLElement>('.meta')
  const timelines = [...screen.querySelectorAll<HTMLElement>('.r5-timeline')]
  const [sourceTimeline, candidateTimeline] = timelines
  const sourceTrack = sourceTimeline?.querySelector<HTMLElement>('.r5-track')
  const candidateTrack = candidateTimeline?.querySelector<HTMLElement>('.r5-track')
  const sourceRange = sourceTrack?.querySelector<HTMLElement>('.r5-range')
  const candidateRange = candidateTrack?.querySelector<HTMLElement>('.r5-range')
  const candidateAnchor = candidateTrack?.querySelector<HTMLElement>('.r5-anchor')
  const frame = screen.querySelector<HTMLElement>('.r5-frame')
  const candidateId = screen.querySelector<HTMLElement>('.r5-candidate-id')
  const monitorTimecode = screen.querySelector<HTMLElement>('.r5-timecode')
  const monitorCaption = screen.querySelector<HTMLElement>('.r5-monitor-caption')
  const note = screen.querySelector<HTMLElement>('.r5-note')
  const inspectorMeta = screen.querySelector<HTMLElement>('.r5-inspector > .r5-panel-head .meta')
  const nudges = [...screen.querySelectorAll<HTMLButtonElement>('.r5-nudge button')]
  if (!rail || !sourceTimeline || !candidateTimeline || !sourceTrack || !candidateTrack || !sourceRange || !candidateRange || !candidateAnchor || !frame || !candidateId || !monitorTimecode || !monitorCaption || !note || !inspectorMeta) return
  const inlineCandidateSwitcher = screen.querySelector<HTMLElement>('[data-inline-candidate-switcher], [data-od-id="clip-inline-candidate-switcher"]')
  const inlineCandidateGrid = inlineCandidateSwitcher?.querySelector<HTMLElement>('.r5-candidate-switch-grid')
  const inlineCandidatePrevious = inlineCandidateSwitcher?.querySelector<HTMLButtonElement>('[data-inline-candidate-page="prev"]')
  const inlineCandidateNext = inlineCandidateSwitcher?.querySelector<HTMLButtonElement>('[data-inline-candidate-page="next"]')
  // These three shapes only demonstrate the static prototype's monitor. Real
  // preview video is inserted below; leaving them would cover actual footage.
  frame.querySelectorAll('.r5-window, .r5-figure, .r5-sub-region').forEach((node) => node.remove())
  frame.classList.add('original-clip-runtime-frame')
  if (!document.getElementById('original-clip-runtime-monitor-style')) document.head.insertAdjacentHTML('beforeend', '<style id="original-clip-runtime-monitor-style">#screen-clip .original-clip-runtime-frame{background:#000!important}#screen-clip .original-clip-runtime-frame:before{display:none!important}</style>')
  monitorTimecode.style.zIndex = '1'
  monitorCaption.style.zIndex = '1'

  let candidates: ClipCandidate[] = []
  let statuses = new Map<string, ClipEpisodeStatus>()
  let candidatesState: LoadState = 'loading'
  let statusesState: LoadState = 'loading'
  let selectedEpisodeId = initialCandidate?.episodeId ?? episodes[0]?.id ?? null
  let selectedCandidateId: string | null = initialCandidate?.id ?? null
  // A newly mounted clip surface receives its target before its own candidate
  // request resolves.  Treat it like an external selection so an empty/stale
  // first response cannot replace it with the episode's first candidate.
  let pendingExternalCandidateId: string | null = initialCandidate?.id ?? null
  let previewPoint = 0
  let drag: DragState = null
  let writePending = false
  let queuedRange: { candidateId: string; startSeconds: number; endSeconds: number } | null = null
  let generating = new Set<string>()
  let mediaFailedFor: string | null = null
  let actionError: { candidateId: string | null; episodeId: string; message: string } | null = null
  let request = 0
  let candidatePage = 0

  const episode = (): EpisodeAsset | null => episodes.find((item) => item.id === selectedEpisodeId) ?? null
  const candidatesForEpisode = (): ClipCandidate[] => candidates.filter((item) => item.episodeId === selectedEpisodeId)
  const selectedCandidate = (): ClipCandidate | null => candidatesForEpisode().find((item) => item.id === selectedCandidateId) ?? null
  const syncCandidatePage = (candidate: ClipCandidate): void => {
    const index = candidatesForEpisode().findIndex((item) => item.id === candidate.id)
    if (index >= 0) candidatePage = Math.floor(index / 4)
  }
  const chooseCandidate = (): ClipCandidate | null => {
    const items = candidatesForEpisode()
    if (pendingExternalCandidateId) {
      const requested = items.find((item) => item.id === pendingExternalCandidateId)
      if (!requested) { selectedCandidateId = pendingExternalCandidateId; return null }
      pendingExternalCandidateId = null
      selectedCandidateId = requested.id
      syncCandidatePage(requested)
      previewPoint = clamp(previewPoint || requested.startSeconds, requested.startSeconds, requested.endSeconds)
      return requested
    }
    const stillSelected = items.find((item) => item.id === selectedCandidateId)
    const next = stillSelected ?? items.find((item) => item.status === 'editing' || item.status === 'pending_review') ?? items[0] ?? null
    selectedCandidateId = next?.id ?? null
    if (next) { syncCandidatePage(next); previewPoint = clamp(previewPoint || next.startSeconds, next.startSeconds, next.endSeconds) }
    return next
  }
  const setControls = (editable: boolean, previewable = false): void => {
    sourceTrack.setAttribute('aria-disabled', String(!editable)); sourceTrack.tabIndex = editable ? 0 : -1
    candidateTrack.setAttribute('aria-disabled', String(!previewable)); candidateTrack.tabIndex = previewable ? 0 : -1
    nudges.forEach((button) => { button.disabled = !editable })
    const confirm = screen.querySelector<HTMLButtonElement>('[data-r5-confirm]')
    if (confirm) confirm.disabled = !editable
  }
  const video = (current: EpisodeAsset): HTMLVideoElement => {
    let node = frame.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')
    if (node?.dataset.episodeId !== current.id) { node?.remove(); node = null }
    if (!node) {
      const sourceEpisodeId = current.id
      const preview = document.createElement('video'); preview.dataset.originalClipPreview = 'true'; preview.muted = true; preview.preload = 'metadata'
      preview.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:0'
      preview.dataset.episodeId = sourceEpisodeId
      preview.addEventListener('error', () => { if (episode()?.id === sourceEpisodeId && frame.querySelector('video[data-original-clip-preview]') === preview) { mediaFailedFor = sourceEpisodeId; render() } })
      preview.addEventListener('loadedmetadata', () => { if (episode()?.id === sourceEpisodeId && frame.querySelector('video[data-original-clip-preview]') === preview) preview.currentTime = previewPoint })
      preview.addEventListener('timeupdate', () => { const currentCandidate = selectedCandidate(); if (episode()?.id === sourceEpisodeId && frame.querySelector('video[data-original-clip-preview]') === preview && currentCandidate) { previewPoint = clamp(preview.currentTime, currentCandidate.startSeconds, currentCandidate.endSeconds); renderTimeline(currentCandidate) } })
      frame.prepend(preview); node = preview
    }
    return node
  }
  const renderRail = (): void => {
    rail.replaceChildren()
    if (railMeta) railMeta.textContent = `${episodes.length} 集`
    for (const item of episodes) {
      const button = document.createElement('button'); button.className = `r5-episode${item.id === selectedEpisodeId ? ' active' : ''}`; button.type = 'button'; button.dataset.clipEpisodeId = item.id; button.setAttribute('aria-pressed', String(item.id === selectedEpisodeId))
      const state = statuses.get(item.id)
      const view = generating.has(item.id) ? { icon: 'run', detail: '正在生成候选' } : state ? statusCopy(state.productionStatus) : statusesState === 'error' ? { icon: 'missing', detail: '状态读取失败' } : { icon: 'run', detail: '正在读取状态' }
      button.innerHTML = `<i class="${view.icon}"></i><span class="num">${String(item.episodeNo ?? item.sortOrder + 1).padStart(2, '0')}</span><span><b>${label(item)}</b><small>${view.detail}</small></span>`
      rail.append(button)
    }
  }
  const renderTimeline = (candidate: ClipCandidate): void => {
    const current = episode(); const duration = current?.durationSeconds ?? 0; const range = Math.max(1, duration)
    const segment = candidate.endSeconds - candidate.startSeconds
    sourceRange.style.left = `${(candidate.startSeconds / range) * 100}%`; sourceRange.style.width = `${(segment / range) * 100}%`
    candidateRange.style.left = '24%'; candidateRange.style.width = '34.3%'; candidateAnchor.style.left = `${24 + ((previewPoint - candidate.startSeconds) / Math.max(segment, MIN_DURATION)) * 34.3}%`
    sourceTimeline.querySelector('.r5-timeline-head span')!.textContent = `${label(current!)} · 00:00:00 — ${timecode(duration).slice(0, 8)}`
    candidateTimeline.querySelector('.r5-timeline-head span')!.textContent = `${candidate.id.slice(0, 8)} · ${segment.toFixed(1)} 秒`
    monitorTimecode.textContent = timecode(previewPoint)
  }
  const renderCandidateSwitcher = (): void => {
    const switcher = inlineCandidateSwitcher
    if (!switcher) return
    const grid = switcher.querySelector<HTMLElement>('.r5-candidate-switch-grid')
    const pageLabel = switcher.querySelector<HTMLElement>('[data-inline-candidate-page-label]')
    const pageWindow = switcher.querySelector<HTMLElement>('[data-inline-candidate-window]')
    const previous = switcher.querySelector<HTMLButtonElement>('[data-inline-candidate-page="prev"]')
    const next = switcher.querySelector<HTMLButtonElement>('[data-inline-candidate-page="next"]')
    if (!grid || !pageLabel || !pageWindow || !previous || !next) return
    const items = candidatesForEpisode()
    const pageSize = 4
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize))
    candidatePage = clamp(candidatePage, 0, pageCount - 1)
    const start = candidatePage * pageSize
    const windowItems = items.slice(start, start + pageSize)
    grid.replaceChildren()
    for (const item of windowItems) {
      const button = document.createElement('button')
      button.className = 'r5-candidate-switch'
      button.type = 'button'
      button.dataset.inlineCandidate = item.id
      button.dataset.candidateStatus = item.status
      button.setAttribute('aria-pressed', String(item.id === selectedCandidateId))
      const marker = document.createElement('i')
      const identifier = document.createElement('b')
      identifier.textContent = `C-${item.id.slice(0, 8)}`
      const status = document.createElement('small')
      status.textContent = `${displayCandidateStatus(item.status)} · ${(item.endSeconds - item.startSeconds).toFixed(1)}s`
      button.append(marker, identifier, status)
      grid.append(button)
    }
    pageLabel.textContent = `共 ${items.length} 条`
    pageWindow.textContent = items.length === 0 ? '0 / 0' : `${start + 1}–${start + windowItems.length} / ${items.length}`
    previous.disabled = candidatePage === 0
    next.disabled = candidatePage >= pageCount - 1
  }
  const render = (): void => {
    const current = episode(); const candidate = chooseCandidate()
    renderRail(); renderCandidateSwitcher()
    if (!current) { setText(candidateId, '没有可用分集'); setText(note, '当前剧目没有分集'); setControls(false); return }
    const missing = !current.sourcePath || current.durationSeconds === null || mediaFailedFor === current.id
    const dimensions = current.videoWidth && current.videoHeight ? `${current.videoWidth} × ${current.videoHeight}` : '画幅读取中'
    if (missing) frame.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')?.remove()
    else {
      const videoNode = video(current); const sourceUrl = toMediaUrl(current.sourcePath)
      if (videoNode.dataset.sourceUrl !== sourceUrl) { videoNode.dataset.sourceUrl = sourceUrl; videoNode.src = sourceUrl }
    }
    const caption = monitorCaption.querySelectorAll('span'); caption[0]!.textContent = `${label(current)} · 源片 ${dimensions} · 等比显示`; caption[1]!.textContent = candidate ? `${candidate.id.slice(0, 8)} · ${timecode(candidate.startSeconds)} — ${timecode(candidate.endSeconds)}` : missing ? '源媒体不可用' : candidatesState === 'error' ? '候选读取失败' : candidatesState === 'loading' ? '正在读取候选' : '尚未生成候选'
    const visibleError = actionError?.episodeId === current.id && (actionError.candidateId === null || actionError.candidateId === candidate?.id) ? actionError.message : null
    if (!candidate || missing || candidatesState !== 'loaded') {
      const reason = visibleError ?? (missing ? '源媒体需要重新定位，无法编辑或生成候选。' : candidatesState === 'error' ? '候选读取失败；没有把失败伪装为未生成。' : candidatesState === 'loading' ? '正在读取真实候选。' : '本集还没有真实候选。')
      setText(candidateId, `${label(current)} · 暂无可编辑候选`, reason); setText(note, missing ? '当前无法编辑' : '候选状态', reason); inspectorMeta.textContent = missing ? '媒体缺失' : candidatesState === 'error' ? '读取失败' : '无候选'
      sourceRange.style.left = '0%'; sourceRange.style.width = '0%'; candidateRange.style.width = '0%'; candidateAnchor.style.left = '0%'; monitorTimecode.textContent = '—'; setControls(false); return
    }
    const editable = isEditable(candidate) && !writePending
    const duration = candidate.endSeconds - candidate.startSeconds
    setText(candidateId, `${label(current)} · 候选 ${candidate.id.slice(0, 8)}`, `${timecode(candidate.startSeconds)} — ${timecode(candidate.endSeconds)} · ${duration.toFixed(1)} 秒`)
    setText(note, visibleError ? '操作失败' : editable ? '候选待确认' : `候选状态：${candidate.status}`, visibleError ?? (editable ? '时间线调整会立即保存到当前候选；不会修改源视频。' : candidate.reason ?? '该候选已不能继续编辑。'))
    inspectorMeta.textContent = candidate.id.slice(0, 8); renderTimeline(candidate); setControls(editable, true)
  }
  const selectInlineCandidate = (candidate: ClipCandidate): void => {
    selectedCandidateId = candidate.id
    pendingExternalCandidateId = null
    syncCandidatePage(candidate)
    previewPoint = candidate.startSeconds
    actionError = null
    render()
  }
  const changeInlineCandidatePage = (offset: number): void => {
    candidatePage += offset
    renderCandidateSwitcher()
  }
  document.addEventListener(candidateSelectionEvent, (event) => {
    const candidate = (event as CustomEvent<ClipCandidate>).detail
    if (!candidate || typeof candidate.id !== 'string' || typeof candidate.episodeId !== 'string') return
    selectedEpisodeId = candidate.episodeId
    selectedCandidateId = candidate.id
    pendingExternalCandidateId = candidate.id
    syncCandidatePage(candidate)
    previewPoint = candidate.startSeconds
    mediaFailedFor = null
    actionError = null
    render()
    void refresh()
  })
  const refresh = async (): Promise<void> => {
    const id = ++request; candidatesState = 'loading'; statusesState = 'loading'; render()
    const [candidateResult, statusResult] = await Promise.allSettled([window.desktopApi.listClipCandidates(dramaId), window.desktopApi.listClipEpisodeStatuses(dramaId)])
    if (id !== request) return
    if (candidateResult.status === 'fulfilled') { candidates = candidateResult.value; candidatesState = 'loaded' } else candidatesState = 'error'
    if (statusResult.status === 'fulfilled') { statuses = new Map(statusResult.value.map((item) => [item.episodeId, item])); statusesState = 'loaded' } else statusesState = 'error'
    render()
  }
  document.addEventListener(workspaceRefreshEvent, () => { void refresh() })
  const persist = async (candidateIdToSave: string, startSeconds: number, endSeconds: number): Promise<void> => {
    const candidate = candidates.find((item) => item.id === candidateIdToSave)
    const current = candidate ? episodes.find((item) => item.id === candidate.episodeId) : null
    if (!current || !candidate || !isEditable(candidate)) return
    const duration = current.durationSeconds ?? 0
    const requestedStart = roundTenth(startSeconds); const requestedEnd = roundTenth(endSeconds)
    const changesStart = requestedStart !== candidate.startSeconds; const changesEnd = requestedEnd !== candidate.endSeconds
    const start = changesStart && !changesEnd
      ? clamp(requestedStart, 0, roundTenth(candidate.endSeconds - MIN_DURATION))
      : !changesStart && changesEnd
        ? candidate.startSeconds
        : clamp(requestedStart, 0, Math.max(0, duration - Math.max(MIN_DURATION, requestedEnd - requestedStart)))
    const end = changesStart && !changesEnd
      ? candidate.endSeconds
      : !changesStart && changesEnd
        ? clamp(requestedEnd, roundTenth(candidate.startSeconds + MIN_DURATION), duration)
        : roundTenth(start + clamp(Math.max(MIN_DURATION, requestedEnd - requestedStart), MIN_DURATION, duration))
    if (writePending) { queuedRange = { candidateId: candidate.id, startSeconds: start, endSeconds: end }; return }
    actionError = null; writePending = true; render()
    try { const updated = await window.desktopApi.updateClipCandidate(candidate.id, start, end); candidates = candidates.map((item) => item.id === updated.id ? updated : item); previewPoint = clamp(previewPoint, updated.startSeconds, updated.endSeconds) }
    catch (error) { actionError = { candidateId: candidate.id, episodeId: current.id, message: error instanceof Error ? error.message : '无法保存候选时间线。' } }
    finally {
      writePending = false
      const queued = queuedRange; queuedRange = null
      if (queued) { void persist(queued.candidateId, queued.startSeconds, queued.endSeconds); return }
      render()
    }
  }
  const point = (event: PointerEvent, track: HTMLElement, duration: number): number => { const bounds = track.getBoundingClientRect(); return bounds.width <= 0 ? 0 : clamp(roundTenth(((event.clientX - bounds.left) / bounds.width) * duration), 0, duration) }
  const changeFromPointer = (event: PointerEvent, mode: DragMode): void => {
    const current = episode(); const candidate = selectedCandidate(); if (!current || !candidate) return
    if (mode === 'preview') { previewPoint = clamp(candidate.startSeconds + point(event, candidateTrack, candidate.endSeconds - candidate.startSeconds), candidate.startSeconds, candidate.endSeconds); video(current).currentTime = previewPoint; renderTimeline(candidate); return }
    if (!isEditable(candidate)) return
    const duration = current.durationSeconds ?? 0; const at = point(event, sourceTrack, duration); const length = candidate.endSeconds - candidate.startSeconds
    const start = mode === 'in' ? at : mode === 'out' ? candidate.startSeconds : clamp(at - length / 2, 0, duration - length)
    const end = mode === 'in' ? candidate.endSeconds : mode === 'out' ? at : start + length
    void persist(candidate.id, start, end)
  }
  rail.addEventListener('click', (event) => { const button = asElement(event.target)?.closest<HTMLElement>('[data-clip-episode-id]'); if (!button) return; selectedEpisodeId = button.dataset.clipEpisodeId ?? selectedEpisodeId; selectedCandidateId = null; candidatePage = 0; previewPoint = 0; mediaFailedFor = null; actionError = null; render() })
  // The copied prototype also owns a click listener on its switcher wrapper.
  // Bind to the real grid/buttons so a prototype listener cannot consume or
  // overwrite real candidate selection before it reaches the screen handler.
  inlineCandidateGrid?.addEventListener('click', (event) => {
    const button = asElement(event.target)?.closest<HTMLButtonElement>('[data-inline-candidate]')
    const candidate = button ? candidatesForEpisode().find((item) => item.id === button.dataset.inlineCandidate) : null
    if (!candidate) return
    event.preventDefault()
    event.stopPropagation()
    selectInlineCandidate(candidate)
  })
  inlineCandidatePrevious?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); changeInlineCandidatePage(-1) })
  inlineCandidateNext?.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); changeInlineCandidatePage(1) })
  sourceTrack.addEventListener('pointerdown', (event) => { const candidate = selectedCandidate(); if (!candidate || !isEditable(candidate)) return; const bounds = sourceTrack.getBoundingClientRect(); const inX = bounds.left + (candidate.startSeconds / Math.max(episode()?.durationSeconds ?? 1, 1)) * bounds.width; const outX = bounds.left + (candidate.endSeconds / Math.max(episode()?.durationSeconds ?? 1, 1)) * bounds.width; const mode: DragMode = Math.abs(event.clientX - inX) < 12 ? 'in' : Math.abs(event.clientX - outX) < 12 ? 'out' : 'move'; drag = { mode }; changeFromPointer(event, mode); event.preventDefault() })
  candidateTrack.addEventListener('pointerdown', (event) => { if (!selectedCandidate()) return; drag = { mode: 'preview' }; changeFromPointer(event, 'preview') })
  document.addEventListener('pointerup', () => { drag = null })
  document.addEventListener('pointermove', (event) => { if (drag) changeFromPointer(event, drag.mode) })
  candidateTrack.addEventListener('keydown', (event) => { const current = episode(); const candidate = selectedCandidate(); if (!current || !candidate || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return; event.preventDefault(); previewPoint = clamp(roundTenth(previewPoint + (event.key === 'ArrowLeft' ? -MIN_DURATION : MIN_DURATION)), candidate.startSeconds, candidate.endSeconds); video(current).currentTime = previewPoint; renderTimeline(candidate) })
  nudges.forEach((button, index) => button.addEventListener('click', () => { const candidate = selectedCandidate(); if (!candidate || !isEditable(candidate)) return; const shift = index === 0 ? -MIN_DURATION : index === 1 ? MIN_DURATION : 0; const start = index < 2 ? candidate.startSeconds + shift : candidate.startSeconds; const end = index === 2 ? candidate.endSeconds - MIN_DURATION : index === 3 ? candidate.endSeconds + MIN_DURATION : candidate.endSeconds; void persist(candidate.id, start, end) }))
  screen.addEventListener('click', (event) => {
    const target = asElement(event.target); if (!target) return
    const candidateButton = target.closest<HTMLButtonElement>('[data-inline-candidate]')
    if (candidateButton) { const candidate = candidatesForEpisode().find((item) => item.id === candidateButton.dataset.inlineCandidate); if (!candidate) return; selectInlineCandidate(candidate); event.preventDefault(); return }
    const candidatePageButton = target.closest<HTMLButtonElement>('[data-inline-candidate-page]')
    if (candidatePageButton) { changeInlineCandidatePage(candidatePageButton.dataset.inlineCandidatePage === 'next' ? 1 : -1); event.preventDefault(); return }
    if (target.closest('[data-r5-confirm]')) { const candidate = selectedCandidate(); const current = episode(); if (!candidate || !current || !isEditable(candidate) || writePending) return; let confirmed = false; actionError = null; writePending = true; render(); void window.desktopApi.confirmClipCandidate(candidate.id).then((updated) => { candidates = candidates.map((item) => item.id === updated.id ? updated : item); selectedCandidateId = null; confirmed = true }).catch((error: unknown) => { actionError = { candidateId: candidate.id, episodeId: current.id, message: error instanceof Error ? error.message : '无法确认候选。' } }).finally(() => { writePending = false; if (confirmed) void refresh(); else render() }); return }
    if (target.closest('[data-r5-open="generate"]')) { const current = episode(); if (!current || !current.sourcePath || current.durationSeconds === null || generating.has(current.id)) return; actionError = null; generating = new Set(generating).add(current.id); render(); const input = { episodeIds: [current.id], candidatesPerEpisode: 1, targetDurationSeconds: Math.min(15, Math.max(MIN_DURATION, current.durationSeconds)), maxOverlapRatio: 0.08, allowRepeat: false }; void window.desktopApi.preflightClipGeneration(dramaId, input).then((preflight) => preflight.estimatedCandidates > 0 ? window.desktopApi.generateClipCandidates(dramaId, input) : Promise.reject(new Error(preflight.skipped[0]?.reason ?? '当前分集不可生成候选。'))).then((created) => { candidates = [...candidates, ...created.filter((item) => !candidates.some((candidate) => candidate.id === item.id))]; if (created[0]) { selectedEpisodeId = created[0].episodeId; selectedCandidateId = created[0].id; previewPoint = created[0].startSeconds } }).catch((error: unknown) => { actionError = { candidateId: null, episodeId: current.id, message: error instanceof Error ? error.message : '无法生成候选。' } }).finally(() => { generating.delete(current.id); void refresh() }); event.preventDefault() }
  })
  void refresh()
}
