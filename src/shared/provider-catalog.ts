import type { ProviderAuthSchemaId } from './provider-auth-schema.js'

export const PROVIDER_CAPABILITIES = ['asr', 'text-analysis', 'multimodal-review'] as const
export type ProviderCapability = (typeof PROVIDER_CAPABILITIES)[number]
export type ProviderCostType = 'local' | 'free-tier' | 'paid' | 'trial-unknown'
export type ProviderQuality = 'local-controllable' | 'balanced' | 'cloud-high-capability'
export type ProviderDifficulty = 'local-setup' | 'guided-api' | 'advanced-api'

export type ProviderCatalogEntry = {
  id: string
  name: string
  capabilities: readonly ProviderCapability[]
  region: 'local' | 'global' | 'cn'
  costType: ProviderCostType
  costLabel: string
  costNotice: string
  quality: ProviderQuality
  qualityLabel: string
  bestFor: string
  notFor: string
  difficulty: ProviderDifficulty
  difficultyLabel: string
  endpoint: string | null
  model: string | null
  timeoutMs: number
  requiresSecret: boolean
  authSchemaId: ProviderAuthSchemaId
  officialDocsUrl: string
  pricingUrl: string
  verifiedAt: string
}

export const PROVIDER_CAPABILITY_LABELS: Record<ProviderCapability, string> = {
  asr: 'ASR 字幕识别',
  'text-analysis': '文本语义分析',
  'multimodal-review': '视频理解复核'
}

export const MODEL_STUDIO_PROVIDER = '阿里云百炼 / Model Studio'
export const MODEL_STUDIO_WAITING_MODEL_LABEL = '等待自动选择'
export const MODEL_STUDIO_CONFIGURED_MODEL_LABEL = '已配置目录模型'
export const MODEL_STUDIO_AUTOMATIC_MODEL_LABEL = '已自动选择兼容模型'

// Provider names cross the Renderer/IPC boundary. Treat visual-only Unicode
// variants as the same directory identity so they cannot become a bypass.
const normalizeProviderIdentity = (provider: string): string => provider
  .normalize('NFKC')
  .replace(/[\s\p{Cf}]+/gu, '')
  .toLocaleLowerCase('en-US')

export const isModelStudioProvider = (provider: string | null | undefined): boolean => (
  typeof provider === 'string' && normalizeProviderIdentity(provider) === normalizeProviderIdentity(MODEL_STUDIO_PROVIDER)
)

export const isModelStudioDisplayModelLabel = (model: string | null | undefined): boolean => {
  const normalized = model?.trim() ?? ''
  return normalized === MODEL_STUDIO_AUTOMATIC_MODEL_LABEL || normalized === MODEL_STUDIO_WAITING_MODEL_LABEL || normalized === MODEL_STUDIO_CONFIGURED_MODEL_LABEL
}

export const isModelStudioAutomaticModel = (model: string | null | undefined): boolean => {
  const normalized = model?.trim() ?? ''
  return normalized === MODEL_STUDIO_AUTOMATIC_MODEL_LABEL
}
export const isModelStudioMultimodalModel = isModelStudioAutomaticModel

export const PROVIDER_COST_LABELS: Record<ProviderCostType, string> = {
  local: '本机运行',
  'free-tier': '免费额度 + 按量付费',
  paid: '按量付费',
  'trial-unknown': '试用/额度待确认'
}

