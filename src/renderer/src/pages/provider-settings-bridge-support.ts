import type { AiCapabilityStatus, ProviderProfile, TencentAsrConfigurationTestFailureCategory, TencentAsrConfigurationTestResult, TencentAsrStoredCredentialStatus } from '../../../shared/contracts.js'
import type { ProviderAuthField, ProviderAuthSchema } from '../../../shared/provider-auth-schema.js'
import { catalogEntriesFor, isModelStudioAutomaticModel, isModelStudioDisplayModelLabel, isModelStudioProvider, isProviderModelGuidanceValue, type ProviderCapability, type ProviderCatalogEntry } from '../../../shared/provider-catalog.js'

export type SettingsSection = 'providers' | 'export' | 'performance' | 'data' | 'about'
export type DraftField = 'vendor' | 'region' | 'endpoint' | 'model' | 'timeout' | 'price' | 'secret'

export const prototypeKey: Record<ProviderCapability, string> = { asr: 'asr', 'text-analysis': 'textAnalysis', 'multimodal-review': 'multimodalReview' }
export const fields: DraftField[] = ['vendor', 'region', 'endpoint', 'model', 'timeout', 'price', 'secret']
export const TENCENT_CLOUD_ASR = '腾讯云 ASR'

export const capabilityForPrototypeKey = (value: string | undefined): ProviderCapability | null => value === 'asr' ? 'asr' : value === 'textAnalysis' ? 'text-analysis' : value === 'multimodalReview' ? 'multimodal-review' : null

export const input = (document: Document, capability: ProviderCapability, field: DraftField): HTMLInputElement | null => document.getElementById(`supplier-${prototypeKey[capability]}-${field}`) as HTMLInputElement | null

export const tencentAsrInput = (document: Document, field: 'secret-id' | 'secret-key'): HTMLInputElement | null => document.getElementById(`supplier-asr-${field}`) as HTMLInputElement | null

// The V49 surface will expose data-provider-credential-field directly. The
// fallbacks keep the currently shipped static source readable until that page
// migration is performed, without leaking field rules into save logic.
export const credentialInput = (document: Document, capability: ProviderCapability, field: ProviderAuthField): HTMLInputElement | null => {
  const explicit = document.querySelector<HTMLInputElement>(`[data-provider-credential-field="${field.key}"]`)
  if (explicit) return explicit
  if (field.key === 'apiKey') return input(document, capability, 'secret')
  if (capability === 'asr' && field.key === 'secretId') return tencentAsrInput(document, 'secret-id')
  if (capability === 'asr' && field.key === 'secretKey') return tencentAsrInput(document, 'secret-key')
  return null
}

export const renderProviderCredentialFields = (document: Document, capability: ProviderCapability, schema: ProviderAuthSchema, saved: boolean): void => {
  const legacyApiKey = input(document, capability, 'secret')
  const legacyTencentFields = document.querySelector<HTMLElement>('[data-tencent-asr-credentials]')
  const existingDynamic = document.querySelector<HTMLElement>('[data-provider-credential-fields]')
  const useLegacyApiKey = schema.fields.length === 1 && schema.fields[0]?.key === 'apiKey' && legacyApiKey
  const useLegacyTencentFields = capability === 'asr' && schema.id === 'tencent-cloud-secret-pair' && legacyTencentFields && tencentAsrInput(document, 'secret-id') && tencentAsrInput(document, 'secret-key')
  if (legacyApiKey) {
    legacyApiKey.hidden = !useLegacyApiKey
    if (useLegacyApiKey) {
      legacyApiKey.dataset.providerCredentialField = 'apiKey'
      legacyApiKey.placeholder = saved ? '••••••••••••••••' : schema.fields[0]?.placeholder ?? '请输入密钥'
    } else delete legacyApiKey.dataset.providerCredentialField
  }
  if (legacyTencentFields) { legacyTencentFields.hidden = !useLegacyTencentFields; legacyTencentFields.style.display = useLegacyTencentFields ? 'contents' : 'none' }
  if (useLegacyApiKey) { existingDynamic?.remove(); return }
  if (useLegacyTencentFields) { existingDynamic?.remove(); for (const field of schema.fields) { const control = credentialInput(document, capability, field); if (control) { control.dataset.providerCredentialField = field.key; control.placeholder = saved ? '••••••••••••••••' : field.placeholder } }; return }
  const container = existingDynamic ?? document.createElement('section')
  if (!existingDynamic) {
    container.dataset.providerCredentialFields = ''
    container.className = 'provider-credential-fields form-grid'
    const anchor = document.querySelector<HTMLElement>(`[data-save-provider="${prototypeKey[capability]}"]`) ?? legacyApiKey
    anchor?.before(container)
  }
  container.replaceChildren(...schema.fields.map((field) => {
    const wrapper = document.createElement('label')
    wrapper.className = 'field'
    wrapper.textContent = field.label
    const control = document.createElement('input')
    control.className = 'input'
    control.type = 'password'
    control.autocomplete = 'off'
    control.id = `supplier-${prototypeKey[capability]}-credential-${field.key}`
    control.dataset.providerCredentialField = field.key
    control.placeholder = saved ? '••••••••••••••••' : field.placeholder
    wrapper.append(control)
    return wrapper
  }))
}

