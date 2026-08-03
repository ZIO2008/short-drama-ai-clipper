// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { ClipCandidate, ClipEpisodeStatus, DesktopApi, EpisodeAsset } from '../../../shared/contracts.js'
import { bindOriginalClipWorkspaceRuntime, refreshOriginalClipWorkspace, selectOriginalClipWorkspaceCandidate } from './OriginalClipWorkspaceRuntimeBridge.js'

const episodes: EpisodeAsset[] = [
  { id: 'e1', episodeNo: 1, sortOrder: 1, sourcePath: 'D:\\episode-01.mp4', durationSeconds: 60, fps: 25, videoWidth: 1920, videoHeight: 1080, status: 'ready' },
  { id: 'e2', episodeNo: 2, sortOrder: 2, sourcePath: '', durationSeconds: null, fps: null, videoWidth: null, videoHeight: null, status: 'missing' }
]
const candidate = (id = 'candidate-1', status: ClipCandidate['status'] = 'pending_review'): ClipCandidate => ({ id, episodeId: 'e1', startSeconds: 10, endSeconds: 25, status, reason: null })
const statuses: ClipEpisodeStatus[] = [
  { episodeId: 'e1', episodeNo: 1, sourceStatus: 'ready', candidateCount: 1, pendingCount: 1, confirmedCount: 0, exportedCount: 0, failedCount: 0, productionStatus: 'pending_confirmation' },
  { episodeId: 'e2', episodeNo: 2, sourceStatus: 'missing', candidateCount: 0, pendingCount: 0, confirmedCount: 0, exportedCount: 0, failedCount: 0, productionStatus: 'missing_media' }
]
const surface = (): Document => {
  const result = document.implementation.createHTMLDocument('clip')
  result.body.innerHTML = '<section id="screen-clip"><div class="r5-panel-head"><span class="meta"></span></div><div class="r5-episodes"></div><div class="r5-frame"><i class="r5-window"></i><i class="r5-figure"></i><i class="r5-sub-region"></i><span class="r5-timecode"></span><div class="r5-monitor-caption"><span></span><span></span></div></div><section class="r5-timeline"><div class="r5-timeline-head"><span></span></div><div class="r5-track"><i class="r5-range"></i></div></section><section class="r5-timeline"><div class="r5-timeline-head"><span></span></div><div class="r5-track"><i class="r5-range"></i><i class="r5-anchor"></i></div></section><aside class="r5-inspector"><div class="r5-panel-head"><span class="meta"></span></div></aside><div class="r5-candidate-id"></div><div class="r5-nudge"><button></button><button></button><button></button><button></button></div><button data-r5-confirm></button><button data-r5-open="generate"></button><div class="r5-note"></div></section>'
  const inspectorBody = result.createElement('div'); inspectorBody.className = 'r5-inspector-body'
  inspectorBody.innerHTML = '<div data-inline-candidate-switcher><span data-inline-candidate-page-label></span><div class="r5-candidate-switch-grid"></div><button data-inline-candidate-page="prev"></button><span data-inline-candidate-window></span><button data-inline-candidate-page="next"></button></div>'
  result.querySelector('.r5-inspector')?.append(inspectorBody)
  return result
}
const api = (overrides: Partial<DesktopApi> = {}): DesktopApi => ({ listClipCandidates: vi.fn().mockResolvedValue([candidate()]), listClipEpisodeStatuses: vi.fn().mockResolvedValue(statuses), updateClipCandidate: vi.fn().mockImplementation(async (id, startSeconds, endSeconds) => candidate(id, 'editing') && { ...candidate(id, 'editing'), startSeconds, endSeconds }), confirmClipCandidate: vi.fn().mockResolvedValue(candidate('candidate-1', 'confirmed')), preflightClipGeneration: vi.fn().mockResolvedValue({ estimatedCandidates: 1, skipped: [] }), generateClipCandidates: vi.fn().mockResolvedValue([candidate('candidate-new')]), ...overrides } as DesktopApi)
const settle = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }

