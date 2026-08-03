// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, DramaDetail, MultiEpisodePreflight, TaskReportItem, TaskSummary } from '../../../shared/contracts.js'
import { MultiEpisodeRunningPanel } from './MultiEpisodeRunningPanel.js'
import { MultiEpisodeWorkspacePage } from './MultiEpisodeWorkspacePage.js'

const drama: DramaDetail = { id: 'd1', name: '测试剧目', episodeCount: 4, issueCount: 0, tagNames: [], updatedAt: '2026-01-01', episodes: [] }
const result: MultiEpisodePreflight = { preflightId: '00000000-0000-4000-8000-000000000001', windows: [{ startEpisode: 1, endEpisode: 2, episodeNumbers: [1, 2], durationSeconds: 120, status: 'ready', reason: null, ok: true, estimatedSizeMb: 20, estimatedBitrateKbps: null }] }
const task: TaskSummary = { id: 'task-1', dramaId: 'd1', dramaName: '测试剧目', type: 'multi_episode', status: 'completed', progressCurrent: 1, progressTotal: 1 }
const taskItems: TaskReportItem[] = [{ id: 'item-1', plannedRange: JSON.stringify({ episodeNumbers: [1, 2] }), actualRange: JSON.stringify([1, 2]), status: 'succeeded', reason: null, outputPath: 'C:/output/测试剧目_第001-002集.mp4' }]

