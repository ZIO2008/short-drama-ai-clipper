// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiRemixTask, DesktopApi, DramaDetail } from '../../../shared/contracts.js'
import { AiRemixWorkspacePage } from './AiRemixWorkspacePage.js'

afterEach(cleanup)

const drama: DramaDetail = {
  id: 'drama', name: '测试剧目', episodeCount: 2, issueCount: 0, tagNames: [], updatedAt: '2026-07-21',
  episodes: [
    { id: 'episode-1', episodeNo: 1, sortOrder: 1, sourcePath: 'episode-1.mp4', durationSeconds: 60, fps: 25, status: 'ready' },
    { id: 'episode-2', episodeNo: 2, sortOrder: 2, sourcePath: 'episode-2.mp4', durationSeconds: 60, fps: 25, status: 'ready' }
  ]
}

const task: AiRemixTask = {
  id: 'task-1', dramaId: 'drama', status: 'completed', config: { episodeStart: 1, episodeEnd: 2, maxDrafts: 3, durationMinSeconds: 30, durationMaxSeconds: 60 }, cost: { estimated: 0, actual: 0, mode: 'controlled', region: 'local', provider: 'controlled', costLimit: 0 }, createdAt: '2026-07-21', updatedAt: '2026-07-21', checkpoint: { version: 1, stage: 'drafts', startedAt: '2026-07-21', outcome: 'drafts-ready', drafts: [{ draftId: 'draft-1', evidenceId: 'evidence-1', summary: '关键冲突', startSeconds: 12, endSeconds: 48, confidence: 0.86, editingAngle: '爆点前置', hookReason: '关键冲突开场。', coreStoryRange: '第 1–2 集核心剧情', episodeStart: 1, episodeEnd: 2, expectedDurationSeconds: 36 }] }
}

