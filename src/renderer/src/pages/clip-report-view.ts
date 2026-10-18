import type { ClipCandidate, ClipExportBatch, EpisodeAsset, MaterialSummary } from '../../../shared/contracts.js'
import { clipCandidateLabel } from '../../../shared/clip-candidate-label.js'

type State = { batch: ClipExportBatch | null; candidates: readonly ClipCandidate[]; materials: readonly MaterialSummary[]; selectedEpisode: string | null; filter: 'all' | 'exception'; loading: boolean; error: string | null }
const UNKNOWN = '__clip_report_unknown__'
const outcome = { exported: '已导出', failed: '失败', cancelled: '已取消', not_output: '未输出' }
const batchState = { running: '进行中', completed: '已完成', cancelled: '已取消', failed: '有失败' }
const node = <T extends keyof HTMLElementTagNameMap>(document: Document, tag: T, className = '', text = ''): HTMLElementTagNameMap[T] => { const result = document.createElement(tag); result.className = className; result.textContent = text; return result }
const text = (document: Document, id: string, value: string): void => { const target = document.getElementById(id); if (target) target.textContent = value }
const episodeLabel = (episode: EpisodeAsset | undefined): string => episode ? `第 ${String(episode.episodeNo ?? episode.sortOrder + 1).padStart(2, '0')} 集` : '历史分集'
const configSummary = (batch: ClipExportBatch): string => {
  const config = batch.config
  if (!config) return '历史批次配置不可用'
  const quality = config.qualityMode === 'bitrate' ? `${config.bitrateKbps ?? '—'} kbps` : config.qualityMode === 'size' ? `${config.targetSizeMb ?? '—'} MB` : config.encoding
  return `${quality} · ${config.outputSize} · ${config.fps === 'source' || config.fps === undefined ? '跟随原片 FPS' : `${config.fps} FPS`} · ${config.subtitleStrategy === 'none' ? '无字幕' : config.subtitleStrategy === 'soft' ? '软字幕' : '烧录字幕'}`
}
const fallbackHead = (document: Document): HTMLElement => {
  const head = node(document, 'div', 'clip-report-results-head'), line = node(document, 'div'), copy = node(document, 'span')
  copy.append(node(document, 'b', '', '本集输出明细'), node(document, 'span', '', '每项均保留候选编号、源片区间与输出文件'))
  line.append(copy, node(document, 'span'))
  const columns = node(document, 'div', 'clip-report-columns')
  for (const label of ['候选', '源片区间 / 输出文件', '时长', '状态', '操作']) columns.append(node(document, 'span', '', label))
  head.append(line, columns); return head
}

