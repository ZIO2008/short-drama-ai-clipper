import { z } from 'zod'
import { isModelStudioProvider } from '../../shared/provider-catalog.js'
import { credentialValuesFromStoredValue } from '../../shared/provider-auth-schema.js'
import type { ClipSemanticAdapter } from './clip-candidate-intelligence-service.js'
import type { ClipMultimodalReviewAdapter } from './clip-multimodal-review-service.js'

type SecretReader = { readPlaintextForMainProcess: (secretRef: unknown) => string }

const apiKeyForSecretRef = (secrets: SecretReader, secretRef: unknown): string => {
  const apiKey = credentialValuesFromStoredValue(secrets.readPlaintextForMainProcess(secretRef), 'api-key')?.apiKey
  if (!apiKey) throw new Error('当前云端方案的 API 密钥不可用。')
  return apiKey
}

const responseSchema = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1) })

const parseJsonObjectContent = (content: string): unknown => {
  const trimmed = content.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1]?.trim()
  const candidate = fenced ?? trimmed
  // A provider may use a complete JSON code block for compatibility, but
  // explanatory prose around an object is not a structured response.
  try { return JSON.parse(candidate) as unknown } catch { return { invalid: 'not-json' } }
}

const requestUrlFor = (endpointValue: string): URL => {
  const endpoint = new URL(endpointValue)
  const normalized = endpoint.pathname.replace(/\/+$/, '')
  if (!normalized.endsWith('/chat/completions')) endpoint.pathname = normalized.endsWith('/v1') ? `${normalized}/chat/completions` : `${normalized || ''}/v1/chat/completions`
  endpoint.search = ''; endpoint.hash = ''
  return endpoint
}

const isResponseFormatRejection = async (response: Response): Promise<boolean> => {
  if (response.status !== 400) return false
  try {
    const body = await response.clone().json() as { error?: { message?: unknown; code?: unknown; param?: unknown } }
    return [body.error?.message, body.error?.code, body.error?.param].some((value) => typeof value === 'string' && /response[_ -]?format/i.test(value))
  } catch { return false }
}

const responseContent = async (response: Response): Promise<string | null> => {
  const body = responseSchema.safeParse(await response.json())
  const content = body.success ? body.data.choices[0]?.message.content?.trim() : null
  return content || null
}

/** Narrow OpenAI-compatible bridge for text semantics; it never exposes a generic model API. */
export class OpenAiCompatibleClipSemanticAdapter implements ClipSemanticAdapter {
  constructor(private readonly secrets: SecretReader, private readonly fetchImpl: typeof fetch = fetch) {}

  async select(input: Parameters<ClipSemanticAdapter['select']>[0]): Promise<unknown> {
    if (!input.profile.endpoint || !input.profile.model) throw new Error('文本语义分析配置缺少地址或模型。')
    const endpoint = input.profile.endpoint
    const model = input.profile.model
    const prompt = JSON.stringify({
      task: '基于全部候选语义窗口判断叙事事件状态、涉及人物、关系、冲突、跨窗连续性、反转/悬念节拍、可独立理解的上下文程度及剪辑用途；从全部窗口中只挑选最强的少量候选，而不是为每个窗口生成候选。只能使用系统给出的 evidenceIds 提出起点和终点锚点；不得输出秒数、帧号、原文、解释或新 ID。',
      candidateLimit: Math.max(1, Math.min(50, Math.floor(input.candidateLimit ?? 50))),
      proposals: input.proposals.map((proposal, index) => ({ windowId: `window-${index + 1}`, coreEvidenceIds: proposal.evidenceIds, contextBeforeIds: proposal.contextBeforeIds ?? [], contextAfterIds: proposal.contextAfterIds ?? [], evidence: proposal.summary })),
      repair: input.repair ?? null,
      outputContract: [
        '只返回一个 JSON 对象，不得在 JSON 前后添加任何文字。',
        '只输出 selections；每一项用一个给定的 windowId 作为 proposalId。程序会生成事件键并从该 windowId 的冻结 contextBeforeIds、coreEvidenceIds、contextAfterIds 原序派生完整来源映射。',
        '不得输出 narrativeEvents、narrativeEventId、coreEvidenceIds 或 sourceEvidenceIds。',
        '每个 selections 项的 evidenceIds、startEvidenceId、endEvidenceId 必须只来自 proposalId 对应窗口的 coreEvidenceIds，且起止 ID 都必须出现在 evidenceIds 中。',
        '只有 narrative.continuity 为 continuous 或 limited，且 seamStatus 为 closed 或 expanded-closed 的窗口才可进入 selections；无法闭合的窗口必须省略，不得把 unclear 作为候选。',
        'selections 的长度不得超过 candidateLimit。'
      ],
      output: { selections: [{ proposalId: 'one supplied windowId only', startEvidenceId: 'existing core ID only', endEvidenceId: 'existing core ID only', evidenceIds: ['existing core ID only'], beat: 'setup|entry|escalation|reversal|climax|reaction|aftermath', purpose: 'hook|conflict|reveal|emotion|transition', context: 'standalone|limited', narrative: { state: 'entry|escalation|reversal|completion|reaction', characters: ['role only'], relationship: 'brief factual relationship', conflict: 'brief factual conflict', continuity: 'continuous|limited' }, seamStatus: 'closed|expanded-closed' }] }
    })
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
    const secretRef = input.profile.secretRef
    if (secretRef) headers.Authorization = `Bearer ${apiKeyForSecretRef(this.secrets, secretRef)}`
    const request = (includeResponseFormat: boolean): Promise<Response> => this.fetchImpl(requestUrlFor(endpoint), {
      method: 'POST', redirect: 'error', signal: input.signal ?? AbortSignal.timeout(input.profile.timeoutMs ?? 60_000), headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], temperature: 0, ...(includeResponseFormat ? { response_format: { type: 'json_object' } } : {}) })
    })
    let response = await request(true)
    let retriedWithoutResponseFormat = false
    // Some OpenAI-compatible endpoints accept the model and prompt but reject
    // response_format. One bounded retry preserves the strict output contract:
    // validation below still rejects anything except snapshot-local JSON IDs.
    if (await isResponseFormatRejection(response)) { response = await request(false); retriedWithoutResponseFormat = true }
    if (!response.ok) throw new Error(`文本语义分析调用失败（HTTP ${response.status}）。`)
    let content = await responseContent(response)
    // Some compatible providers accept response_format but return an empty
    // content field. Retry exactly once without that optional hint; the
    // downstream JSON/schema/snapshot validation remains unchanged.
    if (!content && !retriedWithoutResponseFormat) {
      response = await request(false)
      retriedWithoutResponseFormat = true
      if (!response.ok) throw new Error(`文本语义分析调用失败（HTTP ${response.status}）。`)
      content = await responseContent(response)
    }
    if (!content) throw new Error('文本语义分析未返回结构化结果。')
    return parseJsonObjectContent(content)
  }
}