describe('AiRemixWorkspacePage', () => {
  it('does not present a failed capability read as configured and can retry without blocking controlled analysis', async () => {
    let reads = 0
    const listAiCapabilityStatus = vi.fn().mockImplementation(async () => {
      if (reads++ === 0) throw new Error('能力目录不可用')
      return []
    })
    const createAiRemixTask = vi.fn().mockResolvedValue({ taskId: 'task-1' })
    window.desktopApi = { listAiCapabilityStatus, createAiRemixTask, runAiRemixTask: vi.fn().mockResolvedValue(task), listAiRemixEvidence: vi.fn().mockResolvedValue([]) } as unknown as DesktopApi
    render(<AiRemixWorkspacePage drama={drama} onBack={vi.fn()} onOpenReview={vi.fn()} />)
    expect(await screen.findByText('能力状态读取失败')).toBeTruthy()
    expect(screen.getByText(/能力状态读取失败：能力目录不可用/)).toBeTruthy()
    expect(screen.queryByText(/即使本机已保存供应商配置/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '开始分析剧情' }))
    await waitFor(() => expect(createAiRemixTask).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: '重新读取能力状态' }))
    expect(await screen.findByText('受控本地验证模式')).toBeTruthy()
    expect(listAiCapabilityStatus).toHaveBeenCalledTimes(2)
  })

  it('shows a real error when this runtime cannot read capability status', async () => {
    window.desktopApi = {} as DesktopApi
    render(<AiRemixWorkspacePage drama={drama} onBack={vi.fn()} onOpenReview={vi.fn()} />)
    expect(await screen.findByText('能力状态读取失败')).toBeTruthy()
    expect(screen.getByText(/当前版本缺少能力状态读取能力/)).toBeTruthy()
  })

  it('shows model-required capability guidance instead of implying that the saved provider is usable', async () => {
    window.desktopApi = { listAiCapabilityStatus: vi.fn().mockResolvedValue([{ capability: 'multimodal-review', mode: 'controlled', reason: 'model-required' }]) } as unknown as DesktopApi
    render(<AiRemixWorkspacePage drama={drama} onBack={vi.fn()} onOpenReview={vi.fn()} />)

    expect(await screen.findByText('受控本地验证模式')).toBeTruthy()
    expect(screen.getByText(/已选择方案但尚未填写实际模型/)).toBeTruthy()
    expect(screen.queryByText(/即使本机已保存供应商配置/)).toBeNull()
  })

  it('explains an unreadable Windows-protected secret without reporting it as missing', async () => {
    window.desktopApi = { listAiCapabilityStatus: vi.fn().mockResolvedValue([{ capability: 'multimodal-review', mode: 'controlled', reason: 'unreadable-secret' }]) } as unknown as DesktopApi
    render(<AiRemixWorkspacePage drama={drama} onBack={vi.fn()} onOpenReview={vi.fn()} />)

    expect(await screen.findByText('受控本地验证模式')).toBeTruthy()
    expect(screen.getByText(/已保存密钥但当前 Windows 安全存储无法读取/)).toBeTruthy()
    expect(screen.queryByText(/缺少密钥/)).toBeNull()
  })

  it('keeps the newest capability result when an earlier read finishes late', async () => {
    let releaseFirst: (() => void) | undefined
    const firstRead = new Promise<void>((resolve) => { releaseFirst = resolve })
    let calls = 0
    window.desktopApi = {
      listAiCapabilityStatus: vi.fn().mockImplementation(async () => {
        if (calls++ === 0) { await firstRead; return [] }
        return [{ capability: 'text-analysis', mode: 'controlled', reason: 'no-profile' }]
      })
    } as unknown as DesktopApi
    render(<AiRemixWorkspacePage drama={drama} onBack={vi.fn()} onOpenReview={vi.fn()} />)
    expect(await screen.findByText('正在读取能力状态')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重新读取能力状态' }))
    expect(await screen.findByText('受控本地验证模式')).toBeTruthy()
    expect(screen.getByText(/尚未选择供应商方案：到“设置 → 能力供应商”/)).toBeTruthy()
    releaseFirst?.()
    await waitFor(() => expect(screen.getByText(/尚未选择供应商方案：到“设置 → 能力供应商”/)).toBeTruthy())
    expect(screen.queryByText(/即使本机已保存供应商配置/)).toBeNull()
  })

  it('creates an explicitly controlled local draft task and shows its traceable candidate', async () => {
    const createAiRemixTask = vi.fn().mockResolvedValue({ taskId: 'task-1' })
    window.desktopApi = {
      listAiCapabilityStatus: vi.fn().mockResolvedValue([{ capability: 'text-analysis', mode: 'controlled', reason: 'no-profile' }]),
      createAiRemixTask,
      runAiRemixTask: vi.fn().mockResolvedValue(task),
      listAiRemixEvidence: vi.fn().mockResolvedValue([{ id: 'evidence-1', episodeId: 'episode-1', sourceType: 'subtitle', startSeconds: 12, endSeconds: 48, confidence: 0.86, summary: '关键冲突' }])
    } as unknown as DesktopApi
    render(<AiRemixWorkspacePage drama={drama} onBack={vi.fn()} onOpenReview={vi.fn()} />)
    expect(await screen.findByText('受控本地验证模式')).toBeTruthy()
    expect(screen.getByText(/尚未选择供应商方案：到“设置 → 能力供应商”/)).toBeTruthy()
    expect(screen.getByLabelText('任务费用、区域与上传披露').textContent).toContain('区域：local')
    expect(screen.getByLabelText('任务费用、区域与上传披露').textContent).toContain('预计费用：运行后计算')
    fireEvent.click(screen.getByRole('button', { name: '开始分析剧情' }))
    await waitFor(() => expect(createAiRemixTask).toHaveBeenCalledWith(expect.objectContaining({ dramaId: 'drama', episodeStart: 1, episodeEnd: 2 })))
    await waitFor(() => expect(screen.getAllByText('关键冲突')).toHaveLength(1))
    expect(screen.getByText(/subtitle · 00:12–00:48/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '进入审核时间线' })).toBeTruthy()
    expect(screen.getByText(/视角：爆点前置/)).toBeTruthy()
    expect(screen.getByText(/剧情范围：第 1–2 集核心剧情/)).toBeTruthy()
    expect((screen.getByLabelText('剪辑视角') as HTMLSelectElement).disabled).toBe(true)
    expect(screen.getByLabelText('任务费用、区域与上传披露').textContent).toContain('预计费用：¥0.00')
    expect(screen.getByLabelText('任务费用、区域与上传披露').textContent).toContain('实际费用：¥0.00')
    expect(screen.getByLabelText('任务费用、区域与上传披露').textContent).toContain('本次上传：无')
  })

  it('uses all episodes by default and keeps a custom continuous range valid without enumerating ranges', async () => {
    const createAiRemixTask = vi.fn().mockResolvedValue({ taskId: 'task-1' })
    window.desktopApi = { listAiCapabilityStatus: vi.fn().mockResolvedValue([]), createAiRemixTask, runAiRemixTask: vi.fn().mockResolvedValue(task), listAiRemixEvidence: vi.fn().mockResolvedValue([]) } as unknown as DesktopApi
    render(<AiRemixWorkspacePage drama={drama} onBack={vi.fn()} onOpenReview={vi.fn()} />)

    expect(screen.getByRole('button', { name: '全部 2 集' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('第 1–2 集 · 共 2 集')).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: '剧集范围' })).toBeNull()
    expect(screen.queryByLabelText('起始集')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '自定义范围' }))
    fireEvent.change(screen.getByLabelText('起始集'), { target: { value: '2' } })
    expect(screen.getByText('第 2–2 集 · 共 1 集')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('结束集'), { target: { value: '1' } })
    expect(screen.getByText('第 1–1 集 · 共 1 集')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('结束集'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: '开始分析剧情' }))

    await waitFor(() => expect(createAiRemixTask).toHaveBeenCalledWith(expect.objectContaining({ episodeStart: 1, episodeEnd: 2 })))
  })

  it('shows no recommendation and its reason while retaining evidence when analysis has no credible draft', async () => {
    const noRecommendation: AiRemixTask = { ...task, checkpoint: { ...task.checkpoint, outcome: 'no-recommendation', reason: '字幕置信度不足，未生成草稿。', drafts: [] } }
    window.desktopApi = { listAiCapabilityStatus: vi.fn().mockResolvedValue([]), createAiRemixTask: vi.fn().mockResolvedValue({ taskId: 'task-1' }), runAiRemixTask: vi.fn().mockResolvedValue(noRecommendation), listAiRemixEvidence: vi.fn().mockResolvedValue([{ id: 'evidence-1', episodeId: 'episode-1', sourceType: 'subtitle', startSeconds: 12, endSeconds: 48, confidence: 0.42, summary: '低置信字幕片段' }]) } as unknown as DesktopApi
    render(<AiRemixWorkspacePage drama={drama} onBack={vi.fn()} onOpenReview={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '开始分析剧情' }))
    expect(await screen.findByText('暂无推荐')).toBeTruthy()
    expect(screen.getByText('字幕置信度不足，未生成草稿。')).toBeTruthy()
    expect(screen.getByText('低置信字幕片段')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '进入审核时间线' })).toBeNull()
  })

  it('keeps every generated draft reachable from the candidate areas', async () => {
    const onOpenReview = vi.fn()
    const threeDrafts: AiRemixTask = { ...task, checkpoint: { ...task.checkpoint, drafts: [...task.checkpoint.drafts, { draftId: 'draft-2', evidenceId: 'evidence-2', summary: '身份揭示', startSeconds: 49, endSeconds: 70, confidence: 0.72 }, { draftId: 'draft-3', evidenceId: 'evidence-3', summary: '反转结尾', startSeconds: 71, endSeconds: 90, confidence: 0.64 }] } }
    window.desktopApi = { listAiCapabilityStatus: vi.fn().mockResolvedValue([]), createAiRemixTask: vi.fn().mockResolvedValue({ taskId: 'task-1' }), runAiRemixTask: vi.fn().mockResolvedValue(threeDrafts), listAiRemixEvidence: vi.fn().mockResolvedValue([{ id: 'evidence-1', episodeId: 'episode-1', sourceType: 'subtitle', startSeconds: 12, endSeconds: 48, confidence: 0.86, summary: '证据一' }, { id: 'evidence-2', episodeId: 'episode-1', sourceType: 'script', startSeconds: 49, endSeconds: 70, confidence: 0.72, summary: '证据二' }, { id: 'evidence-3', episodeId: 'episode-2', sourceType: 'shot-list', startSeconds: 71, endSeconds: 90, confidence: 0.64, summary: '证据三' }]) } as unknown as DesktopApi
    render(<AiRemixWorkspacePage drama={drama} onBack={vi.fn()} onOpenReview={onOpenReview} />)
    fireEvent.click(await screen.findByRole('button', { name: '开始分析剧情' }))
    const thirdDraft = await screen.findByText('反转结尾')
    expect(thirdDraft).toBeTruthy()
    expect(screen.getAllByText(/视角：爆点前置/)).toHaveLength(3)
    const reviewButtons = screen.getAllByRole('button', { name: '进入审核时间线' })
    expect(reviewButtons).toHaveLength(3)
    fireEvent.click(reviewButtons[1]!)
    expect(onOpenReview).toHaveBeenCalledWith('draft-2')
    fireEvent.click(reviewButtons.at(-1)!)
    expect(onOpenReview).toHaveBeenCalledWith('draft-3')
    const evidenceButtons = screen.getAllByRole('button', { name: '查看分析依据' })
    expect(evidenceButtons).toHaveLength(3)
    fireEvent.click(evidenceButtons[1]!)
    expect(await screen.findByText('证据二')).toBeTruthy()
    expect(screen.queryByText('证据一')).toBeNull()
    fireEvent.click(evidenceButtons[2]!)
    expect(await screen.findByText('证据三')).toBeTruthy()
    expect(screen.queryByText('证据二')).toBeNull()
  })
})
