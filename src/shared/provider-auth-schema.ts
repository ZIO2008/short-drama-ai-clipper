import { z } from 'zod'

export const PROVIDER_AUTH_SCHEMA_IDS = ['none', 'api-key', 'tencent-cloud-secret-pair'] as const
export type ProviderAuthSchemaId = (typeof PROVIDER_AUTH_SCHEMA_IDS)[number]

export type ProviderAuthField = {
  key: string
  label: string
  placeholder: string
  required: boolean
}

export type ProviderAuthSchema = {
  id: ProviderAuthSchemaId
  fields: readonly ProviderAuthField[]
  requiresCredentialOnInitialSave: boolean
}

export type ProviderCredentialPackage = {
  version: 1
  schema: Exclude<ProviderAuthSchemaId, 'none'>
  values: Record<string, string>
}

const authSchemas: Record<ProviderAuthSchemaId, ProviderAuthSchema> = {
  none: { id: 'none', fields: [], requiresCredentialOnInitialSave: false },
  'api-key': {
    id: 'api-key',
    fields: [{ key: 'apiKey', label: 'API 密钥', placeholder: '请输入 API 密钥', required: true }],
    requiresCredentialOnInitialSave: false
  },
  'tencent-cloud-secret-pair': {
    id: 'tencent-cloud-secret-pair',
    fields: [
      { key: 'secretId', label: 'SecretId', placeholder: '请输入 SecretId', required: true },
      { key: 'secretKey', label: 'SecretKey', placeholder: '请输入 SecretKey', required: true }
    ],
    requiresCredentialOnInitialSave: true
  }
}

const credentialPackageSchema = z.object({
  version: z.literal(1),
  schema: z.enum(['api-key', 'tencent-cloud-secret-pair']),
  values: z.record(z.string(), z.string().trim().min(1).max(4096))
}).strict()

export const providerAuthSchemaForId = (id: ProviderAuthSchemaId): ProviderAuthSchema => authSchemas[id]

export const hasCredentialValues = (values: Readonly<Record<string, string>>): boolean => Object.values(values).some((value) => value.trim().length > 0)

export const createProviderCredentialPackage = (schema: ProviderAuthSchema, values: Readonly<Record<string, string>>): ProviderCredentialPackage => {
  if (schema.id === 'none') throw new Error('本地方案不需要保存凭据。')
  const normalizedValues: Record<string, string> = {}
  for (const field of schema.fields) {
    const value = values[field.key]?.trim() ?? ''
    if (field.required && !value) throw new Error(`${field.label}不能为空。`)
    if (value) normalizedValues[field.key] = value
  }
  return credentialPackageSchema.parse({ version: 1, schema: schema.id, values: normalizedValues })
}

export const parseProviderCredentialPackage = (value: unknown, expectedSchema: Exclude<ProviderAuthSchemaId, 'none'>): ProviderCredentialPackage | null => {
  const parsed = credentialPackageSchema.safeParse(value)
  return parsed.success && parsed.data.schema === expectedSchema ? parsed.data : null
}

// Existing installations saved a raw API key or Tencent's original object.
// Read them only for compatibility; every new write uses the package above.
export const credentialValuesFromStoredValue = (value: string, expectedSchema: Exclude<ProviderAuthSchemaId, 'none'>): Record<string, string> | null => {
  try {
    const parsedValue: unknown = JSON.parse(value)
    const packaged = parseProviderCredentialPackage(parsedValue, expectedSchema)
    if (packaged) return packaged.values
    if (expectedSchema === 'tencent-cloud-secret-pair') {
      const legacy = z.object({ version: z.literal(1), provider: z.literal('tencent-cloud-asr'), secretId: z.string().trim().min(1).max(4096), secretKey: z.string().trim().min(1).max(4096) }).safeParse(parsedValue)
      if (legacy.success) return { secretId: legacy.data.secretId, secretKey: legacy.data.secretKey }
      const legacyUppercase = z.object({ version: z.literal(1), provider: z.literal('tencent-cloud-asr'), SecretId: z.string().trim().min(1).max(4096), SecretKey: z.string().trim().min(1).max(4096) }).safeParse(parsedValue)
      return legacyUppercase.success ? { secretId: legacyUppercase.data.SecretId, secretKey: legacyUppercase.data.SecretKey } : null
    }
    return null
  } catch {
    // A raw API key is the only supported non-JSON legacy value.
    return expectedSchema === 'api-key' && value.trim() ? { apiKey: value.trim() } : null
  }
}
