import type { ClipCandidateGenerationInput } from '../../shared/contracts.js'
import type { ProviderProfile } from './provider-profile-service.js'

export type ClipGenerationPackageIdentity = {
  id: string
  episodeId: string
  version: number
  sourceMediaFingerprint: string
  ruleVersion: string
}

export type ClipGenerationProviderSnapshot = {
  id: string
  capability: string
  region: string
  provider: string
  endpoint: string | null
  model: string | null
  modelSelectionSource: 'model-studio-automatic' | null
  secretRef: string | null
  timeoutMs: number | null
  pricing: string | null
}

export type ClipGenerationProviderChainSnapshot = {
  textAnalysis: ClipGenerationProviderSnapshot
  multimodalReview: ClipGenerationProviderSnapshot | null
}

export const snapshotClipGenerationProvider = (profile: ProviderProfile): ClipGenerationProviderSnapshot => ({
  id: profile.id,
  capability: profile.capability,
  region: profile.region,
  provider: profile.provider,
  endpoint: profile.endpoint,
  model: profile.model,
  modelSelectionSource: profile.modelSelectionSource ?? null,
  secretRef: profile.secretRef,
  timeoutMs: profile.timeoutMs,
  pricing: profile.pricing,
})

export const clipGenerationProviderMatches = (profile: ProviderProfile, snapshot: ClipGenerationProviderSnapshot): boolean =>
  JSON.stringify(snapshotClipGenerationProvider(profile)) === JSON.stringify(snapshot)

export const buildClipGenerationProviderChain = (textAnalysis: ProviderProfile, profiles: readonly ProviderProfile[], hasValidSecret: (secretRef: string) => boolean, requireMultimodal: boolean): ClipGenerationProviderChainSnapshot => {
  const multimodal = profiles.find((profile) => profile.capability === 'multimodal-review')
  const multimodalAvailable = Boolean(multimodal?.endpoint && multimodal.model && (multimodal.region === 'local' || (multimodal.secretRef && hasValidSecret(multimodal.secretRef))))
  if (requireMultimodal && !multimodalAvailable) throw new Error('本轮候选包含必须视频复核的片段，但缺少可用且可冻结的视频复核能力。')
  return { textAnalysis: snapshotClipGenerationProvider(textAnalysis), multimodalReview: multimodal && multimodalAvailable ? snapshotClipGenerationProvider(multimodal) : null }
}

export const buildClipGenerationRequestKey = (
  dramaId: string,
  input: ClipCandidateGenerationInput,
  provider: ClipGenerationProviderChainSnapshot,
  packages: readonly ClipGenerationPackageIdentity[],
): string => JSON.stringify({
  version: 2,
  dramaId,
  generation: { ...input, episodeIds: [...input.episodeIds].sort() },
  eligiblePackages: [...packages]
    .sort((left, right) => left.episodeId.localeCompare(right.episodeId) || left.version - right.version || left.id.localeCompare(right.id))
    .map(({ id, episodeId, version, sourceMediaFingerprint, ruleVersion }) => ({ id, episodeId, version, sourceMediaFingerprint, ruleVersion })),
  provider,
})
