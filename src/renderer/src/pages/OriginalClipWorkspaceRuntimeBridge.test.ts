// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { ClipCandidate } from '../../../shared/contracts.js'
import { bindOriginalClipWorkspaceRuntime, refreshOriginalClipWorkspace, selectOriginalClipWorkspaceCandidate } from './OriginalClipWorkspaceRuntimeBridge.js'
import { api, candidate, episodes, settle, statuses, surface } from './original-clip-workspace-test-helpers.js'

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
    expect(testDocument.querySelector('.r5-frame')?.classList.contains('clip-media-missing')).toBe(true)
    expect(testDocument.querySelector('.clip-missing-message')?.textContent).toContain('第 02 集源媒体不可读')
    expect(testDocument.querySelector('.clip-missing-message')?.textContent).toContain('重新定位源文件')
  })
  it('rejects timeline positioning after a selected episode media load fails', async () => {
    const testDocument = surface(); Object.assign(window, { desktopApi: api() })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')?.dispatchEvent(new Event('error'))
    await settle()
    const track = testDocument.querySelector<HTMLElement>('.r5-timeline .r5-track')!
    track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 40 }))
    expect(testDocument.querySelector('video[data-original-clip-preview]')).toBeNull()
    expect(testDocument.querySelector('.r5-frame')?.classList.contains('clip-media-missing')).toBe(true)
    expect(testDocument.querySelector('[data-clip-source-time]')?.textContent).toBe('—')
  })
  it('persists right-side time nudges using the selected candidate id', async () => {
    const updateClipCandidate = vi.fn().mockResolvedValue({ ...candidate(), status: 'editing', startSeconds: 10.1, endSeconds: 25 })
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ updateClipCandidate }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    testDocument.querySelectorAll<HTMLButtonElement>('[data-clip-nudge]')[1]!.click(); await settle()
    expect(updateClipCandidate).toHaveBeenCalledWith('candidate-1', 10.1, 25)
  })
  it('keeps the in point fixed when an out-point nudge reaches the minimum duration', async () => {
    const shortCandidate = { ...candidate(), endSeconds: 10.1 }
    const updateClipCandidate = vi.fn().mockResolvedValue(shortCandidate)
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ updateClipCandidate, listClipCandidates: vi.fn().mockResolvedValue([shortCandidate]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    testDocument.querySelectorAll<HTMLButtonElement>('[data-clip-nudge]')[2]!.click(); await settle()
    expect(updateClipCandidate).toHaveBeenCalledWith('candidate-1', 10, 10.1)
  })
  it('uses source-timeline clicks and drags only to seek without changing candidate boundaries', async () => {
    const updateClipCandidate = vi.fn().mockImplementation(async (id, startSeconds, endSeconds) => ({ ...candidate(id, 'editing'), startSeconds, endSeconds }))
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ updateClipCandidate }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    const sourceTrack = testDocument.querySelectorAll<HTMLElement>('.r5-track')[0]!
    Object.defineProperty(sourceTrack, 'getBoundingClientRect', { value: () => ({ left: 0, width: 100 }) })
    sourceTrack.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 80 }))
    testDocument.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 90 }))
    expect(testDocument.querySelector('[data-clip-source-time]')?.textContent).toBe('00:00:54.000')
    expect(updateClipCandidate).not.toHaveBeenCalled()
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
    const generateClipCandidates = vi.fn().mockResolvedValue({ taskId: 'generation-1', status: 'running', stage: 'text-semantics', startedAt: '2026-08-12T00:00:00.000Z' })
    const listClipCandidates = vi.fn().mockResolvedValueOnce([candidate()]).mockResolvedValue([candidate(), created])
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ preflightClipGeneration, generateClipCandidates, listClipCandidates, listTasks: vi.fn().mockResolvedValue([{ id: 'generation-1', status: 'running' }]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    testDocument.querySelector<HTMLButtonElement>('[data-r5-open="generate"]')!.click(); await settle()
    expect(preflightClipGeneration).toHaveBeenCalledWith('d1', expect.objectContaining({ episodeIds: ['e1'] }))
    expect(generateClipCandidates).toHaveBeenCalledWith('d1', expect.objectContaining({ episodeIds: ['e1'] }))
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-note')?.textContent).toContain('正在生成候选'))
  })
  it('keeps partial-success blocked evidence visible with exactly one recovery route', async () => {
    const created = candidate('partial-candidate')
    const listClipCandidates = vi.fn().mockResolvedValueOnce([candidate()]).mockResolvedValue([candidate(), created])
    const listTasks = vi.fn().mockResolvedValue([{ id: 'partial-task', type: 'original_clip', status: 'reviewing', checkpointReason: '本次有 1 条候选未纳入：查看素材资产。', episodeIds: ['e1'], updatedAt: '2026-08-12T00:00:00.000Z' }])
    const onRecoveryNavigate = vi.fn()
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ generateClipCandidates: vi.fn().mockResolvedValue({ taskId: 'partial-task', status: 'running', stage: 'text-semantics', startedAt: '2026-08-12T00:00:00.000Z' }), listClipCandidates, listTasks }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes, onRecoveryNavigate }); await settle()
    testDocument.querySelector<HTMLButtonElement>('[data-r5-open="generate"]')!.click()
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-note')?.textContent).toContain('未纳入'))
    const recovery = testDocument.querySelectorAll<HTMLButtonElement>('[data-clip-recovery]')
    expect(recovery).toHaveLength(1); expect(recovery[0]!.dataset.clipRecovery).toBe('assets')
    recovery[0]!.click(); expect(onRecoveryNavigate).toHaveBeenCalledWith('assets')
  })
  it('restores the dedicated deadline decision controls after reopening the workspace', async () => {
    const decideIntelligentClipDeadline = vi.fn().mockResolvedValue(undefined)
    const listTasks = vi.fn().mockResolvedValue([{ id: 'decision-task', type: 'original_clip', status: 'paused', checkpointStage: 'awaiting-decision', checkpointReason: '已达到本阶段目标时间；请在有限延期内选择继续或停止。', episodeIds: ['e1'], updatedAt: '2026-08-12T00:00:00.000Z' }])
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listTasks, decideIntelligentClipDeadline }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    const continueButton = testDocument.querySelector<HTMLButtonElement>('[data-clip-deadline-continue]')
    const stopButton = testDocument.querySelector<HTMLButtonElement>('[data-clip-deadline-stop]')
    expect(continueButton?.dataset.clipDeadlineContinue).toBe('decision-task')
    expect(stopButton?.dataset.clipDeadlineStop).toBe('decision-task')
    continueButton?.click(); await settle()
    expect(decideIntelligentClipDeadline).toHaveBeenCalledWith('decision-task', 'continue')
  })
  it.each([
    ['cancelled', '操作员取消候选生成。'],
    ['interrupted', '应用关闭或重启，文本语义候选生成已中断。'],
    ['failed', '文本语义供应商配置已变化，候选未发布。']
  ])('restores the latest %s generation fact instead of presenting an empty state', async (status, reason) => {
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([]), listTasks: vi.fn().mockResolvedValue([{ id: `${status}-task`, type: 'original_clip', status, checkpointStage: status, checkpointReason: reason, episodeIds: ['e1'], updatedAt: '2026-08-22T00:01:00.000Z' }]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    expect(testDocument.querySelector('.r5-note')?.textContent).toContain(reason)
    expect(testDocument.querySelector('.r5-note')?.textContent).not.toContain('本集还没有真实候选')
  })
  it('does not let an older blocked task override a newer successful candidate round', async () => {
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listTasks: vi.fn().mockResolvedValue([
      { id: 'old-blocked', type: 'original_clip', status: 'failed', taskRound: 1, checkpointReason: '字幕证据门禁未纳入候选。', episodeIds: ['e1'], updatedAt: '2026-08-22T00:01:00.000Z' },
      { id: 'new-reviewing', type: 'original_clip', status: 'reviewing', taskRound: 2, checkpointReason: '已生成 1 条候选，等待人工审阅。', episodeIds: ['e1'], updatedAt: '2026-08-22T00:01:00.000Z' }
    ]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    expect(testDocument.querySelector('.r5-note')?.textContent).toContain('候选待确认')
    expect(testDocument.querySelector('.r5-note')?.textContent).not.toContain('字幕证据门禁')
  })
  it('switches the workspace to the episode of the first generated candidate', async () => {
    const secondEpisode = { ...episodes[1]!, id: 'e2', sourcePath: 'D:\\episode-02.mp4', durationSeconds: 60, status: 'ready' }
    const created = { ...candidate('new-e2'), episodeId: 'e2' }
    const listClipCandidates = vi.fn().mockResolvedValueOnce([candidate()]).mockResolvedValue([candidate(), created])
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ generateClipCandidates: vi.fn().mockResolvedValue({ taskId: 'generation-2', status: 'running', stage: 'text-semantics', startedAt: '2026-08-12T00:00:00.000Z' }), listClipCandidates, listTasks: vi.fn().mockResolvedValue([{ id: 'generation-2', status: 'running' }]), listClipEpisodeStatuses: vi.fn().mockResolvedValue([{ ...statuses[0]! }, { ...statuses[0]!, episodeId: 'e2', episodeNo: 2 }]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes: [episodes[0]!, secondEpisode] }); await settle()
    testDocument.querySelector<HTMLButtonElement>('[data-r5-open="generate"]')!.click()
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-note')?.textContent).toContain('正在生成候选'))
    expect(testDocument.querySelector<HTMLButtonElement>('[data-clip-episode-id="e1"]')?.getAttribute('aria-pressed')).toBe('true')
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
    const nudges = testDocument.querySelectorAll<HTMLButtonElement>('[data-clip-nudge]')
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
  it('maps source PTS and candidate-relative time while keeping review modes non-persistent', async () => {
    const updateClipCandidate = vi.fn()
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ updateClipCandidate }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    expect(testDocument.querySelector('[data-clip-source-time]')?.textContent).toBe('00:00:10.000')
    expect(testDocument.querySelector('[data-clip-relative-time]')?.textContent).toBe('00:00:00.000')
    testDocument.querySelector<HTMLButtonElement>('[data-clip-review="context"]')!.click()
    expect(testDocument.querySelector('[data-clip-review-description]')?.textContent).toContain('入点前 1 秒')
    expect(testDocument.querySelector('[data-clip-source-time]')?.textContent).toBe('00:00:09.000')
    expect(updateClipCandidate).not.toHaveBeenCalled()
  })
  it('uses one-second candidate-timeline keyboard seeking without changing candidate boundaries', async () => {
    const updateClipCandidate = vi.fn()
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ updateClipCandidate }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    const candidateTrack = testDocument.querySelectorAll<HTMLElement>('.r5-track')[1]!
    const preview = testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')!
    Object.defineProperty(preview, 'pause', { configurable: true, value: vi.fn() })
    candidateTrack.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    expect(preview.pause).toHaveBeenCalled()
    expect(testDocument.querySelector('[data-clip-source-time]')?.textContent).toBe('00:00:10.000')
    candidateTrack.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    expect(testDocument.querySelector('[data-clip-source-time]')?.textContent).toBe('00:00:11.000')
    expect(testDocument.querySelector('[data-clip-relative-time]')?.textContent).toBe('00:00:01.000')
    expect(updateClipCandidate).not.toHaveBeenCalled()
  })
  it('keeps speed, volume, loop and candidate-end playback in the session only', async () => {
    const updateClipCandidate = vi.fn()
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ updateClipCandidate }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    const preview = testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')!
    Object.defineProperty(preview, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) })
    expect([...testDocument.querySelectorAll<HTMLButtonElement>('[data-clip-speed]')].map((button) => button.dataset.clipSpeed)).toEqual(['0.5', '1', '1.5', '2'])
    Object.defineProperty(preview, 'pause', { configurable: true, value: vi.fn() })
    testDocument.querySelector<HTMLButtonElement>('[data-clip-speed-trigger]')!.click()
    testDocument.querySelector<HTMLButtonElement>('[data-clip-speed="2"]')!.click()
    expect(preview.playbackRate).toBe(2)
    const volume = testDocument.querySelector<HTMLInputElement>('#clipVolumePopover input')!
    volume.value = '0'; volume.dispatchEvent(new Event('input', { bubbles: true }))
    expect(preview.muted).toBe(true)
    testDocument.querySelector<HTMLButtonElement>('[data-clip-play]')!.click()
    testDocument.querySelector<HTMLButtonElement>('[data-clip-loop]')!.click()
    preview.currentTime = 25; preview.dispatchEvent(new Event('timeupdate'))
    expect(preview.currentTime).toBe(10)
    expect(updateClipCandidate).not.toHaveBeenCalled()
  })
  it('starts context review one second before the in point and stops or loops at its exact end', async () => {
    const testDocument = surface(); Object.assign(window, { desktopApi: api() })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    const preview = testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')!
    Object.defineProperty(preview, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) })
    Object.defineProperty(preview, 'pause', { configurable: true, value: vi.fn() })
    testDocument.querySelector<HTMLButtonElement>('[data-clip-review="context"]')!.click()
    expect(preview.currentTime).toBe(9)
    testDocument.querySelector<HTMLButtonElement>('[data-clip-play]')!.click()
    preview.currentTime = 26; preview.dispatchEvent(new Event('timeupdate'))
    expect(preview.pause).toHaveBeenCalled()
    expect(testDocument.querySelector('[data-clip-source-time]')?.textContent).toBe('00:00:26.000')
    testDocument.querySelector<HTMLButtonElement>('[data-clip-loop]')!.click()
    testDocument.querySelector<HTMLButtonElement>('[data-clip-play]')!.click()
    preview.currentTime = 26; preview.dispatchEvent(new Event('timeupdate'))
    expect(preview.currentTime).toBe(9)
  })
  it('scopes Space to the workbench and releases the preceding media before changing episodes', async () => {
    const secondEpisode = { ...episodes[1]!, id: 'e2', sourcePath: 'D:\\episode-02.mp4', durationSeconds: 60, status: 'ready' }
    const secondCandidate = { ...candidate('candidate-2'), episodeId: 'e2' }
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([candidate(), secondCandidate]), listClipEpisodeStatuses: vi.fn().mockResolvedValue([{ ...statuses[0]! }, { ...statuses[0]!, episodeId: 'e2', episodeNo: 2 }]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes: [episodes[0]!, secondEpisode] }); await settle()
    const first = testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')!
    Object.defineProperty(first, 'play', { configurable: true, value: vi.fn().mockResolvedValue(undefined) })
    Object.defineProperty(first, 'pause', { configurable: true, value: vi.fn() })
    testDocument.querySelectorAll<HTMLElement>('.r5-track')[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(first.play).toHaveBeenCalledTimes(1)
    const input = testDocument.createElement('input'); testDocument.getElementById('screen-clip')!.append(input)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(first.play).toHaveBeenCalledTimes(1)
    const button = testDocument.createElement('button'); testDocument.getElementById('screen-clip')!.append(button)
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(first.play).toHaveBeenCalledTimes(1)
    for (const value of ['', 'plaintext-only']) {
      const editable = testDocument.createElement('div'); editable.setAttribute('contenteditable', value); const child = testDocument.createElement('span'); editable.append(child); testDocument.getElementById('screen-clip')!.append(editable)
      child.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
      expect(first.play).toHaveBeenCalledTimes(1)
    }
    testDocument.querySelectorAll<HTMLButtonElement>('[data-clip-episode-id]')[1]!.click()
    expect(first.pause).toHaveBeenCalled()
    expect(testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')).not.toBe(first)
  })
})