/** Preserve the final V49 structure; historical facts always come from the batch snapshot. */
export const createClipReportRenderer = (document: Document, episodes: readonly EpisodeAsset[]): ((state: State) => string | null) => {
  const screen = document.getElementById('screen-clip-report')
  const headTemplate = screen?.querySelector('.clip-report-results-head')?.cloneNode(true) as HTMLElement | undefined
  return (state): string | null => {
    if (!screen) return state.selectedEpisode
    const rows = document.getElementById('clipReportRows'), rail = document.getElementById('clipReportEpisodes'), summary = document.getElementById('clipReportSummary')
    if (!rows || !rail || !summary) return state.selectedEpisode
    const entries = (state.batch?.items ?? []).map(item => {
      const live = state.candidates.find(candidate => candidate.id === item.candidateId)
      const episodeId = item.episodeId ?? live?.episodeId ?? UNKNOWN
      const material = state.materials.find(material => material.id === item.materialId && material.path)
      const range = typeof item.startSeconds === 'number' && Number.isFinite(item.startSeconds) && typeof item.endSeconds === 'number' && Number.isFinite(item.endSeconds) && item.endSeconds >= item.startSeconds ? { start: item.startSeconds, end: item.endSeconds } : null
      return { item, live, episodeId, material, range }
    })
    const ids = [...new Set(entries.map(entry => entry.episodeId))]
    const unknown = ids.includes(UNKNOWN), knownCount = ids.filter(id => id !== UNKNOWN).length
    const countValues = state.loading || (state.error && !state.batch) ? ['—', '—', '—', '—'] : [unknown ? '—' : knownCount, entries.length, entries.filter(entry => entry.item.status === 'exported').length, entries.filter(entry => entry.item.status !== 'exported').length]
    screen.querySelectorAll('.clip-task-summary > div:not(.clip-task-summary-label) > b').forEach((target, index) => { target.textContent = String(countValues[index]) })
    const count = screen.querySelector('.clip-board-episodes-head > span')
    if (count) count.textContent = state.loading || state.error ? '— 集' : unknown ? '归属待核' : `${knownCount} 集`
    const task = screen.querySelector('.clip-task-summary-label small')
    if (task) task.textContent = state.loading ? '正在读取真实完成批次' : state.error ? state.batch ? '读取失败，保留上次真实批次' : '报告读取失败' : state.batch ? `${unknown ? '归属待核' : `${knownCount} 集`} · ${batchState[state.batch.status]}` : '没有真实完成批次'
    rail.replaceChildren(); summary.replaceChildren(); rows.replaceChildren()
    const message = (heading: string, detail = ''): void => {
      const empty = node(document, 'div', 'clip-board-empty'), copy = node(document, 'div')
      copy.append(node(document, 'b', '', heading), node(document, 'span', '', detail)); empty.append(copy); rows.append(empty)
    }
    if (state.loading || state.error || !state.batch) {
      text(document, 'clipReportTitle', '完成报告')
      text(document, 'clipReportMeta', state.loading ? '正在读取真实完成批次' : state.error ? '报告读取失败，统计未知' : '没有真实完成导出批次')
      message(state.loading ? '正在读取真实完成批次' : state.error ? '报告读取失败' : '尚无可查看的真实完成报告', state.error ?? '')
      return state.selectedEpisode
    }
    const selected = state.selectedEpisode && ids.includes(state.selectedEpisode) ? state.selectedEpisode : ids[0] ?? null
    for (const id of ids) {
      const episode = episodes.find(episode => episode.id === id), owned = entries.filter(entry => entry.episodeId === id)
      const button = node(document, 'button', `clip-episode-row${id === selected ? ' active' : ''}`)
      button.type = 'button'; button.dataset.clipReportEpisode = id
      const number = node(document, 'span', 'num', episode ? String(episode.episodeNo ?? episode.sortOrder + 1).padStart(2, '0') : '—')
      const copy = node(document, 'span')
      copy.append(node(document, 'b', '', id === UNKNOWN ? '归属未记录' : episodeLabel(episode)), node(document, 'small', '', `${owned.filter(entry => entry.item.status === 'exported').length} 已导出 · ${owned.length} 条结果`))
      button.append(number, copy); rail.append(button)
    }
    const title = selected === UNKNOWN ? '归属未记录' : selected ? episodeLabel(episodes.find(episode => episode.id === selected)) : '本次任务'
    text(document, 'clipReportTitle', `${title}完成报告`)
    text(document, 'clipReportMeta', `真实批次 · ${state.batch.id.slice(0, 8)} · ${batchState[state.batch.status]} · ${configSummary(state.batch)}`)
    for (const status of ['exported', 'failed', 'cancelled', 'not_output'] as const) {
      const item = node(document, 'div')
      item.append(node(document, 'b', '', String(entries.filter(entry => entry.item.status === status).length)), node(document, 'span', '', outcome[status])); summary.append(item)
    }
    const current = entries.filter(entry => entry.episodeId === selected && (state.filter === 'all' || entry.item.status !== 'exported'))
    if (!current.length) { message(state.filter === 'exception' ? '本次完成批次没有异常项' : '本集没有完成批次候选'); return selected }
    const head = headTemplate ? headTemplate.cloneNode(true) as HTMLElement : fallbackHead(document)
    const headCount = head.querySelector(':scope > div:first-child > span:last-child')
    if (headCount) headCount.textContent = `${current.length} 条结果`
    rows.append(head)
    for (const { item, live, material, range } of current) {
      const row = node(document, 'div', 'clip-report-list-row')
      const number = node(document, 'span', 'num', clipCandidateLabel({ id: item.candidateId, sequenceNumber: item.sequenceNumber ?? live?.sequenceNumber })); number.title = item.candidateId
      const source = node(document, 'span', 'clip-report-source', range ? `${range.start.toFixed(1)} — ${range.end.toFixed(1)}` : '历史时码未记录')
      const path = material?.path ?? item.reason ?? (item.status === 'exported' ? '历史输出记录不可用' : '本批次未生成输出')
      const file = node(document, 'small', '', path); file.title = path; source.append(file)
      const duration = node(document, 'span', 'clip-report-duration', range ? `${(range.end - range.start).toFixed(1)} 秒` : '—')
      const status = node(document, 'span', `badge ${item.status === 'exported' ? 'success' : item.status === 'failed' ? 'danger' : 'warning'}`, outcome[item.status])
      const open = node(document, 'button', 'btn btn-secondary clip-list-action'); open.type = 'button'
      if (material) { open.dataset.clipOpenMaterial = material.path; open.textContent = '打开位置' }
      else if (live) { open.dataset.clipOpenCandidate = live.id; open.textContent = '查看候选' }
      else { open.disabled = true; open.textContent = '候选已删除'; open.title = '历史候选和可用成果记录均不存在' }
      row.append(number, source, duration, status, open); rows.append(row)
    }
    return selected
  }
}
