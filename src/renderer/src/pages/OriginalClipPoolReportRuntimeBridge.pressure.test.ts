// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { ClipCandidate, ClipEpisodeStatus, DesktopApi, EpisodeAsset } from '../../../shared/contracts.js'
import { bindOriginalClipPoolReportRuntime } from './OriginalClipPoolReportRuntimeBridge.js'

const episodes: EpisodeAsset[] = Array.from({ length: 100 }, (_, index) => ({ id: `episode-${index + 1}`, episodeNo: index + 1, sortOrder: index, sourcePath: `D:\\episodes\\${index + 1}.mp4`, durationSeconds: 600, fps: 25, videoWidth: 1920, videoHeight: 1080, status: 'ready' }))
const candidates: ClipCandidate[] = episodes.flatMap((episode) => Array.from({ length: 50 }, (_, index) => ({ id: `${episode.id}-candidate-${String(index + 1).padStart(2, '0')}`, episodeId: episode.id, startSeconds: index * 10, endSeconds: index * 10 + 8, status: index < 5 ? 'confirmed' as const : 'pending_review' as const, reason: null })))
const statuses: ClipEpisodeStatus[] = episodes.map((episode) => ({ episodeId: episode.id, episodeNo: episode.episodeNo, sourceStatus: 'ready', candidateCount: 50, pendingCount: 45, confirmedCount: 5, exportedCount: 0, failedCount: 0, productionStatus: 'pending_confirmation' }))

const fixture = (): Document => {
  const document = window.document.implementation.createHTMLDocument('pressure')
  document.body.innerHTML = '<section id="screen-clip-pool"><div id="clipCandidateEpisodes"></div><h2 id="clipPoolTitle"></h2><span id="clipPoolWindowMeta"></span><button data-clip-filter="all"></button><button data-clip-filter="pending"></button><button data-clip-filter="confirmed"></button><button data-clip-filter="exported"></button><input id="clipCandidateSearch"><div id="clipCandidateRows"></div><aside class="clip-inspector-stat"><div><b></b></div><div><b></b></div><div><b></b></div><div><b></b></div></aside><button data-clip-export-open></button></section><section id="screen-clip-report"><div class="clip-task-summary"><div class="clip-task-summary-label"><small></small></div><div><b></b></div><div><b></b></div><div><b></b></div><div><b></b></div></div><div id="clipReportEpisodes"></div><h2 id="clipReportTitle"></h2><span id="clipReportMeta"></span><div id="clipReportSummary"></div><div id="clipReportRows"></div></section><section id="exportModal" inert aria-hidden="true"><div class="modal-head"><span class="meta"></span></div><h2 id="exportTitle"></h2><button id="saveExport"></button><button class="active" data-quality-mode="original"></button><input id="exportBitrate" value="6000"><input id="exportTargetSize" value="100"><select id="exportFrameRate"><option selected>跟随原片</option></select><input id="exportDirectory"><button id="exportPackageToggle"></button></section><section id="packagingModal"><select id="packagePreset"></select><input id="packageTitleInput"><select id="packageTitlePosition"></select><input id="packagePromptInput"><select id="packagePromptPosition"></select><select id="packageBadge"></select><select id="packageTitleSize"></select><select id="packageTitleTone"></select><select id="packagePromptStyle"></select><select id="packageOverlay"></select></section>'
  return document
}

describe('OriginalClipPoolReportRuntimeBridge pressure boundary', () => {
  it('keeps 5,000 candidates in memory but renders only the current 20-row window', async () => {
    const document = fixture(); const preflight = vi.fn().mockResolvedValue({ candidateIds: [], count: 500, totalDurationSeconds: 4_000, estimatedSizeBytes: 1, outputDirectory: 'D:\\output', namingPattern: 'clip', encoding: 'copy', outputSize: 'source', subtitleStrategy: 'none', conflictStrategy: 'append', blocked: [] }); const api = { listClipCandidates: vi.fn().mockResolvedValue(candidates), listClipEpisodeStatuses: vi.fn().mockResolvedValue(statuses), getLatestClipExportBatch: vi.fn().mockResolvedValue(null), listMaterials: vi.fn().mockResolvedValue([]), chooseOutputDirectory: vi.fn().mockResolvedValue('D:\\output'), preflightClipExport: preflight, startClipExport: vi.fn().mockResolvedValue({ exportId: 'export', total: 500, completed: 0, status: 'running', results: [] }), getClipExportProgress: vi.fn().mockResolvedValue({ exportId: 'export', total: 500, completed: 500, status: 'completed', results: [] }) } as unknown as DesktopApi
    Object.assign(window, { desktopApi: api })
    const cleanup = bindOriginalClipPoolReportRuntime({ document, dramaId: 'drama', episodes, onOpenCandidate: vi.fn() })
    await vi.waitFor(() => expect(document.querySelectorAll('.clip-candidate-list-row')).toHaveLength(20))
    await vi.waitFor(() => expect(document.querySelectorAll('.clip-candidate-actions')).toHaveLength(20))
    expect(document.querySelectorAll('[data-clip-candidate-episode]')).toHaveLength(100)
    expect(document.getElementById('clipPoolWindowMeta')?.textContent).toContain('50 个匹配候选 · 当前窗口 1 / 3')
    expect([...document.querySelectorAll<HTMLElement>('.clip-inspector-stat b')].map((node) => node.textContent)).toEqual(['500', '0', '500', '4500'])

    document.querySelector<HTMLButtonElement>('[data-clip-export-open]')!.click(); document.getElementById('saveExport')!.click()
    await vi.waitFor(() => expect(preflight).toHaveBeenCalled())
    const exportedIds = (preflight.mock.calls[0]![1] as { candidateIds: string[] }).candidateIds
    expect(exportedIds).toHaveLength(500); expect(new Set(exportedIds).size).toBe(500)

    document.querySelector<HTMLButtonElement>('[data-clip-window="next"]')!.click()
    expect(document.querySelectorAll('.clip-candidate-list-row')).toHaveLength(20)
    await vi.waitFor(() => expect(document.querySelectorAll('.clip-candidate-actions')).toHaveLength(20))
    expect(document.getElementById('clipPoolWindowMeta')?.textContent).toContain('当前窗口 2 / 3')

    document.querySelector<HTMLButtonElement>('[data-clip-candidate-episode="episode-2"]')!.click()
    const search = document.getElementById('clipCandidateSearch') as HTMLInputElement; search.value = 'episode-1-candidate-01'; search.dispatchEvent(new Event('input', { bubbles: true }))
    expect(document.getElementById('clipCandidateRows')?.textContent).toContain('没有匹配当前筛选或搜索的候选')
    expect(document.getElementById('clipCandidateRows')?.textContent).not.toContain('episode-1-candidate-01')
    cleanup()
  })
})
