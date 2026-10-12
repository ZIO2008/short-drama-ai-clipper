// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { ClipCandidate, ClipEpisodeStatus, ClipExportBatch, DesktopApi, EpisodeAsset } from '../../../shared/contracts.js'
import { bindOriginalClipPoolReportRuntime } from './OriginalClipPoolReportRuntimeBridge.js'

const episode: EpisodeAsset = { id: 'e1', episodeNo: 1, sortOrder: 1, sourcePath: 'D:\\one.mp4', durationSeconds: 60, fps: 25, videoWidth: 1920, videoHeight: 1080, status: 'ready' }
const candidate = (id = 'candidate-1', status: ClipCandidate['status'] = 'confirmed'): ClipCandidate => ({ id, episodeId: 'e1', startSeconds: 10, endSeconds: 25, status, reason: null })
const status: ClipEpisodeStatus = { episodeId: 'e1', episodeNo: 1, sourceStatus: 'ready', candidateCount: 1, pendingCount: 0, confirmedCount: 1, exportedCount: 0, failedCount: 0, productionStatus: 'confirmed' }
const batch = (candidateIds: string[], items: ClipExportBatch['items'], value: ClipExportBatch['status'] = 'completed'): ClipExportBatch => ({ id: 'batch-1', dramaId: 'd1', candidateIds, status: value, reason: value === 'failed' ? '一项失败' : value === 'cancelled' ? '用户取消' : null, config: { namingPattern: 'clip_{episode}_{candidate}', encoding: 'h264-balanced', precisionMode: 'final', outputSize: 'source', subtitleStrategy: 'none', conflictStrategy: 'append', qualityMode: 'bitrate', bitrateKbps: 6000, targetSizeMb: null, fps: 25, packagingEnabled: false }, items, createdAt: '2026-01-01', updatedAt: '2026-01-01' })
const fixture = (): Document => { const result = document.implementation.createHTMLDocument('pool'); result.body.innerHTML = '<section id="screen-clip-pool"><div id="clipCandidateEpisodes"></div><h2 id="clipPoolTitle"></h2><span id="clipPoolWindowMeta"></span><button data-clip-filter="all"></button><button data-clip-filter="pending"></button><button data-clip-filter="confirmed"></button><button data-clip-filter="exported"></button><input id="clipCandidateSearch"><div id="clipCandidateRows"></div><aside class="clip-inspector-stat"><div><b>500</b></div><div><b>486</b></div><div><b>14</b></div><div><b>6</b></div></aside><button data-clip-export-open></button></section><section id="screen-clip-report"><div class="clip-task-summary"><div class="clip-task-summary-label"><b>原剧切片</b><small>120 集 · 已完成</small></div><div><b>120</b></div><div><b>500</b></div><div><b>486</b></div><div><b>14</b></div></div><div id="clipReportEpisodes"></div><h2 id="clipReportTitle"></h2><span id="clipReportMeta"></span><button data-clip-report-filter="all"></button><button data-clip-report-filter="exception"></button><div id="clipReportSummary"></div><div id="clipReportRows"></div></section><section id="exportModal" inert aria-hidden="true"><div class="modal-head"><span class="meta"></span></div><h2 id="exportTitle"></h2><button id="closeExport"></button><button id="cancelExport"></button><button id="saveExport"></button><button class="active" data-quality-mode="original"></button><button data-quality-mode="bitrate"></button><button data-quality-mode="size"></button><input id="exportBitrate" value="6000"><input id="exportTargetSize" value="100"><select id="exportFrameRate"><option selected>跟随原片</option><option>25 FPS</option></select><input id="exportDirectory"><button class="switch on" id="exportPackageToggle"></button><button id="configurePackagingFromExport"></button><div class="package-summary"></div></section><section id="packagingModal" inert aria-hidden="true"><button id="closePackaging"></button><button id="cancelPackaging"></button><button id="savePackaging"></button><button class="active" data-package-aspect="portrait"></button><button data-package-aspect="landscape"></button><select id="packagePreset"><option>剧目默认方案</option></select><input id="packageTitleInput" value="标题"><select id="packageTitlePosition"><option>顶部居中</option></select><input id="packagePromptInput" value="提示"><select id="packagePromptPosition"><option>左侧竖排</option></select><select id="packageBadge"><option>热播中</option></select><select id="packageTitleSize"><option value="medium">标准</option></select><select id="packageTitleTone"><option value="warm">暖白</option></select><select id="packagePromptStyle"><option value="solid">实底</option></select><select id="packageOverlay"><option value="subtle">轻</option></select></section>'; return result }
const api = (overrides: Partial<DesktopApi> = {}): DesktopApi => ({ listClipCandidates: vi.fn().mockResolvedValue([candidate()]), listClipEpisodeStatuses: vi.fn().mockResolvedValue([status]), listMaterials: vi.fn().mockResolvedValue([]), getLatestClipExportBatch: vi.fn().mockResolvedValue(null), chooseOutputDirectory: vi.fn().mockResolvedValue('D:\\output'), preflightClipExport: vi.fn().mockResolvedValue({ candidateIds: ['candidate-1'], count: 1, totalDurationSeconds: 15, estimatedSizeBytes: 1, outputDirectory: 'D:\\output', namingPattern: 'clip', encoding: 'h264-balanced', outputSize: 'source', subtitleStrategy: 'none', conflictStrategy: 'append', blocked: [] }), startClipExport: vi.fn().mockResolvedValue({ exportId: 'export-1', total: 1, completed: 0, status: 'running', results: [] }), getClipExportProgress: vi.fn().mockResolvedValue({ exportId: 'export-1', total: 1, completed: 1, status: 'completed', results: [] }), cancelClipExport: vi.fn(), ...overrides } as DesktopApi)
const settle = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
const selectForExport = async (document: Document, id: string): Promise<void> => { await vi.waitFor(() => expect(document.querySelector(`[data-clip-export-candidate="${id}"]`)).not.toBeNull()); document.querySelector<HTMLInputElement>(`[data-clip-export-candidate="${id}"]`)!.click() }

