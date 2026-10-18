// @vitest-environment jsdom
import prototype from '../../../../design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html?raw'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClipCandidate, ClipExportBatch, DesktopApi } from '../../../shared/contracts.js'
import { bindOriginalClipPoolReportRuntime } from './OriginalClipPoolReportRuntimeBridge.js'

const summaryMarkup = prototype.match(/<section class="clip-task-summary" data-od-id="clip-task-total-summary">[\s\S]*?<\/section>/)?.[0]
if (!summaryMarkup) throw new Error('V49 report summary fixture missing')
const labels = ['覆盖剧集', '已确认候选', '已完成导出', '待导出 / 复核']
const cleanups: Array<() => void> = []
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks() })
const values = (document: Document): Record<string, string | null> => Object.fromEntries([...document.querySelectorAll('.clip-task-summary > div:not(.clip-task-summary-label)')].map(node => [node.querySelector('span')!.textContent, node.querySelector('b')!.textContent]))
const mount = (outcomes: ClipExportBatch['items'][number]['status'][] | null, overrides: Partial<DesktopApi> = {}): Document => {
  const document = window.document.implementation.createHTMLDocument('real V49 summary')
  document.body.innerHTML = `<section id="screen-clip-report">${summaryMarkup}<div id="clipReportEpisodes"></div><h2 id="clipReportTitle"></h2><span id="clipReportMeta"></span><button data-clip-report-filter="exception">仅异常</button><div id="clipReportSummary"></div><div id="clipReportRows"></div></section>`
  const items = (outcomes ?? []).map((status, index) => ({ candidateId: `c${index}`, episodeId: index === 0 ? 'e1' : 'e2', status, materialId: null, reason: status === 'failed' ? '输出失败' : null }))
  const latest: ClipExportBatch | null = outcomes ? { id: 'batch', dramaId: 'drama', candidateIds: items.map(item => item.candidateId), items, status: outcomes.includes('cancelled') ? 'cancelled' : outcomes.includes('failed') ? 'failed' : 'completed', reason: null, config: null, createdAt: '2026-10-18', updatedAt: '2026-10-18' } : null
  // The current candidate library is deliberately different: totals must use frozen batch facts.
  const outside: ClipCandidate = { id: 'outside', episodeId: 'e3', startSeconds: 0, endSeconds: 10, status: 'exported', reason: null }
  Object.assign(window, { desktopApi: { listClipCandidates: vi.fn().mockResolvedValue([outside]), listClipEpisodeStatuses: vi.fn().mockResolvedValue([]), listMaterials: vi.fn().mockResolvedValue([]), getLatestClipExportBatch: vi.fn().mockResolvedValue(latest), ...overrides } as DesktopApi })
  cleanups.push(bindOriginalClipPoolReportRuntime({ document, dramaId: 'drama', episodes: [], onOpenCandidate: vi.fn() }))
  return document
}

describe('real V49 report task summary labels', () => {
  it.each([
    { name: 'all successful', outcomes: ['exported', 'exported'], completed: 2, outstanding: 0 },
    { name: 'partly failed', outcomes: ['exported', 'failed'], completed: 1, outstanding: 1 },
    { name: 'partly cancelled', outcomes: ['exported', 'cancelled', 'not_output'], completed: 1, outstanding: 2 },
    { name: 'all failed', outcomes: ['failed', 'failed'], completed: 0, outstanding: 2 },
    { name: 'all cancelled', outcomes: ['cancelled', 'cancelled'], completed: 0, outstanding: 2 },
    { name: 'not output', outcomes: ['not_output', 'not_output'], completed: 0, outstanding: 2 }
  ] satisfies Array<{ name: string; outcomes: ClipExportBatch['items'][number]['status'][]; completed: number; outstanding: number }>)('maps $name batch facts to their actual titles', async ({ outcomes, completed, outstanding }) => {
    const document = mount(outcomes)
    await vi.waitFor(() => expect(document.getElementById('clipReportMeta')?.textContent).toContain('真实批次'))
    expect(values(document)).toEqual({ 覆盖剧集: '2', 已确认候选: String(outcomes.length), 已完成导出: String(completed), '待导出 / 复核': String(outstanding) })
    expect(completed + outstanding).toBe(outcomes.length)
    const before = values(document)
    document.querySelector<HTMLButtonElement>('[data-clip-report-filter="exception"]')!.click()
    expect(values(document)).toEqual(before)
    expect(document.querySelectorAll('#clipReportSummary > div > b')[0]?.textContent).toBe(String(completed))
  })
  it('clears prototype numbers when there is no real batch', async () => {
    const document = mount(null)
    await vi.waitFor(() => expect(document.getElementById('clipReportMeta')?.textContent).toContain('没有真实完成'))
    expect(values(document)).toEqual(Object.fromEntries(labels.map(label => [label, '0'])))
  })
  it('shows zero totals for an existing empty batch', async () => {
    const document = mount([])
    await vi.waitFor(() => expect(document.getElementById('clipReportMeta')?.textContent).toContain('真实批次'))
    expect(values(document)).toEqual(Object.fromEntries(labels.map(label => [label, '0'])))
  })
  it('shows unknown totals when loading the batch fails', async () => {
    const document = mount(null, { getLatestClipExportBatch: vi.fn().mockRejectedValue(new Error('读取失败')) })
    await vi.waitFor(() => expect(document.getElementById('clipReportMeta')?.textContent).toContain('统计未知'))
    expect(values(document)).toEqual(Object.fromEntries(labels.map(label => [label, '—'])))
  })
})
