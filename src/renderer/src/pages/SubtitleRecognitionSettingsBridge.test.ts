// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, SubtitleRecognitionSettings } from '../../../shared/contracts.js'
import { bindSubtitleRecognitionSettings } from './SubtitleRecognitionSettingsBridge.js'

const storedSettings: SubtitleRecognitionSettings = {
  scope: 'current', language: 'zh-en', asrMode: 'denoise', ocrMode: 'fixed-bottom', differenceThreshold: 'strict', importStrategy: 'review-only'
}

const fields = ['subtitleRecognitionScope', 'subtitleRecognitionLanguage', 'subtitleAsrMode', 'subtitleOcrMode', 'subtitleDifferenceThreshold', 'subtitleImportStrategy']

const renderModal = (): Document => {
  const testDocument = document.implementation.createHTMLDocument('subtitle-settings')
  testDocument.body.innerHTML = `<button data-subtitle-open-settings>open</button><div id="subtitleRecognitionSettingsModal" aria-hidden="true"><select id="subtitleRecognitionScope"><option></option><option></option><option></option></select><select id="subtitleRecognitionLanguage"><option></option><option></option><option></option></select><select id="subtitleAsrMode"><option></option><option></option><option></option></select><select id="subtitleOcrMode"><option></option><option></option><option></option></select><select id="subtitleDifferenceThreshold"><option></option><option></option><option></option></select><select id="subtitleImportStrategy"><option></option><option></option><option></option></select><button data-subtitle-close-settings>cancel</button><button data-subtitle-save-settings>save</button></div><div id="toast"></div>`
  return testDocument
}

const installApi = (get = vi.fn().mockResolvedValue(storedSettings), save = vi.fn().mockResolvedValue(storedSettings)): void => {
  window.desktopApi = { getSubtitleRecognitionSettings: get, saveSubtitleRecognitionSettings: save } as unknown as DesktopApi
}

const click = (testDocument: Document, selector: string): void => (testDocument.querySelector(selector) as HTMLElement).click()
const modal = (testDocument: Document): HTMLElement => testDocument.getElementById('subtitleRecognitionSettingsModal')!
const select = (testDocument: Document, id: string): HTMLSelectElement => testDocument.getElementById(id) as HTMLSelectElement

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('bindSubtitleRecognitionSettings', () => {
  it('reads all six persisted settings and saves the selected values for the active drama', async () => {
    const get = vi.fn().mockResolvedValue(storedSettings)
    const save = vi.fn().mockResolvedValue(storedSettings)
    const testDocument = renderModal(); installApi(get, save); bindSubtitleRecognitionSettings({ document: testDocument, dramaId: 'd1' })

    click(testDocument, '[data-subtitle-open-settings]')
    await vi.waitFor(() => expect(select(testDocument, 'subtitleImportStrategy').selectedIndex).toBe(2))
    expect(fields.map((id) => select(testDocument, id).selectedIndex)).toEqual([1, 1, 1, 1, 1, 2])
    click(testDocument, '[data-subtitle-save-settings]')
    await vi.waitFor(() => expect(save).toHaveBeenCalledWith('d1', storedSettings))
    expect(modal(testDocument).classList.contains('open')).toBe(false)
  })

  it('keeps the prototype display-only option visible but blocks unsupported persistence', async () => {
    const save = vi.fn().mockResolvedValue(storedSettings)
    const testDocument = renderModal(); installApi(vi.fn().mockResolvedValue(storedSettings), save); bindSubtitleRecognitionSettings({ document: testDocument, dramaId: 'd1' })

    click(testDocument, '[data-subtitle-open-settings]')
    await vi.waitFor(() => expect(select(testDocument, 'subtitleImportStrategy').selectedIndex).toBe(2))
    select(testDocument, 'subtitleImportStrategy').selectedIndex = 1
    click(testDocument, '[data-subtitle-save-settings]')
    expect(save).not.toHaveBeenCalled()
    expect(modal(testDocument).classList.contains('open')).toBe(true)
    expect(testDocument.getElementById('toast')?.textContent).toContain('仅作为展示字幕')
  })

  it('blocks saving when persisted settings cannot be read', async () => {
    const save = vi.fn().mockResolvedValue(storedSettings)
    const testDocument = renderModal(); installApi(vi.fn().mockRejectedValue(new Error('offline')), save); bindSubtitleRecognitionSettings({ document: testDocument, dramaId: 'd1' })

    click(testDocument, '[data-subtitle-open-settings]')
    await vi.waitFor(() => expect(testDocument.getElementById('toast')?.textContent).toContain('读取失败'))
    click(testDocument, '[data-subtitle-save-settings]')
    expect(save).not.toHaveBeenCalled()
  })

  it('ignores a stale read after the modal is closed and reopened', async () => {
    let resolveFirst!: (value: SubtitleRecognitionSettings) => void
    const first = new Promise<SubtitleRecognitionSettings>((resolve) => { resolveFirst = resolve })
    const second: SubtitleRecognitionSettings = { ...storedSettings, scope: 'missing' }
    const get = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(second)
    const testDocument = renderModal(); installApi(get); bindSubtitleRecognitionSettings({ document: testDocument, dramaId: 'd1' })

    click(testDocument, '[data-subtitle-open-settings]'); click(testDocument, '[data-subtitle-close-settings]'); click(testDocument, '[data-subtitle-open-settings]')
    await vi.waitFor(() => expect(select(testDocument, 'subtitleRecognitionScope').selectedIndex).toBe(2))
    resolveFirst({ ...storedSettings, scope: 'all' })
    await Promise.resolve()
    expect(select(testDocument, 'subtitleRecognitionScope').selectedIndex).toBe(2)
  })

  it('does not close a newer modal session when an earlier save finishes', async () => {
    let resolveSave!: (value: SubtitleRecognitionSettings) => void
    const save = vi.fn().mockReturnValue(new Promise<SubtitleRecognitionSettings>((resolve) => { resolveSave = resolve }))
    const testDocument = renderModal(); installApi(vi.fn().mockResolvedValue(storedSettings), save); bindSubtitleRecognitionSettings({ document: testDocument, dramaId: 'd1' })

    click(testDocument, '[data-subtitle-open-settings]')
    await vi.waitFor(() => expect(select(testDocument, 'subtitleImportStrategy').selectedIndex).toBe(2))
    click(testDocument, '[data-subtitle-save-settings]'); click(testDocument, '[data-subtitle-close-settings]'); click(testDocument, '[data-subtitle-open-settings]')
    await vi.waitFor(() => expect(modal(testDocument).classList.contains('open')).toBe(true))
    resolveSave(storedSettings)
    await Promise.resolve()
    expect(modal(testDocument).classList.contains('open')).toBe(true)
  })

  it('allows only one save request in the same modal session', async () => {
    let resolveSave!: (value: SubtitleRecognitionSettings) => void
    const save = vi.fn().mockReturnValue(new Promise<SubtitleRecognitionSettings>((resolve) => { resolveSave = resolve }))
    const testDocument = renderModal(); installApi(vi.fn().mockResolvedValue(storedSettings), save); bindSubtitleRecognitionSettings({ document: testDocument, dramaId: 'd1' })

    click(testDocument, '[data-subtitle-open-settings]')
    await vi.waitFor(() => expect(select(testDocument, 'subtitleImportStrategy').selectedIndex).toBe(2))
    click(testDocument, '[data-subtitle-save-settings]'); click(testDocument, '[data-subtitle-save-settings]')
    expect(save).toHaveBeenCalledTimes(1)
    resolveSave(storedSettings)
  })
})
