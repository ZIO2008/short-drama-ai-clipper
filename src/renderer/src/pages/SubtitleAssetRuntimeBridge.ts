import type { EpisodeAsset, LocalOcrRuntimeIdentity, SubtitleAsset, SubtitleEvidenceTrack, SubtitleRecognitionRun, SubtitleRecognitionSettings } from '../../../shared/contracts.js'
import { beginPrototypeDataRead, completePrototypeDataRead } from './prototype-data-ready.js'
import { toMediaUrl } from '../components/MediaMonitor.js'
import { announceSubtitleToast as announce } from './subtitle-toast.js'
import { SUBTITLE_PRESSURE_CUE_COUNT, SUBTITLE_PRESSURE_DURATION_SECONDS, SUBTITLE_PRESSURE_EPISODE_NO, SUBTITLE_PRESSURE_SAMPLE_ID, subtitlePressureSample } from './subtitle-pressure-sample.js'
import { asrTrack, evidenceHead, evidenceRows, escapeHtml, formatEpisode, formatRatio, hasReadableMedia, ocrInputTrack, pressureEvidenceHead, renderSubtitleAssetLabel, renderSubtitleStatus, textTracks, type TextEvidence, visualTrack } from './subtitle-evidence-presentation.js'

type Props = { document: Document; dramaId: string; episodes: EpisodeAsset[]; detailActionsEnabled?: boolean; staticDetailActionsEnabled?: boolean }
type EpisodeSnapshot = { episode: EpisodeAsset; tracks: SubtitleEvidenceTrack[]; assets: SubtitleAsset[] }
type EpisodeFailure = { kind: 'read' | 'execution'; message: string }
type ElementTarget = { closest: <T extends Element = Element>(selector: string) => T | null }

const activeRecognitionEpisodes = new Map<string, Set<string>>()
const activeEpisodesFor = (dramaId: string): Set<string> => {
  const existing = activeRecognitionEpisodes.get(dramaId)
  if (existing) return existing
  const episodes = new Set<string>()
  activeRecognitionEpisodes.set(dramaId, episodes)
  return episodes
}
const announceRecognitionState = (dramaId: string, finished: boolean): void => {
  window.dispatchEvent(new CustomEvent('subtitle-recognition-state-changed', { detail: { dramaId, finished } }))
}

const recognitionStatus = (run: SubtitleRecognitionRun | null, episodeId: string, fallback: ReturnType<typeof renderSubtitleStatus>): ReturnType<typeof renderSubtitleStatus> => {
  const item = run?.items.find((candidate) => candidate.episodeId === episodeId)
  if (!item) return fallback
  if (item.status === 'running') return { label: '识别中', tone: 'warning', canView: false }
  if (item.status === 'pending' && run?.status === 'running') return { label: '等待识别', tone: 'warning', canView: fallback.canView }
  if (item.status === 'interrupted') return { label: '已中断', tone: 'warning', canView: fallback.canView }
  if (item.status === 'failed') return { label: '执行失败', tone: 'danger', canView: fallback.canView }
  return fallback
}

const recognitionSummary = (run: SubtitleRecognitionRun, episodes: Map<string, EpisodeAsset>): string => {
  const firstUnfinished = run.items.find((item) => item.status === 'pending' || item.status === 'running' || item.status === 'interrupted')
  const failed = run.items.find((item) => item.status === 'failed')
  const current = firstUnfinished ? episodes.get(firstUnfinished.episodeId) : failed ? episodes.get(failed.episodeId) : null
  const progress = `已完成 ${run.completed} / ${run.total}`
  const runtime = run.ocrRuntime ? ` · OCR ${run.ocrRuntime.buildId}` : ''
  if (run.status === 'running') return `${progress} · ${current ? `${formatEpisode(current.episodeNo)}${firstUnfinished?.status === 'running' ? '识别中' : '等待识别'}` : '识别中'}${runtime}`
  if (run.status === 'interrupted') return `${progress} · 已中断${current ? ` · 可从${formatEpisode(current.episodeNo)}继续` : ''} · ${run.reason ?? '工具已关闭或重启'}${runtime}`
  if (run.status === 'partial' || run.status === 'failed') return `${progress} · ${run.failed} 集执行失败${current ? ` · ${formatEpisode(current.episodeNo)}：${failed?.reason ?? '未知错误'}` : ''}${runtime}`
  return `${progress} · 已完成${runtime}`
}

