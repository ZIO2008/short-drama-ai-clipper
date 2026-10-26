// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createClipReportRenderer } from './clip-report-view.js'
import { createReportScenario } from '../../../../tests/fixtures/clip-report-scenarios.js'

const mount = () => {
  const doc = document.implementation.createHTMLDocument('report')
  doc.body.innerHTML = '<section id="screen-clip-report"><div class="clip-task-summary"><div class="clip-task-summary-label"><small></small></div><div><b></b></div><div><b></b></div><div><b></b></div><div><b></b></div></div><div class="clip-board-episodes-head"><span></span></div><div id="clipReportEpisodes"></div><h2 id="clipReportTitle"></h2><span id="clipReportMeta"></span><div id="clipReportSummary"></div><div id="clipReportRows"></div></section>'
  const scene = createReportScenario('success'), render = createClipReportRenderer(doc, scene.episodes)
  const state = { batch: scene.batch, candidates: scene.candidates, materials: scene.materials, selectedEpisode: 'e1', filter: 'all' as const, loading: false, error: null }
  return { doc, scene, render, state }
}
describe('historical report facts', () => {
  it('uses the frozen range even after the live candidate changes', () => {
    const { doc, render, state } = mount(); render(state)
    expect(doc.querySelector('.clip-report-source')?.textContent).toContain('1.0 — 9.0')
    expect(doc.querySelector('.clip-report-duration')?.textContent).toBe('8.0 秒')
    expect(doc.querySelector('.clip-report-columns')?.children).toHaveLength(5)
  })
  it('does not invent history from current candidate timing', () => {
    const { doc, render, state } = mount()
    delete state.batch!.items[0]!.startSeconds; delete state.batch!.items[0]!.endSeconds
    render(state)
    expect(doc.querySelector('.clip-report-source')?.textContent).toContain('历史时码未记录')
    expect(doc.querySelector('.clip-report-duration')?.textContent).toBe('—')
  })
  it('keeps unknown ownership separate without inventing a covered episode', () => {
    const { doc, render, state } = mount(), legacy = createReportScenario('legacy')
    const initial = render({ ...state, batch: legacy.batch })
    expect(initial).toBe('e1')
    expect(doc.querySelectorAll('.clip-report-list-row')).toHaveLength(2)
    render({ ...state, batch: legacy.batch, selectedEpisode: '__clip_report_unknown__' })
    expect(doc.querySelectorAll('.clip-report-list-row')).toHaveLength(1)
    expect(doc.querySelector('.clip-report-list-row button')?.hasAttribute('disabled')).toBe(true)
    expect(doc.querySelector('.clip-task-summary > div:nth-child(2) b')?.textContent).toBe('—')
  })
  it('keeps output access after candidate deletion and disables missing historical records', () => {
    const { doc, render, state } = mount()
    render({ ...state, candidates: [] })
    expect(doc.querySelector('[data-clip-open-material]')?.getAttribute('data-clip-open-material')).toBe(state.materials[0]?.path)
    render({ ...state, candidates: [], materials: [] })
    expect(doc.querySelector('.clip-report-source')?.textContent).toContain('历史输出记录不可用')
    expect(doc.querySelector('.clip-report-list-row button')?.hasAttribute('disabled')).toBe(true)
  })
  it('never shows zero as a successful loading result or stale rows after error', () => {
    const { doc, render, state } = mount(); render(state); render({ ...state, loading: true })
    expect(doc.querySelector('.clip-task-summary > div:nth-child(2) b')?.textContent).toBe('—')
    expect(doc.querySelectorAll('.clip-report-list-row')).toHaveLength(0)
    render({ ...state, error: '读取错误' })
    expect(doc.querySelector('.clip-task-summary-label small')?.textContent).toContain('保留上次真实批次')
    expect(doc.getElementById('clipReportRows')?.textContent).toContain('读取错误')
  })
})
