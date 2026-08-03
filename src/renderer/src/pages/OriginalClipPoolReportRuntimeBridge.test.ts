// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { ClipCandidate, ClipEpisodeStatus, DesktopApi, EpisodeAsset } from '../../../shared/contracts.js'
import { bindOriginalClipPoolReportRuntime } from './OriginalClipPoolReportRuntimeBridge.js'

const episode: EpisodeAsset = { id: 'e1', episodeNo: 1, sortOrder: 1, sourcePath: 'D:\\one.mp4', durationSeconds: 60, fps: 25, videoWidth: 1920, videoHeight: 1080, status: 'ready' }
const candidate = (id = 'candidate-1', status: ClipCandidate['status'] = 'confirmed'): ClipCandidate => ({ id, episodeId: 'e1', startSeconds: 10, endSeconds: 25, status, reason: null })
const status: ClipEpisodeStatus = { episodeId: 'e1', episodeNo: 1, sourceStatus: 'ready', candidateCount: 1, pendingCount: 0, confirmedCount: 1, exportedCount: 0, failedCount: 0, productionStatus: 'confirmed' }
const fixture = (): Document => { const result = document.implementation.createHTMLDocument('pool'); result.body.innerHTML = '<section id="screen-clip-pool"><div id="clipCandidateEpisodes"></div><h2 id="clipPoolTitle"></h2><span id="clipPoolWindowMeta"></span><button data-clip-filter="all"></button><button data-clip-filter="pending"></button><button data-clip-filter="confirmed"></button><button data-clip-filter="exported"></button><input id="clipCandidateSearch"><div id="clipCandidateRows"></div><button data-clip-export-open></button></section><section id="screen-clip-report"><div id="clipReportEpisodes"></div><h2 id="clipReportTitle"></h2><span id="clipReportMeta"></span><button data-clip-report-filter="all"></button><button data-clip-report-filter="exception"></button><div id="clipReportSummary"></div><div id="clipReportRows"></div></section><section id="exportModal" inert aria-hidden="true"><div class="modal-head"><span class="meta"></span></div><h2 id="exportTitle"></h2><button id="closeExport"></button><button id="cancelExport"></button><button id="saveExport"></button><button class="active" data-quality-mode="original"></button><button data-quality-mode="bitrate"></button><button data-quality-mode="size"></button><input id="exportBitrate" value="6000"><input id="exportTargetSize" value="100"><select id="exportFrameRate"><option selected>跟随原片</option><option>25 FPS</option></select><input id="exportDirectory"><button class="switch on" id="exportPackageToggle"></button><button id="configurePackagingFromExport"></button><div class="package-summary"></div></section><section id="packagingModal" inert aria-hidden="true"><button id="closePackaging"></button><button id="cancelPackaging"></button><button id="savePackaging"></button><button class="active" data-package-aspect="portrait"></button><button data-package-aspect="landscape"></button><select id="packagePreset"><option>剧目默认方案</option></select><input id="packageTitleInput" value="标题"><select id="packageTitlePosition"><option>顶部居中</option></select><input id="packagePromptInput" value="提示"><select id="packagePromptPosition"><option>左侧竖排</option></select><select id="packageBadge"><option>热播中</option></select><select id="packageTitleSize"><option value="medium">标准</option></select><select id="packageTitleTone"><option value="warm">暖白</option></select><select id="packagePromptStyle"><option value="solid">实底</option></select><select id="packageOverlay"><option value="subtle">轻</option></select></section>'; return result }
const api = (overrides: Partial<DesktopApi> = {}): DesktopApi => ({ listClipCandidates: vi.fn().mockResolvedValue([candidate()]), listClipEpisodeStatuses: vi.fn().mockResolvedValue([status]), listMaterials: vi.fn().mockResolvedValue([]), getLatestClipExportBatch: vi.fn().mockResolvedValue(null), chooseOutputDirectory: vi.fn().mockResolvedValue('D:\\output'), preflightClipExport: vi.fn().mockResolvedValue({ candidateIds: ['candidate-1'], count: 1, totalDurationSeconds: 15, estimatedSizeBytes: 1, outputDirectory: 'D:\\output', namingPattern: 'clip', encoding: 'h264-balanced', outputSize: 'source', subtitleStrategy: 'none', conflictStrategy: 'append', blocked: [] }), startClipExport: vi.fn().mockResolvedValue({ exportId: 'export-1', total: 1, completed: 0, status: 'running', results: [] }), getClipExportProgress: vi.fn().mockResolvedValue({ exportId: 'export-1', total: 1, completed: 1, status: 'completed', results: [] }), cancelClipExport: vi.fn(), ...overrides } as DesktopApi)
const settle = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

