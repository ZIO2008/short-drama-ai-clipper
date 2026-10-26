// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, TaskSummary } from '../../../shared/contracts.js'
import { formatElapsed, formatRange, TaskCenterPage } from './TaskCenterPage.js'

const tasks: TaskSummary[] = [
  { id: 'task-multi-1234', dramaName: '甲剧', type: 'multi_episode', status: 'partial', progressCurrent: 2, progressTotal: 3 },
  { id: 'task-clip-5678', dramaName: '乙剧', type: 'original_clip', status: 'running', progressCurrent: 0, progressTotal: 1 }
]

const getTaskReport = vi.fn()
const recoverProductionTask = vi.fn()
const pauseProductionTask = vi.fn()
const resumeProductionTask = vi.fn()
const cancelProductionTask = vi.fn()
const openPath = vi.fn()
const listTasks = vi.fn()

beforeEach(() => {
  getTaskReport.mockReset()
  recoverProductionTask.mockReset().mockResolvedValue(undefined)
  pauseProductionTask.mockReset().mockResolvedValue(undefined)
  resumeProductionTask.mockReset().mockResolvedValue(undefined)
  cancelProductionTask.mockReset().mockResolvedValue(undefined)
  openPath.mockReset().mockResolvedValue(undefined)
  listTasks.mockReset().mockResolvedValue(tasks)
  window.desktopApi = { getTaskReport, recoverProductionTask, pauseProductionTask, resumeProductionTask, cancelProductionTask, openPath, listTasks } as unknown as DesktopApi
})

afterEach(cleanup)

