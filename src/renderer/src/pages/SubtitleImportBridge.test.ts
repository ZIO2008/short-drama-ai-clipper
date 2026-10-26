// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, SubtitleBatchImportPreview, SubtitleBatchImportResult, SubtitleBatchImportedAsset, SubtitleAsset } from '../../../shared/contracts.js'
import { bindSubtitleImport } from './SubtitleImportBridge.js'

const importedAsset: SubtitleBatchImportedAsset = { id: 'asset-1', dramaId: 'd1', episodeId: 'episode-1', episodeNo: 1, sourcePath: 'D:\\01.srt', format: 'srt', cueCount: 18, status: 'ready' }
const importedVttAsset: SubtitleBatchImportedAsset = { id: 'asset-2', dramaId: 'd1', episodeId: 'episode-2', episodeNo: 2, sourcePath: 'D:\\02.vtt', format: 'vtt', cueCount: 7, status: 'ready' }
const importedResult: SubtitleBatchImportResult = { assets: [importedAsset, importedVttAsset], skipped: [{ sourcePath: 'D:\\unknown.srt', reason: '文件名未包含可识别的完整剧集号' }, { sourcePath: 'D:\\01（戏前）.srt', reason: '同次导入中多个字幕文件命中同一剧集，需人工处理' }] }
const importPreview: SubtitleBatchImportPreview = { matches: [{ episodeId: 'episode-1', episodeNo: 1, sourcePath: importedAsset.sourcePath, format: 'srt' }, { episodeId: 'episode-2', episodeNo: 2, sourcePath: importedVttAsset.sourcePath, format: 'vtt' }], skipped: importedResult.skipped }

const renderSurface = (): Document => {
  const testDocument = document.implementation.createHTMLDocument('subtitle-import')
  testDocument.body.innerHTML = '<button data-subtitle-import>导入字幕</button><div id="toast"></div>'
  return testDocument
}

const clickImport = (testDocument: Document): void => (testDocument.querySelector('[data-subtitle-import]') as HTMLButtonElement).click()

