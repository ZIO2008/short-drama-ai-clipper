import type { ProviderProfile } from '../services/provider-profile-service.js'
import { isModelStudioProvider, isProviderModelGuidanceValue } from '../../shared/provider-catalog.js'
import { isModelStudioAutomaticModel } from '../services/model-studio-model-policy.js'

export const AI_CAPABILITIES = ['asr', 'text-analysis', 'multimodal-review', 'tts'] as const
export type AiCapability = (typeof AI_CAPABILITIES)[number]

export type CapabilityAvailability =
  | { mode: 'controlled'; reason: 'no-profile' | 'missing-secret' | 'unreadable-secret' | 'local-endpoint-required' | 'model-required' }
  | { mode: 'configured'; profile: ProviderProfile }

export const resolveCapability = (profiles: readonly ProviderProfile[], capability: AiCapability, getSecretAvailability: (secretRef: string) => boolean | 'unreadable' = () => true): CapabilityAvailability => {
  const profile = profiles.find((candidate) => candidate.capability === capability)
  if (!profile) return { mode: 'controlled', reason: 'no-profile' }
  const secretAvailability = profile.secretRef ? getSecretAvailability(profile.secretRef) : false
  if (secretAvailability === 'unreadable') return { mode: 'controlled', reason: 'unreadable-secret' }
  if (!profile.model || isProviderModelGuidanceValue(profile.model) || (isModelStudioProvider(profile.provider) && (!isModelStudioAutomaticModel(profile.model) || profile.modelSelectionSource !== 'model-studio-automatic'))) return { mode: 'controlled', reason: 'model-required' }
  if (profile.region === 'local') return profile.endpoint ? { mode: 'configured', profile } : { mode: 'controlled', reason: 'local-endpoint-required' }
  if (!profile.secretRef || secretAvailability === false) return { mode: 'controlled', reason: 'missing-secret' }
  return { mode: 'configured', profile }
}

export const assertConfiguredCapability = (profiles: readonly ProviderProfile[], capability: AiCapability): ProviderProfile => {
  const resolved = resolveCapability(profiles, capability)
  if (resolved.mode === 'configured') return resolved.profile
  throw new Error(resolved.reason === 'no-profile' ? `未配置 ${capability} 能力，请前往设置。` : resolved.reason === 'model-required' ? `${capability} 能力尚未取得可用模型；目录方案会在保存时自动选择，请检查密钥和账户开通状态。` : `${capability} 能力缺少密钥，请前往设置。`)
}
