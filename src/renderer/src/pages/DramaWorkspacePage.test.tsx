// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DramaDetail, DramaSummary } from '../../../shared/contracts.js'
import { DramaWorkspacePage } from './DramaWorkspacePage.js'

const drama: DramaSummary = { id: 'd1', name: '测试剧目', episodeCount: 2, issueCount: 0, tagNames: [], updatedAt: '2026-01-01' }
const detail: DramaDetail = { ...drama, episodes: [{ id: 'e1', episodeNo: 1, sortOrder: 0, sourcePath: 'D:\\demo\\01.mp4', durationSeconds: 120, fps: 25, videoWidth: 1920, videoHeight: 1080, status: 'ready' }, { id: 'e2', episodeNo: 2, sortOrder: 1, sourcePath: 'D:\\demo\\02.mp4', durationSeconds: 120, fps: 25, videoWidth: 1920, videoHeight: 1080, status: 'ready' }] }

afterEach(cleanup)

describe('DramaWorkspacePage', () => {
  it('renders the drama workspace as main page content instead of a modal dialog', async () => {
    const { container } = render(<DramaWorkspacePage drama={drama} tags={[]} onClose={vi.fn()} onLoad={vi.fn().mockResolvedValue(detail)} onRename={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} onImportScript={vi.fn()} onLinkScript={vi.fn()} onLinkSegment={vi.fn()} onRelink={vi.fn()} onAttachTag={vi.fn()} onUpdateEpisode={vi.fn()} onRemoveEpisode={vi.fn()} onListCandidates={vi.fn()} onConfirmCandidate={vi.fn()} onExportCandidate={vi.fn()} onChooseOutputDirectory={vi.fn()} onListMaterials={vi.fn()} onPreflightMultiTask={vi.fn()} onCreateMultiTask={vi.fn()} onRunTask={vi.fn()} />)
    await waitFor(() => expect(screen.getAllByRole('heading', { name: '测试剧目' }).length).toBeGreaterThan(0))
    expect(screen.getByRole('tablist', { name: '剧目工作区' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the Version 48 asset context, four-part health strip, and final subtitle tab in the embedded workspace', async () => {
    render(<DramaWorkspacePage drama={drama} tags={[]} onClose={vi.fn()} onLoad={vi.fn().mockResolvedValue(detail)} onRename={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} onImportScript={vi.fn()} onLinkScript={vi.fn()} onLinkSegment={vi.fn()} onRelink={vi.fn()} onAttachTag={vi.fn()} onUpdateEpisode={vi.fn()} onRemoveEpisode={vi.fn()} onListCandidates={vi.fn()} onConfirmCandidate={vi.fn()} onExportCandidate={vi.fn()} onChooseOutputDirectory={vi.fn()} onListMaterials={vi.fn()} onPreflightMultiTask={vi.fn()} onCreateMultiTask={vi.fn()} onRunTask={vi.fn()} />)
    await screen.findByRole('tablist', { name: '剧目工作区' })
    expect(screen.getByRole('button', { name: '返回剧目库' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '编辑剧目' })).toBeTruthy()
    expect([...screen.getByRole('tablist', { name: '剧目工作区' }).querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual(['剧目资产', '素材生产', '字幕资产', '成果库'])
    expect([...screen.getByLabelText('剧目资产健康概览').querySelectorAll('.health-label')].map((label) => label.textContent)).toEqual(['可用剧集', '缺集', '失联', '剧本关联'])
    expect(document.querySelectorAll('iframe.static-prototype-surface')).toHaveLength(0)
  })

  it('opens editing as a focus-managed dialog over the current workspace', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined)
    const onImportFolder = vi.fn().mockResolvedValue(undefined)
    render(<DramaWorkspacePage drama={drama} tags={[]} onClose={vi.fn()} onLoad={vi.fn().mockResolvedValue(detail)} onRename={vi.fn()} onDelete={vi.fn()} onImport={onImport} onImportFolder={onImportFolder} onImportScript={vi.fn()} onLinkScript={vi.fn()} onLinkSegment={vi.fn()} onRelink={vi.fn()} onAttachTag={vi.fn()} onUpdateEpisode={vi.fn()} onRemoveEpisode={vi.fn()} onListCandidates={vi.fn()} onConfirmCandidate={vi.fn()} onExportCandidate={vi.fn()} onChooseOutputDirectory={vi.fn()} onListMaterials={vi.fn()} onPreflightMultiTask={vi.fn()} onCreateMultiTask={vi.fn()} onRunTask={vi.fn()} />)
    await screen.findByRole('tablist', { name: '剧目工作区' })
    fireEvent.click(screen.getAllByRole('button', { name: '编辑剧目' })[0]!)
    expect(await screen.findByRole('dialog', { name: '编辑剧目' })).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByLabelText('剧名'))
    fireEvent.click(screen.getByRole('button', { name: '选择视频文件' }))
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: '选择视频文件夹' }))
    await waitFor(() => expect(onImportFolder).toHaveBeenCalledOnce())
  })

  it('renders focused production workspaces without the outer workspace header and tabs', async () => {
    render(<DramaWorkspacePage drama={drama} tags={[]} onClose={vi.fn()} onLoad={vi.fn().mockResolvedValue(detail)} onRename={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} onImportScript={vi.fn()} onLinkScript={vi.fn()} onLinkSegment={vi.fn()} onRelink={vi.fn()} onAttachTag={vi.fn()} onUpdateEpisode={vi.fn()} onRemoveEpisode={vi.fn()} onListCandidates={vi.fn()} onConfirmCandidate={vi.fn()} onExportCandidate={vi.fn()} onChooseOutputDirectory={vi.fn()} onListMaterials={vi.fn()} onPreflightMultiTask={vi.fn()} onCreateMultiTask={vi.fn()} onRunTask={vi.fn()} />)
    fireEvent.click(await screen.findByRole('tab', { name: '素材生产' }))
    fireEvent.click(await screen.findByRole('button', { name: '创建拼接任务' }))
    expect(await screen.findByRole('heading', { name: '多集拼接工作区' })).toBeTruthy()
    expect(screen.queryByRole('tablist', { name: '剧目工作区' })).toBeNull()
    expect(screen.queryByRole('heading', { name: '测试剧目' })).toBeNull()
  })
})
