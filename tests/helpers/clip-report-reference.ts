import type { Page } from '@playwright/test'
import type { ReportScenario } from '../fixtures/clip-report-scenarios.js'

/** Independent original V49 node templates; no application renderer is imported. */
export const renderReportReference = async (page: Page, scene: ReportScenario): Promise<void> => {
  await page.evaluate(scene => {
    const screen = document.getElementById('screen-clip-report')!, rows = document.getElementById('clipReportRows')!, rail = document.getElementById('clipReportEpisodes')!, summary = document.getElementById('clipReportSummary')!
    const head = rows.querySelector('.clip-report-results-head')!.cloneNode(true) as HTMLElement
    const rowTemplate = rows.querySelector('.clip-report-list-row')!.cloneNode(true) as HTMLElement
    const episodeTemplate = rail.firstElementChild!.cloneNode(true) as HTMLElement
    document.querySelector<HTMLButtonElement>('[data-clip-candidate-episode="3"]')!.click()
    const emptyTemplate = document.querySelector('#clipCandidateRows .clip-board-empty')!.cloneNode(true) as HTMLElement
    document.querySelectorAll<HTMLElement>('.screen').forEach(node => node.classList.toggle('active', node === screen))
    document.getElementById('crumb')!.textContent = `${scene.dramaName} / 原剧切片完成报告`
    screen.querySelector('.screen-head .meta')!.textContent = `${scene.dramaName} / 素材生产 / 原剧切片`
    const badge = document.querySelector<HTMLElement>('#notifBtn .count')!; badge.hidden = true; badge.textContent = '0'
    const items = scene.batch?.items ?? [], blocked = ['loading', 'error'].includes(scene.state)
    const done = items.filter(item => item.status === 'exported').length
    const totals = blocked ? ['—', '—', '—', '—'] : [scene.state === 'legacy' ? '—' : items.length ? 1 : 0, items.length, done, items.length - done]
    screen.querySelectorAll('.clip-task-summary > div:not(.clip-task-summary-label) > b').forEach((target, index) => { target.textContent = String(totals[index]) })
    const phase = scene.batch?.status === 'failed' ? '有失败' : scene.batch?.status === 'cancelled' ? '已取消' : '已完成'
    screen.querySelector('.clip-task-summary-label small')!.textContent = scene.state === 'loading' ? '正在读取真实完成批次' : scene.state === 'error' ? '报告读取失败' : !scene.batch ? '没有真实完成批次' : `${scene.state === 'legacy' ? '归属待核' : '1 集'} · ${phase}`
    screen.querySelector('.clip-board-episodes-head > span')!.textContent = blocked ? '— 集' : scene.state === 'legacy' ? '归属待核' : items.length ? '1 集' : '0 集'
    rail.replaceChildren(); rows.replaceChildren(); summary.replaceChildren()
    const message = (title: string, detail = ''): void => {
      const empty = emptyTemplate.cloneNode(true) as HTMLElement
      empty.querySelector('b')!.textContent = title; empty.querySelector('span')!.textContent = detail; rows.append(empty)
    }
    if (blocked || !scene.batch) {
      document.getElementById('clipReportTitle')!.textContent = '完成报告'
      document.getElementById('clipReportMeta')!.textContent = scene.state === 'loading' ? '正在读取真实完成批次' : scene.state === 'error' ? '报告读取失败，统计未知' : '没有真实完成导出批次'
      message(scene.state === 'loading' ? '正在读取真实完成批次' : scene.state === 'error' ? '报告读取失败' : '尚无可查看的真实完成报告', scene.state === 'error' ? '真实候选、状态或完成批次读取失败。' : '')
      return
    }
    for (const id of scene.state === 'legacy' ? ['e1', '__clip_report_unknown__'] : ['e1']) {
      const row = episodeTemplate.cloneNode(true) as HTMLElement
      row.classList.toggle('active', id === 'e1'); row.dataset.clipReportEpisode = id
      row.querySelector('.num')!.textContent = id === 'e1' ? '01' : '—'
      row.querySelector('b')!.textContent = id === 'e1' ? '第 01 集' : '归属未记录'
      const owned = items.filter(item => id === 'e1' ? item.episodeId === 'e1' : !item.episodeId)
      row.querySelector('small')!.textContent = `${owned.filter(item => item.status === 'exported').length} 已导出 · ${owned.length} 条结果`
      rail.append(row)
    }
    document.getElementById('clipReportTitle')!.textContent = '第 01 集完成报告'
    document.getElementById('clipReportMeta')!.textContent = `真实批次 · report-b · ${phase} · copy · source · 跟随原片 FPS · 无字幕`
    const labels = { exported: '已导出', failed: '失败', cancelled: '已取消', not_output: '未输出' }
    for (const key of ['exported', 'failed', 'cancelled', 'not_output'] as const) {
      const item = document.createElement('div'), value = document.createElement('b'), label = document.createElement('span')
      value.textContent = String(items.filter(item => item.status === key).length); label.textContent = labels[key]; item.append(value, label); summary.append(item)
    }
    const visible = items.filter(item => item.episodeId === 'e1')
    head.querySelector(':scope > div:first-child > span:last-child')!.textContent = `${visible.length} 条结果`; rows.append(head)
    for (const item of visible) {
      const row = rowTemplate.cloneNode(true) as HTMLElement
      row.querySelector('.num')!.textContent = `切片${String(item.sequenceNumber).padStart(2, '0')}`
      const source = row.querySelector('.clip-report-source')!, file = document.createElement('small')
      source.replaceChildren(document.createTextNode(`${item.startSeconds!.toFixed(1)} — ${item.endSeconds!.toFixed(1)}`))
      const material = scene.materials.find(material => material.id === item.materialId)
      file.textContent = material?.path ?? item.reason ?? '本批次未生成输出'; source.append(file)
      row.querySelector('.clip-report-duration')!.textContent = `${(item.endSeconds! - item.startSeconds!).toFixed(1)} 秒`
      const status = row.querySelector('.badge')!
      status.className = `badge ${item.status === 'exported' ? 'success' : item.status === 'failed' ? 'danger' : 'warning'}`; status.textContent = labels[item.status]
      const open = row.querySelector<HTMLButtonElement>('button')!
      open.textContent = material ? '打开位置' : scene.candidates.some(candidate => candidate.id === item.candidateId) ? '查看候选' : '候选已删除'
      open.disabled = !material && !scene.candidates.some(candidate => candidate.id === item.candidateId)
      rows.append(row)
    }
  }, scene)
}
