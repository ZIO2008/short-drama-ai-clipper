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
    '<article class="supplier-candidate" data-supplier-candidate data-supplier="asr" data-cost="local"><h3>whisper.cpp（本机）</h3><button data-use-provider data-supplier="asr" data-candidate="0">预填此方案</button><button data-reference-link="官方文档">官方文档</button></article>',
    '<article class="supplier-candidate" data-supplier-candidate data-supplier="asr" data-cost="pay"><h3>OpenAI API</h3><button data-use-provider data-supplier="asr" data-candidate="1">预填此方案</button></article><article class="supplier-candidate" data-supplier-candidate data-supplier="asr" data-cost="pay"><h3>腾讯云 ASR</h3><button data-use-provider data-supplier="asr" data-candidate="3">预填此方案</button></article><p data-supplier-empty="asr" hidden>空</p>',
    '<input id="supplier-asr-vendor"><input id="supplier-asr-region"><input id="supplier-asr-endpoint"><input id="supplier-asr-model">',
    '<input id="supplier-asr-timeout" value="60"><input id="supplier-asr-price"><input id="supplier-asr-secret"><section data-tencent-asr-credentials hidden><input id="supplier-asr-secret-id"><input id="supplier-asr-secret-key" type="password"></section>',
    '<p id="supplier-draft-status-asr"></p><section data-od-id="asr-current-default"><span data-asr-default-saved></span><b data-asr-default-provider></b><span data-asr-default-detail></span></section><button data-save-provider="asr" data-od-id="save-asr-as-default">保存并设为默认</button><button data-open="settings">返回</button><div id="toast"></div>'
  ].join('')
  return document
}

const textAnalysisForm = (): Document => {
  const document = window.document.implementation.createHTMLDocument('text-analysis')
  document.body.innerHTML = [
    '<input id="supplier-textAnalysis-vendor"><input id="supplier-textAnalysis-region"><input id="supplier-textAnalysis-endpoint"><input id="supplier-textAnalysis-model">',
    '<input id="supplier-textAnalysis-timeout" value="60"><input id="supplier-textAnalysis-price"><input id="supplier-textAnalysis-secret" type="password">',
    '<p id="supplier-draft-status-textAnalysis"></p>',
    '<section data-od-id="text-analysis-current-default"><span data-default-saved></span><b data-default-provider></b><span data-default-detail></span></section>',
    '<button data-test-current-configuration>测试当前配置</button><section data-od-id="text-analysis-connection-status"></section>',
    '<button data-save-provider="textAnalysis" data-od-id="save-text-analysis-as-default">保存并设为默认</button><div id="toast"></div>'
  ].join('')
  return document
}

