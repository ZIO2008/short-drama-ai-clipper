import type { ClipCandidate, ClipCandidateStatus, ClipEpisodeStatus, ClipExportConfig, ClipExportProgress, EpisodeAsset, MaterialSummary, PackagingConfig } from '../../../shared/contracts.js'

type Props = { document: Document; dramaId: string; episodes: EpisodeAsset[]; onOpenCandidate: (candidate: ClipCandidate) => void }
type Filter = 'all' | 'pending' | 'confirmed' | 'exported'
type ReportFilter = 'all' | 'exception'
type Cleanup = () => void

const WINDOW_SIZE = 20
const label = (episode: EpisodeAsset): string => `第 ${String(episode.episodeNo ?? episode.sortOrder + 1).padStart(2, '0')} 集`
const time = (seconds: number): string => `${seconds.toFixed(1)} 秒`
const sourceRange = (candidate: ClipCandidate): string => `${candidate.startSeconds.toFixed(1)} — ${candidate.endSeconds.toFixed(1)}`
const displayStatus = (status: ClipCandidateStatus): string => ({ pending_review: '待确认', editing: '待确认', confirmed: '已确认', exporting: '导出中', exported: '已导出', failed: '异常' })[status]
const reportItemStatus = (status: 'exported' | 'failed' | 'cancelled' | 'not_output'): string => ({ exported: '已导出', failed: '失败', cancelled: '已取消', not_output: '未输出' })[status]
const batchStatus = (status: 'running' | 'completed' | 'cancelled' | 'failed'): string => ({ running: '进行中', completed: '已完成', cancelled: '已取消', failed: '有失败' })[status]
const isDeletable = (status: ClipCandidateStatus): boolean => ['pending_review', 'editing', 'confirmed', 'failed'].includes(status)
const productionStatus = (status: ClipEpisodeStatus['productionStatus']): string => ({ ready_to_generate: '未生成', generating: '生成中', pending_confirmation: '待确认', confirmed: '已确认', exporting: '导出中', exported: '已导出', failed: '异常', missing_media: '媒体缺失' })[status]
const candidateMatches = (candidate: ClipCandidate, filter: Filter, query: string): boolean => (filter === 'pending' && !['pending_review', 'editing'].includes(candidate.status)) || (filter === 'confirmed' && candidate.status !== 'confirmed') || (filter === 'exported' && candidate.status !== 'exported') ? false : !query || `${candidate.id} ${candidate.startSeconds.toFixed(1)} ${candidate.endSeconds.toFixed(1)}`.toLowerCase().includes(query)
const element = <T extends keyof HTMLElementTagNameMap>(document: Document, name: T, className?: string): HTMLElementTagNameMap[T] => { const node = document.createElement(name); if (className) node.className = className; return node }
const setText = (node: Element | null, value: string): void => { if (node) node.textContent = value }
const eventElement = (target: EventTarget | null): Element | null => target !== null && typeof (target as Element).closest === 'function' ? target as Element : null
const setModal = (document: Document, id: string, open: boolean): void => { const modal = document.getElementById(id); if (!modal) return; modal.classList.toggle('open', open); modal.setAttribute('aria-hidden', String(!open)); if (open) modal.removeAttribute('inert'); else modal.setAttribute('inert', '') }
const badge = (document: Document, status: string): HTMLSpanElement => { const tone = ['已导出', '已确认'].includes(status) ? 'success' : ['异常', '媒体缺失'].includes(status) ? 'danger' : 'warning'; const node = element(document, 'span', `badge ${tone}`); node.textContent = status; return node }
const selectedValue = (document: Document, id: string): string => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? ''
const activeQuality = (document: Document): 'original' | 'bitrate' | 'size' => document.querySelector<HTMLElement>('#exportModal [data-quality-mode].active')?.dataset.qualityMode as 'original' | 'bitrate' | 'size' ?? 'original'
const selectedAspect = (document: Document): 'portrait' | 'landscape' => document.querySelector<HTMLElement>('#packagingModal [data-package-aspect].active')?.dataset.packageAspect === 'landscape' ? 'landscape' : 'portrait'
const frameRate = (value: string): 'source' | number => value === '跟随原片' ? 'source' : Number.parseFloat(value)
const packaging = (document: Document): PackagingConfig => ({ aspect: selectedAspect(document), preset: ({ 剧目默认方案: 'default', 冲突前置方案: 'conflict', 纯净画面方案: 'clean' } as Record<string, PackagingConfig['preset']>)[selectedValue(document, 'packagePreset')] ?? 'default', title: selectedValue(document, 'packageTitleInput').trim(), titlePosition: selectedValue(document, 'packageTitlePosition').startsWith('顶部') ? 'top' : 'bottom', prompt: selectedValue(document, 'packagePromptInput').trim(), promptPosition: selectedValue(document, 'packagePromptPosition').startsWith('左侧') ? 'left' : 'right', badge: ({ 热播中: '热播中', 热门短剧: '热门短剧', 爆款推荐: '爆款推荐', 不显示: 'none' } as Record<string, PackagingConfig['badge']>)[selectedValue(document, 'packageBadge')] ?? 'none', titleSize: selectedValue(document, 'packageTitleSize') as PackagingConfig['titleSize'], titleTone: selectedValue(document, 'packageTitleTone') as PackagingConfig['titleTone'], promptStyle: selectedValue(document, 'packagePromptStyle') as PackagingConfig['promptStyle'], overlay: selectedValue(document, 'packageOverlay') as PackagingConfig['overlay'] })
const summaryCounts = (items: readonly ClipCandidate[]) => ({ confirmed: items.filter((item) => ['confirmed', 'exporting', 'exported'].includes(item.status)).length, exported: items.filter((item) => item.status === 'exported').length, pendingExport: items.filter((item) => item.status === 'confirmed').length, review: items.filter((item) => ['pending_review', 'editing', 'failed'].includes(item.status)).length })
const setSummaryValues = (root: Element | null, values: readonly (number | string)[], selector = ':scope > div > b'): void => root?.querySelectorAll<HTMLElement>(selector).forEach((node, index) => { if (index < values.length) node.textContent = String(values[index]) })
const configSummary = (batch: NonNullable<Awaited<ReturnType<typeof window.desktopApi.getLatestClipExportBatch>>>): string => { const config = batch.config; if (!config) return '历史批次配置不可用'; const quality = config.qualityMode === 'bitrate' ? `${config.bitrateKbps ?? '—'} kbps` : config.qualityMode === 'size' ? `${config.targetSizeMb ?? '—'} MB` : config.encoding; const fps = config.fps === 'source' || config.fps === undefined ? '跟随原片 FPS' : `${config.fps} FPS`; return `${quality} · ${config.outputSize} · ${fps} · ${config.subtitleStrategy === 'none' ? '无字幕' : config.subtitleStrategy === 'soft' ? '软字幕' : '烧录字幕'}` }
const sourceDirectory = (sourcePath: string): string => sourcePath.replace(/[\\/][^\\/]*$/, '')
const defaultClipOutputDirectory = (episodes: readonly EpisodeAsset[], candidates: readonly ClipCandidate[]): string => {
  const candidate = candidates.find((item) => item.status === 'confirmed' || item.status === 'exported')
  const episode = candidate ? episodes.find((item) => item.id === candidate.episodeId) : undefined
  return episode?.sourcePath ? `${sourceDirectory(episode.sourcePath)}\\切片` : ''
}

