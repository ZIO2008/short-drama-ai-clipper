import type { ProviderCapability } from '../../shared/provider-catalog.js'

type ModelCandidate = { id: string }

// Raw Model Studio IDs are an execution policy, not UI data. Keep this
// module main-process-only so the Renderer can neither see nor submit them.
const MULTIMODAL_MODEL_PRIORITY = [
  { id: 'qwen3.7-flash' },
  { id: 'qwen3.6-flash' },
  { id: 'qwen3.7-plus' },
  { id: 'qwen3.6-plus' }
] as const satisfies readonly ModelCandidate[]

const ASR_MODEL_PRIORITY = [
  { id: 'paraformer-v2' }
] as const satisfies readonly ModelCandidate[]

const automaticModelIds = new Set<string>([
  ...ASR_MODEL_PRIORITY,
  ...MULTIMODAL_MODEL_PRIORITY
].map(({ id }) => id))

const selectFrom = (availableModelIds: readonly string[], candidates: readonly ModelCandidate[]): string | null => (
  candidates.find(({ id }) => availableModelIds.includes(id))?.id ?? null
)

export const selectModelStudioModel = (capability: ProviderCapability, availableModelIds: readonly string[]): string | null => {
  if (capability === 'asr') return selectFrom(availableModelIds, ASR_MODEL_PRIORITY)
  return selectFrom(availableModelIds, MULTIMODAL_MODEL_PRIORITY)
}

export const isModelStudioAutomaticModel = (model: string | null | undefined): boolean => (
  typeof model === 'string' && automaticModelIds.has(model.trim())
)
