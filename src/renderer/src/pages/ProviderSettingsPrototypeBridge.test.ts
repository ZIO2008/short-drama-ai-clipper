// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindProviderSettingsPrototype } from './ProviderSettingsPrototypeBridge.js'

const flush = async (): Promise<void> => { for (let index = 0; index < 8; index += 1) await Promise.resolve() }
const secretRef = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'

const overview = (): Document => {
  const document = window.document.implementation.createHTMLDocument('providers')
  document.body.innerHTML = '<button data-open="asr">ASR</button><button data-settings="export">导出</button><span id="provider-status-asr"></span><span id="provider-status-textAnalysis"></span><span id="provider-status-multimodalReview"></span><div id="toast"></div>'
  return document
}

const form = (): Document => {
  const document = window.document.implementation.createHTMLDocument('asr')
  document.body.innerHTML = [
    '<div><button class="active" data-supplier-filter="all" data-supplier="asr">全部</button><button data-supplier-filter="local" data-supplier="asr">本机运行</button><button data-supplier-filter="pay" data-supplier="asr">按量付费</button></div>',
    '<article class="supplier-candidate" data-supplier-candidate data-supplier="asr" data-cost="local"><button data-use-provider data-supplier="asr" data-candidate="0">预填此方案</button><button data-reference-link="官方文档">官方文档</button></article>',
    '<article class="supplier-candidate" data-supplier-candidate data-supplier="asr" data-cost="pay"><button data-use-provider data-supplier="asr" data-candidate="1">预填此方案</button></article><p data-supplier-empty="asr" hidden>空</p>',
    '<input id="supplier-asr-vendor"><input id="supplier-asr-region"><input id="supplier-asr-endpoint"><input id="supplier-asr-model">',
    '<input id="supplier-asr-timeout" value="60"><input id="supplier-asr-price"><input id="supplier-asr-secret">',
    '<p id="supplier-draft-status-asr"></p><button data-save-provider="asr">保存</button><button data-open="settings">返回</button><div id="toast"></div>'
  ].join('')
  return document
}

afterEach(() => { vi.restoreAllMocks() })

describe('bindProviderSettingsPrototype', () => {
  it('uses real profiles for overview state and routes only through the Bridge', async () => {
    const document = overview()
    const onNavigate = vi.fn(); const onSectionChange = vi.fn()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([
        { id: 'asr', capability: 'asr', region: 'local', provider: 'Local ASR', endpoint: 'http://127.0.0.1:8080', model: null, secretRef: null, timeoutMs: 60_000, pricing: null },
        { id: 'text', capability: 'text-analysis', region: 'global', provider: 'Cloud', endpoint: 'https://example.test', model: null, secretRef, timeoutMs: 60_000, pricing: null }
      ]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: false })
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: null, onNavigate, onSectionChange, onSaveSecret: vi.fn() })
    await flush()

    expect(document.getElementById('provider-status-asr')?.textContent).toBe('已配置')
    expect(document.getElementById('provider-status-textAnalysis')?.textContent).toBe('缺少密钥')
    document.querySelector<HTMLElement>('[data-open="asr"]')?.click()
    document.querySelector<HTMLElement>('[data-settings="export"]')?.click()
    expect(onNavigate).toHaveBeenCalledWith('asr')
    expect(onSectionChange).toHaveBeenCalledWith('export')
    cleanup()
  })

  it('prefills without saving or overwriting an edited field, and opens the catalog URL outside the iframe', async () => {
    const document = form()
    const openExternalUrl = vi.fn().mockResolvedValue(undefined)
    Object.assign(window, { desktopApi: { listProviderProfiles: vi.fn().mockResolvedValue([]), openExternalUrl } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'asr', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    const model = document.getElementById('supplier-asr-model') as HTMLInputElement
    model.value = '保留的本机模型'; model.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLElement>('[data-use-provider]')?.click()
    expect((document.getElementById('supplier-asr-vendor') as HTMLInputElement).value).toBe('whisper.cpp（本机）')
    expect(model.value).toBe('保留的本机模型')
    expect(window.desktopApi.saveProviderProfile).toBeUndefined()
    document.querySelector<HTMLElement>('[data-reference-link]')?.click()
    await flush()
    expect(openExternalUrl).toHaveBeenCalledWith('https://github.com/ggml-org/whisper.cpp')
    cleanup()
  })

  it('restores the finalized prototype cost filter and selected-card state after isolation', async () => {
    const document = form()
    Object.assign(window, { desktopApi: { listProviderProfiles: vi.fn().mockResolvedValue([]) } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'asr', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    document.querySelector<HTMLElement>('[data-supplier-filter="pay"]')?.click()
    const [local, paid] = [...document.querySelectorAll<HTMLElement>('[data-supplier-candidate]')]
    expect(local.hidden).toBe(true)
    expect(paid.hidden).toBe(false)
    document.querySelector<HTMLElement>('[data-supplier-filter="all"]')?.click()
    document.querySelector<HTMLElement>('[data-use-provider][data-candidate="0"]')?.click()
    expect(document.querySelector<HTMLElement>('[data-use-provider][data-candidate="0"]')?.textContent).toBe('已预填')
    expect(document.querySelector<HTMLElement>('[data-use-provider][data-candidate="0"]')?.closest('article')?.classList.contains('is-selected')).toBe(true)
    cleanup()
  })

  it('persists the secret reference and profile but keeps cloud execution disabled', async () => {
    const document = form()
    const onSaveSecret = vi.fn().mockResolvedValue({ exists: true })
    const saveProviderProfile = vi.fn().mockResolvedValue('asr')
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([]), saveProviderProfile,
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true })
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'asr', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret })
    ;(document.getElementById('supplier-asr-vendor') as HTMLInputElement).value = 'Custom ASR'
    ;(document.getElementById('supplier-asr-region') as HTMLInputElement).value = 'global'
    ;(document.getElementById('supplier-asr-endpoint') as HTMLInputElement).value = 'https://api.example.test/v1'
    ;(document.getElementById('supplier-asr-secret') as HTMLInputElement).value = 'never-render-this'
    document.querySelector<HTMLElement>('[data-save-provider]')?.click()
    await flush(); await flush()
    expect(onSaveSecret).toHaveBeenCalledWith('never-render-this', expect.any(String))
    expect(saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({ capability: 'asr', region: 'global', provider: 'Custom ASR', secretRef: expect.any(String) }))
    expect(document.getElementById('toast')?.textContent).toContain('云端调用仍未启用')
    expect(document.getElementById('toast')?.textContent).not.toContain('never-render-this')
    cleanup()
  })
})
