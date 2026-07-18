// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DramaDetail, MultiEpisodePreflight } from '../../../shared/contracts.js'
import { MultiEpisodeWorkspacePage } from './MultiEpisodeWorkspacePage.js'

const drama: DramaDetail = { id: 'd1', name: '测试剧目', episodeCount: 4, issueCount: 0, tagNames: [], updatedAt: '2026-01-01', episodes: [] }
const result: MultiEpisodePreflight = { preflightId: '00000000-0000-4000-8000-000000000001', windows: [{ startEpisode: 1, endEpisode: 2, episodeNumbers: [1, 2], durationSeconds: 120, status: 'ready', reason: null, ok: true, estimatedSizeMb: 20, estimatedBitrateKbps: null }] }

describe('MultiEpisodeWorkspacePage', () => {
  it('uses the server preflight, invalidates it on config edits, then binds create and run', async () => {
    const onPreflight = vi.fn().mockResolvedValue(result)
    const onCreateTask = vi.fn().mockResolvedValue({ taskId: 'task-1', windows: result.windows })
    const onRunTask = vi.fn().mockResolvedValue(undefined)
    render(<MultiEpisodeWorkspacePage drama={drama} onBack={vi.fn()} onPreflight={onPreflight} onCreateTask={onCreateTask} onRunTask={onRunTask} onChooseOutputDirectory={vi.fn().mockResolvedValue(null)} />)
    fireEvent.change(screen.getByPlaceholderText('选择输出目录'), { target: { value: 'C:/output' } })
    fireEvent.click(screen.getByRole('button', { name: '开始预检' }))
    await waitFor(() => expect(screen.getByText('真实预检结果')).toBeTruthy())
    expect(onPreflight).toHaveBeenCalledWith('d1', expect.objectContaining({ outputDirectory: 'C:/output' }))
    expect(screen.getByText('20.0 MB')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回修改' }))
    fireEvent.change(screen.getByPlaceholderText('选择输出目录'), { target: { value: 'C:/other' } })
    await waitFor(() => expect(screen.queryByText('真实预检结果')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: '开始预检' }))
    await waitFor(() => expect(screen.getByText('真实预检结果')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '确认预检并运行' }))
    await waitFor(() => expect(onCreateTask).toHaveBeenCalledWith('d1', expect.objectContaining({ preflightId: result.preflightId, preflightConfirmed: true })))
    expect(onRunTask).toHaveBeenCalledWith('task-1')
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('任务已完成，可在成果库和任务中心查看报告。'))
  })
})
