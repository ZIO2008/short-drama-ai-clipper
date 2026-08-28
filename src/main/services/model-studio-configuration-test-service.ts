import { z } from 'zod'
import { createHash, randomUUID } from 'node:crypto'
import type { ModelStudioConfigurationTestResult, ProviderProfile } from '../../shared/contracts.js'
import { MODEL_STUDIO_AUTOMATIC_MODEL_LABEL, MODEL_STUDIO_DISCOVERY_HOSTS, isModelStudioProvider } from '../../shared/provider-catalog.js'
import { credentialValuesFromStoredValue } from '../../shared/provider-auth-schema.js'
import { createModelStudioSelectionProof, type ModelStudioSelectionProof } from './model-studio-selection-proof.js'
import { selectModelStudioModel } from './model-studio-model-policy.js'

const modelStudioProviderSchema = z.string().trim().refine(isModelStudioProvider, 'provider must be Model Studio')
const inputSchema = z.object({ capability: z.enum(['asr', 'text-analysis', 'multimodal-review']), provider: modelStudioProviderSchema, endpoint: z.string().trim().min(1).max(2048), timeoutSeconds: z.number().int().min(1).max(600), secretRef: z.string().uuid().optional() }).strict()
type ProfileReader = { list: () => ProviderProfile[] }
type SecretReader = { readPlaintextForMainProcess: (secretRef: unknown) => string; canUseForModelStudioConfiguration: (secretRef: unknown, capability: unknown, ownerId: unknown) => boolean }
type FailureCategory = Extract<ModelStudioConfigurationTestResult, { status: 'failure' }>['category']
const failure = (category: FailureCategory, startedAt: number): ModelStudioConfigurationTestResult => ({ status: 'failure', category, elapsedMs: Math.max(0, Date.now() - startedAt) })

const isAllowedHost = (host: string): boolean => MODEL_STUDIO_DISCOVERY_HOSTS.includes(host)
const modelsUrlFor = (endpoint: URL): URL => {
  // The Renderer may select a regional official host, but never an arbitrary
  // bearer-token path. Model discovery is always the fixed compatible API.
  endpoint.pathname = '/compatible-mode/v1/models'
  endpoint.search = ''
  endpoint.hash = ''
  return endpoint
}
const modelListSchema = z.object({ object: z.literal('list'), data: z.array(z.object({ id: z.string().trim().min(1).max(200) }).passthrough()).max(500) }).passthrough()
const selectionInputSchema = z.object({ capability: z.enum(['asr', 'text-analysis', 'multimodal-review']), provider: modelStudioProviderSchema, endpoint: z.string().trim().min(1).max(2048), secretRef: z.string().uuid(), modelStudioSelectionToken: z.string().uuid() }).strict()
type Selection = { capability: 'asr' | 'text-analysis' | 'multimodal-review'; endpoint: string; model: string; secretRef: string | null; secretHash: string; ownerId: string | null; expiresAt: number }
const secretHash = (secret: string): string => createHash('sha256').update(secret).digest('hex')
const apiKeyFromCredential = (value: string): string => credentialValuesFromStoredValue(value, 'api-key')?.apiKey ?? ''

export class ModelStudioConfigurationTestService {
  private readonly selections = new Map<string, Selection>()
  constructor(private readonly profiles: ProfileReader, private readonly secrets: SecretReader, private readonly fetchImpl: typeof fetch = fetch) {}
  consumeSelection(input: unknown, ownerId?: unknown): ModelStudioSelectionProof | null {
    const parsed = selectionInputSchema.safeParse(input)
    if (!parsed.success) return null
    const selection = this.selections.get(parsed.data.modelStudioSelectionToken)
    if (!selection || selection.expiresAt < Date.now() || selection.capability !== parsed.data.capability || selection.endpoint !== parsed.data.endpoint || selection.secretRef !== parsed.data.secretRef || selection.ownerId !== (typeof ownerId === 'string' ? ownerId : null) || !this.secrets.canUseForModelStudioConfiguration(parsed.data.secretRef, parsed.data.capability, ownerId)) return null
    try {
      const apiKey = apiKeyFromCredential(this.secrets.readPlaintextForMainProcess(parsed.data.secretRef))
      if (!apiKey || selection.secretHash !== secretHash(apiKey)) return null
    } catch { return null }
    this.selections.delete(parsed.data.modelStudioSelectionToken)
    return createModelStudioSelectionProof(selection.model)
  }
  async test(input: unknown, ownerId?: unknown): Promise<ModelStudioConfigurationTestResult> {
    const startedAt = Date.now(); const parsed = inputSchema.safeParse(input)
    if (!parsed.success) return failure('invalid-configuration', startedAt)
    let endpoint: URL
    try { endpoint = new URL(parsed.data.endpoint); if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || !isAllowedHost(endpoint.hostname.toLowerCase()) || (endpoint.port && endpoint.port !== '443')) return failure('invalid-configuration', startedAt) } catch { return failure('invalid-configuration', startedAt) }
    const profile = this.profiles.list().find((item) => item.capability === parsed.data.capability && isModelStudioProvider(item.provider))
    const secretRef = parsed.data.secretRef ?? profile?.secretRef ?? null
    if (!secretRef || !this.secrets.canUseForModelStudioConfiguration(secretRef, parsed.data.capability, ownerId)) return failure('missing-key', startedAt)
    let secret: string
    try { secret = apiKeyFromCredential(this.secrets.readPlaintextForMainProcess(secretRef)) } catch { return failure('missing-key', startedAt) }
    if (!secret) return failure('missing-key', startedAt)
    try {
      const response = await this.fetchImpl(modelsUrlFor(endpoint), { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(parsed.data.timeoutSeconds * 1000), headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' } })
      let payload: unknown = null; try { payload = await response.json() } catch { /* response bodies stay in main */ }
      if (response.ok) {
        const models = modelListSchema.safeParse(payload)
        if (!models.success) return failure('unexpected', startedAt)
        const ids = models.data.data.slice(0, 500).map((item) => item.id)
        const selectedModel = selectModelStudioModel(parsed.data.capability, ids)
        if (!selectedModel) return failure('no-compatible-model', startedAt)
        const selectionToken = randomUUID()
        this.selections.set(selectionToken, { capability: parsed.data.capability, endpoint: parsed.data.endpoint, model: selectedModel, secretRef, secretHash: secretHash(secret), ownerId: typeof ownerId === 'string' ? ownerId : null, expiresAt: Date.now() + 60_000 })
        return { status: 'success', selectedModelLabel: MODEL_STUDIO_AUTOMATIC_MODEL_LABEL, selectionToken, elapsedMs: Math.max(0, Date.now() - startedAt) }
      }
      if (response.status === 401 || response.status === 403) return failure('authentication', startedAt)
      if (response.status === 404) return failure('address', startedAt)
      if (response.status === 429) return failure('rate-limit', startedAt)
      if (response.status >= 500 && response.status <= 599) return failure('server', startedAt)
      return failure('unexpected', startedAt)
    } catch (error) { const name = error instanceof Error ? error.name : ''; return failure(name === 'AbortError' || name === 'TimeoutError' ? 'timeout' : 'network', startedAt) }
  }
}
