// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { ClipCandidate } from '../../../shared/contracts.js'
import { bindOriginalClipWorkspaceRuntime, refreshOriginalClipWorkspace, selectOriginalClipWorkspaceCandidate } from './OriginalClipWorkspaceRuntimeBridge.js'
import { api, candidate, episodes, settle, statuses, surface } from './original-clip-workspace-test-helpers.js'

const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done }); return { promise, resolve } }

describe('OriginalClipWorkspaceRuntimeBridge async isolation', () => {
  it('discards an older refresh that resolves after the newer refresh', async () => {
    const first = deferred<ClipCandidate[]>(); const newest = candidate('newest-02'); const listClipCandidates = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue([newest])
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    refreshOriginalClipWorkspace(testDocument)
    await vi.waitFor(() => expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('newest-0'))
    first.resolve([candidate('stale-01')]); await settle()
    expect(testDocument.querySelector('.r5-candidate-id')?.textContent).toContain('newest-0')
    expect(testDocument.querySelector('.r5-candidate-id')?.textContent).not.toContain('stale-01')
  })

  it('releases the current media and shows failure when seeking throws', async () => {
    const testDocument = surface(); Object.assign(window, { desktopApi: api() })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    const preview = testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')!; const pause = vi.fn(); Object.defineProperty(preview, 'pause', { configurable: true, value: pause }); Object.defineProperty(preview, 'currentTime', { configurable: true, get: () => 10, set: () => { throw new Error('seek failed') } })
    const track = testDocument.querySelector<HTMLElement>('.r5-timeline .r5-track')!; Object.defineProperty(track, 'getBoundingClientRect', { value: () => ({ left: 0, width: 100 }) }); track.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 40 }))
    expect(pause).toHaveBeenCalled(); expect(testDocument.querySelector('video[data-original-clip-preview]')).toBeNull(); expect(testDocument.querySelector('.r5-frame')?.classList.contains('clip-media-missing')).toBe(true); expect(testDocument.querySelector<HTMLButtonElement>('[data-r5-confirm]')?.disabled).toBe(true)
  })

  it('pauses and seeks to the in point when selecting an inline candidate', async () => {
    const second = { ...candidate('candidate-2'), startSeconds: 30, endSeconds: 40 }; const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([candidate(), second]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    const preview = testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')!; const pause = vi.fn(); Object.defineProperty(preview, 'pause', { configurable: true, value: pause })
    testDocument.querySelectorAll<HTMLButtonElement>('[data-inline-candidate]')[1]!.click()
    expect(pause).toHaveBeenCalled(); expect(preview.currentTime).toBe(30); expect(testDocument.querySelectorAll<HTMLButtonElement>('[data-inline-candidate]')[1]?.getAttribute('aria-pressed')).toBe('true')
  })

  it('releases the previous episode and seeks a cross-episode candidate to its in point', async () => {
    const secondEpisode = { ...episodes[1]!, id: 'e2', sourcePath: 'D:\\episode-02.mp4', durationSeconds: 60, status: 'ready' }; const second = { ...candidate('candidate-2'), episodeId: 'e2', startSeconds: 30, endSeconds: 40 }
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([candidate(), second]), listClipEpisodeStatuses: vi.fn().mockResolvedValue([{ ...statuses[0]! }, { ...statuses[0]!, episodeId: 'e2', episodeNo: 2 }]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes: [episodes[0]!, secondEpisode] }); await settle()
    const first = testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')!; const pause = vi.fn(); Object.defineProperty(first, 'pause', { configurable: true, value: pause })
    selectOriginalClipWorkspaceCandidate(testDocument, second); await settle()
    const current = testDocument.querySelector<HTMLVideoElement>('video[data-original-clip-preview]')!; expect(pause).toHaveBeenCalled(); expect(current).not.toBe(first); expect(current.dataset.episodeId).toBe('e2'); expect(current.currentTime).toBe(30)
  })

  it('renders the frozen inspector evidence in the existing note slot', async () => {
    const inspected = { ...candidate(), semanticEventIds: ['event-1'], sceneAnchorIds: ['anchor-1'], evidence: { beat: 'climax' as const, purpose: 'hook' as const, context: 'limited' as const, narrativeState: 'completion' as const, seamStatus: 'closed' as const, claims: [{ kind: 'core-event' as const, evidenceCount: 1, reason: '核心事件已回链' }], reviewStatus: 'supported' as const, reviewReason: '局部复核支持', durationDeviationSeconds: 1.2, durationDeviationReason: '与目标 12.0 秒偏离 1.2 秒。' } }
    const testDocument = surface(); Object.assign(window, { desktopApi: api({ listClipCandidates: vi.fn().mockResolvedValue([inspected]) }) })
    bindOriginalClipWorkspaceRuntime({ document: testDocument, dramaId: 'd1', episodes }); await settle()
    const note = testDocument.querySelector('.r5-note')?.textContent ?? ''
    expect(note).toContain('节拍：高点'); expect(note).toContain('用途：开场钩子'); expect(note).toContain('局部视频复核已支持'); expect(note).toContain('偏离 1.2 秒')
    expect(testDocument.querySelector<HTMLElement>('.r5-anchor')?.getAttribute('aria-label')).toBe('当前预览位置')
  })
})