describe('MultiEpisodeWorkspacePage', () => {
  afterEach(() => { cleanup(); window.sessionStorage.clear(); Reflect.deleteProperty(window, 'desktopApi') })

  it('explains why preflight is unavailable before an output directory is chosen', () => {
    render(<MultiEpisodeWorkspacePage drama={drama} onBack={vi.fn()} onPreflight={vi.fn()} onCreateTask={vi.fn()} onRunTask={vi.fn()} onChooseOutputDirectory={vi.fn().mockResolvedValue(null)} />)
    expect(screen.getByText('请先选择输出根目录，才能开始预检。')).toBeTruthy()
    expect(screen.getByRole('button', { name: '开始预检' }).hasAttribute('disabled')).toBe(true)
  })

  it('uses the server preflight, invalidates it on config edits, then binds create and run', async () => {
    const onPreflight = vi.fn().mockResolvedValue(result)
    const onCreateTask = vi.fn().mockResolvedValue({ taskId: 'task-1', windows: result.windows })
    const onRunTask = vi.fn().mockResolvedValue(undefined)
    const onOpenResults = vi.fn()
    window.desktopApi = { getTaskReport: vi.fn().mockResolvedValue(taskItems), listTasks: vi.fn().mockResolvedValue([task]) } as unknown as DesktopApi
    render(<MultiEpisodeWorkspacePage drama={drama} onBack={vi.fn()} onPreflight={onPreflight} onCreateTask={onCreateTask} onRunTask={onRunTask} onChooseOutputDirectory={vi.fn().mockResolvedValue(null)} onOpenResults={onOpenResults} />)
    fireEvent.click(screen.getByRole('button', { name: '完整导出设置' }))
    expect(document.activeElement).toBe(screen.getAllByRole('button', { name: '原质量' })[1])
    fireEvent.change(within(screen.getByRole('dialog', { name: '导出设置' })).getByPlaceholderText('选择输出目录'), { target: { value: 'C:/output' } })
    fireEvent.change(within(screen.getByRole('dialog', { name: '导出设置' })).getByLabelText('性能模式'), { target: { value: 'speed' } })
    fireEvent.click(screen.getByRole('button', { name: '保存导出设置' }))
    fireEvent.click(screen.getByRole('button', { name: '开始预检' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '预检已完成' })).toBeTruthy())
    expect(onPreflight).toHaveBeenCalledWith('d1', expect.objectContaining({ outputDirectory: 'C:/output', performanceMode: 'speed' }))
    expect(screen.getByText('20.0 MB')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '预计时长' })).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: '处理策略' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回修改' }))
    fireEvent.click(screen.getByRole('button', { name: '完整导出设置' }))
    fireEvent.change(within(screen.getByRole('dialog', { name: '导出设置' })).getByPlaceholderText('选择输出目录'), { target: { value: 'C:/other' } })
    fireEvent.click(screen.getByRole('button', { name: '保存导出设置' }))
    await waitFor(() => expect(screen.queryByRole('heading', { name: '预检已完成' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: '开始预检' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: '预检已完成' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '确认预检并运行' }))
    await waitFor(() => expect(onCreateTask).toHaveBeenCalledWith('d1', expect.objectContaining({ preflightId: result.preflightId, preflightConfirmed: true })))
    expect(onRunTask).toHaveBeenCalledWith('task-1')
    await waitFor(() => expect(screen.getByRole('heading', { name: '本次任务结果已登记' })).toBeTruthy())
    expect(screen.getByText('测试剧目_第001-002集.mp4')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '打开成果库' }))
    expect(onOpenResults).toHaveBeenCalledOnce()
  })

  it('restores a persisted running task directly in the running stage and does not read a report before a terminal status', async () => {
    const runningTask: TaskSummary = { ...task, status: 'running', progressCurrent: 3, progressTotal: 8, elapsedMs: 78_000, checkpointStage: 'FFmpeg 本地合成' }
    const getTaskReport = vi.fn().mockResolvedValue(taskItems)
    window.sessionStorage.setItem('shortdrama.multiEpisodeTask.d1', 'task-1')
    window.desktopApi = { getTaskReport, listTasks: vi.fn().mockResolvedValue([runningTask]) } as unknown as DesktopApi
    render(<MultiEpisodeWorkspacePage drama={drama} onBack={vi.fn()} onPreflight={vi.fn()} onCreateTask={vi.fn()} onRunTask={vi.fn()} onChooseOutputDirectory={vi.fn().mockResolvedValue(null)} />)
    await waitFor(() => expect(screen.getByRole('button', { name: '3 运行' }).hasAttribute('disabled')).toBe(false))
    expect(screen.getByRole('button', { name: '4 报告' }).hasAttribute('disabled')).toBe(true)
    expect(await screen.findByRole('heading', { name: '后台任务运行中' })).toBeTruthy()
    expect(screen.getByLabelText('任务进度 38%')).toBeTruthy()
    expect(screen.getByText('00:01:18')).toBeTruthy()
    expect(screen.getByText('当前阶段 · FFmpeg 本地合成')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '本次任务结果已登记' })).toBeNull()
    expect(getTaskReport).not.toHaveBeenCalled()
  })

  it('clears a persisted pointer when the task belongs to another drama', async () => {
    window.sessionStorage.setItem('shortdrama.multiEpisodeTask.d1', 'task-other')
    window.desktopApi = { getTaskReport: vi.fn(), listTasks: vi.fn().mockResolvedValue([{ ...task, id: 'task-other', dramaId: 'd2' }]) } as unknown as DesktopApi
    render(<MultiEpisodeWorkspacePage drama={drama} onBack={vi.fn()} onPreflight={vi.fn()} onCreateTask={vi.fn()} onRunTask={vi.fn()} onChooseOutputDirectory={vi.fn().mockResolvedValue(null)} />)
    await waitFor(() => expect(window.sessionStorage.getItem('shortdrama.multiEpisodeTask.d1')).toBeNull())
    expect(screen.getByRole('button', { name: '4 报告' }).hasAttribute('disabled')).toBe(true)
  })

  it('returns to configuration and keeps the real missing-task error visible when a running task disappears', async () => {
    const runningTask: TaskSummary = { ...task, status: 'running' }
    let tasks: TaskSummary[] = [runningTask]
    window.sessionStorage.setItem('shortdrama.multiEpisodeTask.d1', 'task-1')
    window.desktopApi = { getTaskReport: vi.fn(), listTasks: vi.fn(() => Promise.resolve(tasks)) } as unknown as DesktopApi
    render(<MultiEpisodeWorkspacePage drama={drama} onBack={vi.fn()} onPreflight={vi.fn()} onCreateTask={vi.fn()} onRunTask={vi.fn()} onChooseOutputDirectory={vi.fn().mockResolvedValue(null)} />)
    await screen.findByRole('heading', { name: '后台任务运行中' })
    tasks = []
    await screen.findByText('当前多集拼接任务不存在、不属于本剧，或已被删除。', {}, { timeout: 2_000 })
    expect(screen.getByRole('button', { name: '开始预检' })).toBeTruthy()
  })

  it('does not invent a checkpoint when task state has not recorded one', () => {
    render(<MultiEpisodeRunningPanel task={{ ...task, status: 'running', checkpointStage: undefined }} taskId="task-1" taskControl="running" message={null} onBack={vi.fn()} onControl={vi.fn()} />)
    expect(screen.getByText('当前阶段 · 未记录')).toBeTruthy()
    expect(screen.queryByText('当前阶段 · 后台队列')).toBeNull()
  })

  it('clears a persisted pointer when the matching task id belongs to another production type', async () => {
    const getTaskReport = vi.fn()
    window.sessionStorage.setItem('shortdrama.multiEpisodeTask.d1', 'task-1')
    window.desktopApi = { getTaskReport, listTasks: vi.fn().mockResolvedValue([{ ...task, type: 'original_clip' }]) } as unknown as DesktopApi
    render(<MultiEpisodeWorkspacePage drama={drama} onBack={vi.fn()} onPreflight={vi.fn()} onCreateTask={vi.fn()} onRunTask={vi.fn()} onChooseOutputDirectory={vi.fn().mockResolvedValue(null)} />)
    await waitFor(() => expect(window.sessionStorage.getItem('shortdrama.multiEpisodeTask.d1')).toBeNull())
    expect(screen.getByRole('button', { name: '4 报告' }).hasAttribute('disabled')).toBe(true)
    expect(getTaskReport).not.toHaveBeenCalled()
  })

  it('clears the prior terminal report before tracking a second task', async () => {
    let currentTasks: TaskSummary[] = [task]
    const onCreateTask = vi.fn()
      .mockResolvedValueOnce({ taskId: 'task-1', windows: result.windows })
      .mockImplementationOnce(async () => {
        currentTasks = [{ ...task, id: 'task-2', status: 'pending', progressCurrent: 0 }]
        return { taskId: 'task-2', windows: result.windows }
      })
    window.desktopApi = { getTaskReport: vi.fn().mockResolvedValue(taskItems), listTasks: vi.fn(() => Promise.resolve(currentTasks)) } as unknown as DesktopApi
    render(<MultiEpisodeWorkspacePage drama={drama} onBack={vi.fn()} onPreflight={vi.fn().mockResolvedValue(result)} onCreateTask={onCreateTask} onRunTask={vi.fn().mockResolvedValue(undefined)} onChooseOutputDirectory={vi.fn().mockResolvedValue(null)} />)
    fireEvent.click(screen.getByRole('button', { name: '完整导出设置' }))
    fireEvent.change(within(screen.getByRole('dialog', { name: '导出设置' })).getByPlaceholderText('选择输出目录'), { target: { value: 'C:/output' } })
    fireEvent.click(screen.getByRole('button', { name: '保存导出设置' }))
    fireEvent.click(screen.getByRole('button', { name: '开始预检' }))
    await screen.findByRole('heading', { name: '预检已完成' })
    fireEvent.click(screen.getByRole('button', { name: '确认预检并运行' }))
    await screen.findByRole('heading', { name: '本次任务结果已登记' })
    fireEvent.click(screen.getByRole('button', { name: '查看预检' }))
    fireEvent.click(screen.getByRole('button', { name: '确认预检并运行' }))
    await waitFor(() => expect(onCreateTask).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: '4 报告' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('heading', { name: '本次任务结果已登记' })).toBeNull()
    expect(screen.getByRole('heading', { name: '后台任务等待队列执行' })).toBeTruthy()
  })

  it('keeps packaging controls and the safe-area preview in the packaging dialog', () => {
    render(<MultiEpisodeWorkspacePage drama={drama} onBack={vi.fn()} onPreflight={vi.fn()} onCreateTask={vi.fn()} onRunTask={vi.fn()} onChooseOutputDirectory={vi.fn().mockResolvedValue(null)} />)
    fireEvent.click(screen.getByRole('button', { name: '完整导出设置' }))
    fireEvent.click(screen.getByRole('button', { name: '导出包装' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: '导出设置' })).getByRole('button', { name: '配置包装' }))
    expect(screen.getByRole('heading', { name: '包装设置' })).toBeTruthy()
    expect(screen.getByText(/竖屏 9:16 安全区/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '横屏 16:9' }))
    expect(screen.getByText(/横屏 16:9 安全区/)).toBeTruthy()
  })
})
