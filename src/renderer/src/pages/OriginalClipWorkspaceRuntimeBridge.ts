import { clipCandidateLabel } from '../../../shared/clip-candidate-label.js'
import { beginPrototypeDataRead, completePrototypeDataRead } from './prototype-data-ready.js'
import type { ClipCandidate, ClipEpisodeStatus, EpisodeAsset } from '../../../shared/contracts.js'
import { ClipWorkspaceMediaSession } from './clip-workspace-media-session.js'
import { MIN_CLIP_DURATION, clamp, labelEpisode, renderCandidateSwitcher, renderEpisodeRail, renderMissingClipMedia, roundTenth, setSurfaceText, timecode } from './clip-workspace-surface.js'
import { resolveClipWorkspaceElements } from './clip-workspace-elements.js'
import { candidateSelectionEvent, workspaceRefreshEvent } from './clip-workspace-events.js'
import { latestClipWorkspaceTaskNotice } from './clip-workspace-task-notice.js'
import { clipInspectorEvidenceText } from './clip-inspector-evidence.js'
export { refreshOriginalClipWorkspace, selectOriginalClipWorkspaceCandidate } from './clip-workspace-events.js'

type Props = { document: Document; dramaId: string; episodes: EpisodeAsset[]; initialCandidate?: ClipCandidate | null; onRecoveryNavigate?: (target: 'assets' | 'subtitles') => void }
type DragMode = 'in' | 'out' | 'move' | 'preview' | 'source-preview'
type LoadState = 'loading' | 'loaded' | 'error'
type DragState = { mode: DragMode } | null
const asElement = (target: EventTarget | null): Element | null => target !== null && typeof (target as Element).closest === 'function' ? target as Element : null
const isEditable = (candidate: ClipCandidate | null): candidate is ClipCandidate => candidate !== null && (candidate.status === 'pending_review' || candidate.status === 'editing')