export const PROVIDER_CATALOG: readonly ProviderCatalogEntry[] = [
  {
    id: 'whispercpp-local', name: 'whisper.cpp（本机）', capabilities: ['asr'], region: 'local',
    costType: 'local', costLabel: '本机运行', costNotice: '不上传原片；模型下载、硬件和部署成本由你承担。',
    quality: 'local-controllable', qualityLabel: '本机可控', bestFor: '隐私优先、可部署本地 ASR 服务的字幕识别。', notFor: '希望免部署直接使用托管 API 的场景。',
    difficulty: 'local-setup', difficultyLabel: '需要本机部署', endpoint: 'http://127.0.0.1:8080', model: 'base', timeoutMs: 60000, requiresSecret: false, authSchemaId: 'none',
    officialDocsUrl: 'https://github.com/ggml-org/whisper.cpp', pricingUrl: 'https://github.com/ggml-org/whisper.cpp', verifiedAt: '2026-07-26'
  },
  {
    id: 'ollama-local', name: 'Ollama（本机）', capabilities: ['text-analysis', 'multimodal-review'], region: 'local',
    costType: 'local', costLabel: '本机运行', costNotice: 'Ollama 本身不收 API 费；模型许可、显存和设备成本需自行核对。',
    quality: 'local-controllable', qualityLabel: '本机可控', bestFor: '希望本地运行文本/视觉模型并自行选择模型的团队。', notFor: '低配置电脑或要求固定云端 SLA 的场景。',
    difficulty: 'local-setup', difficultyLabel: '需要本机部署', endpoint: 'http://127.0.0.1:11434', model: '请按本机已安装模型填写', timeoutMs: 60000, requiresSecret: false, authSchemaId: 'none',
    officialDocsUrl: 'https://docs.ollama.com/', pricingUrl: 'https://docs.ollama.com/', verifiedAt: '2026-07-26'
  },
  {
    id: 'gemini-api', name: 'Google Gemini API', capabilities: ['text-analysis', 'multimodal-review'], region: 'global',
    costType: 'free-tier', costLabel: '免费额度 + 按量付费', costNotice: '免费层配额、地域和可用模型会变动；开通前以官方价格页为准。',
    quality: 'cloud-high-capability', qualityLabel: '云端高能力候选', bestFor: '先用官方免费层验证文本或多模态需求，再按量扩展。', notFor: '不能接受跨境数据处理或依赖固定免费额度的场景。',
    difficulty: 'guided-api', difficultyLabel: '填写 API 密钥', endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash', timeoutMs: 60000, requiresSecret: true, authSchemaId: 'api-key',
    officialDocsUrl: 'https://ai.google.dev/gemini-api/docs/models', pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing', verifiedAt: '2026-07-26'
  },
  {
    id: 'openai-api', name: 'OpenAI API', capabilities: ['asr', 'text-analysis', 'multimodal-review'], region: 'global',
    costType: 'paid', costLabel: '按量付费', costNotice: '按模型和用量计费；本目录不承诺免费 API 额度。',
    quality: 'cloud-high-capability', qualityLabel: '云端高能力候选', bestFor: '希望使用统一云端 API 接入语音、文本和视觉能力。', notFor: '不能接受跨境数据处理或按量计费的场景。',
    difficulty: 'guided-api', difficultyLabel: '填写 API 密钥', endpoint: 'https://api.openai.com/v1', model: '请按所选能力填写模型', timeoutMs: 60000, requiresSecret: true, authSchemaId: 'api-key',
    officialDocsUrl: 'https://developers.openai.com/api/docs/models', pricingUrl: 'https://developers.openai.com/api/docs/pricing', verifiedAt: '2026-07-26'
  },
  {
    id: 'model-studio-asr', name: MODEL_STUDIO_PROVIDER, capabilities: ['asr'], region: 'cn',
    costType: 'paid', costLabel: '按量付费', costNotice: '语音识别按音频时长计费；实际价格与可用区域以百炼官方页面为准。',
    quality: 'balanced', qualityLabel: '国内云端候选', bestFor: '需要使用百炼 Paraformer 进行中文或多语种语音识别的场景。', notFor: '希望本轮立即启用云端 ASR 执行或固定费用的场景。',
    difficulty: 'advanced-api', difficultyLabel: '填写 API 密钥后自动选择', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: null, timeoutMs: 60000, requiresSecret: true, authSchemaId: 'api-key',
    officialDocsUrl: 'https://help.aliyun.com/zh/model-studio/', pricingUrl: 'https://help.aliyun.com/zh/model-studio/pricing/', verifiedAt: '2026-08-05'
  },
  {
    id: 'tencent-cloud-asr', name: '腾讯云 ASR', capabilities: ['asr'], region: 'cn',
    costType: 'paid', costLabel: '按量付费', costNotice: '腾讯云 ASR 按量计费；已支持 SecretId 与 SecretKey 安全保存及最小签名连通性检测，不上传音视频。',
    quality: 'balanced', qualityLabel: '国内云端候选', bestFor: '需要保存腾讯云 ASR 双凭据并进行最小签名连通性检测的场景。', notFor: '希望当前直接上传媒体或创建腾讯云 ASR 字幕识别任务的场景。',
    difficulty: 'advanced-api', difficultyLabel: '需双凭据签名适配', endpoint: 'https://asr.tencentcloudapi.com', model: '16k_zh', timeoutMs: 60000, requiresSecret: true, authSchemaId: 'tencent-cloud-secret-pair',
    officialDocsUrl: 'https://cloud.tencent.com/document/product/1093/35614', pricingUrl: 'https://cloud.tencent.com/document/product/1093', verifiedAt: '2026-08-05'
  },
  {
    id: 'deepseek-api', name: 'DeepSeek API', capabilities: ['text-analysis'], region: 'cn',
    costType: 'paid', costLabel: '按量付费', costNotice: '按输入、输出和缓存 token 计费；峰谷价格和模型定价以官方价格页为准。',
    quality: 'balanced', qualityLabel: '国内云端候选', bestFor: '需要国内云端文本语义分析，并使用 OpenAI 兼容 API 配置的团队。', notFor: '需要本机离线处理、ASR 或视频理解复核的场景。',
    difficulty: 'guided-api', difficultyLabel: '填写 API 密钥', endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', timeoutMs: 60000, requiresSecret: true, authSchemaId: 'api-key',
    officialDocsUrl: 'https://api-docs.deepseek.com/', pricingUrl: 'https://api-docs.deepseek.com/quick_start/pricing/', verifiedAt: '2026-08-04'
  },
  {
    id: 'model-studio', name: MODEL_STUDIO_PROVIDER, capabilities: ['text-analysis', 'multimodal-review'], region: 'cn',
    costType: 'trial-unknown', costLabel: '试用/额度待确认', costNotice: '本轮未承诺具体免费额度；开通前必须在官方价格页核验。',
    quality: 'balanced', qualityLabel: '国内云端候选', bestFor: '需要评估国内云服务路径的文本或多模态需求。', notFor: '把试用额度当成长期固定成本的场景。',
    difficulty: 'guided-api', difficultyLabel: '填写 API 密钥', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: null, timeoutMs: 60000, requiresSecret: true, authSchemaId: 'api-key',
    officialDocsUrl: 'https://www.alibabacloud.com/help/en/model-studio/vision', pricingUrl: 'https://www.alibabacloud.com/help/en/model-studio/pricing', verifiedAt: '2026-08-14'
  }
]