export const toast = (document: Document, message: string): void => {
  const node = document.getElementById('toast')
  if (!node) return
  node.textContent = message
  node.classList.add('show')
  const prior = Number(node.dataset.bridgeToastTimer ?? '0')
  if (prior) window.clearTimeout(prior)
  node.dataset.bridgeToastTimer = String(window.setTimeout(() => {
    node.classList.remove('show')
    delete node.dataset.bridgeToastTimer
  }, 2200))
}

export const statusCopy = (profile: ProviderProfile | undefined, secretExists: boolean | undefined, availabilityReason?: AiCapabilityStatus['reason']): { text: string; className: string } => {
  if (!profile) return { text: '未配置', className: 'warning' }
  if (availabilityReason === 'unreadable-secret') return { text: '需要重新保存密钥', className: 'warning' }
  if (isModelStudioProvider(profile.provider) && !isModelStudioAutomaticModel(profile.model)) return { text: '等待自动选择', className: 'warning' }
  if (isProviderModelGuidanceValue(profile.model) && !(isModelStudioProvider(profile.provider) && isModelStudioDisplayModelLabel(profile.model))) return { text: '需填写模型', className: 'warning' }
  const local = profile.region === 'local'
  const configured = local ? Boolean(profile.endpoint) : secretExists === true
  return { text: configured ? '已配置' : local ? '需确认本机服务' : '缺少密钥', className: configured ? 'success' : 'warning' }
}

export const applySupplierFilter = (document: Document, button: HTMLElement): void => {
  const supplier = button.dataset.supplier
  const cost = button.dataset.supplierFilter
  if (!supplier || !cost) return
  document.querySelectorAll<HTMLElement>(`[data-supplier-filter][data-supplier="${supplier}"]`).forEach((item) => {
    const active = item === button
    item.classList.toggle('active', active)
    item.setAttribute('aria-pressed', String(active))
  })
  let visible = 0
  document.querySelectorAll<HTMLElement>(`[data-supplier-candidate][data-supplier="${supplier}"]`).forEach((card) => {
    const match = cost === 'all' || card.dataset.cost === cost
    card.hidden = !match
    if (match) visible += 1
  })
  const empty = document.querySelector<HTMLElement>(`[data-supplier-empty="${supplier}"]`)
  if (empty) empty.hidden = visible !== 0
}

export const catalogEntryFor = (target: HTMLElement, current: ProviderCapability): ProviderCatalogEntry | undefined => {
  const name = target.closest<HTMLElement>('[data-supplier-candidate]')?.querySelector('h3')?.textContent?.trim()
  return catalogEntriesFor(current).find((entry) => entry.name === name)
}