const sameOcrRuntime = (left: LocalOcrRuntimeIdentity | null, right: LocalOcrRuntimeIdentity | null): boolean => Boolean(left && right && left.buildId === right.buildId && left.sha256 === right.sha256)
const sameRecognitionSettings = (left: SubtitleRecognitionSettings, right: SubtitleRecognitionSettings): boolean => left.recognitionMode === right.recognitionMode && left.scope === right.scope && left.language === right.language && left.asrMode === right.asrMode && left.ocrMode === right.ocrMode && left.differenceThreshold === right.differenceThreshold && left.importStrategy === right.importStrategy

const isElementTarget = (target: EventTarget | null): target is EventTarget & ElementTarget => Boolean(target && typeof (target as { closest?: unknown }).closest === 'function')
const trashIcon = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h16M10 11v5M14 11v5M6.5 9l.8 11h9.4l.8-11M9 4h6v3H9z" /></svg>'
const subtitleSelectionStyleId = 'subtitle-selection-control-style'

const ensureSubtitleSelectionStyles = (document: Document): void => {
  if (document.getElementById(subtitleSelectionStyleId)) return
  const style = document.createElement('style')
  style.id = subtitleSelectionStyleId
  style.textContent = '#subtitleListPanel .subtitle-selection-cell input[type="checkbox"]{accent-color:var(--accent);color-scheme:dark}'
  document.head.append(style)
}