export const catalogEntriesFor = (capability: ProviderCapability): ProviderCatalogEntry[] => PROVIDER_CATALOG.filter((entry) => entry.capabilities.includes(capability))

// Custom cloud providers default to a conventional API-key field. Maintained
// catalogue entries must state their own schema here instead of teaching UI or
// persistence code about vendor names.
export const providerAuthSchemaIdForProvider = (provider: string): ProviderAuthSchemaId => (
  PROVIDER_CATALOG.find((entry) => entry.name === provider)?.authSchemaId ?? 'api-key'
)

// This is the only source for hosts that can receive Model Studio Bearer
// credentials. Model discovery services must import this value rather than
// maintaining a parallel allowlist.
export const MODEL_STUDIO_DISCOVERY_HOSTS = Object.freeze([...new Set(
  PROVIDER_CATALOG
    .filter((entry) => entry.id === 'model-studio' && entry.endpoint)
    .map((entry) => new URL(entry.endpoint!).hostname.toLowerCase())
)])

const modelGuidanceValues = new Set([
  ...PROVIDER_CATALOG.map((entry) => entry.model).filter((model): model is string => Boolean(model?.startsWith('请按'))),
  // A persisted value from the previous Model Studio catalogue. Keep it
  // controlled until the automatic discovery path replaces it.
  '请按开通模型填写'
])

export const isProviderModelGuidanceValue = (model: string | null | undefined): boolean => modelGuidanceValues.has(model?.trim() ?? '') || isModelStudioDisplayModelLabel(model)