export const bindOriginalClipPoolReportRuntime = ({ document, dramaId, episodes: sourceEpisodes, onOpenCandidate }: Props): Cleanup => {
  if (document.body.dataset.clipPoolReportRuntimeBound === 'true') return () => undefined
  document.body.dataset.clipPoolReportRuntimeBound = 'true'
  const episodes = [...sourceEpisodes].sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)); const pool = document.getElementById('screen-clip-pool'); const report = document.getElementById('screen-clip-report')
  if (!pool && !report) return () => undefined
  let candidates: ClipCandidate[] = []; let statuses = new Map<string, ClipEpisodeStatus>(); let materials: MaterialSummary[] = []; let latestBatch: Awaited<ReturnType<typeof window.desktopApi.getLatestClipExportBatch>> = null
  let selectedEpisodeId = episodes[0]?.id ?? null; let reportEpisodeId = episodes[0]?.id ?? null; let filter: Filter = 'all'; let reportFilter: ReportFilter = 'all'; let query = ''; let page = 0; let loading = true; let loadError: string | null = null; let exportId: string | null = null; let exportEpoch = 0; let exportTimer: number | null = null; let exportDirectory = ''; let exportSelection = new Set<string>(); let requestId = 0; let disposed = false
  const selectedExportCandidates = (): ClipCandidate[] => candidates.filter((candidate) => exportSelection.has(candidate.id) && ['confirmed', 'exported'].includes(candidate.status))
  const reportEntries = () => latestBatch?.items.map((item) => { const existing = candidates.find((candidate) => candidate.id === item.candidateId); const candidate = existing ?? (item.episodeId ? { id: item.candidateId, episodeId: item.episodeId, startSeconds: item.startSeconds ?? 0, endSeconds: item.endSeconds ?? item.startSeconds ?? 0, status: item.status === 'exported' ? 'exported' : item.status === 'failed' ? 'failed' : 'confirmed', reason: item.reason } as ClipCandidate : undefined); return { item, candidate, material: item.materialId ? materials.find((material) => material.id === item.materialId) : undefined } }) ?? []
  const reportCandidates = (): ClipCandidate[] => reportEntries().flatMap(({ candidate }) => candidate ? [candidate] : [])
  const renderPoolSummary = (): void => { setSummaryValues(pool?.querySelector('.clip-inspector-stat') ?? null, Object.values(summaryCounts(candidates))) }
  const renderReportTaskSummary = (state: string): void => { const root = report?.querySelector('.clip-task-summary') ?? null; const entries = reportEntries(); const knownEpisodes = new Set(entries.flatMap(({ candidate }) => candidate ? [candidate.episodeId] : [])); setSummaryValues(root, [knownEpisodes.size + (entries.some(({ candidate }) => !candidate) ? 1 : 0), entries.filter(({ item }) => item.status === 'exported').length, entries.filter(({ item }) => item.status === 'failed').length, entries.filter(({ item }) => item.status === 'cancelled' || item.status === 'not_output').length], ':scope > div:not(.clip-task-summary-label) > b'); setText(root?.querySelector('.clip-task-summary-label small') ?? null, state) }
  const showMessage = (scope: Element | null, message: string): void => { if (!scope) return; const empty = element(document, 'div', 'clip-board-empty'); const copy = element(document, 'div'); const heading = element(document, 'b'); heading.textContent = message; copy.append(heading); empty.append(copy); scope.replaceChildren(empty) }
  const renderEpisodes = (scope: Element | null, activeId: string | null, attribute: string, batchOnly = false): void => { if (!scope) return; scope.replaceChildren(); const batchIds = new Set(reportCandidates().map((candidate) => candidate.episodeId)); for (const episode of episodes.filter((item) => !batchOnly || batchIds.has(item.id))) { const button = element(document, 'button', `clip-episode-row${episode.id === activeId ? ' active' : ''}`); button.type = 'button'; button.dataset[attribute] = episode.id; const number = element(document, 'span', 'num'); number.textContent = String(episode.episodeNo ?? episode.sortOrder + 1).padStart(2, '0'); const copy = element(document, 'span'); const title = element(document, 'b'); title.textContent = label(episode); const small = element(document, 'small'); const state = statuses.get(episode.id); small.textContent = state ? `${productionStatus(state.productionStatus)} · ${state.candidateCount} 个候选` : loadError ?? '正在读取状态'; copy.append(title, small); button.append(number, copy); scope.append(button) } }
  const renderPool = (): void => { if (!pool) return; renderPoolSummary(); const rows = document.getElementById('clipCandidateRows'); const title = document.getElementById('clipPoolTitle'); const meta = document.getElementById('clipPoolWindowMeta'); renderEpisodes(document.getElementById('clipCandidateEpisodes'), selectedEpisodeId, 'clipCandidateEpisode'); const episode = episodes.find((item) => item.id === selectedEpisodeId); if (!rows || !title || !meta || !episode) return; title.textContent = `${label(episode)}候选`; if (loading) { meta.textContent = '正在读取真实候选'; showMessage(rows, '正在读取真实候选'); return }; if (loadError) { setSummaryValues(pool.querySelector('.clip-inspector-stat'), ['—', '—', '—', '—']); meta.textContent = '候选读取失败'; showMessage(rows, loadError); return }; if (!episode.sourcePath || episode.durationSeconds === null) { meta.textContent = '源媒体缺失'; showMessage(rows, '源媒体缺失，请返回剧目资产重新关联。'); return }; const all = candidates.filter((candidate) => candidate.episodeId === episode.id); const visible = all.filter((candidate) => candidateMatches(candidate, filter, query)); if (all.length === 0) { meta.textContent = '本集尚未生成真实候选'; showMessage(rows, '本集尚未生成真实候选'); return }; if (visible.length === 0) { meta.textContent = '没有匹配候选'; showMessage(rows, '没有匹配当前筛选或搜索的候选'); return }; const pages = Math.max(1, Math.ceil(visible.length / WINDOW_SIZE)); page = Math.min(page, pages - 1); meta.textContent = `${visible.length} 个匹配候选 · 当前窗口 ${page + 1} / ${pages}`; rows.replaceChildren(); const summary = element(document, 'div', 'clip-board-summary'); summary.textContent = `${label(episode)} · 全部候选均保留独立源时间码`; rows.append(summary); for (const candidate of visible.slice(page * WINDOW_SIZE, (page + 1) * WINDOW_SIZE)) { const row = element(document, 'div', 'clip-candidate-list-row'); const id = element(document, 'span', 'num'); id.textContent = `C-${candidate.id.slice(0, 8)}`; const source = element(document, 'span'); source.append(document.createTextNode(sourceRange(candidate))); const small = element(document, 'small'); small.textContent = '源片时间码 · 独立输出'; source.append(small); const duration = element(document, 'span', 'clip-candidate-duration'); duration.textContent = time(candidate.endSeconds - candidate.startSeconds); const open = element(document, 'button', 'btn btn-secondary clip-list-action'); open.type = 'button'; open.dataset.clipOpenCandidate = candidate.id; open.textContent = '打开'; row.append(id, source, duration, badge(document, displayStatus(candidate.status)), open); rows.append(row) }; const actions = element(document, 'div', 'clip-window-actions'); for (const [direction, copy] of [['prev', '上一窗口'], ['next', '下一窗口']] as const) { const button = element(document, 'button', 'btn btn-secondary'); button.type = 'button'; button.dataset.clipWindow = direction; button.disabled = direction === 'prev' ? page === 0 : page >= pages - 1; button.textContent = copy; actions.append(button) }; rows.append(actions) }
  const renderReport = (): void => { if (!report) return; const rows = document.getElementById('clipReportRows'); const title = document.getElementById('clipReportTitle'); const meta = document.getElementById('clipReportMeta'); const summary = document.getElementById('clipReportSummary'); if (!rows || !title || !meta || !summary) return; if (loading) { renderReportTaskSummary('正在读取真实完成批次'); title.textContent = '完成报告'; meta.textContent = '正在读取真实完成批次'; summary.replaceChildren(); showMessage(rows, '正在读取真实完成批次'); return }; if (loadError) { if (latestBatch) renderReportTaskSummary('读取失败，保留上次真实批次'); else setSummaryValues(report.querySelector('.clip-task-summary'), ['—', '—', '—', '—'], ':scope > div:not(.clip-task-summary-label) > b'); title.textContent = '完成报告'; meta.textContent = '报告读取失败，统计未知'; summary.replaceChildren(); showMessage(rows, loadError); return }; if (!latestBatch) { renderReportTaskSummary('没有真实完成批次'); title.textContent = '完成报告'; meta.textContent = '没有真实完成导出批次'; summary.replaceChildren(); renderEpisodes(document.getElementById('clipReportEpisodes'), null, 'clipReportEpisode', true); showMessage(rows, '尚无可查看的真实完成报告'); return }; const batch = reportEntries(); renderReportTaskSummary(`${new Set(batch.flatMap(({ candidate }) => candidate ? [candidate.episodeId] : [])).size + (batch.some(({ candidate }) => !candidate) ? 1 : 0)} 集 · ${batchStatus(latestBatch.status)}`); if (!batch.some(({ candidate }) => candidate?.episodeId === reportEpisodeId) && !batch.some(({ candidate }) => !candidate)) reportEpisodeId = batch.find(({ candidate }) => candidate)?.candidate?.episodeId ?? reportEpisodeId; renderEpisodes(document.getElementById('clipReportEpisodes'), reportEpisodeId, 'clipReportEpisode', true); const current = batch.filter(({ candidate, item }) => (!candidate || candidate.episodeId === reportEpisodeId) && (reportFilter === 'all' || item.status !== 'exported')); const episode = episodes.find((item) => item.id === reportEpisodeId); title.textContent = `${episode ? label(episode) : '本次任务'}完成报告`; meta.textContent = `真实批次 · ${latestBatch.id.slice(0, 8)} · ${batchStatus(latestBatch.status)} · ${configSummary(latestBatch)}`; summary.replaceChildren(); for (const [count, copy] of [[batch.filter(({ item }) => item.status === 'exported').length, '已导出'], [batch.filter(({ item }) => item.status === 'failed').length, '失败'], [batch.filter(({ item }) => item.status === 'cancelled').length, '已取消'], [batch.filter(({ item }) => item.status === 'not_output').length, '未输出']] as const) { const item = element(document, 'div'); const value = element(document, 'b'); value.textContent = String(count); const label = element(document, 'span'); label.textContent = copy; item.append(value, label); summary.append(item) }; if (current.length === 0) { showMessage(rows, reportFilter === 'exception' ? '本次完成批次没有异常项' : '本集没有完成批次候选'); return }; rows.replaceChildren(); const head = element(document, 'div', 'clip-report-results-head'); head.textContent = `本集输出明细 · ${current.length} 条结果`; rows.append(head); for (const { candidate, item, material } of current) { const row = element(document, 'div', 'clip-report-list-row'); const id = element(document, 'span', 'num'); id.textContent = `C-${item.candidateId.slice(0, 8)}`; const source = element(document, 'span', 'clip-report-source'); source.append(document.createTextNode(candidate ? sourceRange(candidate) : '候选已删除，保留批次事实')); const file = element(document, 'small'); file.textContent = material?.path ?? item.reason ?? '本批次未生成输出'; source.append(file); const duration = element(document, 'span', 'clip-report-duration'); duration.textContent = candidate ? time(candidate.endSeconds - candidate.startSeconds) : '—'; const open = element(document, 'button', 'btn btn-secondary clip-list-action'); open.type = 'button'; if (material) { open.dataset.clipOpenMaterial = material.path; open.textContent = '打开位置' } else if (candidate) { open.dataset.clipOpenCandidate = candidate.id; open.textContent = '查看候选' } else { open.disabled = true; open.textContent = '候选已删除' }; row.append(id, source, duration, badge(document, reportItemStatus(item.status)), open); rows.append(row) } }
  const render = (): void => { if (!disposed) { renderPool(); decorateCandidateRows(); renderReport() } }
  const decorateCandidateRows = (): void => {
    const rows = document.getElementById('clipCandidateRows')
    if (!rows) return
    for (const row of rows.querySelectorAll<HTMLElement>('.clip-candidate-list-row')) {
      const open = row.querySelector<HTMLButtonElement>('[data-clip-open-candidate]')
      const candidate = candidates.find((item) => item.id === open?.dataset.clipOpenCandidate)
      if (!open || !candidate || open.parentElement?.classList.contains('clip-candidate-actions')) continue
      const actions = element(document, 'div', 'clip-candidate-actions')
      open.replaceWith(actions)
      const select = element(document, 'input')
      select.type = 'checkbox'
      select.dataset.clipExportCandidate = candidate.id
      select.checked = exportSelection.has(candidate.id)
      select.disabled = !['confirmed', 'exported'].includes(candidate.status)
      select.setAttribute('aria-label', `选择切片 C-${candidate.id.slice(0, 8)} 导出`)
      actions.append(select)
      actions.append(open)
      const remove = element(document, 'button', 'btn btn-secondary clip-candidate-delete')
      remove.type = 'button'
      remove.dataset.clipDeleteCandidate = candidate.id
      remove.setAttribute('aria-label', `删除切片 C-${candidate.id.slice(0, 8)}`)
      remove.setAttribute('title', isDeletable(candidate.status) ? '删除切片' : candidate.status === 'exporting' ? '候选正在导出，无法删除' : '已导出候选保留审计，无法删除')
      remove.disabled = !isDeletable(candidate.status)
      remove.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 7h16M10 11v5M14 11v5M6.5 7l.8 13h9.4l.8-13M9 7V4h6v3"/></svg>'
      actions.append(remove)
    }
  }
  const candidateRows = document.getElementById('clipCandidateRows')
  const candidateRowObserver = candidateRows ? new MutationObserver(() => decorateCandidateRows()) : null
  if (candidateRows && candidateRowObserver) candidateRowObserver.observe(candidateRows, { childList: true })
  const refresh = async (): Promise<void> => { const id = ++requestId; loading = true; loadError = null; render(); const result = await Promise.allSettled([window.desktopApi.listClipCandidates(dramaId), window.desktopApi.listClipEpisodeStatuses(dramaId), window.desktopApi.getLatestClipExportBatch(dramaId), window.desktopApi.listMaterials(dramaId)]); if (disposed || id !== requestId) return; loading = false; if (result.some((item) => item.status !== 'fulfilled')) { loadError = '真实候选、状态或完成批次读取失败。'; render(); return }; const [candidateResult, statusResult, batchResult, materialResult] = result as [PromiseFulfilledResult<ClipCandidate[]>, PromiseFulfilledResult<ClipEpisodeStatus[]>, PromiseFulfilledResult<Awaited<ReturnType<typeof window.desktopApi.getLatestClipExportBatch>>>, PromiseFulfilledResult<MaterialSummary[]>]; candidates = candidateResult.value; statuses = new Map(statusResult.value.map((item) => [item.episodeId, item])); latestBatch = batchResult.value; materials = materialResult.value; render() }
  const setQuality = (mode: 'original' | 'bitrate' | 'size'): void => { document.querySelectorAll<HTMLElement>('#exportModal [data-quality-mode]').forEach((button) => { const active = button.dataset.qualityMode === mode; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)) }); document.querySelectorAll<HTMLElement>('#exportModal [data-quality-field]').forEach((field) => { field.hidden = field.dataset.qualityField !== mode }) }
  const configFor = (directory: string): ClipExportConfig => { const qualityMode = activeQuality(document); const rate = frameRate(selectedValue(document, 'exportFrameRate')); if (rate !== 'source' && (!Number.isFinite(rate) || rate <= 0 || rate > 120)) throw new Error('请选择有效帧率。'); const bitrateKbps = Number(selectedValue(document, 'exportBitrate')); const targetSizeMb = Number(selectedValue(document, 'exportTargetSize')); if (qualityMode === 'bitrate' && (!Number.isFinite(bitrateKbps) || bitrateKbps <= 0)) throw new Error('请输入大于 0 的有效码率。'); if (qualityMode === 'size' && (!Number.isFinite(targetSizeMb) || targetSizeMb <= 0)) throw new Error('请输入大于 0 的有效目标大小。'); const packagingEnabled = document.getElementById('exportPackageToggle')?.classList.contains('on') === true; const settings = packaging(document); return { candidateIds: selectedExportCandidates().map((candidate) => candidate.id), outputDirectory: directory, namingPattern: 'clip_{episode}_{candidate}', encoding: qualityMode === 'original' ? 'copy' : qualityMode === 'bitrate' ? 'h264-balanced' : 'h264-quality', outputSize: packagingEnabled ? (settings.aspect === 'portrait' ? '1080x1920' : '1920x1080') : 'source', subtitleStrategy: 'none', conflictStrategy: 'append', qualityMode, bitrateKbps: qualityMode === 'bitrate' ? bitrateKbps : undefined, targetSizeMb: qualityMode === 'size' ? targetSizeMb : undefined, fps: rate, packagingEnabled, packaging: settings } }
  const ensureExportDirectoryControl = (): void => {
    const input = document.getElementById('exportDirectory') as HTMLInputElement | null
    if (!input) return
    input.readOnly = false
    input.placeholder = '源文件夹\\切片'
    if (!document.getElementById('chooseExportDirectory')) {
      const choose = element(document, 'button', 'btn btn-secondary')
      choose.id = 'chooseExportDirectory'
      choose.type = 'button'
      choose.textContent = '选择目录'
      input.parentElement?.append(choose)
    }
  }
  const stopPolling = (): void => { if (exportTimer !== null) window.clearTimeout(exportTimer); exportTimer = null }
  const finishExport = async (id: string, progress: ClipExportProgress): Promise<void> => {
    if (disposed || exportId !== id) return
    const epoch = exportEpoch
    const meta = document.querySelector('#exportModal .modal-head .meta')
    const outcome = progress.status === 'completed' ? '导出完成' : progress.status === 'cancelled' ? '导出已取消' : '导出未全部成功'
    setText(meta, `${outcome} ${progress.completed} / ${progress.total} · 正在更新候选列表`)
    exportId = null
    stopPolling()
    await refresh()
    if (disposed || epoch !== exportEpoch) return
    if (loadError) {
      setText(meta, `${outcome}，候选刷新失败；请重新打开工作区查看完成报告`)
      return
    }
    if (progress.status === 'completed') {
      setText(meta, `导出完成 ${progress.completed} / ${progress.total} · 可查看完成报告`)
      setModal(document, 'exportModal', false)
    } else if (progress.status === 'cancelled') {
      setText(meta, `导出已取消，已处理 ${progress.completed} / ${progress.total} · 可查看完成报告`)
    } else {
      setText(meta, `导出未全部成功，已处理 ${progress.completed} / ${progress.total} · 请查看完成报告`)
    }
  }
  const poll = async (id: string): Promise<void> => {
    try {
      const progress = await window.desktopApi.getClipExportProgress(id)
      if (disposed || exportId !== id) return
      if (progress.status === 'running') {
        setText(document.querySelector('#exportModal .modal-head .meta'), `正在导出 ${progress.completed} / ${progress.total}`)
        exportTimer = window.setTimeout(() => { void poll(id) }, 500)
        return
      }
      await finishExport(id, progress)
    } catch (error) {
      if (disposed || exportId !== id) return
      exportId = null
      stopPolling()
      setText(document.querySelector('#exportModal .modal-head .meta'), error instanceof Error ? error.message : '导出进度读取失败')
    }
  }
  const onInput = (event: Event): void => { const input = eventElement(event.target); if (!(input instanceof (document.defaultView?.HTMLInputElement ?? HTMLInputElement))) return; if (input.id === 'clipCandidateSearch') { query = input.value.trim().toLowerCase(); page = 0; renderPool() }; if (input.id === 'exportDirectory') exportDirectory = input.value }
  const onSelectionChange = (event: Event): void => { const input = eventElement(event.target); if (!(input instanceof (document.defaultView?.HTMLInputElement ?? HTMLInputElement)) || !input.dataset.clipExportCandidate) return; if (input.checked) exportSelection.add(input.dataset.clipExportCandidate); else exportSelection.delete(input.dataset.clipExportCandidate) }
  const onDeleteClick = (event: MouseEvent): void => {
    const remove = eventElement(event.target)?.closest<HTMLButtonElement>('[data-clip-delete-candidate]')
    if (!remove || remove.disabled) return
    event.preventDefault(); event.stopImmediatePropagation()
    const candidate = candidates.find((item) => item.id === remove.dataset.clipDeleteCandidate)
    if (!candidate) return
    const confirm = document.defaultView?.confirm ?? window.confirm
    if (!confirm(`删除 C-${candidate.id.slice(0, 8)} 生成切片？此操作仅移除当前候选，不会删除源剧集。`)) return
    requestId += 1
    remove.disabled = true
    void window.desktopApi.deleteClipCandidate(candidate.id).then(() => refresh()).catch((error: unknown) => { if (!disposed) { const meta = document.getElementById('clipPoolWindowMeta'); setText(meta, error instanceof Error ? error.message : '删除候选失败，请重试。'); remove.disabled = false } })
  }
  const onExportDirectoryClick = (event: MouseEvent): void => {
    const target = eventElement(event.target)
    if (!target) return
    const intercept = (): void => { event.preventDefault(); event.stopImmediatePropagation() }
    if (target.closest('[data-clip-export-open]')) {
      intercept()
      if (exportId === null) exportEpoch += 1
      ensureExportDirectoryControl()
      const input = document.getElementById('exportDirectory') as HTMLInputElement | null
      if (input && !exportDirectory) exportDirectory = defaultClipOutputDirectory(episodes, selectedExportCandidates())
      if (input) input.value = exportDirectory
      setModal(document, 'exportModal', true)
      const selected = selectedExportCandidates()
      const count = selected.length
      const repeatCount = selected.filter((candidate) => candidate.status === 'exported').length
      setText(document.getElementById('exportTitle'), '导出已确认切片')
      setText(document.querySelector('#exportModal .modal-head .meta'), count ? `已选择 ${count} 项候选${repeatCount ? ` · 含 ${repeatCount} 项再次导出` : ''}` : '请先在候选池勾选本次要导出的切片')
      const save = document.getElementById('saveExport') as HTMLButtonElement | null
      if (save) { save.disabled = count === 0; save.textContent = `预检并导出 ${count} 项` }
      return
    }
    if (target.closest('#chooseExportDirectory')) {
      intercept()
      void window.desktopApi.chooseOutputDirectory().then((directory) => {
        if (!disposed && directory) { exportDirectory = directory; const input = document.getElementById('exportDirectory') as HTMLInputElement | null; if (input) input.value = directory }
      })
      return
    }
    if (target.closest('#saveExport')) {
      intercept()
      void (async () => {
        try {
          const input = document.getElementById('exportDirectory') as HTMLInputElement | null
          const directory = (input?.value ?? exportDirectory).trim()
          if (!directory) { setText(document.querySelector('#exportModal .modal-head .meta'), '请填写或选择输出目录'); return }
          exportDirectory = directory
          const config = configFor(directory)
          if (config.candidateIds.length === 0) { setText(document.querySelector('#exportModal .modal-head .meta'), '请先在候选池勾选本次要导出的切片'); return }
          const preflight = await window.desktopApi.preflightClipExport(dramaId, config)
          if (disposed) return
          if (preflight.blocked.length > 0) { setText(document.querySelector('#exportModal .modal-head .meta'), `预检阻止：${preflight.blocked[0]?.reason ?? '候选不可导出'}`); return }
          const progress = await window.desktopApi.startClipExport(dramaId, config)
          if (disposed) return
          exportId = progress.exportId
          exportEpoch += 1
          exportSelection.clear()
          document.querySelectorAll<HTMLInputElement>('[data-clip-export-candidate]').forEach((checkbox) => { checkbox.checked = false })
          setText(document.querySelector('#exportModal .modal-head .meta'), `正在导出 ${progress.completed} / ${progress.total}`)
          void poll(progress.exportId)
        } catch (error) { if (!disposed) setText(document.querySelector('#exportModal .modal-head .meta'), error instanceof Error ? error.message : '导出配置或预检失败') }
      })()
    }
  }
  document.addEventListener('click', onExportDirectoryClick, true)
  document.addEventListener('click', onDeleteClick, true)
  const onClick = (event: MouseEvent): void => { const target = eventElement(event.target); if (!target) return; const intercept = (): void => { event.preventDefault(); event.stopPropagation() }; const episodeButton = target.closest<HTMLElement>('[data-clip-candidate-episode]'); if (episodeButton) { intercept(); selectedEpisodeId = episodeButton.dataset.clipCandidateEpisode ?? selectedEpisodeId; page = 0; renderPool(); return }; const reportButton = target.closest<HTMLElement>('[data-clip-report-episode]'); if (reportButton) { intercept(); reportEpisodeId = reportButton.dataset.clipReportEpisode ?? reportEpisodeId; renderReport(); return }; const filterButton = target.closest<HTMLElement>('[data-clip-filter]'); if (filterButton) { intercept(); filter = filterButton.dataset.clipFilter as Filter; page = 0; document.querySelectorAll('[data-clip-filter]').forEach((button) => button.classList.toggle('active', button === filterButton)); renderPool(); return }; const reportFilterButton = target.closest<HTMLElement>('[data-clip-report-filter]'); if (reportFilterButton) { intercept(); reportFilter = reportFilterButton.dataset.clipReportFilter as ReportFilter; document.querySelectorAll('[data-clip-report-filter]').forEach((button) => button.classList.toggle('active', button === reportFilterButton)); renderReport(); return }; const windowButton = target.closest<HTMLElement>('[data-clip-window]'); if (windowButton) { intercept(); page += windowButton.dataset.clipWindow === 'next' ? 1 : -1; renderPool(); return }; const material = target.closest<HTMLElement>('[data-clip-open-material]'); if (material?.dataset.clipOpenMaterial) { intercept(); void window.desktopApi.openPath(material.dataset.clipOpenMaterial); return }; const open = target.closest<HTMLElement>('[data-clip-open-candidate]'); if (open) { intercept(); const candidate = candidates.find((item) => item.id === open.dataset.clipOpenCandidate); if (candidate) onOpenCandidate(candidate); return }; const quality = target.closest<HTMLElement>('#exportModal [data-quality-mode]'); if (quality) { intercept(); setQuality(quality.dataset.qualityMode as 'original' | 'bitrate' | 'size'); return }; if (target.closest('#exportPackageToggle')) { intercept(); const toggle = document.getElementById('exportPackageToggle'); toggle?.classList.toggle('on'); toggle?.setAttribute('aria-pressed', String(toggle.classList.contains('on'))); return }; if (target.closest('#configurePackagingFromExport')) { intercept(); setModal(document, 'exportModal', false); setModal(document, 'packagingModal', true); return }; const aspect = target.closest<HTMLElement>('[data-package-aspect]'); if (aspect) { intercept(); document.querySelectorAll<HTMLElement>('[data-package-aspect]').forEach((button) => { const active = button === aspect; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)) }); return }; if (target.closest('#closePackaging, #cancelPackaging')) { intercept(); setModal(document, 'packagingModal', false); setModal(document, 'exportModal', true); return }; if (target.closest('#savePackaging')) { intercept(); const value = packaging(document); setText(document.querySelector('#exportModal .package-summary'), `${value.preset === 'conflict' ? '冲突前置方案' : value.preset === 'clean' ? '纯净画面方案' : '剧目默认方案'} · ${value.aspect === 'portrait' ? '竖屏 9:16' : '横屏 16:9'} / ${value.titlePosition === 'top' ? '顶部' : '底部'}标题 / ${value.promptPosition === 'left' ? '左侧' : '右侧'}提示语`); setModal(document, 'packagingModal', false); setModal(document, 'exportModal', true); return }; if (target.closest('[data-clip-export-open]')) { intercept(); const count = candidates.filter((candidate) => candidate.status === 'confirmed').length; const directory = document.getElementById('exportDirectory') as HTMLInputElement | null; if (directory) directory.readOnly = true; setModal(document, 'exportModal', true); setText(document.getElementById('exportTitle'), '导出已确认切片'); setText(document.querySelector('#exportModal .modal-head .meta'), count ? `${count} 项真实已确认候选等待预检` : '没有可导出的真实已确认候选'); const save = document.getElementById('saveExport') as HTMLButtonElement | null; if (save) { save.disabled = count === 0; save.textContent = `选择目录并预检 ${count} 项` }; return }; if (target.closest('#closeExport')) { intercept(); setModal(document, 'exportModal', false); return }; if (target.closest('#cancelExport')) { intercept(); if (exportId) { const id = exportId; void window.desktopApi.cancelClipExport(id).then((progress) => { void finishExport(id, progress) }).catch((error: unknown) => { if (!disposed && exportId === id) setText(document.querySelector('#exportModal .modal-head .meta'), error instanceof Error ? error.message : '取消导出失败') }) } else setModal(document, 'exportModal', false); return }; if (target.closest('#saveExport')) { intercept(); void (async () => { try { const directory = await window.desktopApi.chooseOutputDirectory(); if (disposed || !directory) return; const input = document.getElementById('exportDirectory') as HTMLInputElement | null; if (input) input.value = directory; const config = configFor(directory); const preflight = await window.desktopApi.preflightClipExport(dramaId, config); if (disposed) return; if (preflight.blocked.length > 0) { setText(document.querySelector('#exportModal .modal-head .meta'), `预检阻止：${preflight.blocked[0]?.reason ?? '候选不可导出'}`); return }; const progress = await window.desktopApi.startClipExport(dramaId, config); if (disposed) return; exportId = progress.exportId; exportEpoch += 1; setText(document.querySelector('#exportModal .modal-head .meta'), `正在导出 ${progress.completed} / ${progress.total}`); void poll(progress.exportId) } catch (error) { if (!disposed) setText(document.querySelector('#exportModal .modal-head .meta'), error instanceof Error ? error.message : '导出配置或预检失败') } })() } }
  document.addEventListener('input', onInput); document.addEventListener('change', onSelectionChange); document.addEventListener('click', onClick, true); void refresh()
  return () => { disposed = true; requestId += 1; stopPolling(); candidateRowObserver?.disconnect(); document.removeEventListener('input', onInput); document.removeEventListener('change', onSelectionChange); document.removeEventListener('click', onExportDirectoryClick, true); document.removeEventListener('click', onDeleteClick, true); document.removeEventListener('click', onClick, true); delete document.body.dataset.clipPoolReportRuntimeBound }
}