describe('bindOriginalClipPoolReportRuntime', () => {
  it('never exports unselected historical results and keeps explicit selection across filters', async () => {
    const preflight = vi.fn().mockResolvedValue({ blocked: [] })
    const testDocument = fixture()
    Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([candidate('new-confirmed', 'confirmed'), candidate('old-exported', 'exported')]), preflightClipExport: preflight }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    testDocument.querySelector<HTMLButtonElement>('[data-clip-export-open]')!.click()
    expect(testDocument.querySelector<HTMLButtonElement>('#saveExport')?.disabled).toBe(true)
    expect(preflight).not.toHaveBeenCalled()
    testDocument.querySelector<HTMLButtonElement>('#closeExport')!.click()
    await selectForExport(testDocument, 'new-confirmed')
    testDocument.querySelector<HTMLButtonElement>('[data-clip-filter="exported"]')!.click()
    await vi.waitFor(() => expect(testDocument.querySelector<HTMLInputElement>('[data-clip-export-candidate="old-exported"]')?.checked).toBe(false))
    testDocument.querySelector<HTMLButtonElement>('[data-clip-export-open]')!.click()
    expect(testDocument.querySelector('#exportModal .modal-head .meta')?.textContent).toContain('已选择 1 项')
    testDocument.querySelector<HTMLButtonElement>('#saveExport')!.click(); await settle()
    expect(preflight).toHaveBeenCalledWith('d1', expect.objectContaining({ candidateIds: ['new-confirmed'] }))
  })
  it('uses real candidates for search, opening and export preflight', async () => {
    const open = vi.fn(); const testDocument = fixture(); const preflight = vi.fn().mockResolvedValue({ candidateIds: ['candidate-1'], count: 1, totalDurationSeconds: 15, estimatedSizeBytes: 1, outputDirectory: 'D:\\output', namingPattern: 'clip', encoding: 'h264-balanced', outputSize: 'source', subtitleStrategy: 'none', conflictStrategy: 'append', blocked: [] }); Object.assign(window, { desktopApi: api({ preflightClipExport: preflight }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: open }); await settle()
    expect(testDocument.getElementById('clipPoolTitle')?.textContent).toContain('第 01 集')
    testDocument.querySelector<HTMLInputElement>('#clipCandidateSearch')!.value = 'candidate-1'; testDocument.querySelector<HTMLInputElement>('#clipCandidateSearch')!.dispatchEvent(new Event('input', { bubbles: true }))
    testDocument.querySelector<HTMLButtonElement>('[data-clip-open-candidate]')!.click(); expect(open).toHaveBeenCalledWith(candidate())
    await selectForExport(testDocument, 'candidate-1'); testDocument.querySelector<HTMLButtonElement>('[data-clip-export-open]')!.click(); testDocument.getElementById('saveExport')!.click(); await settle()
    expect(preflight).toHaveBeenCalledWith('d1', expect.objectContaining({ candidateIds: ['candidate-1'], outputDirectory: 'D:\\切片' }))
  })
  it('offers an exported candidate for a new configuration without reselecting a folder', async () => {
    const preflight = vi.fn().mockResolvedValue({ blocked: [] })
    const chooseOutputDirectory = vi.fn()
    const testDocument = fixture()
    Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([candidate('already-exported', 'exported')]), preflightClipExport: preflight, chooseOutputDirectory }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    await selectForExport(testDocument, 'already-exported'); testDocument.querySelector<HTMLButtonElement>('[data-clip-export-open]')!.click()
    expect(testDocument.querySelector('#exportModal .modal-head .meta')?.textContent).toContain('再次导出')
    expect(testDocument.querySelector<HTMLButtonElement>('#saveExport')?.disabled).toBe(false)
    testDocument.querySelector<HTMLButtonElement>('#saveExport')!.click(); await settle()
    expect(preflight).toHaveBeenCalledWith('d1', expect.objectContaining({ candidateIds: ['already-exported'] }))
    expect(chooseOutputDirectory).not.toHaveBeenCalled()
  })
  it('defaults to a 切片 subdirectory and accepts a manually edited output directory', async () => {
    const preflight = vi.fn().mockResolvedValue({ candidateIds: ['candidate-1'], count: 1, totalDurationSeconds: 15, estimatedSizeBytes: 1, outputDirectory: 'D:\\custom', namingPattern: 'clip', encoding: 'copy', outputSize: 'source', subtitleStrategy: 'none', conflictStrategy: 'append', blocked: [] })
    const testDocument = fixture(); Object.assign(window, { desktopApi: api({ preflightClipExport: preflight }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    await selectForExport(testDocument, 'candidate-1'); testDocument.querySelector<HTMLButtonElement>('[data-clip-export-open]')!.click()
    const directory = testDocument.querySelector<HTMLInputElement>('#exportDirectory')!
    expect(directory.value).toBe('D:\\切片')
    expect(directory.readOnly).toBe(false)
    directory.value = 'D:\\custom'; directory.dispatchEvent(new Event('input', { bubbles: true }))
    testDocument.getElementById('saveExport')!.click(); await settle()
    expect(preflight).toHaveBeenCalledWith('d1', expect.objectContaining({ outputDirectory: 'D:\\custom' }))
  })
  it('filters real candidate statuses through the production bridge', async () => {
    const items = [candidate('pending-1', 'pending_review'), candidate('editing-1', 'editing'), candidate('confirmed-1', 'confirmed'), candidate('exported-1', 'exported')]
    const testDocument = fixture(); Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue(items) }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    testDocument.querySelector<HTMLButtonElement>('[data-clip-filter="pending"]')!.click(); expect(testDocument.querySelectorAll('.clip-candidate-list-row')).toHaveLength(2); expect(testDocument.getElementById('clipCandidateRows')?.textContent).toContain('pending-'); expect(testDocument.getElementById('clipCandidateRows')?.textContent).toContain('editing-')
    testDocument.querySelector<HTMLButtonElement>('[data-clip-filter="confirmed"]')!.click(); expect(testDocument.querySelectorAll('.clip-candidate-list-row')).toHaveLength(1); expect(testDocument.querySelector('[data-clip-open-candidate="confirmed-1"]')).not.toBeNull()
    testDocument.querySelector<HTMLButtonElement>('[data-clip-filter="exported"]')!.click(); expect(testDocument.querySelectorAll('.clip-candidate-list-row')).toHaveLength(1); expect(testDocument.querySelector('[data-clip-open-candidate="exported-1"]')).not.toBeNull()
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
    expect([...testDocument.querySelectorAll<HTMLElement>('.clip-task-summary > div:not(.clip-task-summary-label) > b')].map((node) => node.textContent)).toEqual(['0', '0', '0', '0'])
  })

  it('clears both existing summary slots when the real data read fails', async () => {
    const testDocument = fixture(); Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockRejectedValue(new Error('候选读取失败')) }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    expect([...testDocument.querySelectorAll<HTMLElement>('.clip-inspector-stat > div > b')].map((node) => node.textContent)).toEqual(['—', '—', '—', '—'])
    expect([...testDocument.querySelectorAll<HTMLElement>('.clip-task-summary > div:not(.clip-task-summary-label) > b')].map((node) => node.textContent)).toEqual(['—', '—', '—', '—'])
    expect(testDocument.getElementById('clipReportMeta')?.textContent).toContain('统计未知')
  })

  it('replaces pool and report demo totals with their distinct real aggregates', async () => {
    const confirmed = candidate('confirmed-1', 'confirmed'); const exported = candidate('exported-1', 'exported'); const review = candidate('review-1', 'pending_review'); const failed = candidate('failed-1', 'failed'); const testDocument = fixture()
    Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([confirmed, exported, review, failed]), getLatestClipExportBatch: vi.fn().mockResolvedValue(batch(['exported-1'], [{ candidateId: 'exported-1', status: 'exported', reason: null, materialId: null }])) }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    expect([...testDocument.querySelectorAll<HTMLElement>('.clip-inspector-stat > div > b')].map((node) => node.textContent)).toEqual(['2', '1', '1', '2'])
    expect([...testDocument.querySelectorAll<HTMLElement>('.clip-task-summary > div:not(.clip-task-summary-label) > b')].map((node) => node.textContent)).toEqual(['1', '1', '0', '0'])
    expect(testDocument.querySelector('.clip-task-summary small')?.textContent).toBe('1 集 · 已完成')
  })

  it('maps quality, frame-rate and packaging controls into the real export config', async () => {
    const preflight = vi.fn().mockResolvedValue({ candidateIds: ['candidate-1'], count: 1, totalDurationSeconds: 15, estimatedSizeBytes: 1, outputDirectory: 'D:\\output', namingPattern: 'clip', encoding: 'h264-balanced', outputSize: '1920x1080', subtitleStrategy: 'none', conflictStrategy: 'append', blocked: [] })
    const testDocument = fixture(); Object.assign(window, { desktopApi: api({ preflightClipExport: preflight }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    testDocument.querySelector<HTMLButtonElement>('[data-quality-mode="bitrate"]')!.click(); testDocument.querySelector<HTMLSelectElement>('#exportFrameRate')!.value = '25 FPS'; testDocument.getElementById('exportPackageToggle')!.click()
    testDocument.querySelector<HTMLButtonElement>('[data-package-aspect="landscape"]')!.click(); await selectForExport(testDocument, 'candidate-1'); testDocument.querySelector<HTMLButtonElement>('[data-clip-export-open]')!.click(); testDocument.getElementById('saveExport')!.click(); await settle()
    expect(preflight).toHaveBeenCalledWith('d1', expect.objectContaining({ qualityMode: 'bitrate', bitrateKbps: 6000, fps: 25, packagingEnabled: false, outputSize: 'source' }))
  })

  it('closes an export dialog without cancelling, and only cancels after explicit cancellation', async () => {
    const cancel = vi.fn().mockResolvedValue({ exportId: 'export-1', total: 1, completed: 0, status: 'cancelled', results: [] })
    const pending = new Promise<never>(() => undefined); const testDocument = fixture(); Object.assign(window, { desktopApi: api({ cancelClipExport: cancel, getClipExportProgress: vi.fn().mockReturnValue(pending) }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    await selectForExport(testDocument, 'candidate-1'); testDocument.querySelector<HTMLButtonElement>('[data-clip-export-open]')!.click(); testDocument.getElementById('saveExport')!.click(); await settle()
    testDocument.getElementById('closeExport')!.click(); expect(cancel).not.toHaveBeenCalled()
    testDocument.getElementById('cancelExport')!.click(); await settle(); expect(cancel).toHaveBeenCalledWith('export-1')
  })

  it('renders only candidates belonging to the actual completed batch', async () => {
    const exported = candidate('candidate-exported', 'exported'); const outside = candidate('outside-1', 'exported'); const testDocument = fixture()
    Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([exported, outside]), getLatestClipExportBatch: vi.fn().mockResolvedValue(batch(['candidate-exported'], [{ candidateId: 'candidate-exported', status: 'exported', reason: null, materialId: 'material-1' }])), listMaterials: vi.fn().mockResolvedValue([{ id: 'material-1', dramaId: 'd1', taskId: 'task-1', taskItemId: 'candidate-exported', path: 'D:\\output\\clip.mp4', durationSeconds: 15, fps: 25, sizeBytes: 1, createdAt: '2026-01-01' }]) }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    expect(testDocument.getElementById('clipReportRows')?.textContent).toContain('C-candidat')
    expect(testDocument.getElementById('clipReportRows')?.textContent).not.toContain('outside-1')
  })

  it('renders failed and cancelled batch item facts and exposes the frozen config summary', async () => {
    const exported = candidate('exported-1', 'exported'); const failed = { ...candidate('failed-1', 'failed'), reason: '边界验证失败' }; const cancelled = candidate('cancelled-1', 'confirmed'); const testDocument = fixture()
    Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([exported, failed, cancelled]), getLatestClipExportBatch: vi.fn().mockResolvedValue(batch(['exported-1', 'failed-1', 'cancelled-1'], [{ candidateId: 'exported-1', status: 'exported', reason: null, materialId: null }, { candidateId: 'failed-1', status: 'failed', reason: '边界验证失败', materialId: null }, { candidateId: 'cancelled-1', status: 'cancelled', reason: '用户取消', materialId: null }], 'failed')) }) })
    bindOriginalClipPoolReportRuntime({ document: testDocument, dramaId: 'd1', episodes: [episode], onOpenCandidate: vi.fn() }); await settle()
    expect(testDocument.getElementById('clipReportMeta')?.textContent).toContain('6000 kbps')
    expect(testDocument.getElementById('clipReportRows')?.textContent).toContain('边界验证失败')
    expect(testDocument.getElementById('clipReportRows')?.textContent).toContain('用户取消')
    testDocument.querySelector<HTMLButtonElement>('[data-clip-report-filter="exception"]')!.click()
    expect(testDocument.querySelectorAll('.clip-report-list-row')).toHaveLength(2)
  })
})
