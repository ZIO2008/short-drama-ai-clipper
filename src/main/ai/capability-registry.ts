import type { ProviderProfile } from '../services/provider-profile-service.js'

export const AI_CAPABILITIES = ['asr', 'text-analysis', 'multimodal-review', 'tts'] as const
export type AiCapability = (typeof AI_CAPABILITIES)[number]

export type CapabilityAvailability =
  | { mode: 'controlled'; reason: 'no-profile' | 'missing-secret' | 'local-endpoint-required' }
  | { mode: 'configured'; profile: ProviderProfile }

export const resolveCapability = (profiles: readonly ProviderProfile[], capability: AiCapability, hasValidSecret: (secretRef: string) => boolean = () => true): CapabilityAvailability => {
  const profile = profiles.find((candidate) => candidate.capability === capability)
  if (!profile) return { mode: 'controlled', reason: 'no-profile' }
  if (profile.region === 'local') return profile.endpoint ? { mode: 'configured', profile } : { mode: 'controlled', reason: 'local-endpoint-required' }
  if (!profile.secretRef || !hasValidSecret(profile.secretRef)) return { mode: 'controlled', reason: 'missing-secret' }
  return { mode: 'configured', profile }
}

export const assertConfiguredCapability = (profiles: readonly ProviderProfile[], capability: AiCapability): ProviderProfile => {
  const resolved = resolveCapability(profiles, capability)
  if (resolved.mode === 'configured') return resolved.profile
  throw new Error(resolved.reason === 'no-profile' ? `未配置 ${capability} 能力，请前往设置。` : `${capability} 能力缺少密钥，请前往设置。`)
}