const installApi = (choose: ReturnType<typeof vi.fn>, importSubtitlesByEpisode: ReturnType<typeof vi.fn>): void => {
  window.desktopApi = { chooseSubtitleFiles: choose, previewSubtitlesByEpisode: vi.fn().mockResolvedValue(importPreview), importSubtitlesByEpisode } as unknown as DesktopApi
  vi.spyOn(window, 'confirm').mockReturnValue(true)
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('bindSubtitleImport', () => {
  it('does not write an asset when the native file picker is cancelled', async () => {
    const choose = vi.fn().mockResolvedValue([])
    const importSubtitlesByEpisode = vi.fn()
    const testDocument = renderSurface(); installApi(choose, importSubtitlesByEpisode); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument)
    await vi.waitFor(() => expect(choose).toHaveBeenCalledOnce())
    expect(importSubtitlesByEpisode).not.toHaveBeenCalled()
  })

  it('imports selected subtitles by episode and reports every skipped file with its reason', async () => {
    const choose = vi.fn().mockResolvedValue([importedAsset.sourcePath, importedVttAsset.sourcePath, 'D:\\unknown.srt', 'D:\\01（戏前）.srt'])
    const importSubtitlesByEpisode = vi.fn().mockResolvedValue(importedResult)
    const testDocument = renderSurface(); installApi(choose, importSubtitlesByEpisode); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    expect(testDocument.querySelector('[data-subtitle-import]')?.textContent).toBe('导入字幕')
    clickImport(testDocument)
    await vi.waitFor(() => expect(importSubtitlesByEpisode).toHaveBeenCalledWith('d1', [importedAsset.sourcePath, importedVttAsset.sourcePath, 'D:\\unknown.srt', 'D:\\01（戏前）.srt']))
    expect(window.desktopApi.previewSubtitlesByEpisode).toHaveBeenCalledWith('d1', [importedAsset.sourcePath, importedVttAsset.sourcePath, 'D:\\unknown.srt', 'D:\\01（戏前）.srt'])
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('将导入 2 个字幕文件：'))
    expect(testDocument.getElementById('toast')?.textContent).toBe('已按文件名暂定归属导入 2 个字幕文件，共 25 条。\n已导入：\n- 第 01 集：01.srt（SRT，18 条）\n- 第 02 集：02.vtt（VTT，7 条）\n已跳过 2 个文件：\n- unknown.srt：文件名未包含可识别的完整剧集号\n- 01（戏前）.srt：同次导入中多个字幕文件命中同一剧集，需人工处理')
    const toast = testDocument.getElementById('toast') as HTMLElement
    expect(toast.style.maxWidth).toBe('min(520px, calc(100vw - 44px))')
    expect(toast.style.maxHeight).toBe('45vh')
    expect(toast.style.overflow).toBe('auto')
    expect(toast.style.whiteSpace).toBe('pre-wrap')
  })

  it('prevents duplicate imports while a file selection is pending', async () => {
    let selectFile!: (path: string | null) => void
    const choose = vi.fn().mockReturnValue(new Promise<string[]>((resolve) => { selectFile = (path) => resolve(path ? [path] : []) }))
    const importSubtitlesByEpisode = vi.fn().mockResolvedValue({ assets: [importedAsset], skipped: [] })
    const testDocument = renderSurface(); installApi(choose, importSubtitlesByEpisode); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument); clickImport(testDocument)
    expect(choose).toHaveBeenCalledOnce()
    expect(testDocument.getElementById('toast')?.textContent).toBe('字幕正在导入，请稍候。')
    selectFile(importedAsset.sourcePath)
    await vi.waitFor(() => expect(importSubtitlesByEpisode).toHaveBeenCalledOnce())
  })

  it('does not write any subtitle asset when the import preview is cancelled', async () => {
    const choose = vi.fn().mockResolvedValue([importedAsset.sourcePath])
    const importSubtitlesByEpisode = vi.fn()
    const testDocument = renderSurface(); installApi(choose, importSubtitlesByEpisode); vi.mocked(window.desktopApi.previewSubtitlesByEpisode).mockResolvedValue({ matches: [importPreview.matches[0]], skipped: [] }); vi.mocked(window.confirm).mockReturnValue(false)
    bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument)
    await vi.waitFor(() => expect(window.desktopApi.previewSubtitlesByEpisode).toHaveBeenCalledOnce())
    expect(importSubtitlesByEpisode).not.toHaveBeenCalled()
    expect(testDocument.getElementById('toast')?.textContent).toBe('已取消本次字幕导入，未写入任何字幕资产。')
  })

  it('keeps a detailed skip notice visible after a prior short toast would expire', async () => {
    vi.useFakeTimers()
    let selectFiles!: (paths: string[]) => void
    const choose = vi.fn().mockReturnValue(new Promise<string[]>((resolve) => { selectFiles = resolve }))
    const importSubtitlesByEpisode = vi.fn().mockResolvedValue(importedResult)
    const testDocument = renderSurface(); installApi(choose, importSubtitlesByEpisode); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument)
    clickImport(testDocument)
    selectFiles([importedAsset.sourcePath, importedVttAsset.sourcePath, 'D:\\unknown.srt', 'D:\\01（戏前）.srt'])
    await vi.waitFor(() => expect(importSubtitlesByEpisode).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(2201)

    expect(testDocument.getElementById('toast')?.classList.contains('show')).toBe(true)
  })

  it('releases the import lock when the native file picker does not settle', async () => {
    vi.useFakeTimers()
    const choose = vi.fn().mockReturnValue(new Promise<string | null>(() => undefined))
    const importSubtitlesByEpisode = vi.fn()
    const testDocument = renderSurface(); installApi(choose, importSubtitlesByEpisode); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(testDocument.getElementById('toast')?.textContent).toBe('字幕导入失败：文件选择等待超时，请重新打开导入。')

    clickImport(testDocument)
    expect(choose).toHaveBeenCalledTimes(2)
    expect(importSubtitlesByEpisode).not.toHaveBeenCalled()
  })

  it('releases the import lock and reports a timeout when the write does not settle', async () => {
    vi.useFakeTimers()
    const choose = vi.fn().mockResolvedValue([importedAsset.sourcePath])
    const importSubtitlesByEpisode = vi.fn().mockReturnValue(new Promise<SubtitleBatchImportResult>(() => undefined))
    const testDocument = renderSurface(); installApi(choose, importSubtitlesByEpisode); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(testDocument.getElementById('toast')?.textContent).toBe('字幕导入失败：字幕导入超时，请稍后重试。')

    clickImport(testDocument)
    expect(choose).toHaveBeenCalledTimes(2)
  })

  it('keeps the prototype page open and reports the actual import failure', async () => {
    const choose = vi.fn().mockResolvedValue([importedAsset.sourcePath])
    const importSubtitlesByEpisode = vi.fn().mockRejectedValue(new Error('bad subtitle'))
    const testDocument = renderSurface(); installApi(choose, importSubtitlesByEpisode); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument)
    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toBe('字幕导入失败：bad subtitle'))
  })
})
