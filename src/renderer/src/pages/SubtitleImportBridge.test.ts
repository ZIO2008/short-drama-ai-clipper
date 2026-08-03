// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, SubtitleAsset } from '../../../shared/contracts.js'
import { bindSubtitleImport } from './SubtitleImportBridge.js'

const importedAsset: SubtitleAsset = { id: 'asset-1', dramaId: 'd1', episodeId: null, sourcePath: 'D:\\captions.srt', format: 'srt', cueCount: 18, status: 'ready' }
const importedVttAsset: SubtitleAsset = { id: 'asset-2', dramaId: 'd1', episodeId: null, sourcePath: 'D:\\captions.vtt', format: 'vtt', cueCount: 7, status: 'ready' }

const renderSurface = (): Document => {
  const testDocument = document.implementation.createHTMLDocument('subtitle-import')
  testDocument.body.innerHTML = '<button data-subtitle-import>导入字幕</button><div id="toast"></div>'
  return testDocument
}

const clickImport = (testDocument: Document): void => (testDocument.querySelector('[data-subtitle-import]') as HTMLButtonElement).click()

const installApi = (choose: ReturnType<typeof vi.fn>, importSubtitle: ReturnType<typeof vi.fn>): void => {
  window.desktopApi = { chooseSubtitleFile: choose, importSubtitle } as unknown as DesktopApi
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

describe('bindSubtitleImport', () => {
  it('does not write an asset when the native file picker is cancelled', async () => {
    const choose = vi.fn().mockResolvedValue(null)
    const importSubtitle = vi.fn()
    const testDocument = renderSurface(); installApi(choose, importSubtitle); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument)
    await vi.waitFor(() => expect(choose).toHaveBeenCalledOnce())
    expect(importSubtitle).not.toHaveBeenCalled()
  })

  it('imports the selected SRT at drama scope and reports its real cue count', async () => {
    const choose = vi.fn().mockResolvedValue(importedAsset.sourcePath)
    const importSubtitle = vi.fn().mockResolvedValue(importedAsset)
    const testDocument = renderSurface(); installApi(choose, importSubtitle); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument)
    await vi.waitFor(() => expect(importSubtitle).toHaveBeenCalledWith('d1', null, importedAsset.sourcePath))
    expect(testDocument.getElementById('toast')?.textContent).toBe('已导入 SRT 字幕，共 18 条，等待按剧集校验。')
  })

  it('imports the selected VTT at drama scope and reports its real cue count', async () => {
    const choose = vi.fn().mockResolvedValue(importedVttAsset.sourcePath)
    const importSubtitle = vi.fn().mockResolvedValue(importedVttAsset)
    const testDocument = renderSurface(); installApi(choose, importSubtitle); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument)
    await vi.waitFor(() => expect(importSubtitle).toHaveBeenCalledWith('d1', null, importedVttAsset.sourcePath))
    expect(testDocument.getElementById('toast')?.textContent).toBe('已导入 VTT 字幕，共 7 条，等待按剧集校验。')
  })

  it('prevents duplicate imports while a file selection is pending', async () => {
    let selectFile!: (path: string | null) => void
    const choose = vi.fn().mockReturnValue(new Promise<string | null>((resolve) => { selectFile = resolve }))
    const importSubtitle = vi.fn().mockResolvedValue(importedAsset)
    const testDocument = renderSurface(); installApi(choose, importSubtitle); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument); clickImport(testDocument)
    expect(choose).toHaveBeenCalledOnce()
    expect(testDocument.getElementById('toast')?.textContent).toBe('字幕正在导入，请稍候。')
    selectFile(importedAsset.sourcePath)
    await vi.waitFor(() => expect(importSubtitle).toHaveBeenCalledOnce())
  })

  it('releases the import lock when the native file picker does not settle', async () => {
    vi.useFakeTimers()
    const choose = vi.fn().mockReturnValue(new Promise<string | null>(() => undefined))
    const importSubtitle = vi.fn()
    const testDocument = renderSurface(); installApi(choose, importSubtitle); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(testDocument.getElementById('toast')?.textContent).toBe('字幕导入失败：文件选择等待超时，请重新打开导入。')

    clickImport(testDocument)
    expect(choose).toHaveBeenCalledTimes(2)
    expect(importSubtitle).not.toHaveBeenCalled()
  })

  it('releases the import lock and reports a timeout when the write does not settle', async () => {
    vi.useFakeTimers()
    const choose = vi.fn().mockResolvedValue(importedAsset.sourcePath)
    const importSubtitle = vi.fn().mockReturnValue(new Promise<SubtitleAsset>(() => undefined))
    const testDocument = renderSurface(); installApi(choose, importSubtitle); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(testDocument.getElementById('toast')?.textContent).toBe('字幕导入失败：字幕导入超时，请稍后重试。')

    clickImport(testDocument)
    expect(choose).toHaveBeenCalledTimes(2)
  })

  it('keeps the prototype page open and reports the actual import failure', async () => {
    const choose = vi.fn().mockResolvedValue(importedAsset.sourcePath)
    const importSubtitle = vi.fn().mockRejectedValue(new Error('bad subtitle'))
    const testDocument = renderSurface(); installApi(choose, importSubtitle); bindSubtitleImport({ document: testDocument, dramaId: 'd1' })

    clickImport(testDocument)
    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toBe('字幕导入失败：bad subtitle'))
  })
})
