import type { EpisodeAsset, SubtitleAsset, SubtitleEvidenceComparison, SubtitleEvidenceCue, SubtitleEvidenceTrack, SubtitleRecognitionSettings } from '../../../shared/contracts.js'

type Props = { document: Document; dramaId: string; episodes: EpisodeAsset[] }
type EpisodeSnapshot = { episode: EpisodeAsset; tracks: SubtitleEvidenceTrack[]; assets: SubtitleAsset[] }
type EpisodeFailure = { kind: 'read' | 'execution'; message: string }
type StatusOptions = { loading?: boolean; executing?: boolean; failure?: EpisodeFailure }
type ElementTarget = { closest: <T extends Element = Element>(selector: string) => T | null }

const isElementTarget = (target: EventTarget | null): target is EventTarget & ElementTarget => Boolean(target && typeof (target as { closest?: unknown }).closest === 'function')
const formatEpisode = (episodeNo: number | null): string => `第 ${String(episodeNo ?? '—').padStart(2, '0')} 集`
const formatRatio = (episode: EpisodeAsset): string => episode.videoWidth && episode.videoHeight ? `${episode.videoWidth}:${episode.videoHeight}` : '画幅待读取'
const announce = (document: Document, message: string): void => {
  const toast = document.getElementById('toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  window.setTimeout(() => toast.classList.remove('show'), 2200)
}
const hasReadableMedia = (episode: EpisodeAsset): boolean => Boolean(episode.sourcePath.trim()) && !['missing', 'unreadable', 'deleted'].includes(episode.status)
const visualTrack = (tracks: SubtitleEvidenceTrack[]): SubtitleEvidenceTrack | undefined => tracks.find((track) => track.sourceKind === 'ocr') ?? tracks.find((track) => track.sourceKind === 'import')
const asrTrack = (tracks: SubtitleEvidenceTrack[]): SubtitleEvidenceTrack | undefined => tracks.find((track) => track.sourceKind === 'asr')
const renderStatus = (snapshot: EpisodeSnapshot, options: StatusOptions = {}): { label: string; tone: 'success' | 'warning' | 'danger'; canView: boolean } => {
  if (options.failure) return { label: options.failure.kind === 'execution' ? '执行失败' : '读取失败', tone: 'danger', canView: false }
  if (options.executing) return { label: '识别中', tone: 'warning', canView: false }
  if (options.loading) return { label: '读取中', tone: 'warning', canView: false }
  if (!hasReadableMedia(snapshot.episode)) return { label: '媒体缺失', tone: 'danger', canView: false }
  const hasAsr = Boolean(asrTrack(snapshot.tracks))
  const hasVisual = Boolean(visualTrack(snapshot.tracks))
  if (snapshot.tracks.some((track) => track.sourceKind === 'resolved')) return { label: '已校验', tone: 'success', canView: true }
  if (hasAsr && hasVisual) return { label: '待校验', tone: 'warning', canView: true }
  if (hasAsr || hasVisual) return { label: '待校验', tone: 'warning', canView: true }
  if (snapshot.assets.length > 0) return { label: '待分集校验', tone: 'warning', canView: false }
  return { label: '未导入', tone: 'warning', canView: false }
}
const renderAssetLabel = (snapshot: EpisodeSnapshot): string => {
  const labels = snapshot.tracks.map((track) => track.sourceKind === 'asr' ? 'ASR' : track.sourceKind === 'ocr' ? 'OCR' : track.sourceKind === 'import' ? '导入字幕' : '校对轨')
  if (labels.length > 0) return [...new Set(labels)].join(' + ')
  return snapshot.assets.length > 0 ? `剧目级导入字幕（${snapshot.assets.length}）` : '—'
}
const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character)
const formatTime = (seconds: number): string => {
  const minute = Math.floor(seconds / 60)
  const second = Math.floor(seconds % 60)
  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${Math.floor((seconds % 1) * 10)}`
}
const evidenceRows = (asr: SubtitleEvidenceCue[], visual: SubtitleEvidenceCue[], comparisons: SubtitleEvidenceComparison[]): string => {
  const count = Math.min(12, Math.max(asr.length, visual.length))
  if (count === 0) return '<div class="r5-evidence-row"><small>—</small><div><small>状态</small><br><b>暂无可用证据</b></div><div><small>下一步</small><br><b>导入字幕或等待 ASR 轨可用</b></div></div>'
  return Array.from({ length: count }, (_, index) => {
    const audio = asr[index]
    const picture = visual[index]
    const comparison = comparisons[index]
    const conclusion = comparison?.conclusion === 'consistent' ? '一致' : comparison?.conclusion === 'different' ? '画面与音频不同' : comparison?.conclusion === 'needs_review' ? '待校验' : audio && !picture ? '仅音频' : picture && !audio ? '仅画面' : '待校验'
    const time = audio?.startSeconds ?? picture?.startSeconds
    return `<div class="r5-evidence-row"><small>${time === undefined ? '—' : formatTime(time)}</small><div><small>ASR</small><br><b>${escapeHtml(audio?.text ?? '—')}</b></div><div><small>OCR / 导入</small><br><b>${escapeHtml(picture?.text ?? '—')}</b><br><span class="status">${conclusion}</span></div></div>`
  }).join('')
}

export const bindSubtitleAssetRuntime = ({ document, dramaId, episodes }: Props): void => {
  if (document.body.dataset.subtitleRuntimeBound === 'true') return
  document.body.dataset.subtitleRuntimeBound = 'true'
  const listBody = document.querySelector<HTMLTableSectionElement>('#subtitleListPanel tbody')
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
  const executing = new Set<string>()
  let listRequest = 0
  let detailRequest = 0
  let selectedEpisodeId: string | null = null
  let generating = false
  let listLoading = true

  const setModal = (open: boolean): void => {
    if (!modal) return
    modal.classList.toggle('open', open)
    modal.setAttribute('aria-hidden', open ? 'false' : 'true')
  }
  const renderList = (): void => {
    if (!listBody) return
    listBody.innerHTML = episodes.map((episode) => {
      const snapshot = snapshots.get(episode.id) ?? { episode, tracks: [], assets: [] }
      const status = renderStatus(snapshot, { loading: listLoading, executing: executing.has(episode.id), failure: failures.get(episode.id) })
      const label = renderAssetLabel(snapshot)
      const action = status.canView ? '查看画面' : '查看状态'
      return `<tr data-subtitle-episode-id="${escapeHtml(episode.id)}"><td><strong>${formatEpisode(episode.episodeNo)}</strong></td><td>${escapeHtml(label)}</td><td><span class="badge ${status.tone}">${status.label}</span></td><td class="right"><button class="btn btn-secondary" type="button" data-subtitle-open-episode="${escapeHtml(episode.id)}">${action}</button></td></tr>`
    }).join('')
  }
  const loadList = async (): Promise<void> => {
    const request = ++listRequest
    listLoading = true
    renderList()
    try {
      const [assets, tracks] = await Promise.all([window.desktopApi.listSubtitles(dramaId), window.desktopApi.listSubtitleEvidenceTracks(dramaId)])
      if (request !== listRequest) return
      const globalAssets = assets.filter((asset) => asset.episodeId === null)
      snapshots.clear()
      episodes.forEach((episode) => snapshots.set(episode.id, {
        episode,
        tracks: tracks.filter((track) => track.episodeId === episode.id),
        assets: assets.filter((asset) => asset.episodeId === episode.id).concat(globalAssets)
      }))
      listLoading = false
      renderList()
    } catch (cause) {
      if (request !== listRequest) return
      listLoading = false
      if (listBody) listBody.innerHTML = `<tr><td colspan="4">字幕资产读取失败：${escapeHtml(cause instanceof Error ? cause.message : '未知错误')}</td></tr>`
    }
  }
  const showDetail = async (episodeId: string): Promise<void> => {
    const episode = episodeById.get(episodeId)
    if (!episode) return
    selectedEpisodeId = episodeId
    const request = ++detailRequest
    let snapshot = snapshots.get(episodeId) ?? { episode, tracks: [], assets: [] }
    const status = renderStatus(snapshot)
    if (detailTitle) detailTitle.textContent = `${formatEpisode(snapshot.episode.episodeNo)}字幕资产`
    if (detailMeta) detailMeta.textContent = `${renderAssetLabel(snapshot)} · 正在读取证据`
    if (detailAsset) detailAsset.hidden = false
    if (detailEmpty) detailEmpty.hidden = true
    setModal(true)
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
      const picture = visualTrack(tracks)
      const [audioCues, visualCues, comparisons] = await Promise.all([
        audio ? window.desktopApi.listSubtitleEvidenceCues(audio.id) : Promise.resolve([]),
        picture ? window.desktopApi.listSubtitleEvidenceCues(picture.id) : Promise.resolve([]),
        audio && picture ? window.desktopApi.getSubtitleEvidenceComparisons(audio.id, picture.id) : Promise.resolve([])
      ])
      if (request !== detailRequest || selectedEpisodeId !== episodeId) return
      failures.delete(episodeId)
      renderList()
      const resolvedStatus = renderStatus(snapshot, { executing: executing.has(episodeId), failure: failures.get(episodeId) })
      if (detailMeta) detailMeta.textContent = `${renderAssetLabel(snapshot)} · ${resolvedStatus.label}${region ? ' · 固定 OCR 区域' : ''}${quality.evaluationCount > 0 ? ` · ${quality.evaluationCount} 次质量记录` : ''}`
      if (monitorEpisode) monitorEpisode.textContent = `${formatEpisode(snapshot.episode.episodeNo)} · 源片 ${formatRatio(snapshot.episode)} · ${region ? 'OCR 固定区域' : '未设置固定 OCR 区域'}`
      const frame = detailAsset?.querySelector<HTMLElement>('.r5-frame')
      if (frame && snapshot.episode.videoWidth && snapshot.episode.videoHeight) frame.style.aspectRatio = `${snapshot.episode.videoWidth} / ${snapshot.episode.videoHeight}`
      if (evidence) {
        const head = evidence.querySelector('.r5-evidence-head')?.outerHTML ?? '<div class="r5-evidence-head"><b>对齐差异与校验结论</b><span>原始证据不可覆盖</span></div>'
        evidence.innerHTML = `${head}${evidenceRows(audioCues, visualCues, comparisons)}`
      }
      const canView = resolvedStatus.canView && hasReadableMedia(snapshot.episode)
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
        const head = evidence.querySelector('.r5-evidence-head')?.outerHTML ?? '<div class="r5-evidence-head"><b>对齐差异与校验结论</b><span>原始证据不可覆盖</span></div>'
        evidence.innerHTML = `${head}<div class="r5-evidence-row"><small>读取失败</small><div><small>ASR</small><br><b>证据读取失败</b></div><div><small>OCR / 导入</small><br><b>证据读取失败</b><br><span class="status">${escapeHtml(message)}</span></div></div>`
      }
      if (detailAsset) detailAsset.hidden = false
      if (detailEmpty) detailEmpty.hidden = true
    }
  }
  const runLocalOcr = async (): Promise<void> => {
    if (generating) { announce(document, '本地 OCR 正在执行，请稍候。'); return }
    generating = true
    try {
      const [settings, availability] = await Promise.all([window.desktopApi.getSubtitleRecognitionSettings(dramaId), window.desktopApi.getLocalOcrAvailability()])
      if (!availability.available) throw new Error(availability.reason ?? '本地 OCR 引擎不可用')
      if (settings.ocrMode !== 'fixed-bottom') throw new Error('请在字幕识别设置中选择“固定底部字幕区域”后再执行本地 OCR。')
      if (settings.language === 'auto') throw new Error('本地 OCR 未实现自动语言检测；请在字幕识别设置中选择“中文”或“中英混合”。')
      const targets = resolveTargets(settings, episodes, snapshots, selectedEpisodeId)
      if (targets.length === 0) throw new Error('当前识别范围内没有具备 ASR 轨的可处理剧集。')
      let fulfilled = 0
      const rejected: string[] = []
      for (const episodeId of targets) {
        executing.add(episodeId)
        failures.delete(episodeId)
        renderList()
        try {
        const track = asrTrack(snapshots.get(episodeId)?.tracks ?? [])
        if (!track) throw new Error(`${formatEpisode(snapshots.get(episodeId)?.episode.episodeNo ?? null)}缺少 ASR 轨`)
        const region = await window.desktopApi.getEffectiveSubtitleOcrRegion(dramaId, episodeId)
        if (!region) throw new Error(`${formatEpisode(snapshots.get(episodeId)?.episode.episodeNo ?? null)}未设置固定 OCR 区域。`)
        await window.desktopApi.extractLocalOcrSubtitleTrack({ asrTrackId: track.id, language: settings.language === 'zh-en' ? 'chi_sim+eng' : 'chi_sim' })
        fulfilled += 1
        } catch (cause) { const message = cause instanceof Error ? cause.message : '未知错误'; failures.set(episodeId, { kind: 'execution', message }); rejected.push(message) } finally { executing.delete(episodeId); renderList() }
      }
      if (fulfilled === 0) throw new Error(rejected[0] ?? '本地 OCR 未生成任何证据')
      announce(document, rejected.length === 0 ? `本地 OCR 已完成，新增 ${fulfilled} 条 OCR 证据。` : `本地 OCR 完成 ${fulfilled} 集；${rejected.length} 集失败，请查看实际条件。`)
      document.dispatchEvent(new CustomEvent('subtitle-assets:changed'))
    } catch (cause) { announce(document, `本地 OCR 未执行：${cause instanceof Error ? cause.message : '未知错误'}`) } finally { generating = false }
  }

  document.addEventListener('click', (event) => {
    if (!isElementTarget(event.target)) return
    if (event.target.closest('[data-subtitle-close-asset]')) { event.preventDefault(); event.stopImmediatePropagation(); setModal(false); return }
    const rowButton = event.target.closest<HTMLButtonElement>('[data-subtitle-open-episode]')
    if (rowButton) { event.preventDefault(); event.stopImmediatePropagation(); void showDetail(rowButton.dataset.subtitleOpenEpisode ?? ''); return }
    if (event.target.closest('[data-subtitle-generate]')) { event.preventDefault(); event.stopImmediatePropagation(); void runLocalOcr() }
  }, true)
  document.addEventListener('subtitle-assets:changed', () => {
    void loadList()
    if (selectedEpisodeId && modal?.classList.contains('open')) void showDetail(selectedEpisodeId)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !modal?.classList.contains('open')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    setModal(false)
  }, true)
  void loadList()
}

const resolveTargets = (settings: SubtitleRecognitionSettings, episodes: EpisodeAsset[], snapshots: Map<string, EpisodeSnapshot>, selectedEpisodeId: string | null): string[] => {
  if (settings.scope === 'current') return selectedEpisodeId && hasReadableMedia(snapshots.get(selectedEpisodeId)?.episode ?? episodes.find((episode) => episode.id === selectedEpisodeId) ?? episodes[0]) && asrTrack(snapshots.get(selectedEpisodeId)?.tracks ?? []) ? [selectedEpisodeId] : []
  return episodes.filter((episode) => {
    if (!hasReadableMedia(episode)) return false
    const tracks = snapshots.get(episode.id)?.tracks ?? []
    if (!asrTrack(tracks)) return false
    return settings.scope === 'all' || !visualTrack(tracks)
  }).map((episode) => episode.id)
}