describe('TaskCenterPage', () => {
  it('filters tasks independently by status, type and drama', () => {
    render(<TaskCenterPage tasks={tasks} loading={false} error={null} onReload={vi.fn()} onRetry={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('按状态筛选'), { target: { value: 'running' } })
    expect(screen.queryByRole('row', { name: /甲剧/ })).toBeNull()
    expect(screen.getByRole('row', { name: /乙剧/ })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('按类型筛选'), { target: { value: 'multi_episode' } })
    expect(screen.getByText('筛选后没有任务')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(screen.getByRole('row', { name: /甲剧/ })).toBeTruthy()
  })

  it('loads a readable report, aggregates outcomes and opens the output location', async () => {
    getTaskReport.mockResolvedValue([
      { id: 'item-1', plannedRange: '{"episodeNumbers":[1,2,3]}', actualRange: '[1,2]', status: 'reduced', reason: '超时缩减', outputPath: 'D:\\output\\result.mp4' },
      { id: 'item-2', plannedRange: '{"episodeNumbers":[2,3,4]}', actualRange: null, status: 'failed', reason: '编码失败', outputPath: null }
    ])
    render(<TaskCenterPage tasks={tasks} loading={false} error={null} onReload={vi.fn()} onRetry={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('查看甲剧多集拼接详情'))
    expect(screen.getByText('正在读取逐窗口报告…')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('第 001–003 集')).toBeTruthy())
    expect(screen.getByText('第 001–002 集')).toBeTruthy()
    expect(screen.getByText('缩减 1')).toBeTruthy()
    expect(screen.getByText('失败 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '打开文件位置' }))
    expect(openPath).toHaveBeenCalledWith('D:\\output\\result.mp4')
  })

  it('keeps original-clip recovery behind its workspace while exposing other task controls', async () => {
    getTaskReport.mockRejectedValue(new Error('报告读取失败'))
    const reload = vi.fn()
    const pendingTask: TaskSummary = { id: 'task-pending-9', dramaName: '丙剧', type: 'multi_episode', status: 'pending', progressCurrent: 0, progressTotal: 1 }
    render(<TaskCenterPage tasks={[...tasks, pendingTask]} loading={false} error={null} onReload={reload} onRetry={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('查看乙剧原剧切片详情'))
    expect(screen.queryByRole('button', { name: '暂停' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    await waitFor(() => expect(cancelProductionTask).toHaveBeenCalledWith('task-clip-5678'))
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    fireEvent.click(screen.getByLabelText('查看丙剧多集拼接详情'))
    fireEvent.click(screen.getByRole('button', { name: '继续任务' }))
    await waitFor(() => expect(recoverProductionTask).toHaveBeenCalledWith('task-pending-9'))
    expect(reload).toHaveBeenCalled()
    fireEvent.keyDown(screen.getByLabelText('查看甲剧多集拼接详情'), { key: 'Enter' })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('报告读取失败'))
  })

  it('keeps an actionable historical-export retry failure visible without reloading tasks', async () => {
    const retry = vi.fn().mockRejectedValue(new Error('该历史任务没有可恢复的导出配置。请返回候选池选择输出目录并重新导出后再重试。'))
    const reload = vi.fn()
    const historicalTask: TaskSummary = { id: 'task-legacy-clip', dramaName: '旧剧', type: 'original_clip', status: 'failed', progressCurrent: 0, progressTotal: 1 }
    render(<TaskCenterPage tasks={[historicalTask]} loading={false} error={null} onReload={reload} onRetry={retry} />)
    fireEvent.click(screen.getByLabelText('查看旧剧原剧切片详情'))
    fireEvent.click(screen.getByRole('button', { name: '重试失败项' }))
    expect((await screen.findByRole('alert')).textContent).toContain('返回候选池选择输出目录')
    expect(retry).toHaveBeenCalledWith('task-legacy-clip')
    expect(reload).not.toHaveBeenCalled()
  })

  it('refreshes the selected task and its report after a successful retry', async () => {
    const retry = vi.fn().mockResolvedValue(undefined)
    const reload = vi.fn()
    const failedTask: TaskSummary = { id: 'task-retry-clip', dramaName: '重试剧', type: 'original_clip', status: 'failed', progressCurrent: 0, progressTotal: 1 }
    const completedTask: TaskSummary = { ...failedTask, status: 'completed', progressCurrent: 1 }
    listTasks.mockResolvedValue([completedTask])
    getTaskReport.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'item-retry', plannedRange: null, actualRange: null, status: 'exported', reason: null, outputPath: 'D:\\output\\retry.mp4' }])
    render(<TaskCenterPage tasks={[failedTask]} loading={false} error={null} onReload={reload} onRetry={retry} />)
    fireEvent.click(screen.getByLabelText('查看重试剧原剧切片详情'))
    fireEvent.click(screen.getByRole('button', { name: '重试失败项' }))
    await waitFor(() => expect(screen.getByText('成功')).toBeTruthy())
    expect(screen.queryByRole('button', { name: '重试失败项' })).toBeNull()
    expect(screen.getByText('失败 0')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '打开文件位置' }))
    expect(openPath).toHaveBeenCalledWith('D:\\output\\retry.mp4')
    expect(listTasks).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('traps focus in the detail drawer and returns focus to the task row on Escape', async () => {
    getTaskReport.mockResolvedValue([])
    render(<TaskCenterPage tasks={tasks} loading={false} error={null} onReload={vi.fn()} onRetry={vi.fn()} />)
    const row = screen.getByLabelText('查看甲剧多集拼接详情')
    fireEvent.click(row)
    const drawer = await screen.findByRole('dialog', { name: /甲剧/ })
    const close = screen.getByRole('button', { name: '关闭' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(drawer, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    fireEvent.keyDown(drawer, { key: 'Escape' })
    await waitFor(() => expect(document.activeElement).toBe(row))
  })
})

describe('formatRange', () => {
  it('formats episode and clip ranges without leaking JSON syntax', () => {
    expect(formatRange('[3,4,5]')).toBe('第 003–005 集')
    expect(formatRange('{"startSeconds":1.5,"endSeconds":4}')).toBe('1.500–4.000 秒')
    expect(formatRange(null)).toBe('—')
  })
})

describe('formatElapsed', () => {
  it('does not treat queued time as processing time and freezes terminal task duration', () => {
    expect(formatElapsed(null, '2026-07-22T10:00:00.000Z', 'pending')).toBe('—')
    expect(formatElapsed('2026-07-22T10:00:00.000Z', '2026-07-22T10:01:30.000Z', 'completed')).toBe('1 分钟')
  })
})
