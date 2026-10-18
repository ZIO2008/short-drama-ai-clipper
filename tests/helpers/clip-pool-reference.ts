import type { Page } from '@playwright/test'
import { poolEmptyCopy, type PoolScenario } from '../fixtures/clip-module-scenarios.js'

/** Independent data-slot substitutions on original V49 nodes, not production render functions. */
export const renderPoolReference = async (page: Page, scene: PoolScenario): Promise<void> => {
  await page.evaluate(({ scene, emptyCopy }) => {
    const pool = document.getElementById('screen-clip-pool')!, rows = document.getElementById('clipCandidateRows')!
    const rowTemplate = rows.querySelector('.clip-candidate-list-row')!.cloneNode(true) as HTMLElement
    const summaryTemplate = rows.querySelector('.clip-board-summary')!.cloneNode(true) as HTMLElement
    const episodeTemplate = document.querySelector<HTMLElement>('[data-clip-candidate-episode]')!.cloneNode(true) as HTMLElement
    pool.querySelector<HTMLButtonElement>('[data-clip-candidate-episode="3"]')!.click()
    const emptyTemplate = rows.querySelector('.clip-board-empty')!.cloneNode(true) as HTMLElement
    pool.querySelector<HTMLButtonElement>('[data-clip-candidate-episode="1"]')!.click()
    const label = (number: number): string => `第 ${String(number).padStart(2, '0')} 集`
    const display: Record<string, string> = { confirmed: '已确认', pending_review: '待确认', exported: '已导出', failed: '异常', editing: '待确认', exporting: '导出中' }
    const production: Record<string, string> = { ready_to_generate: '未生成', generating: '生成中', missing_media: '媒体缺失', pending_confirmation: '待确认' }
    const readError = '真实候选、状态或完成批次读取失败。'
    document.getElementById('crumb')!.textContent = `${scene.dramaName} / 原剧切片全部候选`
    pool.querySelector('.screen-head .meta')!.textContent = `${scene.dramaName} / 素材生产 / 原剧切片`
    pool.querySelector('.clip-board-episodes-head > span')!.textContent = `${scene.episodes.length} 集`
    pool.querySelector('.clip-inspector-note')!.textContent = `长列表只显示当前剧集的 20 条可见窗口，${scene.episodes.length} 集候选不进入页面级滚动。`
    const badge = document.querySelector<HTMLElement>('#notifBtn .count')!; badge.hidden = true; badge.textContent = '0'
    const episodeRows = document.getElementById('clipCandidateEpisodes')!; episodeRows.replaceChildren()
    for (const episode of scene.episodes) {
      const row = episodeTemplate.cloneNode(true) as HTMLElement
      row.classList.toggle('active', episode.id === scene.selectedEpisode)
      row.dataset.clipCandidateEpisode = episode.id
      row.querySelector('.num')!.textContent = String(episode.episodeNo).padStart(2, '0')
      row.querySelector('b')!.textContent = label(episode.episodeNo!)
      const status = scene.statuses.find(status => status.episodeId === episode.id)!
      row.querySelector('small')!.textContent = scene.state === 'loading' ? '正在读取状态' : scene.state === 'error' ? readError : `${production[status.productionStatus]} · ${status.candidateCount} 个候选`
      episodeRows.append(row)
    }
    const values = scene.state === 'loading' || scene.state === 'error' ? ['—', '—', '—', '—'] : [scene.candidates.filter(candidate => ['confirmed', 'exported', 'exporting'].includes(candidate.status)).length, scene.candidates.filter(candidate => candidate.status === 'exported').length, scene.candidates.filter(candidate => candidate.status === 'confirmed').length, scene.candidates.filter(candidate => ['pending_review', 'editing', 'failed'].includes(candidate.status)).length]
    pool.querySelectorAll('.clip-inspector-stat b').forEach((node, index) => { node.textContent = String(values[index]) })
    const owned = scene.candidates.filter(candidate => candidate.episodeId === scene.selectedEpisode)
    const visible = scene.state === 'exported' ? owned.filter(candidate => candidate.status === 'exported') : scene.state === 'search' ? [] : owned
    document.getElementById('clipPoolTitle')!.textContent = `${label(1)}候选`
    const meta = document.getElementById('clipPoolWindowMeta')!
    const stateMeta: Record<string, string> = { loading: '正在读取真实候选', error: '候选读取失败', missing: '源媒体缺失', generating: '本集正在生成候选', empty: '本集尚未生成真实候选', search: '没有匹配候选' }
    meta.textContent = stateMeta[scene.state] ?? `${visible.length} 个匹配候选 · 当前窗口 1 / ${Math.max(1, Math.ceil(visible.length / 20))}`
    pool.querySelectorAll<HTMLElement>('[data-clip-filter]').forEach(node => node.classList.toggle('active', node.dataset.clipFilter === (scene.state === 'exported' ? 'exported' : 'all')))
    const search = document.getElementById('clipCandidateSearch') as HTMLInputElement
    if (scene.state === 'search') { search.value = '不存在的候选'; search.focus() }
    rows.replaceChildren()
    if (emptyCopy) {
      emptyTemplate.querySelector('b')!.textContent = emptyCopy[0]
      emptyTemplate.querySelector('span')!.textContent = emptyCopy[1]
      rows.append(emptyTemplate)
      return
    }
    const summary = summaryTemplate.cloneNode(true) as HTMLElement
    const spans = summary.querySelectorAll('span'); spans[0]!.replaceChildren()
    const title = document.createElement('b'); title.textContent = label(1)
    spans[0]!.append(title, document.createTextNode(' · 所有候选均保留独立源时码'))
    spans[1]!.textContent = `${visible.length} 个候选 · 每窗 20 条`
    rows.append(summary)
    for (const candidate of visible.slice(0, 20)) {
      const row = rowTemplate.cloneNode(true) as HTMLElement
      const cells = row.children
      cells[0]!.textContent = `切片${String(candidate.sequenceNumber).padStart(2, '0')}`
      const source = cells[1]!; source.replaceChildren(document.createTextNode(`${candidate.startSeconds.toFixed(1)} — ${candidate.endSeconds.toFixed(1)}`))
      const small = document.createElement('small'); small.textContent = '源片时间码 · 独立输出'; source.append(small)
      cells[2]!.textContent = `${(candidate.endSeconds - candidate.startSeconds).toFixed(1)} 秒`
      const state = row.querySelector('.badge')!; state.textContent = display[candidate.status]!
      state.className = `badge ${['confirmed', 'exported'].includes(candidate.status) ? 'success' : candidate.status === 'failed' ? 'danger' : 'warning'}`
      const actions = row.querySelector('.clip-candidate-actions')!
      const select = document.createElement('input'); select.type = 'checkbox'; select.className = 'clip-export-selection'; select.checked = scene.selectedIds.includes(candidate.id); select.disabled = !['confirmed', 'exported'].includes(candidate.status); actions.prepend(select)
      row.querySelector<HTMLButtonElement>('.clip-candidate-delete')!.disabled = ['exported', 'exporting'].includes(candidate.status)
      rows.append(row)
    }
    const actions = document.createElement('div'); actions.className = 'clip-window-actions'
    for (const [copy, disabled] of [['上一窗口', true], ['下一窗口', visible.length <= 20]] as const) { const button = document.createElement('button'); button.className = 'btn btn-secondary'; button.type = 'button'; button.disabled = disabled; button.textContent = copy; actions.append(button) }
    rows.append(actions)
  }, { scene, emptyCopy: poolEmptyCopy[scene.state] ?? null })
}
