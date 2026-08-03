// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProductionPage } from './ProductionPage.js'

afterEach(cleanup)

describe('ProductionPage', () => {
  it('keeps original clipping available when one ready episode cannot form a stitch task', () => {
    const onOriginalClip = vi.fn()
    render(<ProductionPage episodeCount={2} readyEpisodeCount={1} onOriginalClip={onOriginalClip} onMultiEpisode={vi.fn()} onAiRemix={vi.fn()} />)

    expect(screen.getByRole('button', { name: '进入工作区' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByRole('button', { name: '至少需要 2 个可用剧集' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '进入工作区' }))
    expect(onOriginalClip).toHaveBeenCalledOnce()
  })

  it('opens P1 while excluding the frozen P2 surface', () => {
    const onAiRemix = vi.fn()
    const onOriginalClip = vi.fn()
    const onMultiEpisode = vi.fn()
    render(<ProductionPage episodeCount={3} readyEpisodeCount={3} onOriginalClip={onOriginalClip} onMultiEpisode={onMultiEpisode} onAiRemix={onAiRemix} />)

    expect([...document.querySelectorAll('.method-card > h2')].map((heading) => heading.textContent)).toEqual(['原剧切片', '多集拼接', 'AI 爆点前置二创'])
    expect([...document.querySelectorAll('.method-card > .meta')].map((label) => label.textContent)).toEqual(['人工审核', '批量处理', 'AI 辅助剪辑'])
    expect([...document.querySelectorAll('.method-card > .btn')].map((button) => button.textContent)).toEqual(['进入工作区', '创建拼接任务', '查看工作台方向'])
    expect(screen.getByRole('heading', { name: 'AI 爆点前置二创' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'AI 短剧解说' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '进入工作区' }))
    fireEvent.click(screen.getByRole('button', { name: '创建拼接任务' }))
    fireEvent.click(screen.getByRole('button', { name: '查看工作台方向' }))
    expect(onOriginalClip).toHaveBeenCalledOnce()
    expect(onMultiEpisode).toHaveBeenCalledOnce()
    expect(onAiRemix).toHaveBeenCalledOnce()
    expect(screen.getByText('人工审核')).toBeTruthy()
    expect(screen.getByText('批量处理')).toBeTruthy()
    expect(screen.getByText('AI 辅助剪辑')).toBeTruthy()
    expect(screen.getByText('准备字幕、生成候选并人工审片微调，确认后统一导出到成果库。')).toBeTruthy()
    expect(screen.getByText('按滑动窗口批量组合连续剧集，预检时长、体积、帧率和包装后运行。')).toBeTruthy()
    expect(screen.getByText('基于字幕、分镜和剧情分析生成可解释草稿，必须经过人工审核。')).toBeTruthy()
  })
})
