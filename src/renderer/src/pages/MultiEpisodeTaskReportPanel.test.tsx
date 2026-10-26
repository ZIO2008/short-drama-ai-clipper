// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TaskReportItem, TaskSummary } from '../../../shared/contracts.js'
import { MultiEpisodeTaskReportPanel } from './MultiEpisodeTaskReportPanel.js'

afterEach(cleanup)

const task: TaskSummary = { id: 'task-1', dramaId: 'd1', dramaName: '测试剧目', type: 'multi_episode', status: 'partial', progressCurrent: 2, progressTotal: 3 }

describe('MultiEpisodeTaskReportPanel', () => {
  it('renders only the current task items with their actual outcome and keeps results unavailable without outputs', () => {
    const onOpenResults = vi.fn()
    const items: TaskReportItem[] = [{ id: 'failed', plannedRange: JSON.stringify({ episodeNumbers: [1, 3] }), actualRange: null, status: 'failed', reason: '确认后的资产已变化，请重新预检。', outputPath: null }]
    const openTaskCenter = vi.fn()
    render(<MultiEpisodeTaskReportPanel task={task} items={items} loading={false} error={null} onRetry={vi.fn()} onOpenResults={onOpenResults} onOpenTaskCenter={openTaskCenter} onBackToPreflight={vi.fn()} />)
    expect(screen.getAllByText('失败')).toHaveLength(2)
    expect(screen.getByText('确认后的资产已变化，请重新预检。')).toBeTruthy()
    expect(screen.getByText('尚未生成输出文件')).toBeTruthy()
    expect(screen.getByRole('button', { name: '打开成果库' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '前往任务中心处理' }))
    expect(openTaskCenter).toHaveBeenCalledOnce()
    expect(onOpenResults).not.toHaveBeenCalled()
  })

  it('keeps a report-read failure actionable without inventing task results', () => {
    const retry = vi.fn()
    render(<MultiEpisodeTaskReportPanel task={null} items={[]} loading={false} error="读取失败" onRetry={retry} onBackToPreflight={vi.fn()} />)
    expect(screen.queryByText('成功')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重试读取' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
