import { describe, expect, it } from 'vitest'
import { createProviderCredentialPackage, credentialValuesFromStoredValue, providerAuthSchemaForId } from './provider-auth-schema.js'
import { providerAuthSchemaIdForProvider } from './provider-catalog.js'

describe('provider authentication schemas', () => {
  it('declares Tencent Cloud ASR as a two-field credential without changing the API-key schema', () => {
    expect(providerAuthSchemaForId(providerAuthSchemaIdForProvider('腾讯云 ASR')).fields.map((field) => field.key)).toEqual(['secretId', 'secretKey'])
    expect(providerAuthSchemaForId(providerAuthSchemaIdForProvider('DeepSeek API')).fields.map((field) => field.key)).toEqual(['apiKey'])
  })

  it('writes a versioned package and continues to read legacy records', () => {
    const schema = providerAuthSchemaForId(providerAuthSchemaIdForProvider('腾讯云 ASR'))
    expect(createProviderCredentialPackage(schema, { secretId: 'id', secretKey: 'key' })).toEqual({ version: 1, schema: 'tencent-cloud-secret-pair', values: { secretId: 'id', secretKey: 'key' } })
    expect(credentialValuesFromStoredValue(JSON.stringify({ version: 1, provider: 'tencent-cloud-asr', secretId: 'old-id', secretKey: 'old-key' }), 'tencent-cloud-secret-pair')).toEqual({ secretId: 'old-id', secretKey: 'old-key' })
    expect(credentialValuesFromStoredValue(JSON.stringify({ version: 1, provider: 'tencent-cloud-asr', SecretId: 'old-uppercase-id', SecretKey: 'old-uppercase-key' }), 'tencent-cloud-secret-pair')).toEqual({ secretId: 'old-uppercase-id', secretKey: 'old-uppercase-key' })
    expect(credentialValuesFromStoredValue('legacy-api-key', 'api-key')).toEqual({ apiKey: 'legacy-api-key' })
    expect(credentialValuesFromStoredValue(JSON.stringify({ version: 1, schema: 'tencent-cloud-secret-pair', values: { secretId: 'must-not-be-used-as-api-key', secretKey: 'must-not-leak' } }), 'api-key')).toBeNull()
  })
})
