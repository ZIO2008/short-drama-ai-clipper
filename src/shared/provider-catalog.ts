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
  officialDocsUrl: string
  pricingUrl: string
  verifiedAt: string
}

export const PROVIDER_CAPABILITY_LABELS: Record<ProviderCapability, string> = {
  asr: 'ASR 字幕识别',
  'text-analysis': '文本语义分析',
  'multimodal-review': '视频理解复核'
}

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
    difficulty: 'local-setup', difficultyLabel: '需要本机部署', endpoint: 'http://127.0.0.1:8080', model: 'base', timeoutMs: 60000, requiresSecret: false,
    officialDocsUrl: 'https://github.com/ggml-org/whisper.cpp', pricingUrl: 'https://github.com/ggml-org/whisper.cpp', verifiedAt: '2026-07-26'
  },
  {
    id: 'ollama-local', name: 'Ollama（本机）', capabilities: ['text-analysis', 'multimodal-review'], region: 'local',
    costType: 'local', costLabel: '本机运行', costNotice: 'Ollama 本身不收 API 费；模型许可、显存和设备成本需自行核对。',
    quality: 'local-controllable', qualityLabel: '本机可控', bestFor: '希望本地运行文本/视觉模型并自行选择模型的团队。', notFor: '低配置电脑或要求固定云端 SLA 的场景。',
    difficulty: 'local-setup', difficultyLabel: '需要本机部署', endpoint: 'http://127.0.0.1:11434', model: '请按本机已安装模型填写', timeoutMs: 60000, requiresSecret: false,
    officialDocsUrl: 'https://docs.ollama.com/', pricingUrl: 'https://docs.ollama.com/', verifiedAt: '2026-07-26'
  },
  {
    id: 'gemini-api', name: 'Google Gemini API', capabilities: ['text-analysis', 'multimodal-review'], region: 'global',
    costType: 'free-tier', costLabel: '免费额度 + 按量付费', costNotice: '免费层配额、地域和可用模型会变动；开通前以官方价格页为准。',
    quality: 'cloud-high-capability', qualityLabel: '云端高能力候选', bestFor: '先用官方免费层验证文本或多模态需求，再按量扩展。', notFor: '不能接受跨境数据处理或依赖固定免费额度的场景。',
    difficulty: 'guided-api', difficultyLabel: '填写 API 密钥', endpoint: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash', timeoutMs: 60000, requiresSecret: true,
    officialDocsUrl: 'https://ai.google.dev/gemini-api/docs/models', pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing', verifiedAt: '2026-07-26'
  },
  {
    id: 'openai-api', name: 'OpenAI API', capabilities: ['asr', 'text-analysis', 'multimodal-review'], region: 'global',
    costType: 'paid', costLabel: '按量付费', costNotice: '按模型和用量计费；本目录不承诺免费 API 额度。',
    quality: 'cloud-high-capability', qualityLabel: '云端高能力候选', bestFor: '希望使用统一云端 API 接入语音、文本和视觉能力。', notFor: '不能接受跨境数据处理或按量计费的场景。',
    difficulty: 'guided-api', difficultyLabel: '填写 API 密钥', endpoint: 'https://api.openai.com/v1', model: '请按所选能力填写模型', timeoutMs: 60000, requiresSecret: true,
    officialDocsUrl: 'https://developers.openai.com/api/docs/models', pricingUrl: 'https://developers.openai.com/api/docs/pricing', verifiedAt: '2026-07-26'
  },
  {
    id: 'model-studio', name: '阿里云百炼 / Model Studio', capabilities: ['text-analysis', 'multimodal-review'], region: 'cn',
    costType: 'trial-unknown', costLabel: '试用/额度待确认', costNotice: '本轮未承诺具体免费额度；开通前必须在官方价格页核验。',
    quality: 'balanced', qualityLabel: '国内云端候选', bestFor: '需要评估国内云服务路径的文本或多模态需求。', notFor: '把试用额度当成长期固定成本的场景。',
    difficulty: 'advanced-api', difficultyLabel: '需核对区域与模型', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: '请按开通模型填写', timeoutMs: 60000, requiresSecret: true,
    officialDocsUrl: 'https://www.alibabacloud.com/help/en/model-studio/', pricingUrl: 'https://www.alibabacloud.com/help/en/model-studio/pricing', verifiedAt: '2026-07-26'
  }
]

export const catalogEntriesFor = (capability: ProviderCapability): ProviderCatalogEntry[] => PROVIDER_CATALOG.filter((entry) => entry.capabilities.includes(capability))