describe('bindOriginalClipWorkspaceRuntime', () => {
  it('replaces prototype fixtures with real episode and candidate data', async () => {
    const testDocument = surface(); Object.assign(window, { desktopApi: api() })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    expect(testDocument.querySelector('.r5-episodes')?.textContent).toContain('第 01 集')
    expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('candidat')
    expect(testDocument.querySelector('video')?.getAttribute('src')).toContain('episode-01.mp4')
  })
  it('uses only current real candidates in the four-item switcher and synchronizes selection', async () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({ ...candidate(`real-${index + 1}`), startSeconds: index * 5, endSeconds: index * 5 + 4 }))
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue(candidates) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    expect(testDocument.querySelectorAll('[data-inline-candidate]')).toHaveLength(4)
    expect(testDocument.querySelector('[data-inline-candidate]')?.getAttribute('data-inline-candidate')).toBe('real-1')
    testDocument.querySelector<HTMLButtonElement>('[data-inline-candidate-page="next"]')!.click()
    expect(testDocument.querySelector('[data-inline-candidate]')?.getAttribute('data-inline-candidate')).toBe('real-5')
    testDocument.querySelector<HTMLButtonElement>('[data-inline-candidate]')!.click()
    expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('real-5')
    expect(testDocument.querySelector('.r5-monitor-caption')?.textContent).toContain('00:00:20.000')
  })
  it('finds the switcher through the static prototype data-od-id', async () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({ ...candidate(`real-${index + 1}`), startSeconds: index * 5, endSeconds: index * 5 + 4 }))
    const testDocument = surface()
    const switcher = testDocument.querySelector<HTMLElement>('[data-inline-candidate-switcher]')!
    switcher.removeAttribute('data-inline-candidate-switcher')
    switcher.dataset.odId = 'clip-inline-candidate-switcher'
    Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue(candidates) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    expect(testDocument.querySelectorAll('[data-inline-candidate]')).toHaveLength(4)
    expect(testDocument.querySelector('[data-inline-candidate]')?.getAttribute('data-inline-candidate')).toBe('real-1')
  })
  it('keeps real candidate selection when the copied prototype consumes wrapper clicks', async () => {
    const candidates = [candidate('real-1'), { ...candidate('real-2'), startSeconds: 30, endSeconds: 45 }]
    const testDocument = surface()
    testDocument.querySelector('[data-inline-candidate-switcher]')?.addEventListener('click', (event) => event.stopPropagation())
    Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue(candidates) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    testDocument.querySelectorAll<HTMLButtonElement>('[data-inline-candidate]')[1]!.click()
    expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('real-2')
    expect(testDocument.querySelector('.r5-monitor-caption')?.textContent).toContain('00:00:30.000')
  })
  it('removes static monitor placeholders while retaining the real preview layer', async () => {
    const testDocument = surface(); Object.assign(window, { desktopApi: api() })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    expect(testDocument.querySelector('.r5-window')).toBeNull()
    expect(testDocument.querySelector('.r5-figure')).toBeNull()
    expect(testDocument.querySelector('.r5-sub-region')).toBeNull()
    expect(testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')?.getAttribute('src')).toContain('episode-01.mp4')
    expect(testDocument.querySelector('.r5-frame')?.classList.contains('original-clip-runtime-frame')).toBe(true)
    expect(testDocument.querySelector('.r5-timecode')?.textContent).toBe('00:00:10.000')
    expect(testDocument.querySelector('.r5-monitor-caption')?.textContent).toContain('candidat')
    expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('候选 candidat')
    expect(testDocument.querySelectorAll('.r5-timeline')).toHaveLength(2)
    expect(testDocument.querySelectorAll('.r5-timeline-head span')[0]?.textContent).toContain('第 01 集')
  })
  it('atomically switches to a missing episode without retaining the preceding candidate', async () => {
    const testDocument = surface(); Object.assign(window, { desktopApi: api() })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    testDocument.querySelectorAll<HTMLButtonElement>('[data-clip-episode-id]')[1]!.click()
    expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('暂无可编辑候选')
    expect(testDocument.querySelector('.r5-note')?.textContent).toContain('重新定位')
    expect(testDocument.querySelector<HTMLButtonElement>('[data-r5-confirm]')?.disabled).toBe(true)
    expect(testDocument.querySelector('video[data-original-clip-preview]')).toBeNull()
  })
  it('persists right-side time nudges using the selected candidate id', async () => {
    const updateClipCandidate = vi.fn().mockResolvedValue({ ...candidate(), status: 'editing', startSeconds: 10.1, endSeconds: 25 })
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ updateClipCandidate }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    testDocument.querySelectorAll<HTMLButtonElement>('.r5-nudge button')[1]!.click(); await settle()
    expect(updateClipCandidate).toHaveBeenCalledWith('candidate-1', 10.1, 25)
  })
  it('keeps the in point fixed when an out-point nudge reaches the minimum duration', async () => {
    const shortCandidate = { ...candidate(), endSeconds: 10.1 }
    const updateClipCandidate = vi.fn().mockResolvedValue(shortCandidate)
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ updateClipCandidate, listClipCandidates: vi.fn().mockResolvedValue([shortCandidate]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    testDocument.querySelectorAll<HTMLButtonElement>('.r5-nudge button')[2]!.click(); await settle()
    expect(updateClipCandidate).toHaveBeenCalledWith('candidate-1', 10, 10.1)
  })
  it('persists source-timeline clicks and drags as real candidate ranges', async () => {
    const updateClipCandidate = vi.fn().mockImplementation(async (id, startSeconds, endSeconds) => ({ ...candidate(id, 'editing'), startSeconds, endSeconds }))
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ updateClipCandidate }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    const sourceTrack = testDocument.querySelectorAll<HTMLElement>('.r5-track')[0]!
    Object.defineProperty(sourceTrack, 'getBoundingClientRect', { value: () => ({ left: 0, width: 100 }) })
    sourceTrack.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 80 }))
    testDocument.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 90 }))
    await vi.waitFor(() => expect(updateClipCandidate).toHaveBeenLastCalledWith('candidate-1', 45, 60))
  })
  it('confirms the real selected candidate rather than issuing a prototype toast', async () => {
    const confirmClipCandidate = vi.fn().mockResolvedValue(candidate('candidate-1', 'confirmed'))
    const listClipCandidates = vi.fn().mockResolvedValueOnce([candidate()]).mockResolvedValue([candidate('candidate-1', 'confirmed')])
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ confirmClipCandidate, listClipCandidates }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    testDocument.querySelector<HTMLButtonElement>('[data-r5-confirm]')!.click(); await settle()
    expect(confirmClipCandidate).toHaveBeenCalledWith('candidate-1')
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-note')?.textContent).toContain('confirmed'))
  })
  it('does not turn a candidate read failure into an ungenerated state', async () => {
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockRejectedValue(new Error('offline')) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    expect(testDocument.querySelector('.r5-note')?.textContent).toContain('读取失败')
    expect(testDocument.querySelector('.r5-note')?.textContent).not.toContain('尚未生成')
  })
  it('preflights before generating only the currently selected real episode', async () => {
    const preflightClipGeneration = vi.fn().mockResolvedValue({ estimatedCandidates: 1, skipped: [] })
    const created = candidate('new-candidate')
    const generateClipCandidates = vi.fn().mockResolvedValue([created])
    const listClipCandidates = vi.fn().mockResolvedValueOnce([candidate()]).mockResolvedValue([candidate(), created])
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ preflightClipGeneration, generateClipCandidates, listClipCandidates }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    testDocument.querySelector<HTMLButtonElement>('[data-r5-open="generate"]')!.click(); await settle()
    expect(preflightClipGeneration).toHaveBeenCalledWith('d1', expect.objectContaining({ episodeIds: ['e1'] }))
    expect(generateClipCandidates).toHaveBeenCalledWith('d1', expect.objectContaining({ episodeIds: ['e1'] }))
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('new-cand'))
  })
  it('switches the workspace to the episode of the first generated candidate', async () => {
    const secondEpisode = { ...episodes[1]!, id: 'e2', sourcePath: 'D:\\episode-02.mp4', durationSeconds: 60, status: 'ready' }
    const created = { ...candidate('new-e2'), episodeId: 'e2' }
    const listClipCandidates = vi.fn().mockResolvedValueOnce([candidate()]).mockResolvedValue([candidate(), created])
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ generateClipCandidates: vi.fn().mockResolvedValue([created]), listClipCandidates, listClipEpisodeStatuses: vi.fn().mockResolvedValue([{ ...statuses[0]! }, { ...statuses[0]!, episodeId: 'e2', episodeNo: 2 }]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes: [episodes[0]!, secondEpisode] }); await settle()
    testDocument.querySelector<HTMLButtonElement>('[data-r5-open="generate"]')!.click()
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('new-e2'))
    expect(testDocument.querySelector<HTMLButtonElement>('[data-clip-episode-id="e2"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')?.getAttribute('src')).toContain('episode-02.mp4')
  })
  it('keeps a newly mounted workspace target pending until its candidate list contains that target', async () => {
    const target = candidate('target-02')
    const listClipCandidates = vi.fn().mockResolvedValueOnce([candidate('stale-01')]).mockResolvedValue([candidate('stale-01'), target])
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes, initialCandidate: target }); await settle()
    expect(testDocument.querySelector('.r5-candidate-id')?.textContent).not.toContain('stale-0')
    refreshOriginalClipWorkspace(testDocument)
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('target-0'))
  })
  it('selects a candidate explicitly when a persistent clip workspace receives it from the pool', async () => {
    const secondEpisode = { ...episodes[1]!, id: 'e2', sourcePath: 'D:\\episode-02.mp4', durationSeconds: 60, status: 'ready' }
    const secondCandidate = { ...candidate('second-02'), episodeId: 'e2' }
    const listClipCandidates = vi.fn().mockResolvedValueOnce([candidate()]).mockResolvedValue([candidate(), secondCandidate])
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates, listClipEpisodeStatuses: vi.fn().mockResolvedValue([{ ...statuses[0]! }, { ...statuses[0]!, episodeId: 'e2', episodeNo: 2 }]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes: [episodes[0]!, secondEpisode] }); await settle()
    selectOriginalClipWorkspaceCandidate(testDocument, secondCandidate)
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('second-0'))
    expect(testDocument.querySelector<HTMLButtonElement>('[data-clip-episode-id="e2"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')?.getAttribute('src')).toContain('episode-02.mp4')
  })
  it('opens the selected pool candidate on its own four-item page', async () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({ ...candidate(`real-${index + 1}`), startSeconds: index * 5, endSeconds: index * 5 + 4 }))
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue(candidates) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    selectOriginalClipWorkspaceCandidate(testDocument, candidates[4]!)
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('real-5'))
    expect(testDocument.querySelector('[data-inline-candidate-window]')?.textContent).toBe('5–5 / 5')
    expect(testDocument.querySelector('[data-inline-candidate]')?.getAttribute('data-inline-candidate')).toBe('real-5')
  })
  it('refreshes candidates when a persistent workspace becomes active', async () => {
    const listClipCandidates = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([candidate('fresh-001')])
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('暂无可编辑候选')
    refreshOriginalClipWorkspace(testDocument)
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('fresh-00'))
  })
  it('keeps queued drag writes bound to the original candidate after switching episodes', async () => {
    const secondEpisode = { ...episodes[1]!, id: 'e2', sourcePath: 'D:\\episode-02.mp4', durationSeconds: 60, status: 'ready' }
    const secondCandidate = { ...candidate('candidate-2'), episodeId: 'e2' }
    let resolveFirst!: (value: ClipCandidate) => void
    const firstWrite = new Promise<ClipCandidate>((resolve) => { resolveFirst = resolve })
    const updateClipCandidate = vi.fn().mockImplementationOnce(() => firstWrite).mockImplementation(async (id, startSeconds, endSeconds) => ({ ...candidate(id, 'editing'), startSeconds, endSeconds }))
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ updateClipCandidate, listClipCandidates: vi.fn().mockResolvedValue([candidate(), secondCandidate]), listClipEpisodeStatuses: vi.fn().mockResolvedValue([{ ...statuses[0]! }, { ...statuses[0]!, episodeId: 'e2', episodeNo: 2 }]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes: [episodes[0]!, secondEpisode] }); await settle()
    const nudges = testDocument.querySelectorAll<HTMLButtonElement>('.r5-nudge button')
    nudges[1]!.click(); nudges[3]!.click()
    testDocument.querySelectorAll<HTMLButtonElement>('[data-clip-episode-id]')[1]!.click()
    resolveFirst({ ...candidate(), status: 'editing', startSeconds: 10.1 })
    await settle()
    expect(updateClipCandidate.mock.calls.every(([id]) => id === 'candidate-1')).toBe(true)
  })
  it('keeps the prototype HUD visible and ignores an old video error after returning to an episode', async () => {
    const secondEpisode = { ...episodes[1]!, id: 'e2', sourcePath: 'D:\\episode-02.mp4', durationSeconds: 60, status: 'ready' }
    const secondCandidate = { ...candidate('candidate-2'), episodeId: 'e2' }
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([candidate(), secondCandidate]), listClipEpisodeStatuses: vi.fn().mockResolvedValue([{ ...statuses[0]! }, { ...statuses[0]!, episodeId: 'e2', episodeNo: 2 }]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes: [episodes[0]!, secondEpisode] }); await settle()
    const firstEpisodeVideo = testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')!
    expect(firstEpisodeVideo.style.zIndex).toBe('0')
    expect(testDocument.querySelector<HTMLElement>('.r5-timecode')?.style.zIndex).toBe('1')
    expect(testDocument.querySelector<HTMLElement>('.r5-monitor-caption')?.style.zIndex).toBe('1')
    testDocument.querySelectorAll<HTMLButtonElement>('[data-clip-episode-id]')[1]!.click()
    testDocument.querySelectorAll<HTMLButtonElement>('[data-clip-episode-id]')[0]!.click()
    const currentEpisodeVideo = testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')!
    firstEpisodeVideo.dispatchEvent(new Event('error'))
    expect(testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')).toBe(currentEpisodeVideo)
    expect(testDocument.querySelector<HTMLButtonElement>('[data-r5-confirm]')?.disabled).toBe(false)
  })
})
