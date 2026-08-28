import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { isModelStudioProvider, isProviderModelGuidanceValue, MODEL_STUDIO_PROVIDER } from '../../shared/provider-catalog.js'
import { isModelStudioSelectionProof, type ModelStudioSelectionProof } from './model-studio-selection-proof.js'
import { isModelStudioAutomaticModel } from './model-studio-model-policy.js'

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max)
const providerCapabilities = ['asr', 'text-analysis', 'multimodal-review'] as const
const legacyProviderCapabilities = ['text_semantics', 'video_understanding'] as const
const providerCapabilitySchema = z.enum([...providerCapabilities, ...legacyProviderCapabilities])
const endpointSchema = z.string().trim().max(2048).url().refine((value) => {
  const parsed = new URL(value)
  return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && !parsed.username && !parsed.password
}, 'endpoint must be an http(s) URL without embedded credentials')
const profileSchema = z.object({
  capability: providerCapabilitySchema,
  region: nonEmptyText(100),
  provider: nonEmptyText(100),
  endpoint: endpointSchema.nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  secretRef: z.string().uuid().nullable().optional(),
  timeoutMs: z.number().int().positive().max(600000).nullable().optional(),
  pricing: z.string().trim().max(500).nullable().optional(),
})

const normalizeCapability = (capability: string): string => ({ text_semantics: 'text-analysis', video_understanding: 'multimodal-review' }[capability] ?? capability)

export type ProviderProfile = {
  id: string
  capability: string
  region: string
  provider: string
  endpoint: string | null
  model: string | null
  modelSelectionSource?: 'model-studio-automatic' | null
  secretRef: string | null
  timeoutMs: number | null
  pricing: string | null
}

export class ProviderProfileService {
  constructor(private readonly database: Database.Database) {}

  save(input: unknown): string { return this.saveInternal(input, false) }
  saveModelStudioSelection(input: unknown, proof: ModelStudioSelectionProof): string {
    if (!isModelStudioSelectionProof(proof)) throw new Error('百炼模型必须使用本次主进程自动选型结果保存。')
    const parsed = profileSchema.parse(input)
    return this.saveInternal({ ...parsed, model: proof.selectedModel }, true)
  }

  private saveInternal(input: unknown, modelStudioVerified: boolean): string {
    const parsed = profileSchema.parse(input)
    const profile = { ...parsed, capability: normalizeCapability(parsed.capability), provider: isModelStudioProvider(parsed.provider) ? MODEL_STUDIO_PROVIDER : parsed.provider }
    if (isProviderModelGuidanceValue(profile.model)) throw new Error('模型仍是目录引导文案，请填写已开通的实际模型 ID 后保存。')
    const modelStudio = isModelStudioProvider(profile.provider)
    if (modelStudio && (!modelStudioVerified || !isModelStudioAutomaticModel(profile.model))) throw new Error('百炼目录方案的模型必须由应用从已开通模型中自动选择。')
    const now = new Date().toISOString()
    // A capability has one local global default. Upsert it in a transaction so
    // repeated saves update the existing profile instead of accumulating rows.
    const save = this.database.transaction(() => {
      const existing = this.database.prepare('SELECT id, secret_ref AS secretRef FROM provider_profiles WHERE capability = ? ORDER BY updated_at DESC LIMIT 1').get(profile.capability) as { id: string; secretRef: string | null } | undefined
      const id = existing?.id ?? randomUUID()
      const secretRef = profile.secretRef ?? existing?.secretRef ?? null
      const modelSelectionSource = modelStudioVerified ? 'model-studio-automatic' : null
      if (existing) {
        this.database.prepare('UPDATE provider_profiles SET region = ?, provider = ?, endpoint = ?, model = ?, model_selection_source = ?, secret_ref = ?, pricing_json = ?, timeout_ms = ?, updated_at = ? WHERE id = ?').run(
          profile.region, profile.provider, profile.endpoint ?? null, profile.model ?? null,
          modelSelectionSource, secretRef, profile.pricing ?? null, profile.timeoutMs ?? null, now, id,
        )
        // Clean up any legacy duplicate defaults before the unique index is applied.
        this.database.prepare('DELETE FROM provider_profiles WHERE capability = ? AND id <> ?').run(profile.capability, id)
      } else {
        this.database.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, model_selection_source, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
          id, profile.capability, profile.region, profile.provider, profile.endpoint ?? null,
          profile.model ?? null, modelSelectionSource, secretRef, profile.pricing ?? null, profile.timeoutMs ?? null, now, now,
        )
      }
      if (modelStudioVerified && secretRef) this.database.prepare('DELETE FROM model_studio_provisional_secrets WHERE secret_ref = ?').run(secretRef)
      return id
    })
    return save()
  }

  list(): ProviderProfile[] {
    // P2 narration/TTS profiles may exist in historical local databases, but
    // are deliberately not a production provider surface while P2 is frozen.
    return this.database.prepare('SELECT id, capability, region, provider, endpoint, model, model_selection_source AS modelSelectionSource, secret_ref AS secretRef, timeout_ms AS timeoutMs, pricing_json AS pricing FROM provider_profiles WHERE capability IN (?, ?, ?) ORDER BY updated_at DESC').all(...providerCapabilities) as ProviderProfile[]
  }
}
