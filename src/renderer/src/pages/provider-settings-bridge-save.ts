import type { ModelStudioConfigurationTestResult, ProviderProfile, TencentAsrStoredCredentialStatus } from '../../../shared/contracts.js'
import { MODEL_STUDIO_PROVIDER, PROVIDER_CAPABILITY_LABELS, isModelStudioProvider, isProviderModelGuidanceValue, providerAuthSchemaIdForProvider, type ProviderCapability } from '../../../shared/provider-catalog.js'
import { createProviderCredentialPackage, hasCredentialValues, providerAuthSchemaForId, type ProviderCredentialPackage } from '../../../shared/provider-auth-schema.js'
import { credentialInput, input, toast } from './provider-settings-bridge-support.js'

type SaveProviderProfileParams = {
  document: Document
  current: ProviderCapability
  profiles: Map<ProviderCapability, ProviderProfile>
  tencentAsrStoredCredentialStatus: TencentAsrStoredCredentialStatus
  isSaving: () => boolean
  setSaving: (value: boolean) => void
  isDraftCurrent: () => boolean
  onSaveSecret: (credential: ProviderCredentialPackage, secretRef: string) => Promise<void>
  refreshProfiles: () => Promise<void>
  afterSuccess: () => void
  successMessage: () => string
}

export const saveProviderProfile = async ({ document, current, profiles, tencentAsrStoredCredentialStatus, isSaving, setSaving, isDraftCurrent, onSaveSecret, refreshProfiles, afterSuccess, successMessage }: SaveProviderProfileParams): Promise<void> => {
  if (isSaving()) return
  const vendor = input(document, current, 'vendor')?.value.trim() ?? ''
  const region = input(document, current, 'region')?.value.trim() ?? 'local'
  const endpoint = input(document, current, 'endpoint')?.value.trim() ?? ''
  const model = input(document, current, 'model')?.value.trim() ?? ''
  const timeoutSeconds = Number(input(document, current, 'timeout')?.value ?? '60')
  const pricing = input(document, current, 'price')?.value.trim() ?? ''
  const authSchema = providerAuthSchemaForId(providerAuthSchemaIdForProvider(vendor))
  const credentialValues = Object.fromEntries(authSchema.fields.map((field) => [field.key, credentialInput(document, current, field)?.value.trim() ?? '']))
  const priorProfile = profiles.get(current)
  const canReuseSavedCredential = priorProfile?.provider === vendor && (authSchema.id !== 'tencent-cloud-secret-pair' || tencentAsrStoredCredentialStatus === 'valid')
  if (authSchema.requiresCredentialOnInitialSave && !hasCredentialValues(credentialValues) && !canReuseSavedCredential) { toast(document, `首次保存需要填写${authSchema.fields.filter((field) => field.required).map((field) => field.label).join('、')}。`); return }
  let credential: ProviderCredentialPackage | null = null
  if (hasCredentialValues(credentialValues)) {
    try { credential = createProviderCredentialPackage(authSchema, credentialValues) } catch (error) { toast(document, error instanceof Error ? error.message : '凭据格式不正确。'); return }
  }
  if (!vendor) { toast(document, `${PROVIDER_CAPABILITY_LABELS[current]}需要填写供应商。`); return }
  const modelStudio = isModelStudioProvider(vendor)
  if (isProviderModelGuidanceValue(model) && !modelStudio) { toast(document, '模型仍是目录引导文案，不能保存。'); return }
  if (endpoint) { try { const parsed = new URL(endpoint); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error() } catch { toast(document, 'API 地址必须是没有内嵌凭据的 http(s) 地址。'); return } }
  if (region === 'local' && !endpoint) { toast(document, '本机方案需要填写本地服务地址。'); return }
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 600) { toast(document, '超时必须是 1–600 秒。'); return }
  setSaving(true)
  let createdSecretRef: string | null = null
  try {
    let secretRef = priorProfile?.secretRef ?? null
    if (credential) {
      secretRef = crypto.randomUUID()
      createdSecretRef = secretRef
      await (modelStudio
        ? window.desktopApi.saveModelStudioProvisionalCredential?.(credential, secretRef, current)
          ?? onSaveSecret(credential, secretRef)
        : onSaveSecret(credential, secretRef))
    }
    let selectedModel = model || null
    let modelStudioSelectionToken: string | undefined
    if (modelStudio) {
      if (!secretRef) { toast(document, '请先填写 API 密钥后再自动选择模型。'); return }
      const result = await window.desktopApi.testModelStudioMultimodalConfiguration({ capability: current, provider: MODEL_STUDIO_PROVIDER, endpoint, timeoutSeconds, secretRef }).catch((): ModelStudioConfigurationTestResult => ({ status: 'failure', category: 'network', elapsedMs: 0 }))
      if (result.status === 'failure') {
        if (createdSecretRef) { await window.desktopApi.deleteSecret(createdSecretRef).catch(() => undefined); createdSecretRef = null }
        toast(document, result.category === 'no-compatible-model' ? `账号未开通兼容的${PROVIDER_CAPABILITY_LABELS[current]}模型；请在百炼模型页开通后重试。` : '无法验证百炼账号或自动选择兼容模型；现有默认方案未被修改。'); return
      }
      if (!isDraftCurrent()) {
        if (createdSecretRef) { await window.desktopApi.deleteSecret(createdSecretRef).catch(() => undefined); createdSecretRef = null }
        toast(document, '配置已变更，已丢弃旧的自动选型结果。'); return
      }
      selectedModel = result.selectedModelLabel
      modelStudioSelectionToken = result.selectionToken
      const modelInput = input(document, current, 'model'); if (modelInput) modelInput.value = selectedModel
    }
    if (!isDraftCurrent()) {
      if (createdSecretRef) await window.desktopApi.deleteSecret(createdSecretRef).catch(() => undefined)
      toast(document, '配置已变更，未保存旧草稿。')
      return
    }
    await window.desktopApi.saveProviderProfile({ capability: current, region: region === 'cn' || region === 'global' ? region : 'local', provider: modelStudio ? MODEL_STUDIO_PROVIDER : vendor, endpoint: endpoint || null, model: selectedModel, secretRef, timeoutMs: timeoutSeconds * 1000, pricing: pricing || null, ...(modelStudioSelectionToken ? { modelStudioSelectionToken } : {}) })
    createdSecretRef = null
    await refreshProfiles()
    for (const field of authSchema.fields) { const credentialField = credentialInput(document, current, field); if (credentialField) credentialField.value = '' }
    afterSuccess()
    toast(document, successMessage())
  } catch (error) {
    if (createdSecretRef) await window.desktopApi.deleteSecret(createdSecretRef).catch(() => undefined)
    toast(document, error instanceof Error ? error.message : '方案保存失败。')
  } finally { setSaving(false) }
}