const multimodalForm = (): Document => {
  const document = window.document.implementation.createHTMLDocument('multimodal-review')
  document.body.innerHTML = [
    '<input id="supplier-multimodalReview-vendor"><input id="supplier-multimodalReview-region"><input id="supplier-multimodalReview-endpoint"><input id="supplier-multimodalReview-model">',
    '<input id="supplier-multimodalReview-timeout" value="60"><input id="supplier-multimodalReview-price"><input id="supplier-multimodalReview-secret" type="password">',
    '<section data-od-id="model-studio-current-default"><span data-model-studio-default-saved></span><b data-model-studio-default-provider></b><span data-model-studio-default-detail></span></section>',
    '<button data-test-model-studio-configuration>测试当前配置</button><section data-od-id="model-studio-connection-status"></section>',
    '<button data-save-provider="multimodalReview">保存并设为默认</button><div id="toast"></div>'
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

  it('does not display a historical Model Studio ASR model ID in the draft field', async () => {
    const document = form()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'asr', capability: 'asr', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'paraformer-v2', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true })
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'asr', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    await flush()

    const model = document.getElementById('supplier-asr-model') as HTMLInputElement
    expect(model.readOnly).toBe(true)
    expect(model.value).toBe('等待自动选择')
    expect(document.body.textContent).not.toContain('paraformer-v2')
    cleanup()
  })

  it('offers Model Studio ASR detection without creating an ASR task or saving the profile', async () => {
    const document = form()
    const testModelStudioMultimodalConfiguration = vi.fn().mockResolvedValue({ status: 'success', selectedModelLabel: '已自动选择兼容模型', selectionToken: secretRef, elapsedMs: 19 })
    const saveProviderProfile = vi.fn()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'asr', capability: 'asr', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '已自动选择兼容模型', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), testModelStudioMultimodalConfiguration, saveProviderProfile
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'asr', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    await flush()

    const button = document.querySelector<HTMLButtonElement>('[data-test-model-studio-asr-configuration]')
    expect(button?.hidden).toBe(false)
    button?.click()
    await flush()

    expect(testModelStudioMultimodalConfiguration).toHaveBeenCalledWith({ capability: 'asr', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', timeoutSeconds: 60, secretRef })
    expect(saveProviderProfile).not.toHaveBeenCalled()
    expect(document.querySelector('[data-od-id="model-studio-asr-connection-status"]')?.textContent).toContain('账号连接成功 · 19 ms')
    cleanup()
  })

  it('uses the complete current-capability label for all Model Studio no-compatible-model results', async () => {
    const testModelStudioMultimodalConfiguration = vi.fn().mockResolvedValue({ status: 'failure', category: 'no-compatible-model', elapsedMs: 1 })
    const asr = form()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'asr', capability: 'asr', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '等待自动选择', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), testModelStudioMultimodalConfiguration
    } })
    const asrCleanup = bindProviderSettingsPrototype({ document: asr, capability: 'asr', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    await flush(); asr.querySelector<HTMLElement>('[data-test-model-studio-asr-configuration]')?.click(); await flush()
    expect(asr.querySelector('[data-od-id="model-studio-asr-connection-status"]')?.textContent).toContain('账号未开通ASR 字幕识别模型')
    asrCleanup()

    const text = textAnalysisForm()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'text', capability: 'text-analysis', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '等待自动选择', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), testModelStudioMultimodalConfiguration
    } })
    const textCleanup = bindProviderSettingsPrototype({ document: text, capability: 'text-analysis', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    await flush(); text.querySelector<HTMLElement>('[data-test-current-configuration]')?.click(); await flush()
    expect(text.querySelector('[data-od-id="text-analysis-connection-status"]')?.textContent).toContain('账号未开通文本语义分析模型')
    textCleanup()

    const multimodal = multimodalForm()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'review', capability: 'multimodal-review', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '等待自动选择', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), testModelStudioMultimodalConfiguration
    } })
    const multimodalCleanup = bindProviderSettingsPrototype({ document: multimodal, capability: 'multimodal-review', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    await flush(); multimodal.querySelector<HTMLElement>('[data-test-model-studio-configuration]')?.click(); await flush()
    expect(multimodal.querySelector('[data-od-id="model-studio-connection-status"]')?.textContent).toContain('账号未开通视频理解复核模型')
    multimodalCleanup()
  })

  it('keeps ASR Tencent and Model Studio detection controls mutually exclusive across supplier changes', async () => {
    const document = form()
    document.body.insertAdjacentHTML('afterbegin', '<button data-test-tencent-asr-configuration hidden>测试当前配置</button><section data-od-id="tencent-asr-connection-status" hidden></section>')
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'asr', capability: 'asr', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '等待自动选择', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true })
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'asr', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    await flush()
    const modelStudio = document.querySelector<HTMLButtonElement>('[data-test-model-studio-asr-configuration]')
    const tencent = document.querySelector<HTMLButtonElement>('[data-test-tencent-asr-configuration]')
    expect(modelStudio?.hidden).toBe(false)
    expect(tencent?.hidden).toBe(true)

    const vendor = document.getElementById('supplier-asr-vendor') as HTMLInputElement
    vendor.value = '腾讯云 ASR'; vendor.dispatchEvent(new Event('input', { bubbles: true })); await flush()
    expect(modelStudio?.hidden).toBe(true)
    expect(tencent?.hidden).toBe(false)

    vendor.value = '阿里云百炼 / Model Studio'; vendor.dispatchEvent(new Event('input', { bubbles: true })); await flush()
    expect(modelStudio?.hidden).toBe(false)
    expect(tencent?.hidden).toBe(true)
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

  it('persists the secret reference and profile without exposing the secret', async () => {
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
    expect(onSaveSecret).toHaveBeenCalledWith({ version: 1, schema: 'api-key', values: { apiKey: 'never-render-this' } }, expect.any(String))
    expect(saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({ capability: 'asr', region: 'global', provider: 'Custom ASR', secretRef: expect.any(String) }))
    expect(document.getElementById('toast')?.textContent).toContain('ASR 字幕识别默认方案已保存')
    expect(document.getElementById('toast')?.textContent).not.toContain('never-render-this')
    cleanup()
  })

  it('automatically selects a compatible Model Studio model before replacing a saved profile', async () => {
    const document = multimodalForm()
    const onSaveSecret = vi.fn().mockResolvedValue({ exists: true })
    const saveProviderProfile = vi.fn().mockResolvedValue('multimodal-review')
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'review', capability: 'multimodal-review', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '请按开通模型填写', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), saveProviderProfile,
      testModelStudioMultimodalConfiguration: vi.fn().mockResolvedValue({ status: 'success', selectedModelLabel: '已自动选择兼容模型', selectionToken: secretRef, elapsedMs: 12 })
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'multimodal-review', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret })
    await flush()
    expect((document.getElementById('supplier-multimodalReview-model') as HTMLInputElement).readOnly).toBe(true)
    document.querySelector<HTMLElement>('[data-save-provider="multimodalReview"]')?.click()

    await flush(); await flush()
    expect(onSaveSecret).not.toHaveBeenCalled()
    expect(window.desktopApi.testModelStudioMultimodalConfiguration).toHaveBeenCalledWith(expect.objectContaining({ secretRef }))
    expect(saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({ model: '已自动选择兼容模型', secretRef, modelStudioSelectionToken: secretRef }))
    expect(document.getElementById('toast')?.textContent).toContain('视频理解复核方案已保存')
    cleanup()
  })

  it('names ASR accurately when Model Studio has no compatible model and leaves the saved profile untouched', async () => {
    const document = form()
    const saveProviderProfile = vi.fn()
    const deleteSecret = vi.fn()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'asr', capability: 'asr', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '等待自动选择', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), saveProviderProfile, deleteSecret,
      testModelStudioMultimodalConfiguration: vi.fn().mockResolvedValue({ status: 'failure', category: 'no-compatible-model', elapsedMs: 12 })
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'asr', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    await flush()

    document.querySelector<HTMLElement>('[data-save-provider="asr"]')?.click()
    await flush(); await flush()

    expect(saveProviderProfile).not.toHaveBeenCalled()
    expect(deleteSecret).not.toHaveBeenCalled()
    expect(document.getElementById('toast')?.textContent).toContain('ASR 字幕识别模型')
    expect(document.getElementById('toast')?.textContent).not.toContain('视频理解模型')
    cleanup()
  })

  it('discards an in-flight automatic model selection when the Model Studio draft changes', async () => {
    const document = multimodalForm()
    let resolveDiscovery: ((result: { status: 'success'; selectedModelLabel: string; selectionToken: string; elapsedMs: number }) => void) | undefined
    const saveProviderProfile = vi.fn()
    const deleteSecret = vi.fn().mockResolvedValue(undefined)
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'review', capability: 'multimodal-review', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '请按开通模型填写', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), saveProviderProfile, deleteSecret,
      testModelStudioMultimodalConfiguration: vi.fn().mockImplementation(() => new Promise<{ status: 'success'; selectedModelLabel: string; selectionToken: string; elapsedMs: number }>((resolve) => { resolveDiscovery = resolve }))
    } })
    const onSaveSecret = vi.fn().mockResolvedValue(undefined)
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'multimodal-review', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret })
    await flush()
    const secretInput = document.getElementById('supplier-multimodalReview-secret') as HTMLInputElement
    secretInput.value = 'new-draft-secret'; secretInput.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLElement>('[data-save-provider="multimodalReview"]')?.click()
    await flush()
    const endpoint = document.getElementById('supplier-multimodalReview-endpoint') as HTMLInputElement
    endpoint.value = 'https://dashscope.aliyuncs.com/changed'; endpoint.dispatchEvent(new Event('input', { bubbles: true }))
    resolveDiscovery?.({ status: 'success', selectedModelLabel: '已自动选择兼容模型', selectionToken: secretRef, elapsedMs: 1 })
    await flush(); await flush()

    expect(onSaveSecret).toHaveBeenCalledWith({ version: 1, schema: 'api-key', values: { apiKey: 'new-draft-secret' } }, expect.any(String))
    expect(saveProviderProfile).not.toHaveBeenCalled()
    expect(deleteSecret).toHaveBeenCalledWith(onSaveSecret.mock.calls[0]![1])
    expect(document.getElementById('toast')?.textContent).toContain('配置已变更')
    expect(document.getElementById('toast')?.textContent).not.toContain('new-draft-secret')
    cleanup()
  })

  it('reclaims a newly stored Model Studio key when automatic selection fails', async () => {
    const document = multimodalForm()
    const onSaveSecret = vi.fn().mockResolvedValue(undefined)
    const deleteSecret = vi.fn().mockResolvedValue(undefined)
    const saveProviderProfile = vi.fn()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'review', capability: 'multimodal-review', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '请按开通模型填写', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), saveProviderProfile, deleteSecret,
      testModelStudioMultimodalConfiguration: vi.fn().mockResolvedValue({ status: 'failure', category: 'authentication', elapsedMs: 1 })
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'multimodal-review', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret })
    await flush()
    const secretInput = document.getElementById('supplier-multimodalReview-secret') as HTMLInputElement
    secretInput.value = 'new-failed-secret'; secretInput.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLElement>('[data-save-provider="multimodalReview"]')?.click()
    await flush(); await flush()

    expect(saveProviderProfile).not.toHaveBeenCalled()
    expect(deleteSecret).toHaveBeenCalledWith(onSaveSecret.mock.calls[0]![1])
    expect(document.getElementById('toast')?.textContent).not.toContain('new-failed-secret')
    cleanup()
  })

  it('reclaims a newly stored Model Studio key when profile persistence rejects', async () => {
    const document = multimodalForm()
    const onSaveSecret = vi.fn().mockResolvedValue(undefined)
    const deleteSecret = vi.fn().mockResolvedValue(undefined)
    const saveProviderProfile = vi.fn().mockRejectedValue(new Error('save rejected'))
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'review', capability: 'multimodal-review', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '请按开通模型填写', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), saveProviderProfile, deleteSecret,
      testModelStudioMultimodalConfiguration: vi.fn().mockResolvedValue({ status: 'success', selectedModelLabel: '已自动选择兼容模型', selectionToken: secretRef, elapsedMs: 1 })
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'multimodal-review', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret })
    await flush()
    const secretInput = document.getElementById('supplier-multimodalReview-secret') as HTMLInputElement
    secretInput.value = 'new-rejected-secret'; secretInput.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLElement>('[data-save-provider="multimodalReview"]')?.click()
    await flush(); await flush()

    expect(deleteSecret).toHaveBeenCalledWith(onSaveSecret.mock.calls[0]![1])
    expect(document.getElementById('toast')?.textContent).not.toContain('new-rejected-secret')
    cleanup()
  })

  it('automatically selects and saves a Model Studio text model instead of accepting a hand-entered ID', async () => {
    const document = textAnalysisForm()
    const onSaveSecret = vi.fn().mockResolvedValue({ exists: true })
    const saveProviderProfile = vi.fn().mockResolvedValue('text-analysis')
    const testModelStudioMultimodalConfiguration = vi.fn().mockResolvedValue({ status: 'success', selectedModelLabel: '已自动选择兼容模型', selectionToken: secretRef, elapsedMs: 12 })
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'text', capability: 'text-analysis', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '请按开通模型填写', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), saveProviderProfile, testModelStudioMultimodalConfiguration
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'text-analysis', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret })
    await flush()
    const model = document.getElementById('supplier-textAnalysis-model') as HTMLInputElement
    expect(model.readOnly).toBe(true)
    expect(model.placeholder).toContain('自动选择')
    model.value = 'manual-model'
    document.querySelector<HTMLElement>('[data-test-current-configuration]')?.click()
    await flush()
    expect(testModelStudioMultimodalConfiguration).toHaveBeenCalledWith(expect.objectContaining({ capability: 'text-analysis' }))
    expect(document.querySelector('[data-od-id="text-analysis-connection-status"]')?.textContent).toContain('已找到兼容模型')

    document.querySelector<HTMLElement>('[data-save-provider="textAnalysis"]')?.click()
    await flush(); await flush()
    expect(testModelStudioMultimodalConfiguration).toHaveBeenLastCalledWith(expect.objectContaining({ secretRef }))
    expect(saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({ capability: 'text-analysis', model: '已自动选择兼容模型', secretRef, modelStudioSelectionToken: secretRef }))
    expect(document.getElementById('toast')?.textContent).toContain('文本语义分析默认方案已保存')
    cleanup()
  })

  it('stores a draft Model Studio key provisionally before testing and never sends it as transientSecret', async () => {
    const document = textAnalysisForm()
    const provisionalCredential = vi.fn().mockResolvedValue({ exists: true })
    const deleteSecret = vi.fn().mockResolvedValue(undefined)
    const testModelStudioMultimodalConfiguration = vi.fn().mockResolvedValue({ status: 'success', selectedModelLabel: '已自动选择兼容模型', selectionToken: secretRef, elapsedMs: 12 })
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: false }),
      saveModelStudioProvisionalCredential: provisionalCredential,
      deleteSecret,
      testModelStudioMultimodalConfiguration
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'text-analysis', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    await flush()
    ;(document.getElementById('supplier-textAnalysis-vendor') as HTMLInputElement).value = '阿里云百炼 / Model Studio'
    ;(document.getElementById('supplier-textAnalysis-endpoint') as HTMLInputElement).value = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    ;(document.getElementById('supplier-textAnalysis-secret') as HTMLInputElement).value = 'draft-key-must-not-cross-ipc-as-plaintext'
    document.querySelector<HTMLElement>('[data-test-current-configuration]')?.click()
    await flush(); await flush()

    expect(provisionalCredential).toHaveBeenCalledWith({ version: 1, schema: 'api-key', values: { apiKey: 'draft-key-must-not-cross-ipc-as-plaintext' } }, expect.any(String), 'text-analysis')
    expect(testModelStudioMultimodalConfiguration).toHaveBeenCalledWith(expect.objectContaining({ capability: 'text-analysis', secretRef: expect.any(String) }))
    expect(testModelStudioMultimodalConfiguration).not.toHaveBeenCalledWith(expect.objectContaining({ transientSecret: expect.anything() }))
    expect(deleteSecret).toHaveBeenCalledWith(expect.any(String))
    cleanup()
  })

  it('requires SecretId and SecretKey together for Tencent Cloud ASR and encrypts them as one credential record', async () => {
    const document = form()
    const onSaveSecret = vi.fn().mockResolvedValue({ exists: true })
    const saveProviderProfile = vi.fn().mockResolvedValue('asr')
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([]), saveProviderProfile,
      getSecretStatus: vi.fn().mockResolvedValue({ exists: false })
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'asr', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret })
    ;(document.getElementById('supplier-asr-vendor') as HTMLInputElement).value = '腾讯云 ASR'
    ;(document.getElementById('supplier-asr-region') as HTMLInputElement).value = 'cn'
    ;(document.getElementById('supplier-asr-endpoint') as HTMLInputElement).value = 'https://asr.tencentcloudapi.com'
    ;(document.getElementById('supplier-asr-model') as HTMLInputElement).value = '16k_zh'
    ;(document.getElementById('supplier-asr-secret-id') as HTMLInputElement).value = 'secret-id-value'
    document.querySelector<HTMLElement>('[data-save-provider]')?.click()
    expect(onSaveSecret).not.toHaveBeenCalled()
    expect(document.getElementById('toast')?.textContent).toContain('SecretKey不能为空')

    ;(document.getElementById('supplier-asr-secret-key') as HTMLInputElement).value = 'secret-key-value'
    document.querySelector<HTMLElement>('[data-save-provider]')?.click()
    await flush(); await flush()

    expect(onSaveSecret).toHaveBeenCalledTimes(1)
    expect(onSaveSecret.mock.calls[0][0]).toEqual({ version: 1, schema: 'tencent-cloud-secret-pair', values: { secretId: 'secret-id-value', secretKey: 'secret-key-value' } })
    expect(saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({ capability: 'asr', provider: '腾讯云 ASR', secretRef: expect.any(String) }))
    expect(document.getElementById('toast')?.textContent).not.toContain('secret-key-value')
    cleanup()
  })

  it('renders the ASR default using the prototype panel and leaves other capabilities untouched', async () => {
    const document = form()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([
        { id: 'asr', capability: 'asr', region: 'local', provider: 'whisper.cpp（本机）', endpoint: 'http://127.0.0.1:8080', model: 'base', secretRef: null, timeoutMs: 60_000, pricing: null },
        { id: 'text', capability: 'text-analysis', region: 'cn', provider: 'DeepSeek API', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', secretRef, timeoutMs: 60_000, pricing: null }
      ]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: false })
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'asr', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    await flush()

    expect(document.querySelector('[data-asr-default-provider]')?.textContent).toBe('whisper.cpp（本机）')
    expect(document.querySelector('[data-asr-default-saved]')?.textContent).toBe('已保存默认')
    expect(document.querySelector('[data-asr-default-detail]')?.textContent).toContain('受控本地实现')
    expect(document.querySelector('[data-save-provider="asr"]')?.textContent).toBe('保存并设为默认')
    cleanup()
  })

  it('uses the Tencent ASR prototype test nodes without saving the profile or exposing either credential', async () => {
    const document = form()
    document.body.insertAdjacentHTML('afterbegin', '<button data-test-tencent-asr-configuration>测试当前配置</button><section data-od-id="tencent-asr-connection-status"></section>')
    const testTencentAsrConfiguration = vi.fn().mockResolvedValue({ status: 'success', elapsedMs: 479 })
    const saveProviderProfile = vi.fn()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'asr', capability: 'asr', region: 'cn', provider: '腾讯云 ASR', endpoint: 'https://asr.tencentcloudapi.com', model: '16k_zh', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), getTencentAsrStoredCredentialStatus: vi.fn().mockResolvedValue('valid'), testTencentAsrConfiguration, saveProviderProfile
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'asr', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    await flush()

    const secretId = document.getElementById('supplier-asr-secret-id') as HTMLInputElement
    const secretKey = document.getElementById('supplier-asr-secret-key') as HTMLInputElement
    expect(secretId.placeholder).toBe('••••••••••••••••')
    expect(secretKey.placeholder).toBe('••••••••••••••••')
    secretId.value = 'draft-secret-id'; secretId.dispatchEvent(new Event('input', { bubbles: true }))
    secretKey.value = 'draft-secret-key'; secretKey.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector<HTMLElement>('[data-test-tencent-asr-configuration]')?.click()
    await flush()

    expect(testTencentAsrConfiguration).toHaveBeenCalledWith({ capability: 'asr', provider: '腾讯云 ASR', endpoint: 'https://asr.tencentcloudapi.com', timeoutSeconds: 60, transientCredential: { version: 1, schema: 'tencent-cloud-secret-pair', values: { secretId: 'draft-secret-id', secretKey: 'draft-secret-key' } } })
    expect(saveProviderProfile).not.toHaveBeenCalled()
    expect(document.querySelector('[data-od-id="tencent-asr-connection-status"]')?.textContent).toContain('签名验证成功 · 479 ms')
    expect(document.body.textContent).not.toContain('draft-secret-key')

    const endpoint = document.getElementById('supplier-asr-endpoint') as HTMLInputElement
    endpoint.value = 'https://asr.tencentcloudapi.com/v1'; endpoint.dispatchEvent(new Event('input', { bubbles: true }))
    expect(document.querySelector('[data-od-id="tencent-asr-connection-status"]')?.textContent).toContain('配置已保存，尚未验证')
    cleanup()
  })

  it('does not mask or reuse a legacy one-field Tencent credential', async () => {
    const document = form()
    const onSaveSecret = vi.fn()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'asr', capability: 'asr', region: 'cn', provider: '腾讯云 ASR', endpoint: 'https://asr.tencentcloudapi.com', model: '16k_zh', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), getTencentAsrStoredCredentialStatus: vi.fn().mockResolvedValue('invalid')
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'asr', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret })
    await flush()

    const secretId = document.getElementById('supplier-asr-secret-id') as HTMLInputElement
    const secretKey = document.getElementById('supplier-asr-secret-key') as HTMLInputElement
    expect(secretId.placeholder).toContain('请输入')
    expect(secretKey.placeholder).toContain('请输入')
    document.querySelector<HTMLElement>('[data-save-provider]')?.click()
    expect(onSaveSecret).not.toHaveBeenCalled()
    expect(document.getElementById('toast')?.textContent).toContain('首次保存需要填写')
    cleanup()
  })

  it('uses the prototype connectivity nodes for DeepSeek only and blocks the prototype demo handler', async () => {
    const document = textAnalysisForm()
    const testDeepSeekTextAnalysisConfiguration = vi.fn().mockResolvedValue({ status: 'success', elapsedMs: 438 })
    const saveProviderProfile = vi.fn()
    const onSaveSecret = vi.fn()
    const demoHandler = vi.fn()
    document.querySelector<HTMLElement>('[data-test-current-configuration]')?.addEventListener('click', demoHandler)
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'text', capability: 'text-analysis', region: 'cn', provider: 'DeepSeek API', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), testDeepSeekTextAnalysisConfiguration, saveProviderProfile
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'text-analysis', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret })
    await flush()

    expect(document.querySelector('[data-default-provider]')?.textContent).toBe('DeepSeek API')
    const secretInput = document.getElementById('supplier-textAnalysis-secret') as HTMLInputElement
    expect(secretInput.value).toBe('')
    expect(secretInput.placeholder).toBe('••••••••••••••••')
    document.querySelector<HTMLElement>('[data-test-current-configuration]')?.click()
    await flush()
    expect(demoHandler).not.toHaveBeenCalled()
    expect(testDeepSeekTextAnalysisConfiguration).toHaveBeenCalledWith({ capability: 'text-analysis', provider: 'DeepSeek API', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', timeoutSeconds: 60, transientCredential: undefined })
    expect(saveProviderProfile).not.toHaveBeenCalled()
    expect(document.querySelector('[data-od-id="text-analysis-connection-status"]')?.textContent).toContain('连接成功 · 438 ms')

    document.querySelector<HTMLElement>('[data-save-provider="textAnalysis"]')?.click()
    await flush()
    expect(onSaveSecret).not.toHaveBeenCalled()
    expect(saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({ capability: 'text-analysis', secretRef }))
    expect(document.getElementById('toast')?.textContent).toContain('本次已验证')
    expect(document.querySelector('[data-default-detail]')?.textContent).toContain('本次已验证连接')

    const endpoint = document.getElementById('supplier-textAnalysis-endpoint') as HTMLInputElement
    endpoint.value = 'https://api.deepseek.com/v1'; endpoint.dispatchEvent(new Event('input', { bubbles: true }))
    expect(document.querySelector('[data-od-id="text-analysis-connection-status"]')?.textContent).toContain('配置已保存，尚未验证')
    cleanup()
  })

  it('shows a dedicated balance failure without exposing the saved secret', async () => {
    const document = textAnalysisForm()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'text', capability: 'text-analysis', region: 'cn', provider: 'DeepSeek API', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }),
      testDeepSeekTextAnalysisConfiguration: vi.fn().mockResolvedValue({ status: 'failure', category: 'insufficient-balance', elapsedMs: 1 })
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'text-analysis', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    await flush()

    document.querySelector<HTMLElement>('[data-test-current-configuration]')?.click()
    await flush()

    expect(document.querySelector('[data-od-id="text-analysis-connection-status"]')?.textContent).toContain('账户余额不足')
    expect(document.body.textContent).not.toContain('saved-secret-value')
    cleanup()
  })

  it('hides the test control after the text-analysis draft changes to a non-DeepSeek provider', async () => {
    const document = textAnalysisForm()
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([]), getSecretStatus: vi.fn(), testDeepSeekTextAnalysisConfiguration: vi.fn()
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'text-analysis', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    const vendor = document.getElementById('supplier-textAnalysis-vendor') as HTMLInputElement
    vendor.value = 'OpenAI API'; vendor.dispatchEvent(new Event('input', { bubbles: true }))
    expect(document.querySelector<HTMLButtonElement>('[data-test-current-configuration]')?.hidden).toBe(true)
    expect(document.querySelector<HTMLElement>('[data-od-id="text-analysis-connection-status"]')?.hidden).toBe(true)
    cleanup()
  })

  it('discards a late test result after the draft changes in flight', async () => {
    const document = textAnalysisForm()
    let resolveTest: ((result: { status: 'success'; elapsedMs: number }) => void) | undefined
    const testDeepSeekTextAnalysisConfiguration = vi.fn().mockImplementation(() => new Promise<{ status: 'success'; elapsedMs: number }>((resolve) => { resolveTest = resolve }))
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([{ id: 'text', capability: 'text-analysis', region: 'cn', provider: 'DeepSeek API', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', secretRef, timeoutMs: 60_000, pricing: null }]),
      getSecretStatus: vi.fn().mockResolvedValue({ exists: true }), testDeepSeekTextAnalysisConfiguration
    } })
    const cleanup = bindProviderSettingsPrototype({ document, capability: 'text-analysis', onNavigate: vi.fn(), onSectionChange: vi.fn(), onSaveSecret: vi.fn() })
    await flush()

    document.querySelector<HTMLElement>('[data-test-current-configuration]')?.click()
    await flush()
    const endpoint = document.getElementById('supplier-textAnalysis-endpoint') as HTMLInputElement
    endpoint.value = 'https://api.deepseek.com/v1'; endpoint.dispatchEvent(new Event('input', { bubbles: true }))
    resolveTest?.({ status: 'success', elapsedMs: 1 })
    await flush()

    expect(document.querySelector('[data-od-id="text-analysis-connection-status"]')?.textContent).toContain('配置已保存，尚未验证')
    expect(document.querySelector('[data-od-id="text-analysis-connection-status"]')?.textContent).not.toContain('连接成功')
    cleanup()
  })
})
