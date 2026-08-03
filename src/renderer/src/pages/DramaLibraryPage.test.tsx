// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DramaLibraryPage } from './DramaLibraryPage.js'

describe('DramaLibraryPage', () => {
  afterEach(() => { cleanup(); Reflect.deleteProperty(window, 'desktopApi') })

  it('always reloads the current drama cover after returning to the library', async () => {
    const drama = { id: 'd1', name: 'Demo', episodeCount: 1, issueCount: 0, tagNames: [], updatedAt: '2026-01-01' }
    let resolveSecondRead: ((cover: { url: string; sourceKind: 'uploaded' | 'auto_frame' } | null) => void) | undefined
    const getDramaCover = vi.fn()
      .mockResolvedValueOnce({ url: 'file:///first-auto-frame.jpg', sourceKind: 'auto_frame' })
      .mockImplementationOnce(() => new Promise<{ url: string; sourceKind: 'uploaded' | 'auto_frame' } | null>((resolve) => { resolveSecondRead = resolve }))
    window.desktopApi = { getDramaCover } as unknown as typeof window.desktopApi
    const props = { dramas: [drama], loading: false, error: null, onRetry: vi.fn(), onCreate: vi.fn(), tags: [], onRename: vi.fn(), onLoad: vi.fn(), onDelete: vi.fn(), onImport: vi.fn(), onAttachTag: vi.fn() }
    const first = render(<DramaLibraryPage {...props} />)
    expect((await screen.findByRole('img', { name: 'Demo封面' })).getAttribute('src')).toBe('file:///first-auto-frame.jpg')
    first.unmount()

    render(<DramaLibraryPage {...props} />)
    expect(screen.queryByRole('img', { name: 'Demo封面' })).toBeNull()
    expect(screen.getByLabelText('Demo封面读取中')).toBeTruthy()
    resolveSecondRead?.({ url: 'file:///newly-uploaded-cover.jpg', sourceKind: 'uploaded' })
    await waitFor(() => expect(screen.getByRole('img', { name: 'Demo封面' }).getAttribute('src')).toBe('file:///newly-uploaded-cover.jpg'))
    expect(getDramaCover).toHaveBeenCalledTimes(2)
  })
  it('creates a drama and exposes edit/import entry points', async () => {
    const created = { id: 'd2', name: 'New drama', episodeCount: 0, issueCount: 0, tagNames: [], updatedAt: '2026-01-02' }
    const onCreate = vi.fn().mockResolvedValue(created)
    const onChooseVideoFiles = vi.fn().mockResolvedValue(['D:/Episode 1.mp4', 'D:/Episode 2.mp4'])
    const onChooseVideoFolder = vi.fn().mockResolvedValue(['D:/Episodes'])
    const onImportEpisodePaths = vi.fn().mockResolvedValue(undefined)
    render(<DramaLibraryPage dramas={[{ id: 'd1', name: 'Demo', episodeCount: 2, issueCount: 0, tagNames: [], updatedAt: '2026-01-01' }]} loading={false} error={null} onRetry={vi.fn()} onCreate={onCreate} onChooseVideoFiles={onChooseVideoFiles} onChooseVideoFolder={onChooseVideoFolder} onImportEpisodePaths={onImportEpisodePaths} tags={[]} onRename={vi.fn()} onLoad={vi.fn().mockResolvedValue({ id: 'd1', name: 'Demo', episodeCount: 2, issueCount: 0, tagNames: [], updatedAt: '2026-01-01', episodes: [] })} onDelete={vi.fn()} onImport={vi.fn()} onAttachTag={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: '创建剧目' })[0]!)
    expect(document.activeElement).toBe(screen.getByLabelText('剧名'))
    fireEvent.change(screen.getByLabelText('剧名'), { target: { value: 'New drama' } })
    fireEvent.click(screen.getByRole('button', { name: '选择视频文件' }))
    await waitFor(() => expect(onChooseVideoFiles).toHaveBeenCalledOnce())
    expect(await screen.findByText('已选择 2 个视频文件')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '保存并整理资产' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('New drama'))
    await waitFor(() => expect(onImportEpisodePaths).toHaveBeenCalledWith('d2', ['D:/Episode 1.mp4', 'D:/Episode 2.mp4']))
  })

  it('lets a new drama scan a separately selected video folder', async () => {
    const onChooseVideoFolder = vi.fn().mockResolvedValue(['D:/Episodes'])
    const onImportEpisodePaths = vi.fn().mockResolvedValue(undefined)
    const created = { id: 'd3', name: 'Folder drama', episodeCount: 0, issueCount: 0, tagNames: [], updatedAt: '2026-01-03' }
    render(<DramaLibraryPage dramas={[]} loading={false} error={null} onRetry={vi.fn()} onCreate={vi.fn().mockResolvedValue(created)} onChooseVideoFolder={onChooseVideoFolder} onImportEpisodePaths={onImportEpisodePaths} tags={[]} onRename={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} onAttachTag={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: '创建剧目' })[0]!)
    fireEvent.change(screen.getByLabelText('剧名'), { target: { value: 'Folder drama' } })
    fireEvent.click(screen.getByRole('button', { name: '选择视频文件夹' }))
    await waitFor(() => expect(onChooseVideoFolder).toHaveBeenCalledOnce())
    expect(await screen.findByText('已选择 1 个视频文件夹，将扫描其中的视频')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '保存并整理资产' }))
    await waitFor(() => expect(onImportEpisodePaths).toHaveBeenCalledWith('d3', ['D:/Episodes']))
  })

  it('replaces the library screen with the drama workspace instead of stacking both pages', async () => {
    render(<DramaLibraryPage dramas={[{ id: 'd1', name: 'Demo', episodeCount: 0, issueCount: 0, tagNames: [], updatedAt: '2026-01-01' }]} loading={false} error={null} onRetry={vi.fn()} onCreate={vi.fn()} tags={[]} onRename={vi.fn()} onLoad={vi.fn().mockResolvedValue({ id: 'd1', name: 'Demo', episodeCount: 0, issueCount: 0, tagNames: [], updatedAt: '2026-01-01', episodes: [] })} onDelete={vi.fn()} onImport={vi.fn()} onAttachTag={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '打开剧目：Demo' }))
    expect(await screen.findByRole('tablist', { name: '剧目工作区' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '剧目库' })).toBeNull()
  })

  it('keeps the library visible until the selected drama detail is genuinely ready', async () => {
    let resolveDetail: ((value: { id: string; name: string; episodeCount: number; issueCount: number; tagNames: string[]; updatedAt: string; episodes: [] }) => void) | undefined
    const onLoad = vi.fn(() => new Promise<{ id: string; name: string; episodeCount: number; issueCount: number; tagNames: string[]; updatedAt: string; episodes: [] }>((resolve) => { resolveDetail = resolve }))
    render(<DramaLibraryPage dramas={[{ id: 'd1', name: 'Demo', episodeCount: 0, issueCount: 0, tagNames: [], updatedAt: '2026-01-01' }]} loading={false} error={null} onRetry={vi.fn()} onCreate={vi.fn()} tags={[]} onRename={vi.fn()} onLoad={onLoad} onDelete={vi.fn()} onImport={vi.fn()} onAttachTag={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '打开剧目：Demo' }))
    expect(screen.getByRole('heading', { name: '剧目库' })).toBeTruthy()
    expect((screen.getByRole('button', { name: '打开剧目：Demo' }) as HTMLButtonElement).disabled).toBe(true)
    resolveDetail?.({ id: 'd1', name: 'Demo', episodeCount: 0, issueCount: 0, tagNames: [], updatedAt: '2026-01-01', episodes: [] })
    expect(await screen.findByRole('tablist', { name: '剧目工作区' })).toBeTruthy()
  })

  it('exits only the selected drama when the global library request changes', async () => {
    const props = { dramas: [{ id: 'd1', name: 'Demo', episodeCount: 0, issueCount: 0, tagNames: ['投流'], updatedAt: '2026-01-01' }], loading: false, error: null, onRetry: vi.fn(), onCreate: vi.fn(), tags: [{ id: 'tag-1', name: '投流', usageCount: 1 }], onRename: vi.fn(), onLoad: vi.fn().mockResolvedValue({ id: 'd1', name: 'Demo', episodeCount: 0, issueCount: 0, tagNames: ['投流'], updatedAt: '2026-01-01', episodes: [] }), onDelete: vi.fn(), onImport: vi.fn(), onAttachTag: vi.fn() }
    const { rerender } = render(<DramaLibraryPage {...props} exitRequestId={0} />)
    fireEvent.change(screen.getByRole('textbox', { name: '搜索剧目' }), { target: { value: 'Demo' } })
    fireEvent.change(screen.getByRole('combobox', { name: '标签筛选' }), { target: { value: '投流' } })
    fireEvent.change(screen.getByRole('combobox', { name: '排序' }), { target: { value: 'name' } })
    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    fireEvent.click(screen.getByRole('button', { name: '打开剧目：Demo' }))
    expect(await screen.findByRole('tablist', { name: '剧目工作区' })).toBeTruthy()
    rerender(<DramaLibraryPage {...props} exitRequestId={1} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: '剧目库' })).toBeTruthy())
    expect((screen.getByRole('textbox', { name: '搜索剧目' }) as HTMLInputElement).value).toBe('Demo')
    expect((screen.getByRole('combobox', { name: '标签筛选' }) as HTMLSelectElement).value).toBe('投流')
    expect((screen.getByRole('combobox', { name: '排序' }) as HTMLSelectElement).value).toBe('name')
    expect(screen.getByRole('button', { name: '列表' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('ignores a detail response that arrives after a global request to return to the library', async () => {
    let resolveDetail: ((value: { id: string; name: string; episodeCount: number; issueCount: number; tagNames: string[]; updatedAt: string; episodes: [] }) => void) | undefined
    const props = { dramas: [{ id: 'd1', name: 'Demo', episodeCount: 0, issueCount: 0, tagNames: [], updatedAt: '2026-01-01' }], loading: false, error: null, onRetry: vi.fn(), onCreate: vi.fn(), tags: [], onRename: vi.fn(), onLoad: vi.fn(() => new Promise<{ id: string; name: string; episodeCount: number; issueCount: number; tagNames: string[]; updatedAt: string; episodes: [] }>((resolve) => { resolveDetail = resolve })), onDelete: vi.fn(), onImport: vi.fn(), onAttachTag: vi.fn() }
    const { rerender } = render(<DramaLibraryPage {...props} exitRequestId={0} />)
    fireEvent.click(screen.getByRole('button', { name: '打开剧目：Demo' }))
    rerender(<DramaLibraryPage {...props} exitRequestId={1} />)
    expect(screen.getByRole('heading', { name: '剧目库' })).toBeTruthy()
    resolveDetail?.({ id: 'd1', name: 'Demo', episodeCount: 0, issueCount: 0, tagNames: [], updatedAt: '2026-01-01', episodes: [] })
    await waitFor(() => expect(screen.queryByRole('tablist', { name: '剧目工作区' })).toBeNull())
    expect(screen.getByRole('heading', { name: '剧目库' })).toBeTruthy()
    expect((screen.getByRole('button', { name: '打开剧目：Demo' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps an unsubmitted create draft when the global library request changes at the root', () => {
    const props = { dramas: [], loading: false, error: null, onRetry: vi.fn(), onCreate: vi.fn(), tags: [], onRename: vi.fn(), onDelete: vi.fn(), onImport: vi.fn(), onAttachTag: vi.fn() }
    const { rerender } = render(<DramaLibraryPage {...props} exitRequestId={0} />)
    fireEvent.click(screen.getAllByRole('button', { name: '创建剧目' })[0]!)
    fireEvent.change(screen.getByLabelText('剧名'), { target: { value: '未提交剧目' } })
    rerender(<DramaLibraryPage {...props} exitRequestId={1} />)
    expect((screen.getByLabelText('剧名') as HTMLInputElement).value).toBe('未提交剧目')
  })

  it('switches to the compact list view and distinguishes loading, error and empty states', () => {
    const props = { dramas: [{ id: 'd1', name: 'Demo', episodeCount: 2, issueCount: 0, tagNames: [], updatedAt: '2026-01-01' }], loading: false, error: null, onRetry: vi.fn(), onCreate: vi.fn().mockResolvedValue(undefined), tags: [], onRename: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn().mockResolvedValue(undefined), onImport: vi.fn().mockResolvedValue(undefined), onAttachTag: vi.fn().mockResolvedValue(undefined) }
    const { rerender } = render(<DramaLibraryPage {...props} />)
    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    expect(document.querySelector('.library-list .drama-card')).not.toBeNull()
    rerender(<DramaLibraryPage {...props} loading />)
    expect(document.querySelector('.library-list .drama-card')).not.toBeNull()
    rerender(<DramaLibraryPage {...props} dramas={null} loading />)
    expect(screen.getByRole('status', { name: '正在读取剧目库' })).toBeTruthy()
    rerender(<DramaLibraryPage {...props} loading={false} error="数据库不可用" />)
    expect(screen.getByRole('alert').textContent).toContain('数据库不可用')
    rerender(<DramaLibraryPage {...props} dramas={[]} loading={false} error={null} />)
    expect(screen.getByText('还没有剧目')).toBeTruthy()
  })

  it('shows the latest real task in both library views', () => {
    const props = { dramas: [{ id: 'd1', name: 'Demo', episodeCount: 2, issueCount: 0, tagNames: [], updatedAt: '2026-01-01' }], loading: false, error: null, onRetry: vi.fn(), onCreate: vi.fn().mockResolvedValue(undefined), tags: [], tasks: [{ id: 'task-1', dramaId: 'd1', dramaName: 'Demo', type: 'multi_episode', status: 'running', progressCurrent: 1, progressTotal: 3, updatedAt: '2026-01-02' }], onRename: vi.fn().mockResolvedValue(undefined), onDelete: vi.fn().mockResolvedValue(undefined), onImport: vi.fn().mockResolvedValue(undefined), onAttachTag: vi.fn().mockResolvedValue(undefined) }
    render(<DramaLibraryPage {...props} />)
    expect(screen.getByText('多集拼接 · 运行中')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '列表' }))
    expect(screen.getByText('多集拼接 · 运行中')).toBeTruthy()
  })

  it('paginates the real filtered library in groups of six', () => {
    const dramas = Array.from({ length: 7 }, (_, index) => ({ id: `d${index + 1}`, name: `剧目 ${index + 1}`, episodeCount: index + 1, issueCount: 0, tagNames: [], updatedAt: `2026-01-${String(index + 1).padStart(2, '0')}` }))
    render(<DramaLibraryPage dramas={dramas} loading={false} error={null} onRetry={vi.fn()} onCreate={vi.fn()} tags={[]} onRename={vi.fn()} onLoad={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} onAttachTag={vi.fn()} />)
    expect(screen.getByText('第 1 / 2 页 · 共 7 部剧目')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '打开剧目：剧目 7' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '打开剧目：剧目 1' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    expect(screen.getByText('第 2 / 2 页 · 共 7 部剧目')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '打开剧目：剧目 7' })).toBeNull()
    expect(screen.queryByRole('button', { name: '打开剧目：剧目 1' })).toBeTruthy()
  })

  it('filters and sorts the real library while resetting pagination', () => {
    const dramas = [
      { id: 'd1', name: '乙剧', episodeCount: 1, issueCount: 2, tagNames: ['目标'], updatedAt: '2026-01-01' },
      { id: 'd2', name: '甲剧', episodeCount: 2, issueCount: 0, tagNames: ['目标'], updatedAt: '2026-01-02' },
      { id: 'd3', name: '普通剧', episodeCount: 3, issueCount: 0, tagNames: ['其他'], updatedAt: '2026-01-03' },
      ...Array.from({ length: 4 }, (_, index) => ({ id: `d${index + 4}`, name: `补充剧 ${index + 1}`, episodeCount: index + 4, issueCount: 0, tagNames: ['其他'], updatedAt: `2026-01-${String(index + 4).padStart(2, '0')}` }))
    ]
    render(<DramaLibraryPage dramas={dramas} loading={false} error={null} onRetry={vi.fn()} onCreate={vi.fn()} tags={[{ id: 'target', name: '目标', usageCount: 2 }, { id: 'other', name: '其他', usageCount: 5 }]} onRename={vi.fn()} onLoad={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} onAttachTag={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索剧目' }), { target: { value: '普通' } })
    expect(screen.getByText('第 1 / 1 页 · 共 1 部剧目')).toBeTruthy()
    expect(screen.getByRole('button', { name: '打开剧目：普通剧' })).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索剧目' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: '标签筛选' }), { target: { value: '目标' } })
    fireEvent.change(screen.getByRole('combobox', { name: '排序' }), { target: { value: 'name' } })
    expect(screen.getAllByRole('button', { name: /打开剧目：/ }).map((button) => button.getAttribute('aria-label'))).toEqual(['打开剧目：甲剧', '打开剧目：乙剧'])
    fireEvent.change(screen.getByRole('combobox', { name: '排序' }), { target: { value: 'issues' } })
    expect(screen.getAllByRole('button', { name: /打开剧目：/ }).map((button) => button.getAttribute('aria-label'))).toEqual(['打开剧目：乙剧', '打开剧目：甲剧'])
  })
})
