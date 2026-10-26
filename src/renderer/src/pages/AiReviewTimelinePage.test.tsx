// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, TimelineProject } from '../../../shared/contracts.js'
import { AiReviewTimelinePage } from './AiReviewTimelinePage.js'

afterEach(cleanup)

const project: TimelineProject = { id: 'timeline', draftId: 'draft', updatedAt: '2026-07-21', timeline: { version: 1, snapEnabled: true, video: [{ id: 'video', sourcePath: 'episode.mp4', sourceStartSeconds: 12, sourceEndSeconds: 21, positionSeconds: 9, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, transition: 'cut', transitionDurationSeconds: 0, role: 'conflict' }], music: [[], []], sfx: [[{ id: 'narration', sourcePath: 'narration.wav', sourceStartSeconds: 0, sourceEndSeconds: 9, positionSeconds: 0, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, transition: 'cut', transitionDurationSeconds: 0, role: 'narration', sourceEvidenceId: 'evidence-1', narrationText: '根据原片证据：关键冲突。', duckOriginalAudio: true }], []] } }

describe('AiReviewTimelinePage', () => {
  it('makes a P2 narration clip inspectable and editable on the fixed audio track', async () => {
    const saveTimelineProject = vi.fn().mockResolvedValue(project)
    window.desktopApi = { getTimelineProject: vi.fn().mockResolvedValue(project), saveTimelineProject, chooseAudioFile: vi.fn().mockResolvedValue(null) } as unknown as DesktopApi
    render(<AiReviewTimelinePage draftId="draft" origin="P2" onBack={vi.fn()} />)
    await screen.findByRole('heading', { name: '固定轨道时间线' })
    fireEvent.click(screen.getByRole('button', { name: '旁白 0.0–9.0s' }))
    expect(await screen.findByRole('heading', { name: '旁白资产' })).toBeTruthy()
    expect(screen.getByText('根据原片证据：关键冲突。')).toBeTruthy()
    expect(screen.getByText('来源证据：evidence-1 · 旁白期间原片人声避让至 35%')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('位置（秒）'), { target: { value: '2' } })
    await waitFor(() => expect(saveTimelineProject).toHaveBeenCalledWith('draft', expect.objectContaining({ sfx: expect.any(Array) })))
  })

  it('uses the static-prototype heading for a P1 review draft', async () => {
    window.desktopApi = { getTimelineProject: vi.fn().mockResolvedValue(project), chooseAudioFile: vi.fn().mockResolvedValue(null) } as unknown as DesktopApi
    render(<AiReviewTimelinePage draftId="draft" origin="P1" onBack={vi.fn()} />)
    expect(await screen.findByRole('heading', { name: '候选草稿 01' })).toBeTruthy()
    expect(screen.getByText('P1 审核草稿 · 自动保存')).toBeTruthy()
  })

  it('persists trimming and allows free positioning after snap is disabled', async () => {
    const saveTimelineProject = vi.fn().mockImplementation(async (_draftId, timeline) => ({ ...project, timeline }))
    window.desktopApi = { getTimelineProject: vi.fn().mockResolvedValue(project), saveTimelineProject, chooseAudioFile: vi.fn().mockResolvedValue(null) } as unknown as DesktopApi
    render(<AiReviewTimelinePage draftId="draft" origin="P2" onBack={vi.fn()} />)
    await screen.findByRole('heading', { name: '固定轨道时间线' })
    fireEvent.click(screen.getByRole('button', { name: '旁白 0.0–9.0s' }))
    fireEvent.click(screen.getByRole('button', { name: '时间线吸附' }))
    await waitFor(() => expect(saveTimelineProject).toHaveBeenLastCalledWith('draft', expect.objectContaining({ snapEnabled: false })))
    fireEvent.change(screen.getByLabelText('位置（秒）'), { target: { value: '2.3' } })
    await waitFor(() => expect(saveTimelineProject).toHaveBeenLastCalledWith('draft', expect.objectContaining({ sfx: expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ positionSeconds: 2.3 })])]) })))
    fireEvent.change(screen.getByLabelText('入点（秒）'), { target: { value: '1' } })
    await waitFor(() => expect(saveTimelineProject).toHaveBeenLastCalledWith('draft', expect.objectContaining({ sfx: expect.arrayContaining([expect.arrayContaining([expect.objectContaining({ positionSeconds: 2.3, sourceStartSeconds: 1 })])]) })))
  })

  it('returns a confirmed draft to editing after adding audio so it can be confirmed again', async () => {
    const confirmedProject = { ...project, confirmed: true }
    const addTimelineAudio = vi.fn().mockResolvedValue({ ...project, confirmed: false })
    window.desktopApi = { getTimelineProject: vi.fn().mockResolvedValue(confirmedProject), addTimelineAudio, chooseAudioFile: vi.fn().mockResolvedValue('music.mp3') } as unknown as DesktopApi
    render(<AiReviewTimelinePage draftId="draft" onBack={vi.fn()} />)
    await screen.findByRole('heading', { name: '候选草稿 01' })
    expect(screen.getByRole('button', { name: '已确认审核草稿' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '为音乐 1 添加音频' }))
    await waitFor(() => expect(addTimelineAudio).toHaveBeenCalled())
    expect((await screen.findByRole('button', { name: '确认审核草稿' })).hasAttribute('disabled')).toBe(false)
  })

  it('opens a modal export settings flow and exports from the top action after confirmation', async () => {
    const confirmTimelineDraft = vi.fn().mockResolvedValue({ ...project, confirmed: true })
    const exportTimelineDraft = vi.fn().mockResolvedValue({ outputPath: 'D:/exports/draft.mp4' })
    const chooseOutputDirectory = vi.fn().mockResolvedValue('D:/exports')
    window.desktopApi = { getTimelineProject: vi.fn().mockResolvedValue(project), chooseOutputDirectory, confirmTimelineDraft, exportTimelineDraft, chooseAudioFile: vi.fn().mockResolvedValue(null) } as unknown as DesktopApi
    render(<AiReviewTimelinePage draftId="draft" onBack={vi.fn()} />)
    await screen.findByRole('heading', { name: '候选草稿 01' })
    fireEvent.click(screen.getByRole('button', { name: '导出设置' }))
    expect(await screen.findByRole('dialog', { name: '导出设置' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '选择' }))
    await waitFor(() => expect(chooseOutputDirectory).toHaveBeenCalledOnce())
    expect((screen.getByLabelText('输出目录') as HTMLInputElement).value).toBe('D:/exports')
    fireEvent.click(screen.getByRole('button', { name: '保存导出设置' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '导出设置' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: '确认并导出' }))
    await waitFor(() => expect(confirmTimelineDraft).toHaveBeenCalledWith('draft'))
    await waitFor(() => expect(exportTimelineDraft).toHaveBeenCalledWith('draft', 'D:/exports'))
  })

  it('closes export settings with Escape and restores focus to its opener', async () => {
    window.desktopApi = { getTimelineProject: vi.fn().mockResolvedValue(project), chooseAudioFile: vi.fn().mockResolvedValue(null) } as unknown as DesktopApi
    render(<AiReviewTimelinePage draftId="draft" onBack={vi.fn()} />)
    await screen.findByRole('heading', { name: '候选草稿 01' })
    const opener = await screen.findByRole('button', { name: '导出设置' })
    opener.focus()
    fireEvent.click(opener)
    await screen.findByRole('dialog', { name: '导出设置' })
    fireEvent.keyDown(screen.getByRole('dialog', { name: '导出设置' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '导出设置' })).toBeNull())
    expect(document.activeElement).toBe(opener)
  })

  it('keeps export settings open and reports a directory chooser failure', async () => {
    window.desktopApi = { getTimelineProject: vi.fn().mockResolvedValue(project), chooseOutputDirectory: vi.fn().mockRejectedValue(new Error('目录选择器不可用')), chooseAudioFile: vi.fn().mockResolvedValue(null) } as unknown as DesktopApi
    render(<AiReviewTimelinePage draftId="draft" onBack={vi.fn()} />)
    await screen.findByRole('heading', { name: '候选草稿 01' })
    fireEvent.click(screen.getByRole('button', { name: '导出设置' }))
    const dialog = await screen.findByRole('dialog', { name: '导出设置' })
    fireEvent.click(screen.getByRole('button', { name: '选择' }))
    expect((await screen.findByRole('alert')).textContent).toContain('目录选择器不可用')
    expect(dialog).toBeTruthy()
  })
})
