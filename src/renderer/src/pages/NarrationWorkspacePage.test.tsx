// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, DramaDetail, NarrationTask } from '../../../shared/contracts.js'
import { NarrationWorkspacePage } from './NarrationWorkspacePage.js'

afterEach(cleanup)

const drama: DramaDetail = { id: 'drama', name: '测试剧目', episodeCount: 2, issueCount: 0, tagNames: [], updatedAt: '2026-07-21', episodes: [{ id: 'episode-1', episodeNo: 1, sortOrder: 1, sourcePath: 'episode-1.mp4', durationSeconds: 60, fps: 25, status: 'ready' }, { id: 'episode-2', episodeNo: 2, sortOrder: 2, sourcePath: 'episode-2.mp4', durationSeconds: 60, fps: 25, status: 'ready' }] }
const task: NarrationTask = { id: 'task-1', dramaId: 'drama', status: 'completed', config: { episodeStart: 1, episodeEnd: 2, mode: 'conflict-insert', durationMinSeconds: 30, durationMaxSeconds: 60, maxDrafts: 3, voice: 'general-mandarin', controlledMode: 'success', costLimit: 0 }, cost: { estimated: 0, actual: 0, mode: 'controlled', region: 'local', provider: 'controlled', costLimit: 0 }, checkpoint: { outcome: 'segments-ready' } }

describe('NarrationWorkspacePage', () => {
  it('creates a controlled conflict-insert draft and exposes its audit handoff', async () => {
    const createNarrationTask = vi.fn().mockResolvedValue({ taskId: 'task-1' })
    const onOpenReview = vi.fn()
    window.desktopApi = { listAiCapabilityStatus: vi.fn().mockResolvedValue([{ capability: 'tts', mode: 'controlled', reason: 'missing-secret' }]), createNarrationTask, runNarrationTask: vi.fn().mockResolvedValue({ taskId: 'task-1', outcome: 'segments-ready', segments: [] }), getNarrationTask: vi.fn().mockResolvedValue(task), listNarrationSegments: vi.fn().mockResolvedValue([{ id: 'segment-1', draftId: 'draft-1', evidenceId: 'evidence-1', narrationAssetId: 'asset-1', assetPath: 'narration.wav', text: '根据原片证据：关键冲突。', targetDurationSeconds: 30, insertStartSeconds: 12, insertEndSeconds: 24, confidence: 0.9, mode: 'conflict-insert', status: 'pending_review' }]) } as unknown as DesktopApi
    render(<NarrationWorkspacePage drama={drama} onBack={vi.fn()} onOpenReview={onOpenReview} />)
    expect(await screen.findByText('受控本地验证模式')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '冲突插入原片' }))
    fireEvent.click(screen.getByRole('button', { name: '生成解说审核草稿' }))
    await waitFor(() => expect(createNarrationTask).toHaveBeenCalledWith(expect.objectContaining({ dramaId: 'drama', mode: 'conflict-insert', voice: 'general-mandarin' })))
    expect(await screen.findByText('关键冲突插入原片')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '进入审核时间线' }))
    expect(onOpenReview).toHaveBeenCalledWith('draft-1')
  })
})
