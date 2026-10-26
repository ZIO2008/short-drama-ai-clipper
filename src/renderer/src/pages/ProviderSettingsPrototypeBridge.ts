import type { AiCapabilityStatus, DeepSeekConfigurationTestFailureCategory, DeepSeekConfigurationTestResult, ModelStudioConfigurationTestResult, ProviderProfile, TencentAsrConfigurationTestFailureCategory, TencentAsrConfigurationTestResult, TencentAsrStoredCredentialStatus } from '../../../shared/contracts.js'
import { createProviderCredentialPackage, type ProviderCredentialPackage } from '../../../shared/provider-auth-schema.js'
import { MODEL_STUDIO_AUTOMATIC_MODEL_LABEL, MODEL_STUDIO_PROVIDER, MODEL_STUDIO_WAITING_MODEL_LABEL, PROVIDER_CAPABILITY_LABELS, isModelStudioAutomaticModel, isModelStudioProvider, isProviderModelGuidanceValue, providerAuthSchemaIdForProvider, type ProviderCapability } from '../../../shared/provider-catalog.js'
import { providerAuthSchemaForId } from '../../../shared/provider-auth-schema.js'
import { saveProviderProfile } from './provider-settings-bridge-save.js'
import { runModelStudioConfigurationCheck } from './model-studio-configuration-check.js'
import { renderModelStudioConnectivitySurface } from './model-studio-connectivity-surface.js'
import { TENCENT_CLOUD_ASR, alignModelStudioFixtureOrder, alignProviderConnectivityFixtureOrder, applyCatalogDraft, applySupplierFilter, capabilityForPrototypeKey, catalogEntryFor, credentialInput, ensureAsrModelStudioConnectivityNodes, fields, input, markCatalogSelection, prototypeKey, renderAsrDefaultConfiguration, renderProviderCredentialFields, renderTencentAsrConnectivitySurface, statusCopy, toast, type DraftField, type SettingsSection } from './provider-settings-bridge-support.js'
type Props = { document: Document; capability: ProviderCapability | null; onNavigate: (capability: ProviderCapability | null) => void; onSectionChange: (section: SettingsSection) => void; onSaveSecret: (credential: ProviderCredentialPackage, secretRef: string) => Promise<void> }
type ConnectivityState = { kind: 'unverified' } | { kind: 'testing' } | { kind: 'result'; result: DeepSeekConfigurationTestResult }
type ModelStudioConnectivityState = { kind: 'unverified' } | { kind: 'testing' } | { kind: 'result'; result: ModelStudioConfigurationTestResult }
type TencentAsrConnectivityState = { kind: 'unverified' } | { kind: 'testing' } | { kind: 'result'; result: TencentAsrConfigurationTestResult }
const connectivityFailureCopy: Record<DeepSeekConfigurationTestFailureCategory, string> = { network: '网络或 TLS 连接失败', timeout: '连接超时', authentication: '鉴权未通过', address: '地址不存在或不兼容', model: '模型不可用', 'rate-limit': '配额或限流', 'insufficient-balance': '账户余额不足', server: '服务端暂时不可用', 'missing-key': '缺少可用密钥', 'invalid-configuration': '当前配置不符合测试要求', unexpected: '服务返回了无法验证的结果' }
export const bindProviderSettingsPrototype = ({ document, capability, onNavigate, onSectionChange, onSaveSecret }: Props): (() => void) => {
  let profiles = new Map<ProviderCapability, ProviderProfile>()
  let secretExists = new Map<ProviderCapability, boolean>()
  let capabilityStatuses = new Map<ProviderCapability, AiCapabilityStatus>()
  let tencentAsrStoredCredentialStatus: TencentAsrStoredCredentialStatus = 'missing'
  let edited = new Set<DraftField>()
  let saving = false
  let profileReadGeneration = 0
  let connectivityGeneration = 0
  let modelStudioConnectivityGeneration = 0
  let draftGeneration = 0
  let connectivityState: ConnectivityState = { kind: 'unverified' }
  let modelStudioConnectivityState: ModelStudioConnectivityState = { kind: 'unverified' }
  let tencentAsrConnectivityState: TencentAsrConnectivityState = { kind: 'unverified' }
  const updateOverview = (): void => {
    for (const current of ['asr', 'text-analysis', 'multimodal-review'] as ProviderCapability[]) {
      const badge = document.getElementById(`provider-status-${prototypeKey[current]}`)
      if (!badge) continue
      const profile = profiles.get(current)
      const hasUsableSecret = current === 'asr' && profile?.provider === TENCENT_CLOUD_ASR
        ? tencentAsrStoredCredentialStatus === 'valid'
        : secretExists.get(current)
      const state = statusCopy(profile, hasUsableSecret, capabilityStatuses.get(current)?.reason)
      badge.textContent = state.text
      badge.className = `badge ${state.className}`
    }
  }
  const fillDraft = (current: ProviderCapability): void => {
    const profile = profiles.get(current)
    if (!profile && current !== 'text-analysis') return
    const values: Partial<Record<DraftField, string>> = { vendor: profile?.provider ?? '', region: profile?.region ?? '', endpoint: profile?.endpoint ?? '', model: profile?.model ?? '', timeout: profile ? String(Math.round((profile.timeoutMs ?? 60_000) / 1000)) : '60', price: profile?.pricing ?? '' }
    for (const field of fields) if (field !== 'secret' && !edited.has(field)) { const node = input(document, current, field); if (node) node.value = values[field] ?? '' }
    const credentialSchema = providerAuthSchemaForId(providerAuthSchemaIdForProvider(profile?.provider ?? input(document, current, 'vendor')?.value.trim() ?? ''))
    const savedCredential = profile?.secretRef && secretExists.get(current) && capabilityStatuses.get(current)?.reason !== 'unreadable-secret'
      && (credentialSchema.id !== 'tencent-cloud-secret-pair' || tencentAsrStoredCredentialStatus === 'valid')
    renderProviderCredentialFields(document, current, credentialSchema, Boolean(savedCredential))
    for (const field of credentialSchema.fields) {
      const control = credentialInput(document, current, field)
      if (control && !edited.has('secret')) control.value = ''
    }
    const hasUsableSecret = current === 'asr' && profile?.provider === TENCENT_CLOUD_ASR
      ? tencentAsrStoredCredentialStatus === 'valid'
      : secretExists.get(current)
    const state = statusCopy(profile, hasUsableSecret, capabilityStatuses.get(current)?.reason)
    const message = document.getElementById(`supplier-draft-status-${prototypeKey[current]}`)
    if (message) message.innerHTML = current === 'asr' && profile?.provider === TENCENT_CLOUD_ASR && tencentAsrStoredCredentialStatus === 'invalid'
      ? '<strong>已保存的腾讯云凭据格式无效</strong><br>请重新填写 SecretId 和 SecretKey；旧记录会保留，不会被删除。'
      : `<strong>${state.text}</strong><br>保存后可从字幕设置发起识别；是否可执行以配置测试和账户授权为准。`
    if (current === 'text-analysis') renderConnectivity()
    if (current === 'multimodal-review') renderModelStudioConnectivity()
    syncModelStudioModelInput()
    if (current === 'asr') { ensureAsrModelStudioConnectivityNodes(document); renderTencentAsrConnectivity(); renderAsrDefaultConfiguration(document, profiles.get('asr')); renderModelStudioConnectivity() }
  }
  const isModelStudioDraft = (current = capability): boolean => Boolean(current && isModelStudioProvider(input(document, current, 'vendor')?.value))
  const syncModelStudioModelInput = (): void => {
    if (!capability) return
    const modelInput = input(document, capability, 'model')
    if (!modelInput) return
    const automatic = isModelStudioDraft()
    if (automatic && modelInput.value !== MODEL_STUDIO_AUTOMATIC_MODEL_LABEL) modelInput.value = MODEL_STUDIO_WAITING_MODEL_LABEL
    modelInput.readOnly = automatic
    modelInput.placeholder = automatic ? '保存后自动选择已开通的兼容模型' : '请输入模型'
    modelInput.setAttribute('aria-label', automatic ? '模型由应用自动选择' : '模型')
  }
  const isDeepSeekDraft = (): boolean => input(document, 'text-analysis', 'vendor')?.value.trim() === 'DeepSeek API'
  const draftMatchesTextDefault = (profile: ProviderProfile | undefined): boolean => Boolean(profile
    && profile.provider === input(document, 'text-analysis', 'vendor')?.value.trim()
    && (profile.endpoint ?? '') === input(document, 'text-analysis', 'endpoint')?.value.trim()
    && (profile.model ?? '') === input(document, 'text-analysis', 'model')?.value.trim()
    && Math.round((profile.timeoutMs ?? 60_000) / 1000) === Number(input(document, 'text-analysis', 'timeout')?.value ?? '0'))
  const renderConnectivity = (): void => {
    if (capability !== 'text-analysis') return
    const defaultPanel = document.querySelector<HTMLElement>('[data-od-id="text-analysis-current-default"]')
    const testButton = document.querySelector<HTMLButtonElement>('[data-test-current-configuration]')
    const testPanel = document.querySelector<HTMLElement>('[data-od-id="text-analysis-connection-status"]')
    if (!defaultPanel || !testButton || !testPanel) return
    const profile = profiles.get('text-analysis')
    const provider = defaultPanel.querySelector<HTMLElement>('[data-default-provider]')
    const saved = defaultPanel.querySelector<HTMLElement>('[data-default-saved]')
    const detail = defaultPanel.querySelector<HTMLElement>('[data-default-detail]')
    if (provider) provider.textContent = profile?.provider ?? '未设置默认方案'
    if (saved) { saved.textContent = profile ? '已保存默认' : '尚未设置'; saved.className = `badge ${profile ? 'info' : 'warning'}` }
    const defaultMatchesDraft = draftMatchesTextDefault(profile)
    if (detail) detail.textContent = !profile ? '保存后将成为文本语义分析的默认方案'
      : defaultMatchesDraft && connectivityState.kind === 'result' && connectivityState.result.status === 'success' ? '当前能力的默认方案 · 本次已验证连接'
        : defaultMatchesDraft && connectivityState.kind === 'result' ? '当前能力的默认方案 · 本次验证失败'
          : '当前能力的默认方案 · 尚未验证'
    const deepSeek = isDeepSeekDraft()
    const modelStudio = isModelStudioDraft('text-analysis')
    const needsAutomaticModel = Boolean(profile && isModelStudioProvider(profile.provider) && (!profile.model || isProviderModelGuidanceValue(profile.model) || !isModelStudioAutomaticModel(profile.model)))
    if (saved && needsAutomaticModel) { saved.textContent = '等待自动选择'; saved.className = 'badge warning' }
    if (detail && needsAutomaticModel) detail.textContent = '填写 API 密钥后，应用会自动选择已开通的兼容文本语义分析模型。'
    testButton.hidden = !deepSeek && !modelStudio
    testPanel.hidden = !deepSeek && !modelStudio
    if (modelStudio) { renderModelStudioConnectivity(); return }
    if (!deepSeek) return
    testPanel.className = `text-analysis-test${connectivityState.kind === 'testing' ? ' is-testing' : connectivityState.kind === 'result' && connectivityState.result.status === 'success' ? ' is-success' : connectivityState.kind === 'result' ? ' is-failure' : ''}`
    if (connectivityState.kind === 'testing') {
      testButton.disabled = true; testButton.textContent = '正在测试当前配置'
      testPanel.innerHTML = '<span class="badge info">测试中</span><strong>正在连接 DeepSeek API</strong><p>将发起一次最小请求，可能产生少量费用；不上传剧集、视频、字幕、剧本或提示词。</p>'
      return
    }
    testButton.disabled = false; testButton.textContent = '测试当前配置'
    if (connectivityState.kind === 'result' && connectivityState.result.status === 'success') {
      testPanel.innerHTML = `<span class="badge success">测试连接成功</span><strong>连接成功 · ${connectivityState.result.elapsedMs} ms</strong><p>仅验证当前草稿的地址、模型与密钥引用；未保存草稿，也未发起业务分析。</p>`
      return
    }
    if (connectivityState.kind === 'result') {
      const failed = connectivityState.result
      if (failed.status === 'failure') testPanel.innerHTML = `<span class="badge danger">连接失败</span><strong>${connectivityFailureCopy[failed.category]}</strong><p>未显示密钥、请求内容或原始响应；当前默认方案未被修改。</p>`
      return
    }
    testPanel.innerHTML = `<span class="badge warning">${profile ? '尚未验证' : '未保存草稿'}</span><strong>${profile ? '配置已保存，尚未验证' : '测试仅验证当前草稿'}</strong><p>测试不会保存草稿、替换默认方案或上传业务素材。</p>`
  }
  const invalidateConnectivity = (): void => {
    connectivityGeneration += 1
    connectivityState = { kind: 'unverified' }
    renderConnectivity()
  }
  const refreshProfiles = async (): Promise<void> => {
    const generation = ++profileReadGeneration
    const loaded = await window.desktopApi.listProviderProfiles()
    const loadedStatuses = await window.desktopApi.listAiCapabilityStatus?.().catch(() => []) ?? []
    const nextProfiles = new Map(loaded.filter((item) => item.capability === 'asr' || item.capability === 'text-analysis' || item.capability === 'multimodal-review').map((item) => [item.capability as ProviderCapability, item]))
    const nextSecrets = new Map<ProviderCapability, boolean>()
    await Promise.all([...nextProfiles.entries()].map(async ([current, profile]) => { if (profile.secretRef) nextSecrets.set(current, (await window.desktopApi.getSecretStatus(profile.secretRef)).exists) }))
    let nextTencentStatus: TencentAsrStoredCredentialStatus = 'missing'
    const asrProfile = nextProfiles.get('asr')
    if (asrProfile?.provider === TENCENT_CLOUD_ASR && asrProfile.secretRef) {
      nextTencentStatus = await window.desktopApi.getTencentAsrStoredCredentialStatus?.().catch(() => 'invalid') ?? 'invalid'
    }
    if (generation !== profileReadGeneration) return
      profiles = nextProfiles
      secretExists = nextSecrets
      capabilityStatuses = new Map(loadedStatuses.filter((item) => item.capability === 'asr' || item.capability === 'text-analysis' || item.capability === 'multimodal-review').map((item) => [item.capability as ProviderCapability, item]))
      tencentAsrStoredCredentialStatus = nextTencentStatus
    updateOverview(); if (capability) fillDraft(capability)
  }
  const save = async (current: ProviderCapability): Promise<void> => {
    const savedDraftGeneration = draftGeneration
    await saveProviderProfile({
        document, current, profiles, tencentAsrStoredCredentialStatus, isSaving: () => saving, setSaving: (value) => { saving = value }, isDraftCurrent: () => savedDraftGeneration === draftGeneration, onSaveSecret, refreshProfiles,
        afterSuccess: () => {
          edited = new Set()
          updateOverview(); fillDraft(current)
          if (current === 'text-analysis') renderConnectivity()
          if (current === 'asr') renderAsrDefaultConfiguration(document, profiles.get('asr'))
        },
        successMessage: () => {
          if (current === 'text-analysis') {
            const verification = connectivityState.kind === 'result' && connectivityState.result.status === 'success' ? '本次已验证。'
              : connectivityState.kind === 'result' ? '验证失败。' : '尚未验证。'
            return `文本语义分析默认方案已保存；${verification}`
          }
          if (current === 'asr') return 'ASR 字幕识别默认方案已保存。'
          return `${PROVIDER_CAPABILITY_LABELS[current]}方案已保存；云端调用仍未启用。`
        }
      })
  }
  const onInput = (event: Event): void => {
    if (!capability) return
    const target = event.target as HTMLInputElement
    const prefix = `supplier-${prototypeKey[capability]}-`
    if (!target.id.startsWith(prefix)) return
    if (target.dataset.providerCredentialField) {
      edited.add('secret'); draftGeneration += 1
      if (capability === 'text-analysis') invalidateConnectivity()
      if (capability === 'asr') invalidateTencentAsrConnectivity()
      modelStudioConnectivityGeneration += 1; modelStudioConnectivityState = { kind: 'unverified' }; renderModelStudioConnectivity()
      return
    }
    const field = target.id.slice(prefix.length) as DraftField
    if (fields.includes(field)) {
      edited.add(field)
      draftGeneration += 1
      if (capability === 'text-analysis' && ['vendor', 'endpoint', 'model', 'timeout', 'secret'].includes(field)) invalidateConnectivity()
      if ((capability === 'asr' || capability === 'text-analysis' || capability === 'multimodal-review') && ['vendor', 'endpoint', 'timeout', 'secret'].includes(field)) {
        modelStudioConnectivityGeneration += 1
        modelStudioConnectivityState = { kind: 'unverified' }
        renderModelStudioConnectivity()
      }
      if (field === 'vendor') renderProviderCredentialFields(document, capability, providerAuthSchemaForId(providerAuthSchemaIdForProvider(target.value.trim())), false)
      syncModelStudioModelInput()
      if (capability === 'asr' && ['vendor', 'endpoint', 'timeout'].includes(field)) invalidateTencentAsrConnectivity()
    }
  }
  const testCurrentConfiguration = async (): Promise<void> => {
    if (capability !== 'text-analysis') return
    if (isModelStudioDraft()) { await testModelStudioConfiguration(); return }
    if (!isDeepSeekDraft() || connectivityState.kind === 'testing') return
    const generation = ++connectivityGeneration
    connectivityState = { kind: 'testing' }; renderConnectivity()
    const transientApiKey = credentialInput(document, capability, providerAuthSchemaForId('api-key').fields[0]!)?.value.trim() ?? ''
    const result = await window.desktopApi.testDeepSeekTextAnalysisConfiguration({
      capability: 'text-analysis', provider: 'DeepSeek API', endpoint: input(document, capability, 'endpoint')?.value.trim() ?? '', model: input(document, capability, 'model')?.value.trim() ?? '', timeoutSeconds: Number(input(document, capability, 'timeout')?.value ?? '0'), transientCredential: transientApiKey ? createProviderCredentialPackage(providerAuthSchemaForId('api-key'), { apiKey: transientApiKey }) : undefined
    }).catch((): DeepSeekConfigurationTestResult => ({ status: 'failure', category: 'network', elapsedMs: 0 }))
    if (generation !== connectivityGeneration) return
    connectivityState = { kind: 'result', result }
    renderConnectivity()
  }
  const renderModelStudioConnectivity = (): void => {
    if (capability !== 'asr' && capability !== 'text-analysis' && capability !== 'multimodal-review') return
    if (capability === 'asr') ensureAsrModelStudioConnectivityNodes(document)
    renderModelStudioConnectivitySurface({ document, capability, profiles, availabilityReason: capabilityStatuses.get(capability)?.reason, active: isModelStudioDraft(), state: modelStudioConnectivityState })
  }
  const testModelStudioConfiguration = async (): Promise<void> => {
    if ((capability !== 'asr' && capability !== 'text-analysis' && capability !== 'multimodal-review') || !isModelStudioDraft() || modelStudioConnectivityState.kind === 'testing') return
    const generation = ++modelStudioConnectivityGeneration
    modelStudioConnectivityState = { kind: 'testing' }; renderModelStudioConnectivity()
    const result = await runModelStudioConfigurationCheck({ document, capability, profiles })
    if (generation !== modelStudioConnectivityGeneration) return
    modelStudioConnectivityState = { kind: 'result', result }; renderModelStudioConnectivity()
  }
  const renderTencentAsrConnectivity = (): void => {
    if (capability !== 'asr') return
    renderTencentAsrConnectivitySurface({ document, active: input(document, capability, 'vendor')?.value.trim() === TENCENT_CLOUD_ASR, profile: profiles.get('asr'), credentialStatus: tencentAsrStoredCredentialStatus, state: tencentAsrConnectivityState })
  }
  const invalidateTencentAsrConnectivity = (): void => {
    if (tencentAsrConnectivityState.kind === 'testing') return
    tencentAsrConnectivityState = { kind: 'unverified' }
    renderTencentAsrConnectivity()
  }
  const testTencentAsrConfiguration = async (): Promise<void> => {
    if (capability !== 'asr' || input(document, capability, 'vendor')?.value.trim() !== TENCENT_CLOUD_ASR || tencentAsrConnectivityState.kind === 'testing') return
    const schema = providerAuthSchemaForId('tencent-cloud-secret-pair')
    const secretId = credentialInput(document, capability, schema.fields[0]!)?.value.trim() || undefined
    const secretKey = credentialInput(document, capability, schema.fields[1]!)?.value.trim() || undefined
    if (Boolean(secretId) !== Boolean(secretKey)) {
      tencentAsrConnectivityState = { kind: 'result', result: { status: 'failure', category: 'invalid-configuration', elapsedMs: 0 } }
      renderTencentAsrConnectivity()
      return
    }
    tencentAsrConnectivityState = { kind: 'testing' }
    renderTencentAsrConnectivity()
    const result = await window.desktopApi.testTencentAsrConfiguration({ capability: 'asr', provider: TENCENT_CLOUD_ASR, endpoint: input(document, capability, 'endpoint')?.value.trim() ?? '', timeoutSeconds: Number(input(document, capability, 'timeout')?.value ?? '0'), transientCredential: secretId && secretKey ? createProviderCredentialPackage(schema, { secretId, secretKey }) : undefined }).catch((): TencentAsrConfigurationTestResult => ({ status: 'failure', category: 'network', elapsedMs: 0 }))
    tencentAsrConnectivityState = { kind: 'result', result }
    renderTencentAsrConnectivity()
  }
  const onClick = (event: Event): void => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-settings], [data-open], [data-supplier-filter], [data-use-provider], [data-save-provider], [data-reference-link], [data-test-current-configuration], [data-test-model-studio-configuration], [data-test-model-studio-asr-configuration], [data-test-tencent-asr-configuration]')
    if (!target) return
    const section = target.dataset.settings as SettingsSection | undefined
    if (section && ['providers', 'export', 'performance', 'data', 'about'].includes(section)) {
      event.preventDefault(); event.stopImmediatePropagation(); onSectionChange(section); return
    }
    const openCapability = capabilityForPrototypeKey(target.dataset.open)
    if (openCapability || target.dataset.open === 'settings') { event.preventDefault(); event.stopImmediatePropagation(); onNavigate(openCapability); return }
    if (!capability) return
    if (target.hasAttribute('data-test-current-configuration')) { event.preventDefault(); event.stopImmediatePropagation(); void testCurrentConfiguration(); return }
    if (target.hasAttribute('data-test-model-studio-configuration')) { event.preventDefault(); event.stopImmediatePropagation(); void testModelStudioConfiguration(); return }
    if (target.hasAttribute('data-test-model-studio-asr-configuration')) { event.preventDefault(); event.stopImmediatePropagation(); void testModelStudioConfiguration(); return }
    if (target.hasAttribute('data-test-tencent-asr-configuration')) { event.preventDefault(); event.stopImmediatePropagation(); void testTencentAsrConfiguration(); return }
    if (target.hasAttribute('data-supplier-filter')) {
      event.preventDefault(); event.stopImmediatePropagation(); applySupplierFilter(document, target); return
    }
    if (target.hasAttribute('data-use-provider')) {
      event.preventDefault(); event.stopImmediatePropagation()
      const entry = catalogEntryFor(target, capability)
      if (entry) {
        draftGeneration += 1
        applyCatalogDraft(document, capability, entry, edited, invalidateConnectivity)
        renderProviderCredentialFields(document, capability, providerAuthSchemaForId(entry.authSchemaId), false)
        modelStudioConnectivityGeneration += 1
        modelStudioConnectivityState = { kind: 'unverified' }
        renderModelStudioConnectivity()
        renderTencentAsrConnectivity()
        markCatalogSelection(document, target)
        syncModelStudioModelInput()
      }
      return
    }
    if (target.hasAttribute('data-save-provider')) { event.preventDefault(); event.stopImmediatePropagation(); void save(capability); return }
    if (target.hasAttribute('data-reference-link')) {
      event.preventDefault(); event.stopImmediatePropagation()
      const candidate = target.closest<HTMLElement>('[data-supplier-candidate]')?.querySelector<HTMLElement>('[data-use-provider]')
      const entry = candidate ? catalogEntryFor(candidate, capability) : undefined
      if (entry) void window.desktopApi.openExternalUrl(target.dataset.referenceLink === '价格/额度' ? entry.pricingUrl : entry.officialDocsUrl).then(() => toast(document, '已交由系统默认浏览器打开外部资料。')).catch((error: unknown) => toast(document, error instanceof Error ? error.message : '无法打开外部资料。'))
    }
  }
  document.addEventListener('input', onInput)
  document.addEventListener('click', onClick, true)
  void refreshProfiles().catch((error: unknown) => toast(document, error instanceof Error ? error.message : '供应商配置读取失败。'))
  alignProviderConnectivityFixtureOrder(document, capability)
  alignModelStudioFixtureOrder(document, capability)
  if (capability) fillDraft(capability)
  return () => { document.removeEventListener('input', onInput); document.removeEventListener('click', onClick, true) }
}