export const markCatalogSelection = (document: Document, button: HTMLElement): void => {
  const supplier = button.dataset.supplier
  if (!supplier) return
  document.querySelectorAll<HTMLElement>(`[data-use-provider][data-supplier="${supplier}"]`).forEach((item) => {
    const selected = item === button
    item.setAttribute('aria-pressed', String(selected))
    item.textContent = selected ? '已预填' : '预填此方案'
    item.closest('.supplier-candidate')?.classList.toggle('is-selected', selected)
  })
}

export const alignProviderConnectivityFixtureOrder = (document: Document, capability: ProviderCapability | null): void => {
  if (capability !== 'text-analysis') return
  const formGrid = document.querySelector<HTMLElement>('#screen-textAnalysis .supplier-draft .form-grid')
  const testButton = document.querySelector<HTMLElement>('[data-test-current-configuration]')
  const testPanel = document.querySelector<HTMLElement>('[data-od-id="text-analysis-connection-status"]')
  if (formGrid && testButton && testPanel) formGrid.before(testButton, testPanel)
}

export const alignModelStudioFixtureOrder = (document: Document, capability: ProviderCapability | null): void => {
  if (capability !== 'multimodal-review') return
  const formGrid = document.querySelector<HTMLElement>('#screen-multimodalReview .supplier-draft .form-grid')
  const testButton = document.querySelector<HTMLElement>('[data-test-model-studio-configuration]')
  const testPanel = document.querySelector<HTMLElement>('[data-od-id="model-studio-connection-status"]')
  if (formGrid && testButton && testPanel) formGrid.before(testButton, testPanel)
}

export const ensureAsrModelStudioConnectivityNodes = (document: Document): void => {
  const anchor = document.querySelector<HTMLElement>('[data-test-tencent-asr-configuration], [data-save-provider="asr"]')
  if (!anchor) return
  let button = document.querySelector<HTMLButtonElement>('[data-test-model-studio-asr-configuration]')
  let panel = document.querySelector<HTMLElement>('[data-od-id="model-studio-asr-connection-status"]')
  if (!button) {
    button = document.createElement('button')
    button.className = 'btn btn-secondary'
    button.type = 'button'
    button.hidden = true
    button.dataset.testModelStudioAsrConfiguration = ''
    button.dataset.odId = 'model-studio-asr-test-current-configuration'
    button.textContent = '检测并自动选择'
    anchor.before(button)
  }
  if (!panel) {
    panel = document.createElement('section')
    // Reuse the approved ASR prototype's connectivity panel geometry.
    panel.className = 'tencent-asr-test model-studio-asr-test'
    panel.hidden = true
    panel.dataset.odId = 'model-studio-asr-connection-status'
    button.after(panel)
  }
}

export const applyCatalogDraft = (document: Document, current: ProviderCapability, entry: ProviderCatalogEntry, edited: Set<DraftField>, onTextAnalysisChanged: () => void): void => {
  const values: Partial<Record<DraftField, string>> = { vendor: entry.name, region: entry.region, endpoint: entry.endpoint ?? '', model: entry.model ?? '', timeout: String(Math.round(entry.timeoutMs / 1000)), price: `${entry.costLabel}；${entry.costNotice}` }
  for (const field of fields) if (field !== 'secret' && !edited.has(field)) { const node = input(document, current, field); if (node) node.value = values[field] ?? '' }
  const message = document.getElementById(`supplier-draft-status-${prototypeKey[current]}`)
  if (message) message.innerHTML = `<strong>已预填 ${entry.name}</strong><br>尚未保存，不会覆盖已有密钥。`
  if (current === 'asr') document.dispatchEvent(new CustomEvent('provider-asr:vendor-changed'))
  if (current === 'text-analysis') onTextAnalysisChanged()
  toast(document, `已预填 ${entry.name}；请确认后保存。`)
}

