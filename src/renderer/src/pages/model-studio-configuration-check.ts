import type { ModelStudioConfigurationTestResult, ProviderProfile } from '../../../shared/contracts.js'
import { MODEL_STUDIO_PROVIDER } from '../../../shared/provider-catalog.js'
import { createProviderCredentialPackage, providerAuthSchemaForId } from '../../../shared/provider-auth-schema.js'
import { input } from './provider-settings-bridge-support.js'

type Capability = 'asr' | 'text-analysis' | 'multimodal-review'
type Params = { document: Document; capability: Capability; profiles: ReadonlyMap<string, ProviderProfile> }

export const runModelStudioConfigurationCheck = async ({ document, capability, profiles }: Params): Promise<ModelStudioConfigurationTestResult> => {
  const draftSecret = input(document, capability, 'secret')?.value.trim() ?? ''
  const existingSecretRef = profiles.get(capability)?.secretRef ?? null
  const provisionalSecretRef = draftSecret ? crypto.randomUUID() : null
  try {
    if (provisionalSecretRef) await window.desktopApi.saveModelStudioProvisionalCredential(createProviderCredentialPackage(providerAuthSchemaForId('api-key'), { apiKey: draftSecret }), provisionalSecretRef, capability)
    const secretRef = provisionalSecretRef ?? existingSecretRef
    return secretRef
      ? await window.desktopApi.testModelStudioMultimodalConfiguration({ capability, provider: MODEL_STUDIO_PROVIDER, endpoint: input(document, capability, 'endpoint')?.value.trim() ?? '', timeoutSeconds: Number(input(document, capability, 'timeout')?.value ?? '0'), secretRef })
      : { status: 'failure', category: 'missing-key', elapsedMs: 0 }
  } catch {
    return { status: 'failure', category: 'network', elapsedMs: 0 }
  } finally {
    if (provisionalSecretRef) await window.desktopApi.deleteSecret(provisionalSecretRef).catch(() => undefined)
  }
}