export const bindSubtitleAssetRuntime = ({ document, dramaId, episodes, detailActionsEnabled = true, staticDetailActionsEnabled = false }: Props): void => {
  if (document.body.dataset.subtitleRuntimeBound === 'true') return
  document.body.dataset.subtitleRuntimeBound = 'true'
  beginPrototypeDataRead(document)
  ensureSubtitleSelectionStyles(document)
  const listBody = document.querySelector<HTMLTableSectionElement>('#subtitleListPanel tbody')
  const listHelper = document.querySelector<HTMLElement>('#subtitleListPanel .helper')
  const generateButton = document.querySelector<HTMLButtonElement>('[data-subtitle-generate]')
  const listHeader = document.querySelector<HTMLTableRowElement>('#subtitleListPanel thead tr')
  if (listHeader && !listHeader.querySelector('[data-subtitle-select-all]')) {
    const selectionHeader = document.createElement('th')
    selectionHeader.className = 'subtitle-selection-cell'
    selectionHeader.innerHTML = '<input type="checkbox" data-subtitle-select-all aria-label="选择全部可识别剧集" title="选择全部可识别剧集">'
    listHeader.prepend(selectionHeader)
  }
  const modal = document.getElementById('subtitleAssetModal')
  const detailAsset = document.getElementById('subtitleDetailAsset')
  const detailEmpty = document.getElementById('subtitleDetailEmpty')
  const detailEmptyText = document.getElementById('subtitleDetailEmptyText')
  const detailTitle = document.getElementById('subtitleAssetModalTitle')
  const detailMeta = document.getElementById('subtitleAssetModalMeta')
  const evidence = detailAsset?.querySelector<HTMLElement>('.r5-evidence')
  const monitorEpisode = document.getElementById('subtitleMonitorEpisode')
  const snapshots = new Map<string, EpisodeSnapshot>()
  const episodeById = new Map(episodes.map((episode) => [episode.id, episode]))
  const failures = new Map<string, EpisodeFailure>()
  const executing = activeEpisodesFor(dramaId)
  const deleting = new Set<string>()
  const selectedEpisodeIds = new Set<string>()
  let listRequest = 0
  let detailRequest = 0
  let selectedEpisodeId: string | null = null
  let recognitionRun: SubtitleRecognitionRun | null = null
  let generating = false
  let listLoading = true


  const selectableEpisodes = (): EpisodeAsset[] => episodes.filter(hasReadableMedia)
  const selectedTargets = (): string[] => selectableEpisodes().filter((episode) => selectedEpisodeIds.has(episode.id)).map((episode) => episode.id)
  const renderSelectionControls = (): void => {
    const selectedCount = selectedTargets().length
    if (generateButton) {
      generateButton.textContent = selectedCount > 0 ? `识别已选 ${selectedCount} 集` : '一键生成字幕'
      generateButton.setAttribute('aria-label', selectedCount > 0 ? `识别已选 ${selectedCount} 集` : '一键生成字幕')
    }
    const selectAll = document.querySelector<HTMLInputElement>('[data-subtitle-select-all]')
    if (selectAll) {
      const selectable = selectableEpisodes()
      selectAll.checked = selectable.length > 0 && selectable.every((episode) => selectedEpisodeIds.has(episode.id))
      selectAll.indeterminate = selectedCount > 0 && !selectAll.checked
    }
  }
  const renderListHelper = (): void => {
    if (!listHelper) return
    const selectedCount = selectedTargets().length
    const selection = selectedCount > 0 ? `已选 ${selectedCount} 集，将只识别这些剧集。` : null
    listHelper.textContent = recognitionRun ? [recognitionSummary(recognitionRun, episodeById), selection].filter(Boolean).join(' · ') : selection ?? `共 ${episodes.length} 集。可批量导入字幕，并管理每集已导入字幕。`
  }

  const setModal = (open: boolean): void => {
    if (!modal) return
    modal.classList.toggle('open', open)
    modal.setAttribute('aria-hidden', open ? 'false' : 'true')
  }
  const removePreview = (): void => detailAsset?.querySelector<HTMLVideoElement>('video[data-subtitle-preview]')?.remove()
  const showPreview = (episode: EpisodeAsset): void => {
    const frame = detailAsset?.querySelector<HTMLElement>('.r5-frame')
    if (!frame || !hasReadableMedia(episode)) { removePreview(); return }
    let preview = frame.querySelector<HTMLVideoElement>('video[data-subtitle-preview]')
    if (preview?.dataset.episodeId !== episode.id) { preview?.remove(); preview = null }
    if (preview) return
    const sourceEpisodeId = episode.id
    preview = document.createElement('video')
    preview.dataset.subtitlePreview = 'true'
    preview.dataset.episodeId = sourceEpisodeId
    preview.preload = 'metadata'
    preview.muted = true
    preview.src = toMediaUrl(episode.sourcePath)
    preview.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:1'
    preview.addEventListener('error', () => {
      if (preview?.dataset.episodeId === sourceEpisodeId) {
        preview.remove()
        if (monitorEpisode) monitorEpisode.textContent = `${formatEpisode(episode.episodeNo)} · 源片预览失败，保留字幕证据`
      }
    })
    preview.addEventListener('click', () => { if (preview) void (preview.paused ? preview.play() : Promise.resolve(preview.pause())) })
    frame.prepend(preview)
  }
  const renderList = (): void => {
    if (!listBody) return
    const rows = episodes.map((episode) => {
      const snapshot = snapshots.get(episode.id) ?? { episode, tracks: [], assets: [] }
      const fallback = renderSubtitleStatus(snapshot.episode, snapshot.tracks, snapshot.assets, { loading: listLoading, executing: executing.has(episode.id), failure: failures.get(episode.id) })
      const status = recognitionStatus(recognitionRun, episode.id, fallback)
      const label = renderSubtitleAssetLabel(snapshot.tracks, snapshot.assets)
      const canDelete = !deleting.has(episode.id)
      const selectable = hasReadableMedia(episode)
      const detailAction = detailActionsEnabled
        ? `<button class="btn btn-secondary" type="button" data-subtitle-open-episode="${escapeHtml(episode.id)}">${status.canView ? '查看画面' : '查看状态'}</button>`
        : staticDetailActionsEnabled
          ? `<button class="btn btn-secondary" type="button" data-subtitle-open-static="${status.canView ? 'view' : 'status'}" data-subtitle-static-episode-id="${escapeHtml(episode.id)}">${status.canView ? '查看画面' : '查看状态'}</button>`
          : ''
      return `<tr data-subtitle-episode-id="${escapeHtml(episode.id)}"><td class="subtitle-selection-cell"><input type="checkbox" data-subtitle-select-episode="${escapeHtml(episode.id)}" aria-label="选择${escapeHtml(formatEpisode(episode.episodeNo))}用于识别"${selectedEpisodeIds.has(episode.id) ? ' checked' : ''}${selectable ? '' : ' disabled'}></td><td><strong>${formatEpisode(episode.episodeNo)}</strong></td><td>${escapeHtml(label)}</td><td><span class="badge ${status.tone}">${status.label}</span></td><td class="right">${detailAction}<button class="btn btn-secondary" type="button" data-subtitle-delete-episode="${escapeHtml(episode.id)}" aria-label="删除${escapeHtml(formatEpisode(episode.episodeNo))}导入字幕" title="删除导入字幕"${canDelete ? '' : ' disabled'}>${trashIcon}</button></td></tr>`
    }).join('')
    const pressureRow = detailActionsEnabled ? `<tr data-subtitle-pressure-sample="${SUBTITLE_PRESSURE_SAMPLE_ID}"><td class="subtitle-selection-cell"><input type="checkbox" aria-label="压力测试样本不可选择" disabled></td><td><strong>第 ${String(SUBTITLE_PRESSURE_EPISODE_NO).padStart(2, '0')} 集</strong></td><td>ASR + OCR · 03:00</td><td><span class="badge success">压力测试就绪</span></td><td class="right"><button class="btn btn-secondary" type="button" data-subtitle-open-pressure-sample="true">打开压力样本</button><button class="btn btn-secondary" type="button" data-subtitle-delete-pressure-sample="true" aria-label="压力测试样本不支持删除" title="压力测试样本不支持删除" disabled>${trashIcon}</button></td></tr>` : ''
    listBody.innerHTML = `${rows}${pressureRow}`
    renderListHelper()
    renderSelectionControls()
  }
  const loadList = async (): Promise<void> => {
    const request = ++listRequest
    listLoading = true
    renderList()
    try {
      const [assets, tracks, run] = await Promise.all([window.desktopApi.listSubtitles(dramaId), window.desktopApi.listSubtitleEvidenceTracks(dramaId), window.desktopApi.getLatestSubtitleRecognitionRun(dramaId)])
      if (request !== listRequest) return
      snapshots.clear()
      recognitionRun = run
      episodes.forEach((episode) => snapshots.set(episode.id, {
        episode,
        tracks: tracks.filter((track) => track.episodeId === episode.id),
        assets: assets.filter((asset) => asset.episodeId === episode.id)
      }))
      listLoading = false
      renderList()
      completePrototypeDataRead(document)
    } catch (cause) {
      if (request !== listRequest) return
      listLoading = false
      if (listBody) listBody.innerHTML = `<tr><td colspan="4">字幕资产读取失败：${escapeHtml(cause instanceof Error ? cause.message : '未知错误')}</td></tr>`
      completePrototypeDataRead(document)
    }
  }
  const showDetail = async (episodeId: string): Promise<void> => {
    const episode = episodeById.get(episodeId)
    if (!episode) return
    selectedEpisodeId = episodeId
    modal?.querySelectorAll<HTMLElement>('[data-subtitle-open-settings]').forEach((button) => { button.dataset.subtitleEpisodeId = episodeId })
    delete modal?.dataset.subtitleStress
    const request = ++detailRequest
    let snapshot = snapshots.get(episodeId) ?? { episode, tracks: [], assets: [] }
    const status = renderSubtitleStatus(snapshot.episode, snapshot.tracks, snapshot.assets)
    if (detailTitle) detailTitle.textContent = `${formatEpisode(snapshot.episode.episodeNo)}字幕资产`
    if (detailMeta) detailMeta.textContent = `${renderSubtitleAssetLabel(snapshot.tracks, snapshot.assets)} · 正在读取证据`
    if (monitorEpisode) monitorEpisode.textContent = `${formatEpisode(snapshot.episode.episodeNo)} · 正在读取字幕证据`
    if (evidence) evidence.innerHTML = `${evidenceHead(snapshot.episode)}<div class="r5-evidence-row"><small>读取中</small><div><small>ASR / 导入</small><br><b>正在读取证据</b></div><div><small>OCR</small><br><b>正在读取证据</b></div></div>`
    if (detailAsset) detailAsset.hidden = false
    if (detailEmpty) detailEmpty.hidden = true
    setModal(true)
    showPreview(episode)
    try {
      const [tracks, region, quality] = await Promise.all([
        window.desktopApi.listSubtitleEvidenceTracks(dramaId, episodeId),
        window.desktopApi.getEffectiveSubtitleOcrRegion(dramaId, episodeId),
        window.desktopApi.getSubtitleQualityReport(dramaId, episodeId)
      ])
      if (request !== detailRequest || selectedEpisodeId !== episodeId) return
      snapshot = { ...snapshot, tracks }
      snapshots.set(episodeId, snapshot)
      const audio = asrTrack(tracks)
      const transcripts = textTracks(tracks)
      const picture = visualTrack(tracks)
      const [transcriptEvidence, visualCues, comparisons] = await Promise.all([
        Promise.all(transcripts.map(async (track): Promise<TextEvidence> => ({ label: track.sourceKind === 'import' ? 'ASR（导入）' : 'ASR', cues: await window.desktopApi.listSubtitleEvidenceCues(track.id) }))),
        picture ? window.desktopApi.listSubtitleEvidenceCues(picture.id) : Promise.resolve([]),
        audio && picture ? window.desktopApi.getSubtitleEvidenceComparisons(audio.id, picture.id) : Promise.resolve([])
      ])
      if (request !== detailRequest || selectedEpisodeId !== episodeId) return
      if (failures.get(episodeId)?.kind === 'read') failures.delete(episodeId)
      renderList()
      const resolvedStatus = renderSubtitleStatus(snapshot.episode, snapshot.tracks, snapshot.assets, { executing: executing.has(episodeId), failure: failures.get(episodeId) })
      if (detailMeta) detailMeta.textContent = `${renderSubtitleAssetLabel(snapshot.tracks, snapshot.assets)} · ${resolvedStatus.label}${region ? ' · 固定 OCR 区域' : ''}${quality.evaluationCount > 0 ? ` · ${quality.evaluationCount} 次质量记录` : ''}`
      if (monitorEpisode) monitorEpisode.textContent = `${formatEpisode(snapshot.episode.episodeNo)} · 源片 ${formatRatio(snapshot.episode)} · ${region ? 'OCR 固定区域' : '未设置固定 OCR 区域'}`
      const frame = detailAsset?.querySelector<HTMLElement>('.r5-frame')
      if (frame && snapshot.episode.videoWidth && snapshot.episode.videoHeight) frame.style.aspectRatio = `${snapshot.episode.videoWidth} / ${snapshot.episode.videoHeight}`
      if (evidence) {
        evidence.innerHTML = `${evidenceHead(snapshot.episode)}${evidenceRows(transcriptEvidence, visualCues, comparisons)}`
      }
      const canView = hasReadableMedia(snapshot.episode)
      if (detailAsset) detailAsset.hidden = !canView
      if (detailEmpty) detailEmpty.hidden = canView
      if (!canView && detailEmptyText) detailEmptyText.textContent = `${formatEpisode(snapshot.episode.episodeNo)}当前为${status.label}，暂无可查看的字幕画面。`
    } catch (cause) {
      if (request !== detailRequest || selectedEpisodeId !== episodeId) return
      const message = cause instanceof Error ? cause.message : '未知错误'
      failures.set(episodeId, { kind: 'read', message })
      renderList()
      if (detailMeta) detailMeta.textContent = `证据读取失败：${message}`
      if (monitorEpisode) monitorEpisode.textContent = `${formatEpisode(episode.episodeNo)} · 字幕证据读取失败`
      if (evidence) {
        evidence.innerHTML = `${evidenceHead(episode)}<div class="r5-evidence-row"><small>读取失败</small><div><small>ASR / 导入</small><br><b>证据读取失败</b></div><div><small>OCR</small><br><b>证据读取失败</b><br><span class="status">${escapeHtml(message)}</span></div></div>`
      }
      if (detailAsset) detailAsset.hidden = false
      if (detailEmpty) detailEmpty.hidden = true
    }
  }
  const showPressureSample = (): void => {
    selectedEpisodeId = null
    detailRequest += 1
    if (modal) modal.dataset.subtitleStress = 'true'
    removePreview()
    const { asr, ocr, comparisons } = subtitlePressureSample()
    if (detailTitle) detailTitle.textContent = `第 ${String(SUBTITLE_PRESSURE_EPISODE_NO).padStart(2, '0')} 集字幕资产`
    if (detailMeta) detailMeta.textContent = `ASR + OCR · 03:00 · ${SUBTITLE_PRESSURE_CUE_COUNT} 条字幕片段 · 证据列表独立滚动`
    if (monitorEpisode) monitorEpisode.textContent = `第 ${String(SUBTITLE_PRESSURE_EPISODE_NO).padStart(2, '0')} 集 · 源片 16:9 · OCR 固定区域`
    if (evidence) evidence.innerHTML = `${pressureEvidenceHead(SUBTITLE_PRESSURE_EPISODE_NO, SUBTITLE_PRESSURE_DURATION_SECONDS, SUBTITLE_PRESSURE_CUE_COUNT)}${evidenceRows([{ label: 'ASR', cues: asr }], ocr, comparisons)}`
    if (detailAsset) detailAsset.hidden = false
    if (detailEmpty) detailEmpty.hidden = true
    setModal(true)
  }
  const runRecognition = async (): Promise<void> => {
    if (generating) { announce(document, '字幕识别正在执行，请稍候。'); return }
    generating = true
    let persistedRun: SubtitleRecognitionRun | null = null
    try {
      const latest = await window.desktopApi.getLatestSubtitleRecognitionRun(dramaId)
      if (latest?.status === 'running') { announce(document, `字幕识别仍在执行：${recognitionSummary(latest, episodeById)}`); return }
      const settings = latest?.status === 'interrupted' ? latest.settings : await window.desktopApi.getSubtitleRecognitionSettings(dramaId)
      const usesAsr = settings.recognitionMode !== 'ocr-only'
      const usesOcr = settings.recognitionMode !== 'asr-only'
      let ocrRuntime: LocalOcrRuntimeIdentity | null = null
      if (usesOcr) {
        const availability = await window.desktopApi.getLocalOcrAvailability()
        if (!availability.available) throw new Error(availability.reason ?? '本地 OCR 引擎不可用')
        const runtime = await window.desktopApi.getLocalOcrRuntimeInfo()
        if (!runtime.available) throw new Error(runtime.reason ?? '本地 OCR 引擎自检失败')
        ocrRuntime = { buildId: runtime.buildId, sha256: runtime.sha256 }
        if (settings.language === 'auto') throw new Error('本地 OCR 未实现自动语言检测；请在字幕识别设置中选择“中文”或“中英混合”。')
      }
      let targets: string[]
      let run: SubtitleRecognitionRun
      const explicitTargets = selectedTargets()
      const canResumeInterrupted = latest?.status === 'interrupted' && (!usesOcr || sameOcrRuntime(latest.ocrRuntime, ocrRuntime))
      const failedRunMatchesSettings = explicitTargets.length === 0 && (latest?.status === 'partial' || latest?.status === 'failed') && latest.items.some((item) => item.status === 'failed') && sameRecognitionSettings(latest.settings, settings)
      const staleFailedRun = failedRunMatchesSettings && usesOcr && !sameOcrRuntime(latest?.ocrRuntime ?? null, ocrRuntime)
      const retryFailedOnly = failedRunMatchesSettings && !staleFailedRun
      let skipCompletedStages = false
      if (latest?.status === 'interrupted' && !canResumeInterrupted) {
        const targetNotice = explicitTargets.length > 0 ? `本次将只重新识别已选 ${explicitTargets.length} 集。` : '本次将只建立缺失字幕的新批次。'
        announce(document, latest.ocrRuntime ? `检测到上次字幕识别使用了不同的 OCR runner；旧批次已保留，${targetNotice}` : `检测到上次字幕识别没有记录 OCR runner 身份；旧批次已保留，${targetNotice}`)
      }
      if (canResumeInterrupted) {
        const first = latest.items.find((item) => item.status === 'pending' || item.status === 'interrupted')
        const episode = first ? episodeById.get(first.episodeId) : null
        if (!window.confirm(`检测到上次字幕识别已中断（${recognitionSummary(latest, episodeById)}）。将按原识别设置从${episode ? formatEpisode(episode.episodeNo) : '未完成分集'}继续，且不会重复处理已成功分集。是否继续？`)) return
        run = await window.desktopApi.resumeSubtitleRecognitionRun(latest.id)
        targets = run.items.filter((item) => item.status === 'pending').map((item) => item.episodeId)
        skipCompletedStages = true
      } else if (retryFailedOnly && latest) {
        run = await window.desktopApi.retryFailedSubtitleRecognitionRun(latest.id)
        targets = run.items.filter((item) => item.status === 'pending').map((item) => item.episodeId)
        skipCompletedStages = true
      } else {
        const startSettings = latest?.status === 'interrupted' && usesOcr ? { ...settings, scope: 'missing' as const } : settings
        skipCompletedStages = staleFailedRun
        targets = staleFailedRun && latest
          ? latest.items.filter((item) => item.status === 'failed').map((item) => item.episodeId)
          : retryFailedOnly && latest
          ? latest.items.filter((item) => item.status === 'failed').map((item) => item.episodeId)
          : explicitTargets.length > 0 ? explicitTargets : resolveTargets(startSettings, episodes, snapshots, selectedEpisodeId)
        if (targets.length === 0) throw new Error('当前识别范围内没有可处理的媒体，或“仅缺失”范围内没有需要生成的字幕。')
        if (usesAsr && !window.confirm('将从当前范围的视频提取音频并发送给当前默认 ASR 供应商，可能产生费用。不会上传视频画面。是否继续？')) return
        skipCompletedStages = staleFailedRun
        run = await window.desktopApi.startSubtitleRecognitionRun({ dramaId, settings: startSettings, episodeIds: targets, ocrRuntime })
        skipCompletedStages = retryFailedOnly || staleFailedRun
      }
      persistedRun = run
      recognitionRun = run
      let fulfilled = 0
      const rejected: string[] = []
      for (const episodeId of targets) {
        executing.add(episodeId)
        recognitionRun = await window.desktopApi.markSubtitleRecognitionRunItemRunning(run.id, episodeId)
        announceRecognitionState(dramaId, false)
        failures.delete(episodeId)
        renderList()
        try {
        const episode = snapshots.get(episodeId)?.episode ?? episodeById.get(episodeId)
        const label = formatEpisode(episode?.episodeNo ?? null)
        const currentTracks = skipCompletedStages ? await window.desktopApi.listSubtitleEvidenceTracks(dramaId, episodeId) : []
        const needsAsr = usesAsr && (!skipCompletedStages || !asrTrack(currentTracks))
        const needsOcr = usesOcr && (!skipCompletedStages || !visualTrack(currentTracks))
        if (needsAsr) await window.desktopApi.extractDefaultAsrSubtitleTrack({ dramaId, episodeId, language: settings.language, mode: settings.asrMode })
        if (needsOcr) {
          const region = settings.ocrMode === 'auto-region' ? null : await window.desktopApi.getEffectiveSubtitleOcrRegion(dramaId, episodeId)
          if (settings.ocrMode !== 'auto-region' && !region) throw new Error(`${label}未设置固定 OCR 区域。`)
          await window.desktopApi.extractIndependentLocalOcrSubtitleTrack({ dramaId, episodeId, language: settings.language === 'zh-en' ? 'chi_sim+eng' : 'chi_sim', regionMode: settings.ocrMode === 'auto-region' ? 'auto-region' : 'fixed-region' })
        }
        fulfilled += 1
        recognitionRun = await window.desktopApi.markSubtitleRecognitionRunItemSucceeded(run.id, episodeId)
        } catch (cause) { const message = cause instanceof Error ? cause.message : '未知错误'; failures.set(episodeId, { kind: 'execution', message }); rejected.push(message); recognitionRun = await window.desktopApi.markSubtitleRecognitionRunItemFailed(run.id, episodeId, message) } finally { executing.delete(episodeId); announceRecognitionState(dramaId, false); renderList() }
      }
      recognitionRun = await window.desktopApi.finishSubtitleRecognitionRun(run.id)
      await loadList()
      announceRecognitionState(dramaId, true)
      if (fulfilled === 0) throw new Error(rejected[0] ?? '字幕识别未生成任何证据')
      const modeLabel = settings.recognitionMode === 'asr-only' ? '仅 ASR' : settings.recognitionMode === 'ocr-only' ? '仅 OCR' : 'ASR + OCR'
      const retryNotice = retryFailedOnly ? '已仅重试失败项；' : ''
      announce(document, rejected.length === 0 ? `${retryNotice}${modeLabel}识别已完成，共处理 ${fulfilled} 集。` : `${retryNotice}${modeLabel}完成 ${fulfilled} 集；${rejected.length} 集失败，请查看实际条件。`)
      document.dispatchEvent(new CustomEvent('subtitle-assets:changed'))
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '未知错误'
      if (persistedRun && recognitionRun?.status === 'running') {
        try {
          recognitionRun = await window.desktopApi.interruptSubtitleRecognitionRun(persistedRun.id, message)
          renderList()
        } catch {
          // The next app start still converts any surviving running run to interrupted.
        }
      }
      announce(document, `字幕识别未执行：${message}`)
    } finally { generating = false }
  }

  const deleteEpisodeSubtitles = async (episodeId: string): Promise<void> => {
    const snapshot = snapshots.get(episodeId)
    if (!snapshot || snapshot.assets.length === 0) { announce(document, '当前剧集没有可删除的导入字幕。'); return }
    if (!window.confirm(`删除${formatEpisode(snapshot.episode.episodeNo)}的 ${snapshot.assets.length} 份导入字幕？\n只删除本软件内字幕数据，不删除 SRT、视频、ASR 或 OCR。`)) return
    deleting.add(episodeId)
    renderList()
    try {
      const deletedCount = await window.desktopApi.removeSubtitlesByEpisode(dramaId, episodeId)
      snapshots.delete(episodeId)
      announce(document, `${formatEpisode(snapshot.episode.episodeNo)}的 ${deletedCount} 份导入字幕已删除；原 SRT、视频、ASR 和 OCR 未修改。`)
    } catch (cause) {
      announce(document, `删除导入字幕失败：${cause instanceof Error ? cause.message : '未知错误'}`)
    } finally {
      deleting.delete(episodeId)
      document.dispatchEvent(new CustomEvent('subtitle-assets:changed'))
    }
  }

  document.addEventListener('click', (event) => {
    if (!isElementTarget(event.target)) return
    const selectAll = event.target.closest<HTMLInputElement>('[data-subtitle-select-all]')
    if (selectAll) {
      event.stopImmediatePropagation()
      selectableEpisodes().forEach((episode) => selectAll.checked ? selectedEpisodeIds.add(episode.id) : selectedEpisodeIds.delete(episode.id))
      renderList()
      return
    }
    const selectionToggle = event.target.closest<HTMLInputElement>('[data-subtitle-select-episode]')
    if (selectionToggle) {
      event.stopImmediatePropagation()
      const episodeId = selectionToggle.dataset.subtitleSelectEpisode
      if (episodeId) selectionToggle.checked ? selectedEpisodeIds.add(episodeId) : selectedEpisodeIds.delete(episodeId)
      renderList()
      return
    }
    if (event.target.closest('[data-subtitle-close-asset]')) { event.preventDefault(); event.stopImmediatePropagation(); setModal(false); return }
    if (event.target.closest('[data-subtitle-open-pressure-sample]')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (detailActionsEnabled) showPressureSample()
      return
    }
    const deleteButton = event.target.closest<HTMLButtonElement>('[data-subtitle-delete-episode]')
    if (deleteButton) { event.preventDefault(); event.stopImmediatePropagation(); void deleteEpisodeSubtitles(deleteButton.dataset.subtitleDeleteEpisode ?? ''); return }
    const rowButton = event.target.closest<HTMLButtonElement>('[data-subtitle-open-episode]')
    if (rowButton) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (detailActionsEnabled) void showDetail(rowButton.dataset.subtitleOpenEpisode ?? '')
      return
    }
    if (event.target.closest('[data-subtitle-generate]')) { event.preventDefault(); event.stopImmediatePropagation(); void runRecognition() }
  }, true)
  document.addEventListener('subtitle-assets:changed', () => {
    void loadList()
    if (selectedEpisodeId && modal?.classList.contains('open')) void showDetail(selectedEpisodeId)
  })
  const onRecognitionStateChanged = (event: Event): void => {
    const detail = (event as CustomEvent<{ dramaId?: string; finished?: boolean }>).detail
    if (detail?.dramaId !== dramaId) return
    if (detail.finished) void loadList()
    else renderList()
  }
  window.addEventListener('subtitle-recognition-state-changed', onRecognitionStateChanged)
  document.defaultView?.addEventListener('unload', () => window.removeEventListener('subtitle-recognition-state-changed', onRecognitionStateChanged), { once: true })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !modal?.classList.contains('open')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    setModal(false)
  }, true)
  void loadList()
}

const resolveTargets = (settings: SubtitleRecognitionSettings, episodes: EpisodeAsset[], snapshots: Map<string, EpisodeSnapshot>, selectedEpisodeId: string | null): string[] => {
  if (settings.scope === 'current') return selectedEpisodeId && hasReadableMedia(snapshots.get(selectedEpisodeId)?.episode ?? episodes.find((episode) => episode.id === selectedEpisodeId) ?? episodes[0]) ? [selectedEpisodeId] : []
  return episodes.filter((episode) => {
    if (!hasReadableMedia(episode)) return false
    const tracks = snapshots.get(episode.id)?.tracks ?? []
    if (settings.scope === 'all') return true
    if (settings.recognitionMode === 'asr-only') return !asrTrack(tracks)
    if (settings.recognitionMode === 'ocr-only') return !visualTrack(tracks)
    return !asrTrack(tracks) || !visualTrack(tracks)
  }).map((episode) => episode.id)
}
