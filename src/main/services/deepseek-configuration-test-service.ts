import { z } from 'zod'
import type { DeepSeekConfigurationTestResult, ProviderProfile } from '../../shared/contracts.js'
import { credentialValuesFromStoredValue } from '../../shared/provider-auth-schema.js'

const inputSchema = z.object({
  capability: z.literal('text-analysis'),
  provider: z.literal('DeepSeek API'),
  endpoint: z.string().trim().min(1).max(2048),
  model: z.string().trim().min(1).max(200),
  timeoutSeconds: z.number().int().min(1).max(600),
  transientCredential: z.object({ version: z.literal(1), schema: z.enum(['api-key', 'tencent-cloud-secret-pair']), values: z.record(z.string(), z.string().trim().min(1).max(4096)) }).strict().optional()
}).strict()
const deepSeekApiHost = 'api.deepseek.com'

type ProfileReader = { list: () => ProviderProfile[] }
type SecretReader = { readPlaintextForMainProcess: (secretRef: unknown) => string }
type FailureCategory = Extract<DeepSeekConfigurationTestResult, { status: 'failure' }>['category']

const elapsedSince = (startedAt: number): number => Math.max(0, Date.now() - startedAt)
const failure = (category: FailureCategory, startedAt: number): DeepSeekConfigurationTestResult => ({ status: 'failure', category, elapsedMs: elapsedSince(startedAt) })

const requestUrlFor = (endpoint: URL): URL => {
  const normalizedPath = endpoint.pathname.replace(/\/+$/, '')
  endpoint.search = ''
  endpoint.hash = ''
  if (normalizedPath.endsWith('/chat/completions')) return endpoint
  if (!normalizedPath || normalizedPath === '/') endpoint.pathname = '/v1/chat/completions'
  else endpoint.pathname = `${normalizedPath}/chat/completions`
  return endpoint
}

const isModelError = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false
  const error = 'error' in value ? value.error : value
  if (!error || typeof error !== 'object') return false
  const details = [
    'code' in error && typeof error.code === 'string' ? error.code : '',
    'type' in error && typeof error.type === 'string' ? error.type : '',
    'message' in error && typeof error.message === 'string' ? error.message : ''
  ].join(' ').toLowerCase()
  return details.includes('model') || details.includes('模型')
}

const hasOpenAiSuccessShape = (value: unknown): boolean => Boolean(
  value
  && typeof value === 'object'
  && 'id' in value && typeof value.id === 'string' && value.id
  && 'object' in value && typeof value.object === 'string' && value.object
  && 'created' in value && typeof value.created === 'number'
  && 'model' in value && typeof value.model === 'string' && value.model
  && 'choices' in value
  && Array.isArray(value.choices)
  && value.choices.some((choice) => Boolean(
    choice
    && typeof choice === 'object'
    && 'finish_reason' in choice && typeof choice.finish_reason === 'string'
    && 'message' in choice
    && choice.message
    && typeof choice.message === 'object'
    && 'role' in choice.message && choice.message.role === 'assistant'
    && 'content' in choice.message
    && (choice.message.content === null || typeof choice.message.content === 'string')
  ))
)

/** A one-purpose probe. It deliberately has no generic vendor execution surface. */
export class DeepSeekConfigurationTestService {
  constructor(
    private readonly profiles: ProfileReader,
    private readonly secrets: SecretReader,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async test(input: unknown): Promise<DeepSeekConfigurationTestResult> {
    const startedAt = Date.now()
    const parsed = inputSchema.safeParse(input)
    if (!parsed.success) return failure('invalid-configuration', startedAt)

    let endpoint: URL
    try {
      endpoint = new URL(parsed.data.endpoint)
      if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hostname.toLowerCase() !== deepSeekApiHost || (endpoint.port && endpoint.port !== '443')) return failure('invalid-configuration', startedAt)
    } catch {
      return failure('invalid-configuration', startedAt)
    }

    let secret = parsed.data.transientCredential
      ? credentialValuesFromStoredValue(JSON.stringify(parsed.data.transientCredential), 'api-key')?.apiKey ?? ''
      : ''
    if (parsed.data.transientCredential && !secret) return failure('invalid-configuration', startedAt)
    if (!secret) {
      const profile = this.profiles.list().find((item) => item.capability === 'text-analysis' && item.provider === 'DeepSeek API')
      if (!profile?.secretRef) return failure('missing-key', startedAt)
      try { secret = credentialValuesFromStoredValue(this.secrets.readPlaintextForMainProcess(profile.secretRef), 'api-key')?.apiKey ?? '' } catch { return failure('missing-key', startedAt) }
    }
    if (!secret) return failure('missing-key', startedAt)

    try {
      const response = await this.fetchImpl(requestUrlFor(endpoint), {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(parsed.data.timeoutSeconds * 1000),
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ model: parsed.data.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, temperature: 0, stream: false })
      })
      let payload: unknown = null
      try { payload = await response.json() } catch { /* response bodies never leave this method */ }
      if (response.ok) return hasOpenAiSuccessShape(payload) ? { status: 'success', elapsedMs: elapsedSince(startedAt) } : failure('unexpected', startedAt)
      if (response.status === 401 || response.status === 403) return failure('authentication', startedAt)
      if (response.status === 402) return failure('insufficient-balance', startedAt)
      if (isModelError(payload)) return failure('model', startedAt)
      if (response.status === 404) return failure('address', startedAt)
      if (response.status === 429) return failure('rate-limit', startedAt)
      if (response.status >= 500 && response.status <= 599) return failure('server', startedAt)
      return failure('unexpected', startedAt)
    } catch (error) {
      const name = error instanceof Error ? error.name : ''
      return failure(name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'network', startedAt)
    }
  }
}