export const bindOriginalClipWorkspaceRuntime = ({ document, dramaId, episodes: sourceEpisodes, initialCandidate = null, onRecoveryNavigate }: Props): void => {
  const screen = document.getElementById('screen-clip')
  if (!screen || screen.dataset.originalClipRuntimeBound === 'true') return
  screen.dataset.originalClipRuntimeBound = 'true'
  // The V49 source document boots its own visual-demo handlers.  Runtime mode
  // keeps that document's full shell, so detach those handlers before binding
  // the product controls; otherwise one click would toggle the same control twice.
  for (const selector of ['.clip-transport', '.r5-inspector']) {
    const node = screen.querySelector<HTMLElement>(selector)
    if (!node) continue
    const replacement = node.cloneNode(true) as HTMLElement
    node.replaceWith(replacement)
  }
  const episodes = [...sourceEpisodes].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id))
  const elements = resolveClipWorkspaceElements(screen)
  if (!elements) return
  beginPrototypeDataRead(document)
  const { rail, railMeta, sourceTimeline, candidateTimeline, sourceTrack, candidateTrack, sourceRange, candidateRange, candidateAnchor, frame, candidateId, monitorTimecode, monitorCaption, note, inspectorMeta, transportPlay, transportLoop, speedTrigger, volumeTrigger, speedPopover, volumePopover, sourceTime, relativeTime, volumeLabel, volumeInput, reviewButtons, reviewDescription, boundaryState, nudges, inlineCandidateSwitcher, inlineCandidateGrid, inlineCandidatePrevious, inlineCandidateNext } = elements
  candidateAnchor.classList.add('clip-playhead'); candidateAnchor.dataset.clipPlayhead = 'true'; candidateAnchor.setAttribute('aria-label', '当前预览位置')
  if (!screen.querySelector('[data-clip-inspector-evidence-style]')) { const style = document.createElement('style'); style.dataset.clipInspectorEvidenceStyle = 'true'; style.textContent = '#screen-clip .r5-anchor.clip-playhead::after{content:"预览"}'; screen.append(style) }
  if (!screen.hasAttribute('tabindex')) screen.tabIndex = 0
  // Version 49 contributes the control's visual shell, while the product
  // contract owns the allowed session speeds.
  speedPopover.replaceChildren(...[0.5, 1, 1.5, 2].map((speed) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.clipSpeed = String(speed)
    button.setAttribute('aria-pressed', String(speed === 1))
    button.textContent = `${speed}×`
    return button
  }))
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
  let generationTaskIds = new Map<string, string>()
  let mediaFailedFor: string | null = null
  let actionError: { candidateId: string | null; episodeId: string; message: string; recovery?: 'assets' | 'subtitles'; deadlineTaskId?: string } | null = null
  let request = 0
  let candidateRevision = 0
  let candidatePage = 0

  const watchGeneration = (episodeId: string, taskId: string): void => {
    const poll = async (): Promise<void> => {
      try {
        const [nextCandidates, tasks] = await Promise.all([window.desktopApi.listClipCandidates(dramaId), window.desktopApi.listTasks()])
        const task = tasks.find((item) => item.id === taskId)
        if (task?.status === 'running' || task?.status === 'pending') {
          actionError = { candidateId: null, episodeId, message: task.checkpointReason ? `正在生成候选：${task.checkpointReason}` : (task.checkpointStage === 'multimodal-review' ? '正在生成候选：复核关键片段；再次点击生成按钮可取消。' : '正在生成候选：文本语义分析；再次点击生成按钮可取消。') }
          render()
          window.setTimeout(() => { void poll() }, 350)
          return
        }
        // A terminal generation result is newer than any background read
        // started before it; that read must not restore its older candidate list.
        candidateRevision += 1
        candidates = nextCandidates
        candidatesState = 'loaded'
        generating.delete(episodeId); generationTaskIds = new Map(generationTaskIds); generationTaskIds.delete(episodeId)
        if (task?.status === 'reviewing' || task?.status === 'completed') {
          const created = nextCandidates.filter((item) => item.episodeId === episodeId).at(-1)
          if (created) { selectedEpisodeId = created.episodeId; selectedCandidateId = created.id; previewPoint = created.startSeconds; const summary = task?.checkpointReason ?? ''; actionError = summary.includes('未纳入') ? { candidateId: null, episodeId, message: summary, recovery: summary.includes('素材资产') ? 'assets' : summary.includes('字幕资产') ? 'subtitles' : undefined } : null }
          else { const message = task?.checkpointReason ?? '候选任务已结束，但没有符合证据门禁的候选。'; actionError = { candidateId: null, episodeId, message, recovery: message.includes('素材资产') ? 'assets' : message.includes('字幕资产') ? 'subtitles' : undefined } }
        } else actionError = { candidateId: null, episodeId, message: task?.checkpointReason ?? '候选生成未完成；此前稳定候选未被覆盖。', ...(task?.checkpointStage === 'awaiting-decision' ? { deadlineTaskId: task.id } : {}) }
      } catch (error) { generating.delete(episodeId); actionError = { candidateId: null, episodeId, message: error instanceof Error ? error.message : '无法读取候选任务状态。' } }
      render()
    }
    void poll()
  }

  const episode = (): EpisodeAsset | null => episodes.find((item) => item.id === selectedEpisodeId) ?? null
  const hasPreviewableMedia = (current: EpisodeAsset | null = episode()): current is EpisodeAsset & { sourcePath: string; durationSeconds: number } => Boolean(current?.sourcePath && current.durationSeconds !== null && mediaFailedFor !== current.id)
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
  let session: ClipWorkspaceMediaSession
  const setControls = (editable: boolean, previewable = false): void => {
    sourceTrack.setAttribute('aria-disabled', String(!editable)); sourceTrack.tabIndex = editable ? 0 : -1
    candidateTrack.setAttribute('aria-disabled', String(!previewable)); candidateTrack.tabIndex = previewable ? 0 : -1
    nudges.forEach((button) => { button.disabled = !editable })
    const confirm = screen.querySelector<HTMLButtonElement>('[data-r5-confirm]')
    if (confirm) confirm.disabled = !editable
  }
  const renderTimeline = (candidate: ClipCandidate): void => {
    const current = episode(); const duration = current?.durationSeconds ?? 0; const range = Math.max(1, duration)
    const segment = candidate.endSeconds - candidate.startSeconds
    sourceRange.style.left = `${(candidate.startSeconds / range) * 100}%`; sourceRange.style.width = `${(segment / range) * 100}%`
    candidateRange.style.left = '24%'; candidateRange.style.width = '34.3%'; candidateAnchor.style.left = `${24 + ((previewPoint - candidate.startSeconds) / Math.max(segment, MIN_CLIP_DURATION)) * 34.3}%`
    sourceTimeline.querySelector('.r5-timeline-head span')!.textContent = `${labelEpisode(current!)} · 00:00:00 — ${timecode(duration).slice(0, 8)}`
    candidateTimeline.querySelector('.r5-timeline-head span')!.textContent = `${clipCandidateLabel(candidate, candidate.id.slice(0, 8))} · ${segment.toFixed(1)} 秒`
    monitorTimecode.textContent = timecode(previewPoint)
    session.sync(candidate, true)
  }
  const render = (): void => {
    const current = episode(); const candidate = chooseCandidate()
    renderEpisodeRail(rail, railMeta ?? null, episodes, selectedEpisodeId, statuses, statusesState, generating); candidatePage = renderCandidateSwitcher(inlineCandidateSwitcher ?? null, candidatesForEpisode(), selectedCandidateId, candidatePage)
    if (!current) { session.release(); renderMissingClipMedia(frame, null, false, ''); setSurfaceText(candidateId, '没有可用分集'); setSurfaceText(note, '当前剧目没有分集'); setControls(false); session.sync(null, false); return }
    const missing = !current.sourcePath || current.durationSeconds === null || mediaFailedFor === current.id
    const dimensions = current.videoWidth && current.videoHeight ? `${current.videoWidth} × ${current.videoHeight}` : '画幅读取中'
    if (missing) session.release(); else session.load(current)
    renderMissingClipMedia(frame, current, missing, dimensions)
    const caption = monitorCaption.querySelectorAll('span'); caption[0]!.textContent = `${labelEpisode(current)} · 源片 ${dimensions} · 等比显示`; caption[1]!.textContent = candidate ? `${clipCandidateLabel(candidate, candidate.id.slice(0, 8))} · ${timecode(candidate.startSeconds)} — ${timecode(candidate.endSeconds)}` : missing ? '源媒体不可用' : candidatesState === 'error' ? '候选读取失败' : candidatesState === 'loading' ? '正在读取候选' : '尚未生成候选'
    const visibleError = actionError?.episodeId === current.id && (actionError.candidateId === null || actionError.candidateId === candidate?.id) ? actionError.message : null
    if (!candidate || missing || candidatesState !== 'loaded') {
      const reason = visibleError ?? (missing ? '源媒体需要重新定位，无法编辑或生成候选。' : candidatesState === 'error' ? '候选读取失败；没有把失败伪装为未生成。' : candidatesState === 'loading' ? '正在读取真实候选。' : '本集还没有真实候选。')
      setSurfaceText(candidateId, `${labelEpisode(current)} · 暂无可编辑候选`, reason); setSurfaceText(note, missing ? '当前无法编辑' : '候选状态', reason); if (actionError?.recovery && onRecoveryNavigate) { const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-secondary'; button.dataset.clipRecovery = actionError.recovery; button.textContent = actionError.recovery === 'subtitles' ? '前往字幕资产' : '查看素材资产'; note.append(button) }; if (actionError?.deadlineTaskId) { const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-secondary'; button.dataset.clipDeadlineContinue = actionError.deadlineTaskId; button.textContent = '继续有限延期'; note.append(button); const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'btn btn-danger'; stop.dataset.clipDeadlineStop = actionError.deadlineTaskId; stop.textContent = '停止生成'; note.append(stop) }; inspectorMeta.textContent = missing ? '媒体缺失' : candidatesState === 'error' ? '读取失败' : '无候选'
      sourceRange.style.left = '0%'; sourceRange.style.width = '0%'; candidateRange.style.width = '0%'; candidateAnchor.style.left = '0%'; monitorTimecode.textContent = '—'; setControls(false); session.sync(candidate, false); return
    }
    const editable = isEditable(candidate) && !writePending
    const duration = candidate.endSeconds - candidate.startSeconds
    setSurfaceText(candidateId, `${labelEpisode(current)} · ${clipCandidateLabel(candidate, `候选 ${candidate.id.slice(0, 8)}`)}`, `${timecode(candidate.startSeconds)} — ${timecode(candidate.endSeconds)} · ${duration.toFixed(1)} 秒`)
    const qualificationNote = candidate.qualification === 'qualified_with_limit' ? candidate.qualificationReason ?? '核心事件和切点证据完整，但上下文存在限制。' : null
    const evidenceText = clipInspectorEvidenceText(candidate)
    setSurfaceText(note, visibleError ? '操作失败' : qualificationNote ? '候选可用但受限' : editable ? '候选待确认' : `候选状态：${candidate.status}`, visibleError ?? [qualificationNote, evidenceText, editable ? '时间线调整会立即保存到当前候选；不会修改源视频。' : candidate.reason].filter(Boolean).join('；'))
    if (visibleError && actionError?.recovery && onRecoveryNavigate) { const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-secondary'; button.dataset.clipRecovery = actionError.recovery; button.textContent = actionError.recovery === 'subtitles' ? '前往字幕资产' : '查看素材资产'; note.append(button) }
    if (visibleError && actionError?.deadlineTaskId) { const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-secondary'; button.dataset.clipDeadlineContinue = actionError.deadlineTaskId; button.textContent = '继续有限延期'; note.append(button); const stop = document.createElement('button'); stop.type = 'button'; stop.className = 'btn btn-danger'; stop.dataset.clipDeadlineStop = actionError.deadlineTaskId; stop.textContent = '停止生成'; note.append(stop) }
    inspectorMeta.textContent = clipCandidateLabel(candidate, candidate.id.slice(0, 8)); renderTimeline(candidate); setControls(editable, true)
  }
  session = new ClipWorkspaceMediaSession(document, frame, { play: transportPlay, loop: transportLoop, speed: speedTrigger, volume: volumeTrigger, speedPopover, volumePopover, sourceTime, relativeTime, volumeLabel, volumeInput, reviewButtons, reviewDescription, boundaryState }, { episode, candidate: selectedCandidate, previewPoint: () => previewPoint, setPreviewPoint: (value) => { previewPoint = value }, isAvailable: hasPreviewableMedia, mediaFailure: (episodeId) => { mediaFailedFor = episodeId }, renderTimeline, render })
  session.bind()
  const selectInlineCandidate = (candidate: ClipCandidate): void => {
    session.pause()
    selectedCandidateId = candidate.id
    pendingExternalCandidateId = null
    syncCandidatePage(candidate)
    previewPoint = candidate.startSeconds
    actionError = null
    render()
    const current = episode(); if (current && hasPreviewableMedia(current)) session.seek(session.video(current), previewPoint)
  }
  const changeInlineCandidatePage = (offset: number): void => {
    candidatePage += offset
    candidatePage = renderCandidateSwitcher(inlineCandidateSwitcher ?? null, candidatesForEpisode(), selectedCandidateId, candidatePage)
  }
  document.addEventListener(candidateSelectionEvent, (event) => {
    const candidate = (event as CustomEvent<ClipCandidate>).detail
    if (!candidate || typeof candidate.id !== 'string' || typeof candidate.episodeId !== 'string') return
    session.pause()
    if (candidate.episodeId !== selectedEpisodeId) session.release()
    selectedEpisodeId = candidate.episodeId
    selectedCandidateId = candidate.id
    pendingExternalCandidateId = candidate.id
    syncCandidatePage(candidate)
    previewPoint = candidate.startSeconds
    mediaFailedFor = null
    actionError = null
    render()
    const current = episode(); if (current && hasPreviewableMedia(current)) session.seek(session.video(current), previewPoint)
    void refresh()
  })
  const refresh = async (): Promise<void> => {
    const id = ++request; const revision = candidateRevision
    // Background reads must not replace a stable candidate/empty state with
    // the initial loading surface while their asynchronous results are pending.
    if (candidatesState !== 'loaded') candidatesState = 'loading'
    if (statusesState !== 'loaded') statusesState = 'loading'
    render()
    const [candidateResult, statusResult, taskResult] = await Promise.allSettled([window.desktopApi.listClipCandidates(dramaId), window.desktopApi.listClipEpisodeStatuses(dramaId), window.desktopApi.listTasks()])
    if (id !== request) return
    if (revision === candidateRevision) {
      if (candidateResult.status === 'fulfilled') { candidates = candidateResult.value; candidatesState = 'loaded' } else candidatesState = 'error'
    }
    if (statusResult.status === 'fulfilled') { statuses = new Map(statusResult.value.map((item) => [item.episodeId, item])); statusesState = 'loaded' } else statusesState = 'error'
    if (taskResult.status === 'fulfilled' && revision === candidateRevision) {
      const currentEpisodeId = selectedEpisodeId ?? ''
      const taskNotice = latestClipWorkspaceTaskNotice(taskResult.value, currentEpisodeId, generating.has(currentEpisodeId))
      if (taskNotice) actionError = { candidateId: null, episodeId: currentEpisodeId, ...taskNotice }
      else if (actionError?.candidateId === null && actionError.episodeId === currentEpisodeId && !generating.has(currentEpisodeId)) actionError = null
    }
    render(); completePrototypeDataRead(document)
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
      ? clamp(requestedStart, 0, roundTenth(candidate.endSeconds - MIN_CLIP_DURATION))
      : !changesStart && changesEnd
        ? candidate.startSeconds
        : clamp(requestedStart, 0, Math.max(0, duration - Math.max(MIN_CLIP_DURATION, requestedEnd - requestedStart)))
    const end = changesStart && !changesEnd
      ? candidate.endSeconds
      : !changesStart && changesEnd
        ? clamp(requestedEnd, roundTenth(candidate.startSeconds + MIN_CLIP_DURATION), duration)
        : roundTenth(start + clamp(Math.max(MIN_CLIP_DURATION, requestedEnd - requestedStart), MIN_CLIP_DURATION, duration))
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
    if (!hasPreviewableMedia(current)) return
    if (mode === 'source-preview') { previewPoint = point(event, sourceTrack, current.durationSeconds ?? 0); session.seek(session.video(current), previewPoint); renderTimeline(candidate); return }
    if (mode === 'preview') { previewPoint = clamp(candidate.startSeconds + point(event, candidateTrack, candidate.endSeconds - candidate.startSeconds), candidate.startSeconds, candidate.endSeconds); session.seek(session.video(current), previewPoint); renderTimeline(candidate); return }
    if (!isEditable(candidate)) return
    const duration = current.durationSeconds ?? 0; const at = point(event, sourceTrack, duration); const length = candidate.endSeconds - candidate.startSeconds
    const start = mode === 'in' ? at : mode === 'out' ? candidate.startSeconds : clamp(at - length / 2, 0, duration - length)
    const end = mode === 'in' ? candidate.endSeconds : mode === 'out' ? at : start + length
    void persist(candidate.id, start, end)
  }
  rail.addEventListener('click', (event) => { const button = asElement(event.target)?.closest<HTMLElement>('[data-clip-episode-id]'); if (!button) return; const nextEpisodeId = button.dataset.clipEpisodeId ?? selectedEpisodeId; if (nextEpisodeId !== selectedEpisodeId) session.release(); else session.pause(); selectedEpisodeId = nextEpisodeId; selectedCandidateId = null; candidatePage = 0; previewPoint = 0; mediaFailedFor = null; actionError = null; render() })
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
  sourceTrack.addEventListener('pointerdown', (event) => { if (!selectedCandidate() || !hasPreviewableMedia()) return; session.pause(); drag = { mode: 'source-preview' }; changeFromPointer(event, 'source-preview'); event.preventDefault() })
  candidateTrack.addEventListener('pointerdown', (event) => { if (!selectedCandidate() || !hasPreviewableMedia()) return; session.pause(); drag = { mode: 'preview' }; changeFromPointer(event, 'preview') })
  document.addEventListener('pointerup', () => { drag = null })
  document.addEventListener('pointermove', (event) => { if (drag) changeFromPointer(event, drag.mode) })
  candidateTrack.addEventListener('keydown', (event) => { const current = episode(); const candidate = selectedCandidate(); if (!current || !candidate || !hasPreviewableMedia(current) || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return; session.pause(); event.preventDefault(); event.stopPropagation(); previewPoint = clamp(roundTenth(previewPoint + (event.key === 'ArrowLeft' ? -1 : 1)), candidate.startSeconds, candidate.endSeconds); session.seek(session.video(current), previewPoint); renderTimeline(candidate) })
  nudges.forEach((button) => button.addEventListener('click', () => { const candidate = selectedCandidate(); if (!candidate || !hasPreviewableMedia() || !isEditable(candidate)) return; session.pause(); const action = button.dataset.clipNudge; const start = action === 'in-back' ? candidate.startSeconds - MIN_CLIP_DURATION : action === 'in-forward' ? candidate.startSeconds + MIN_CLIP_DURATION : candidate.startSeconds; const end = action === 'out-back' ? candidate.endSeconds - MIN_CLIP_DURATION : action === 'out-forward' ? candidate.endSeconds + MIN_CLIP_DURATION : candidate.endSeconds; void persist(candidate.id, start, end) }))
  screen.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.code !== 'Space') return
    const target = asElement(event.target)
    if (target?.closest('button,a,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="dialog"],[aria-modal="true"]')) return
    event.preventDefault(); event.stopPropagation(); session.toggle()
  })
  screen.addEventListener('click', (event) => {
    const target = asElement(event.target); if (!target) return
    const recovery = target.closest<HTMLElement>('[data-clip-recovery]')?.dataset.clipRecovery
    if ((recovery === 'assets' || recovery === 'subtitles') && onRecoveryNavigate) { onRecoveryNavigate(recovery); event.preventDefault(); return }
    const deadlineContinue = target.closest<HTMLElement>('[data-clip-deadline-continue]')?.dataset.clipDeadlineContinue
    if (deadlineContinue) { void window.desktopApi.decideIntelligentClipDeadline(deadlineContinue, 'continue').then(() => refresh()).catch((error: unknown) => { const current = episode(); if (current) { actionError = { candidateId: null, episodeId: current.id, message: error instanceof Error ? error.message : '无法继续候选生成。' }; render() } }); event.preventDefault(); return }
    const deadlineStop = target.closest<HTMLElement>('[data-clip-deadline-stop]')?.dataset.clipDeadlineStop
    if (deadlineStop) { void window.desktopApi.decideIntelligentClipDeadline(deadlineStop, 'stop').then(() => refresh()).catch((error: unknown) => { const current = episode(); if (current) { actionError = { candidateId: null, episodeId: current.id, message: error instanceof Error ? error.message : '无法停止候选生成。' }; render() } }); event.preventDefault(); return }
    const candidateButton = target.closest<HTMLButtonElement>('[data-inline-candidate]')
    if (candidateButton) { const candidate = candidatesForEpisode().find((item) => item.id === candidateButton.dataset.inlineCandidate); if (!candidate) return; selectInlineCandidate(candidate); event.preventDefault(); return }
    const candidatePageButton = target.closest<HTMLButtonElement>('[data-inline-candidate-page]')
    if (candidatePageButton) { changeInlineCandidatePage(candidatePageButton.dataset.inlineCandidatePage === 'next' ? 1 : -1); event.preventDefault(); return }
    if (target.closest('[data-r5-confirm]')) { const candidate = selectedCandidate(); const current = episode(); if (!candidate || !hasPreviewableMedia(current) || !isEditable(candidate) || writePending) return; let confirmed = false; actionError = null; writePending = true; render(); void window.desktopApi.confirmClipCandidate(candidate.id).then((updated) => { candidates = candidates.map((item) => item.id === updated.id ? updated : item); selectedCandidateId = null; confirmed = true }).catch((error: unknown) => { actionError = { candidateId: candidate.id, episodeId: current.id, message: error instanceof Error ? error.message : '无法确认候选。' } }).finally(() => { writePending = false; if (confirmed) void refresh(); else render() }); return }
    if (target.closest('[data-r5-open="generate"]')) { const current = episode(); if (!hasPreviewableMedia(current)) return; const activeTaskId = generationTaskIds.get(current.id); if (generating.has(current.id) && activeTaskId) { void window.desktopApi.cancelIntelligentClipGeneration(activeTaskId).then(() => { generating.delete(current.id); generationTaskIds = new Map(generationTaskIds); generationTaskIds.delete(current.id); actionError = { candidateId: null, episodeId: current.id, message: '候选生成已取消；此前稳定候选未被覆盖。' }; void refresh() }).catch((error: unknown) => { actionError = { candidateId: null, episodeId: current.id, message: error instanceof Error ? error.message : '无法取消候选生成。' } }).finally(render); event.preventDefault(); return } if (generating.has(current.id)) return; actionError = null; generating = new Set(generating).add(current.id); render(); const input = { episodeIds: [current.id], candidatesPerEpisode: 1, targetDurationSeconds: Math.min(15, Math.max(MIN_CLIP_DURATION, current.durationSeconds)), maxOverlapRatio: 0.08, allowRepeat: false }; void window.desktopApi.preflightClipGeneration(dramaId, input).then((preflight) => preflight.estimatedCandidates > 0 ? window.desktopApi.generateClipCandidates(dramaId, input) : Promise.reject(new Error(preflight.skipped[0]?.reason ?? '当前分集不可生成候选。'))).then((task) => { generationTaskIds = new Map(generationTaskIds).set(current.id, task.taskId); actionError = { candidateId: null, episodeId: current.id, message: `正在生成候选（${task.status === 'deduplicated' ? '已合并相同任务' : '文本语义分析'}）。再次点击生成按钮可取消。` }; watchGeneration(current.id, task.taskId) }).catch((error: unknown) => { generating.delete(current.id); actionError = { candidateId: null, episodeId: current.id, message: error instanceof Error ? error.message : '无法生成候选。' } }).finally(() => { render() }); event.preventDefault() }
  })
  void refresh()
}
