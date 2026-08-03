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

const announce = (document: Document, message: string): void => {
  const toast = document.getElementById('toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  window.setTimeout(() => toast.classList.remove('show'), 2200)
}

export const bindSubtitleImport = ({ document, dramaId }: Props): void => {
  if (document.body.dataset.subtitleImportBound === 'true') return
  document.body.dataset.subtitleImportBound = 'true'
  let importing = false
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return
    if (!(target as unknown as { closest: (selector: string) => Element | null }).closest('[data-subtitle-import]')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (importing) { announce(document, '字幕正在导入，请稍候。'); return }
    importing = true
    void withTimeout(window.desktopApi.chooseSubtitleFile(), FILE_PICKER_TIMEOUT_MS, '文件选择等待超时，请重新打开导入。').then(async (path) => {
      if (!path) return null
      return withTimeout(window.desktopApi.importSubtitle(dramaId, null, path), IMPORT_TIMEOUT_MS, '字幕导入超时，请稍后重试。')
    }).then((asset) => {
      if (!asset) return
      announce(document, `已导入 ${asset.format.toUpperCase()} 字幕，共 ${asset.cueCount} 条，等待按剧集校验。`)
      document.dispatchEvent(new CustomEvent('subtitle-assets:changed'))
    }).catch((cause: unknown) => announce(document, importFailureMessage(cause))).finally(() => {
      importing = false
    })
  }, true)
}