const multimodalResultSchema = z.object({ factCode: z.string().trim().min(1).max(100), conclusion: z.enum(['supported', 'not-supported', 'unclear']), evidenceIds: z.array(z.string().uuid()).min(1).max(50), claimKinds: z.array(z.enum(['start-boundary', 'end-boundary', 'core-event', 'narrative-closure'])).max(4), reason: z.string().trim().min(1).max(500) }).strict()
const multimodalStrictResponseFormat = (factCode: string) => ({
  type: 'json_schema',
  json_schema: {
    name: 'clip_multimodal_review',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        factCode: { type: 'string', const: factCode },
        conclusion: { type: 'string', enum: ['supported', 'not-supported', 'unclear'] },
        evidenceIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 },
        claimKinds: { type: 'array', items: { type: 'string', enum: ['start-boundary', 'end-boundary', 'core-event', 'narrative-closure'] }, maxItems: 4 },
        reason: { type: 'string' },
      },
      required: ['factCode', 'conclusion', 'evidenceIds', 'claimKinds', 'reason'],
      additionalProperties: false,
    },
  },
} as const)
const supportsStrictMultimodalSchema = (provider: string, model: string): boolean => isModelStudioProvider(provider) && /^qwen3\.7-plus(?:-|$)/.test(model)

/** Restricted bridge: it can inspect only caller-derived boundary frames. */
export class OpenAiCompatibleClipMultimodalReviewAdapter implements ClipMultimodalReviewAdapter {
  constructor(private readonly secrets: SecretReader, private readonly fetchImpl: typeof fetch = fetch) {}

  async review(input: Parameters<ClipMultimodalReviewAdapter['review']>[0]): Promise<unknown> {
    if (!input.profile.endpoint || !input.profile.model) throw new Error('视频复核配置缺少地址或模型。')
    const endpoint = input.profile.endpoint
    const model = input.profile.model
    const prompt = JSON.stringify({
      task: '仅判断给定候选边界帧是否支持 reviewQuestion 中指定的视觉事实。只能引用 evidenceIds 和 requestedClaimKinds；不得输出秒数、帧号、新ID、切点建议或自由叙事。',
      factCode: input.factCode,
      reviewQuestion: input.reviewQuestion,
      evidenceIds: input.evidenceIds,
      requestedClaimKinds: input.claimKinds,
      repair: input.repair ?? null,
      output: { factCode: 'repeat supplied factCode exactly', conclusion: 'supported|not-supported|unclear', evidenceIds: ['existing evidence ID only'], claimKinds: ['only the concrete claims this review supports'], reason: 'brief factual reason' },
    })
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
    if (input.profile.secretRef) headers.Authorization = `Bearer ${apiKeyForSecretRef(this.secrets, input.profile.secretRef)}`
    const strictResponse = supportsStrictMultimodalSchema(input.profile.provider, model)
    const request = (includeResponseFormat: boolean): Promise<Response> => this.fetchImpl(requestUrlFor(endpoint), {
      method: 'POST', redirect: 'error', signal: input.signal ?? AbortSignal.timeout(input.profile.timeoutMs ?? 60_000), headers,
      body: JSON.stringify({ model, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...input.frames.map((frame) => ({ type: 'image_url', image_url: { url: frame.dataUrl } }))] }], temperature: 0, ...(isModelStudioProvider(input.profile.provider) ? { enable_thinking: false } : {}), ...(includeResponseFormat ? { response_format: strictResponse ? multimodalStrictResponseFormat(input.factCode) : { type: 'json_object' } } : {}) })
    })
    let response = await request(true)
    // Match the text bridge: retry exactly once only when this compatible
    // endpoint rejects response_format; parsing remains strictly JSON-only.
    if (!strictResponse && await isResponseFormatRejection(response)) response = await request(false)
    if (!response.ok) throw new Error(`视频复核调用失败（HTTP ${response.status}）。`)
    const body = responseSchema.safeParse(await response.json())
    if (!body.success || !body.data.choices[0]?.message.content) throw new Error('视频复核未返回结构化结果。')
    try { return multimodalResultSchema.parse(parseJsonObjectContent(body.data.choices[0].message.content)) } catch { return { invalid: 'not-json-or-schema' } }
  }
}
