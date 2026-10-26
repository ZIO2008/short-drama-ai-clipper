import type { SubtitleRecognitionSettings } from '../../../shared/contracts.js'

type Props = { document: Document; dramaId: string }

type SettingKey = keyof SubtitleRecognitionSettings

const optionValues: Record<SettingKey, string[]> = {
  recognitionMode: ['asr-only', 'ocr-only', 'asr-ocr'],
  scope: ['all', 'current', 'missing'],
  language: ['zh-CN', 'zh-en', 'auto'],
  asrMode: ['audio-first', 'denoise', 'import-only'],
  ocrMode: ['auto-region', 'fixed-bottom', 'episode-manual'],
  differenceThreshold: ['standard', 'strict', 'loose'],
  importStrategy: ['parallel', 'display-only', 'review-only']
}

const fieldIds: Record<SettingKey, string> = {
  recognitionMode: 'subtitleRecognitionMode',
  scope: 'subtitleRecognitionScope',
  language: 'subtitleRecognitionLanguage',
  asrMode: 'subtitleAsrMode',
  ocrMode: 'subtitleOcrMode',
  differenceThreshold: 'subtitleDifferenceThreshold',
  importStrategy: 'subtitleImportStrategy'
}

const prototypeRecognitionModes = {
  asr: 'asr-only',
  ocr: 'ocr-only',
  dual: 'asr-ocr'
} as const

const announce = (document: Document, message: string): void => {
  const toast = document.getElementById('toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  window.setTimeout(() => toast.classList.remove('show'), 2200)
}

const applySettings = (document: Document, settings: SubtitleRecognitionSettings): void => {
  ;(Object.keys(fieldIds) as SettingKey[]).forEach((key) => {
    const select = document.getElementById(fieldIds[key]) as HTMLSelectElement | null
    const index = optionValues[key].indexOf(settings[key])
    if (select && index >= 0) {
      select.selectedIndex = index
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
  })
  document.querySelectorAll<HTMLElement>('[data-subtitle-method]').forEach((button) => {
    button.setAttribute('aria-pressed', String(prototypeRecognitionModes[button.dataset.subtitleMethod as keyof typeof prototypeRecognitionModes] === settings.recognitionMode))
  })
}

const readSettings = (document: Document): SubtitleRecognitionSettings | null => {
  const result = {} as SubtitleRecognitionSettings
  for (const key of Object.keys(fieldIds) as SettingKey[]) {
    const select = document.getElementById(fieldIds[key]) as HTMLSelectElement | null
    const selectedMethod = document.querySelector<HTMLElement>('[data-subtitle-method][aria-pressed="true"]')
    const value = key === 'recognitionMode' && !select
      ? prototypeRecognitionModes[selectedMethod?.dataset.subtitleMethod as keyof typeof prototypeRecognitionModes]
      : select ? optionValues[key][select.selectedIndex] : undefined
    if (!value) return null
    result[key] = value as never
  }
  return result
}

export const bindSubtitleRecognitionSettings = ({ document, dramaId }: Props): void => {
  const modal = document.getElementById('subtitleRecognitionSettingsModal')
  if (!modal || modal.dataset.bound === 'true') return
  modal.dataset.bound = 'true'
  let lastTrigger: HTMLButtonElement | null = null
  let settingsLoaded = false
  let settingsSession = 0
  let savingSession: number | null = null
  const setOpen = (open: boolean): void => {
    modal.classList.toggle('open', open)
    modal.setAttribute('aria-hidden', open ? 'false' : 'true')
  }
  const close = (): void => {
    settingsSession += 1
    setOpen(false)
    lastTrigger?.focus()
  }
  const exitCalibration = (): boolean => {
    if (!modal.classList.contains('is-calibrating')) return false
    modal.classList.remove('is-calibrating')
    const title = document.getElementById('subtitleRecognitionSettingsTitle')
    if (title) title.textContent = '字幕识别设置'
    return true
  }
  document.addEventListener('click', (event) => {
    const target = event.target
    if (!target || typeof (target as { closest?: unknown }).closest !== 'function') return
    const element = target as unknown as { closest: <T extends Element = Element>(selector: string) => T | null }
    if (element.closest('[data-subtitle-open-settings]')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      lastTrigger = element.closest<HTMLButtonElement>('button')
      document.dispatchEvent(new CustomEvent('subtitle-recognition-settings:opened', {
        detail: { episodeId: lastTrigger?.dataset.subtitleEpisodeId ?? null }
      }))
      exitCalibration()
      setOpen(true)
      settingsLoaded = false
      const openSession = ++settingsSession
      void window.desktopApi.getSubtitleRecognitionSettings(dramaId).then((settings) => {
        if (settingsSession !== openSession || !modal.classList.contains('open')) return
        applySettings(document, settings)
        settingsLoaded = true
      }).catch(() => {
        if (settingsSession === openSession && modal.classList.contains('open')) announce(document, '字幕识别设置读取失败，请重试。')
      })
      return
    }
    if (element.closest('[data-subtitle-close-settings]')) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!exitCalibration()) close()
      return
    }
    if (!element.closest('[data-subtitle-save-settings]')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (!settingsLoaded) { announce(document, '正在读取字幕识别设置，请稍后再保存。'); return }
    if (savingSession === settingsSession) { announce(document, '字幕识别设置正在保存，请稍候。'); return }
    const importStrategy = document.getElementById(fieldIds.importStrategy) as HTMLSelectElement | null
    if (importStrategy?.selectedIndex === 1) { announce(document, '当前证据契约不支持“仅作为展示字幕”，请选择其他策略。'); return }
    const settings = readSettings(document)
    if (!settings) { announce(document, '字幕识别设置无效，请检查后重试。'); return }
    const saveSession = settingsSession
    savingSession = saveSession
    void window.desktopApi.saveSubtitleRecognitionSettings(dramaId, settings).then(() => {
      if (settingsSession !== saveSession || !modal.classList.contains('open')) return
      close()
      announce(document, '字幕识别设置已保存。')
    }).catch(() => {
      if (settingsSession === saveSession && modal.classList.contains('open')) announce(document, '字幕识别设置保存失败，请重试。')
    }).finally(() => {
      if (savingSession === saveSession) savingSession = null
    })
  }, true)
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('open')) close() })
}