describe('bindOriginalClipPoolReportRuntime', () => {
  it('uses real candidates for search, opening and export preflight', async () => {
    const open = vi.fn(); const testDocument = fixture(); const preflight = vi.fn().mockResolvedValue({ candidateIds: ['candidate-1'], count: 1, totalDurationSeconds: 15, estimatedSizeBytes: 1, outputDirectory: 'D:\\output', namingPattern: 'clip', encoding: 'h264-balanced', outputSize: 'source', subtitleStrategy: 'none', conflictStrategy: 'append', blocked: [] }); Object.assign(window, { desktopApi: api({ preflightClipExport: preflight }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: open }); await settle()
    expect(testDocument.getElementById('clipPoolTitle')?.textContent).toContain('第 01 集')
    testDocument.querySelector<HTMLInputElement>('#clipCandidateSearch')!.value = 'candidate-1'; testDocument.querySelector<HTMLInputElement>('#clipCandidateSearch')!.dispatchEvent(new Event('input', { bubbles: true }))
    testDocument.querySelector<HTMLButtonElement>('[data-clip-open-candidate]')!.click(); expect(open).toHaveBeenCalledWith(candidate())
    testDocument.querySelector<HTMLButtonElement>('[data-clip-export-open]')!.click(); testDocument.getElementById('saveExport')!.click(); await settle()
    expect(preflight).toHaveBeenCalledWith('d1', expect.objectContaining({ candidateIds: ['candidate-1'], outputDirectory: 'D:\\output' }))
  })
  it('renders the prototype trash icon and deletes only a confirmed real candidate after confirmation', async () => {
    const remove = vi.fn().mockResolvedValue(undefined); const list = vi.fn().mockResolvedValueOnce([candidate()]).mockResolvedValue([]); const testDocument = fixture(); vi.spyOn(window, 'confirm').mockReturnValue(true); Object.assign(window, { desktopApi: api({ deleteClipCandidate: remove, listClipCandidates: list }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    const button = testDocument.querySelector<HTMLButtonElement>('[data-clip-delete-candidate]')!
    expect(button.innerHTML).toContain('<svg')
    button.click(); await settle()
    expect(remove).toHaveBeenCalledWith('candidate-1')
    await vi.waitFor(() => expect(testDocument.getElementById('clipCandidateRows')?.textContent).toContain('尚未生成真实候选'))
  })
  it('keeps the delete icon disabled for exported candidates', async () => {
    const testDocument = fixture(); Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([candidate('exported-1', 'exported')]) }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    expect(testDocument.querySelector<HTMLButtonElement>('[data-clip-delete-candidate]')?.disabled).toBe(true)
  })
  it('does not substitute a report when no real completed batch exists', async () => {
    const testDocument = fixture(); Object.assign(window, { desktopApi: api() })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    expect(testDocument.getElementById('clipReportMeta')?.textContent).toContain('没有真实完成导出批次')
    expect(testDocument.getElementById('clipReportRows')?.textContent).toContain('尚无可查看的真实完成报告')
  })

  it('maps quality, frame-rate and packaging controls into the real export config', async () => {
    const preflight = vi.fn().mockResolvedValue({ candidateIds: ['candidate-1'], count: 1, totalDurationSeconds: 15, estimatedSizeBytes: 1, outputDirectory: 'D:\\output', namingPattern: 'clip', encoding: 'h264-balanced', outputSize: '1920x1080', subtitleStrategy: 'none', conflictStrategy: 'append', blocked: [] })
    const testDocument = fixture(); Object.assign(window, { desktopApi: api({ preflightClipExport: preflight }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    testDocument.querySelector<HTMLButtonElement>('[data-quality-mode="bitrate"]')!.click(); testDocument.querySelector<HTMLSelectElement>('#exportFrameRate')!.value = '25 FPS'; testDocument.getElementById('exportPackageToggle')!.click()
    testDocument.querySelector<HTMLButtonElement>('[data-package-aspect="landscape"]')!.click(); testDocument.querySelector<HTMLButtonElement>('[data-clip-export-open]')!.click(); testDocument.getElementById('saveExport')!.click(); await settle()
    expect(preflight).toHaveBeenCalledWith('d1', expect.objectContaining({ qualityMode: 'bitrate', bitrateKbps: 6000, fps: 25, packagingEnabled: false, outputSize: 'source' }))
  })

  it('closes an export dialog without cancelling, and only cancels after explicit cancellation', async () => {
    const cancel = vi.fn().mockResolvedValue({ exportId: 'export-1', total: 1, completed: 0, status: 'cancelled', results: [] })
    const pending = new Promise<never>(() => undefined); const testDocument = fixture(); Object.assign(window, { desktopApi: api({ cancelClipExport: cancel, getClipExportProgress: vi.fn().mockReturnValue(pending) }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    testDocument.querySelector<HTMLButtonElement>('[data-clip-export-open]')!.click(); testDocument.getElementById('saveExport')!.click(); await settle()
    testDocument.getElementById('closeExport')!.click(); expect(cancel).not.toHaveBeenCalled()
    testDocument.getElementById('cancelExport')!.click(); await settle(); expect(cancel).toHaveBeenCalledWith('export-1')
  })

  it('renders only candidates belonging to the actual completed batch', async () => {
    const exported = candidate('candidate-exported', 'exported'); const outside = candidate('outside-1', 'exported'); const testDocument = fixture()
    Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([exported, outside]), getLatestClipExportBatch: vi.fn().mockResolvedValue({ id: 'batch-1', dramaId: 'd1', candidateIds: ['candidate-exported'], status: 'completed', reason: null, createdAt: '2026-01-01', updatedAt: '2026-01-01' }), listMaterials: vi.fn().mockResolvedValue([{ id: 'material-1', dramaId: 'd1', taskId: 'task-1', taskItemId: 'candidate-exported', path: 'D:\\output\\clip.mp4', durationSeconds: 15, fps: 25, sizeBytes: 1, createdAt: '2026-01-01' }]) }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    expect(testDocument.getElementById('clipReportRows')?.textContent).toContain('C-candidat')
    expect(testDocument.getElementById('clipReportRows')?.textContent).not.toContain('outside-1')
  })
})
