// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DramaDetail } from '../../../shared/contracts.js'
import { DramaAssetsPage } from './DramaAssetsPage.js'

const drama: DramaDetail = { id: 'd1', name: 'Demo', episodeCount: 1, issueCount: 0, tagNames: [], updatedAt: '2026-01-01', episodes: [{ id: 'e1', episodeNo: 1, sortOrder: 0, sourcePath: 'D:\\demo\\01.mp4', durationSeconds: 120, fps: 25, videoWidth: 1920, videoHeight: 1080, status: 'available' }] }

afterEach(cleanup)

describe('DramaAssetsPage', () => {
  it('keeps the Version 48 default asset toolbar order and seven-column table while retaining the folder-import extension', () => {
    const { container } = render(<DramaAssetsPage drama={drama} scripts={[]} onImport={vi.fn().mockResolvedValue(undefined)} onImportFolder={vi.fn().mockResolvedValue(undefined)} onImportScript={vi.fn().mockResolvedValue([])} onLinkScript={vi.fn().mockResolvedValue(undefined)} onLinkSegment={vi.fn().mockResolvedValue(undefined)} onRelink={vi.fn().mockResolvedValue(undefined)} onEdit={vi.fn()} />)
    const toolbarButtons = [...container.querySelectorAll('.asset-page > .toolbar > button')].map((button) => button.textContent)
    expect(toolbarButtons).toEqual(['添加视频文件', '导入视频文件夹', '批量重新定位', '导入剧本'])
    expect([...container.querySelectorAll('.asset-table-wrap thead th')].map((cell) => cell.textContent)).toEqual(['集号', '文件', '时长', '帧率', '剧本', '状态', '操作'])
  })

  it('routes existing-drama file and folder imports to their separate callbacks', async () => {
    const onImport = vi.fn().mockResolvedValue(undefined)
    const onImportFolder = vi.fn().mockResolvedValue(undefined)
    render(<DramaAssetsPage drama={drama} scripts={[]} onImport={onImport} onImportFolder={onImportFolder} onImportScript={vi.fn().mockResolvedValue([])} onLinkScript={vi.fn().mockResolvedValue(undefined)} onLinkSegment={vi.fn().mockResolvedValue(undefined)} onRelink={vi.fn().mockResolvedValue(undefined)} onEdit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '添加视频文件' }))
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce())
    expect(onImportFolder).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '导入视频文件夹' }))
    await waitFor(() => expect(onImportFolder).toHaveBeenCalledOnce())
    expect(onImport).toHaveBeenCalledOnce()
  })

  it('keeps split preview visible and shows an actionable import error', async () => {
    const onImportScript = vi.fn()
      .mockResolvedValueOnce([{ segmentId: 's1', episodeNo: 1, title: '第一集', text: '对白预览' }])
      .mockRejectedValueOnce(new Error('扫描版 PDF 不支持 OCR'))
    render(<DramaAssetsPage drama={drama} scripts={[]} onImport={vi.fn().mockResolvedValue(undefined)} onImportScript={onImportScript} onLinkScript={vi.fn().mockResolvedValue(undefined)} onLinkSegment={vi.fn().mockResolvedValue(undefined)} onRelink={vi.fn().mockResolvedValue(undefined)} onEdit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '导入剧本' }))
    await waitFor(() => expect(screen.getByText(/第 1 集 · 第一集/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '导入剧本' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('扫描版 PDF'))
    expect(screen.getByText('对白预览')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '关联剧本第 1 集' })).toBeTruthy()
  })

  it('uses the relink operation for unavailable source files', async () => {
    const onRelink = vi.fn().mockResolvedValue(undefined)
    render(<DramaAssetsPage drama={{ ...drama, episodes: [{ ...drama.episodes[0]!, status: 'unreadable' }] }} scripts={[]} onImport={vi.fn().mockResolvedValue(undefined)} onImportScript={vi.fn().mockResolvedValue([])} onLinkScript={vi.fn().mockResolvedValue(undefined)} onLinkSegment={vi.fn().mockResolvedValue(undefined)} onRelink={onRelink} onEdit={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '重新定位' }))
    await waitFor(() => expect(onRelink).toHaveBeenCalledOnce())
  })

  it('requires confirmation before removing only the application episode reference', async () => {
    const onRemoveEpisode = vi.fn().mockResolvedValue(undefined)
    render(<DramaAssetsPage drama={drama} scripts={[]} onImport={vi.fn().mockResolvedValue(undefined)} onImportScript={vi.fn().mockResolvedValue([])} onLinkScript={vi.fn().mockResolvedValue(undefined)} onLinkSegment={vi.fn().mockResolvedValue(undefined)} onRelink={vi.fn().mockResolvedValue(undefined)} onRemoveEpisode={onRemoveEpisode} onEdit={vi.fn()} />)
    expect(screen.getByRole('button', { name: '删除剧集' }).querySelector('svg')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '删除剧集' }))
    expect(screen.getByText(/不会删除或移动原始视频文件/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onRemoveEpisode).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '删除剧集' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除剧集' }))
    await waitFor(() => expect(onRemoveEpisode).toHaveBeenCalledWith('e1'))
  })

  it('restores the prototype status filter and filters the visible rows', () => {
    const { container } = render(<DramaAssetsPage drama={{ ...drama, episodes: [...drama.episodes, { ...drama.episodes[0]!, id: 'e2', episodeNo: 2, sourcePath: 'D:\\demo\\02.mp4', status: 'unreadable' }] }} scripts={[]} onImport={vi.fn().mockResolvedValue(undefined)} onImportScript={vi.fn().mockResolvedValue([])} onLinkScript={vi.fn().mockResolvedValue(undefined)} onLinkSegment={vi.fn().mockResolvedValue(undefined)} onRelink={vi.fn().mockResolvedValue(undefined)} onEdit={vi.fn()} />)
    const view = within(container)
    const filter = view.getByRole('combobox', { name: '剧集状态筛选' })
    expect(view.getByText('01.mp4')).toBeTruthy()
    expect(view.getByText('02.mp4')).toBeTruthy()
    fireEvent.change(filter, { target: { value: 'available' } })
    expect(view.getByText('01.mp4')).toBeTruthy()
    expect(view.queryByText('02.mp4')).toBeNull()
    fireEvent.change(filter, { target: { value: 'attention' } })
    expect(view.queryByText('01.mp4')).toBeNull()
    expect(view.getByText('02.mp4')).toBeTruthy()
  })

  it('shows an ultra-short duration alert in the existing status cell and lets the user dismiss only that alert', async () => {
    const onDismissDurationAlert = vi.fn().mockResolvedValue(undefined)
    render(<DramaAssetsPage drama={{ ...drama, issueCount: 1, episodes: [{ ...drama.episodes[0]!, episodeNo: 48, durationSeconds: 1.4 }] }} scripts={[]} onImport={vi.fn().mockResolvedValue(undefined)} onImportScript={vi.fn().mockResolvedValue([])} onLinkScript={vi.fn().mockResolvedValue(undefined)} onLinkSegment={vi.fn().mockResolvedValue(undefined)} onRelink={vi.fn().mockResolvedValue(undefined)} onDismissDurationAlert={onDismissDurationAlert} onEdit={vi.fn()} />)
    expect(screen.getByText('时长异常 · 1.40 秒')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '忽略时长异常提示' }))
    await waitFor(() => expect(onDismissDurationAlert).toHaveBeenCalledWith('e1'))
  })
})
