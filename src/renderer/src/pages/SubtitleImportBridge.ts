import type { SubtitleBatchImportPreview } from '../../../shared/contracts.js'
import { announceSubtitleToast as announce } from './subtitle-toast.js'

type Props = { document: Document; dramaId: string }

const FILE_PICKER_TIMEOUT_MS = 5 * 60_000
const IMPORT_TIMEOUT_MS = 60_000

const withTimeout = async <Value>(action: Promise<Value>, timeoutMs: number, message: string): Promise<Value> => {
  let timeoutId: number | undefined
  try {
    return await Promise.race([
      action,
      new Promise<never>((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs) })
    ])
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}

const importFailureMessage = (cause: unknown): string => cause instanceof Error && cause.message
  ? `字幕导入失败：${cause.message}`
  : '字幕导入失败：发生未知错误，请重试。'

const subtitleFilename = (sourcePath: string): string => sourcePath.split(/[\\/]/).pop() || sourcePath
const skippedImportDetails = (skipped: Array<{ sourcePath: string; reason: string }>): string => skipped.map(({ sourcePath, reason }) => `- ${subtitleFilename(sourcePath)}：${reason}`).join('\n')
const importedAssetDetails = (assets: Array<{ episodeNo: number; sourcePath: string; format: string; cueCount: number }>): string => assets.map(({ episodeNo, sourcePath, format, cueCount }) => `- 第 ${String(episodeNo).padStart(2, '0')} 集：${subtitleFilename(sourcePath)}（${format.toUpperCase()}，${cueCount} 条）`).join('\n')
const previewMatchDetails = (matches: SubtitleBatchImportPreview['matches']): string => matches.map(({ episodeNo, sourcePath, format }) => `- 第 ${String(episodeNo).padStart(2, '0')} 集：${subtitleFilename(sourcePath)}（${format.toUpperCase()}）`).join('\n')
const importNoticeDuration = (itemCount: number): number => Math.min(20_000, Math.max(8_000, 3_000 + itemCount * 1_400))

const confirmImportPreview = (preview: SubtitleBatchImportPreview): boolean => {
  const matches = `将导入 ${preview.matches.length} 个字幕文件：\n${previewMatchDetails(preview.matches)}`
  const skipped = preview.skipped.length > 0 ? `\n\n将跳过 ${preview.skipped.length} 个文件：\n${skippedImportDetails(preview.skipped)}` : ''
  return window.confirm(`${matches}${skipped}\n\n确认写入本剧目的字幕资产吗？`)
}

export const bindSubtitleImport = ({ document, dramaId }: Props): void => {
  if (document.body.dataset.subtitleImportBound === 'true') return
  document.body.dataset.subtitleImportBound = 'true'
  const importButton = document.querySelector<HTMLButtonElement>('[data-subtitle-import]')
  if (importButton) {
    importButton.title = '选择一份或多份 SRT/VTT；确认逐集匹配后才会写入'
    importButton.setAttribute('aria-label', '导入字幕')
  }
  let importing = false
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return
    if (!(target as unknown as { closest: (selector: string) => Element | null }).closest('[data-subtitle-import]')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (importing) { announce(document, '字幕正在导入，请稍候。'); return }
    importing = true
    void withTimeout(window.desktopApi.chooseSubtitleFiles(), FILE_PICKER_TIMEOUT_MS, '文件选择等待超时，请重新打开导入。').then(async (paths) => {
      if (paths.length === 0) return null
      const preview = await withTimeout(window.desktopApi.previewSubtitlesByEpisode(dramaId, paths), IMPORT_TIMEOUT_MS, '字幕导入预检超时，请稍后重试。')
      if (preview.matches.length === 0) {
        const details = preview.skipped.length > 0 ? `\n已跳过 ${preview.skipped.length} 个文件：\n${skippedImportDetails(preview.skipped)}` : ''
        announce(document, `没有可导入的字幕。${details || '没有可唯一匹配的剧集。'}`, importNoticeDuration(preview.skipped.length))
        return null
      }
      if (!confirmImportPreview(preview)) {
        announce(document, '已取消本次字幕导入，未写入任何字幕资产。')
        return null
      }
      return withTimeout(window.desktopApi.importSubtitlesByEpisode(dramaId, paths), IMPORT_TIMEOUT_MS, '字幕导入超时，请稍后重试。')
    }).then((result) => {
      if (!result) return
      if (result.assets.length === 0) {
        const details = result.skipped.length > 0 ? `\n已跳过 ${result.skipped.length} 个文件：\n${skippedImportDetails(result.skipped)}` : ''
        announce(document, `没有导入任何字幕。${details || '没有可匹配的剧集。'}`, importNoticeDuration(result.skipped.length))
        return
      }
      const cueCount = result.assets.reduce((total, asset) => total + asset.cueCount, 0)
      const imported = `\n已导入：\n${importedAssetDetails(result.assets)}`
      const skipped = result.skipped.length > 0 ? `\n已跳过 ${result.skipped.length} 个文件：\n${skippedImportDetails(result.skipped)}` : ''
      announce(document, `已按文件名暂定归属导入 ${result.assets.length} 个字幕文件，共 ${cueCount} 条。${imported}${skipped}`, importNoticeDuration(result.assets.length + result.skipped.length))
      document.dispatchEvent(new CustomEvent('subtitle-assets:changed'))
    }).catch((cause: unknown) => announce(document, importFailureMessage(cause))).finally(() => {
      importing = false
    })
  }, true)
}
