import type { AiCapabilityStatus, ModelStudioConfigurationTestResult, ProviderProfile } from '../../../shared/contracts.js'
import { PROVIDER_CAPABILITY_LABELS, isModelStudioAutomaticModel, isModelStudioProvider, isProviderModelGuidanceValue, type ProviderCapability } from '../../../shared/provider-catalog.js'

type State = { kind: 'unverified' } | { kind: 'testing' } | { kind: 'result'; result: ModelStudioConfigurationTestResult }
type Props = { document: Document; capability: ProviderCapability; profiles: ReadonlyMap<ProviderCapability, ProviderProfile>; availabilityReason?: AiCapabilityStatus['reason']; active: boolean; state: State }
const setVisible = (element: HTMLElement, visible: boolean): void => { element.hidden = !visible; element.style.display = visible ? '' : 'none' }

const selectorsFor = (capability: ProviderCapability): { button: string; panel: string; provider: string; saved: string; detail: string } => {
  if (capability === 'asr') return { button: '[data-test-model-studio-asr-configuration]', panel: '[data-od-id="model-studio-asr-connection-status"]', provider: '[data-asr-default-provider]', saved: '[data-asr-default-saved]', detail: '[data-asr-default-detail]' }
  if (capability === 'text-analysis') return { button: '[data-test-current-configuration]', panel: '[data-od-id="text-analysis-connection-status"]', provider: '[data-default-provider]', saved: '[data-default-saved]', detail: '[data-default-detail]' }
  return { button: '[data-test-model-studio-configuration]', panel: '[data-od-id="model-studio-connection-status"]', provider: '[data-model-studio-default-provider]', saved: '[data-model-studio-default-saved]', detail: '[data-model-studio-default-detail]' }
}

export const renderModelStudioConnectivitySurface = ({ document, capability, profiles, availabilityReason, active, state }: Props): void => {
  const selectors = selectorsFor(capability)
  const button = document.querySelector<HTMLButtonElement>(selectors.button)
  const panel = document.querySelector<HTMLElement>(selectors.panel)
  if (!button || !panel) return
  // Text analysis shares these nodes with its DeepSeek connectivity surface.
  // Do not leave an inline display override for that other provider to inherit.
  if (capability === 'text-analysis') {
    button.hidden = !active
    panel.hidden = !active
    button.style.display = ''
    panel.style.display = ''
  } else {
    setVisible(button, active)
    setVisible(panel, active)
  }
  if (!active) return
  const profile = profiles.get(capability)
  const provider = document.querySelector<HTMLElement>(selectors.provider)
  const saved = document.querySelector<HTMLElement>(selectors.saved)
  const detail = document.querySelector<HTMLElement>(selectors.detail)
  const capabilityLabel = PROVIDER_CAPABILITY_LABELS[capability]
  const needsModel = Boolean(isModelStudioProvider(profile?.provider) && (!profile?.model || isProviderModelGuidanceValue(profile.model) || !isModelStudioAutomaticModel(profile.model)))
  const unreadableSecret = availabilityReason === 'unreadable-secret'
  if (provider) provider.textContent = profile?.provider ?? '未设置默认方案'
  if (saved) { saved.textContent = unreadableSecret ? '需要重新保存密钥' : needsModel ? '等待自动选择' : profile ? '已保存默认' : '尚未设置'; saved.className = `badge ${unreadableSecret || needsModel ? 'warning' : profile ? 'info' : 'warning'}` }
  if (detail) detail.textContent = unreadableSecret ? '已保存密钥但当前 Windows 安全存储无法读取；请重新保存该方案密钥。' : needsModel ? `填写 API 密钥后，应用会自动选择已开通的兼容${capabilityLabel}模型。` : profile ? '当前能力的默认方案 · 已自动选择兼容模型' : `保存后将成为${capabilityLabel}的默认方案`
  if (state.kind === 'testing') { button.disabled = true; button.textContent = '正在检测并自动选择'; panel.innerHTML = '<span class="badge info">检测中</span><strong>正在连接百炼账号并选择兼容模型</strong><p>仅读取模型目录，不上传业务素材。</p>'; return }
  button.disabled = false; button.textContent = '检测并自动选择'
  if (state.kind === 'result') { const result = state.result; panel.innerHTML = result.status === 'success' ? `<span class="badge success">已找到兼容模型</span><strong>账号连接成功 · ${result.elapsedMs} ms</strong><p>保存时会自动使用此兼容模型；未上传图片、视频、字幕、剧本或提示词。</p>` : `<span class="badge danger">无法自动选择</span><strong>${{network:'网络或 TLS 连接失败',timeout:'连接超时',authentication:'鉴权未通过',address:'地址不存在或不兼容','no-compatible-model':`账号未开通${capabilityLabel}模型`,'rate-limit':'配额或限流',server:'服务端暂时不可用','missing-key':'缺少可用密钥','invalid-configuration':'当前配置不符合测试要求',unexpected:'服务返回了无法验证的结果'}[result.category]}</strong><p>未显示密钥、模型列表或原始响应；当前默认方案未被修改。</p>`; return }
  panel.innerHTML = '<span class="badge warning">尚未检测</span><strong>填写 API 密钥后自动选择兼容模型</strong><p>保存或检测只读取模型目录，不上传图片、视频、字幕、剧本或提示词。</p>'
}