export const renderAsrDefaultConfiguration = (document: Document, profile: ProviderProfile | undefined): void => {
  const panel = document.querySelector<HTMLElement>('[data-od-id="asr-current-default"]')
  if (!panel) return
  const provider = panel.querySelector<HTMLElement>('[data-asr-default-provider]')
  const saved = panel.querySelector<HTMLElement>('[data-asr-default-saved]')
  const detail = panel.querySelector<HTMLElement>('[data-asr-default-detail]')
  if (provider) provider.textContent = profile?.provider ?? '未设置默认方案'
  if (saved) { saved.textContent = profile ? '已保存默认' : '尚未设置'; saved.className = `badge ${profile ? 'info' : 'warning'}` }
  if (detail) detail.textContent = profile ? '当前能力的默认方案 · 当前 P1 仍只运行受控本地实现' : '保存后将成为 ASR 字幕识别的默认方案'
}

type TencentAsrConnectivityState = { kind: 'unverified' } | { kind: 'testing' } | { kind: 'result'; result: TencentAsrConfigurationTestResult }
const setVisible = (element: HTMLElement, visible: boolean): void => { element.hidden = !visible; element.style.display = visible ? '' : 'none' }
const tencentAsrFailureCopy: Record<TencentAsrConfigurationTestFailureCategory, string> = { network: '网络或 TLS 连接失败', timeout: '连接超时', authentication: '签名或鉴权未通过', address: '地址不符合腾讯云 ASR 要求', 'rate-limit': '配额或限流', server: '服务端暂时不可用', 'missing-key': '缺少可用的 SecretId 或 SecretKey', 'invalid-configuration': '当前配置不符合测试要求', unexpected: '服务返回了无法验证的结果' }

export const renderTencentAsrConnectivitySurface = ({ document, active, profile, credentialStatus, state }: { document: Document; active: boolean; profile: ProviderProfile | undefined; credentialStatus: TencentAsrStoredCredentialStatus; state: TencentAsrConnectivityState }): void => {
  const button = document.querySelector<HTMLButtonElement>('[data-test-tencent-asr-configuration]')
  const panel = document.querySelector<HTMLElement>('[data-od-id="tencent-asr-connection-status"]')
  if (!button || !panel) return
  setVisible(button, active); setVisible(panel, active)
  if (!active) return
  panel.className = `tencent-asr-test${state.kind === 'testing' ? ' is-testing' : state.kind === 'result' && state.result.status === 'success' ? ' is-success' : state.kind === 'result' ? ' is-failure' : ''}`
  if (state.kind === 'testing') { button.disabled = true; button.textContent = '正在测试当前配置'; panel.innerHTML = '<span class="badge info">测试中</span><strong>正在验证腾讯云 ASR 签名</strong><p>仅发送固定的签名校验；不上传音频、视频、字幕、剧本或提示词，也不创建任务。</p>'; return }
  button.disabled = false; button.textContent = '测试当前配置'
  if (state.kind === 'result') { const result = state.result; panel.innerHTML = result.status === 'success' ? `<span class="badge success">测试连接成功</span><strong>签名验证成功 · ${result.elapsedMs} ms</strong><p>仅验证地址、SecretId、SecretKey 和签名；未保存草稿，也未创建任务或调用字幕识别。</p>` : `<span class="badge danger">连接失败</span><strong>${tencentAsrFailureCopy[result.category]}</strong><p>未显示 SecretId、SecretKey、签名、请求内容或原始响应；当前默认方案未被修改。</p>`; return }
  if (profile?.provider === TENCENT_CLOUD_ASR && credentialStatus === 'invalid') { panel.innerHTML = '<span class="badge warning">凭据需要重新填写</span><strong>已保存的旧凭据不能作为 SecretId + SecretKey 使用</strong><p>请重新填写两项后保存；不会显示、删除或导出旧密钥。</p>'; return }
  panel.innerHTML = `<span class="badge warning">${profile?.provider === TENCENT_CLOUD_ASR ? '尚未验证' : '未保存草稿'}</span><strong>${profile?.provider === TENCENT_CLOUD_ASR ? '配置已保存，尚未验证' : '测试 SecretId、SecretKey 和签名'}</strong><p>仅向腾讯云 ASR 发起固定签名校验；不上传音频、视频、字幕、剧本或提示词，也不创建任务。</p>`
}
