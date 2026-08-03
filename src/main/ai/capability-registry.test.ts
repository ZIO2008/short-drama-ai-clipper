import { describe, expect, it } from 'vitest'
import { assertConfiguredCapability, resolveCapability } from './capability-registry.js'

const profile = { id: 'p1', capability: 'tts', region: 'cn', provider: 'test', endpoint: 'https://example.com', model: 'test', secretRef: 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321', timeoutMs: 30000, pricing: null }

describe('capability registry', () => {
  it('uses controlled mode until a capability has an opaque secret reference', () => {
    expect(resolveCapability([], 'tts')).toEqual({ mode: 'controlled', reason: 'no-profile' })
    expect(resolveCapability([{ ...profile, secretRef: null }], 'tts')).toEqual({ mode: 'controlled', reason: 'missing-secret' })
  })

  it('returns configured profiles without exposing any secret value', () => {
    expect(assertConfiguredCapability([profile], 'tts')).toEqual(profile)
    expect(() => assertConfiguredCapability([], 'tts')).toThrow('未配置 tts 能力')
  })

  it('treats a stale secret reference as missing when the secret store cannot resolve it', () => {
    expect(resolveCapability([profile], 'tts', () => false)).toEqual({ mode: 'controlled', reason: 'missing-secret' })
  })

  it('treats a local provider with an endpoint as configured without inventing a cloud secret', () => {
    expect(resolveCapability([{ ...profile, capability: 'asr', region: 'local', secretRef: null, endpoint: 'http://127.0.0.1:8080' }], 'asr')).toMatchObject({ mode: 'configured' })
    expect(resolveCapability([{ ...profile, capability: 'asr', region: 'local', secretRef: null, endpoint: null }], 'asr')).toEqual({ mode: 'controlled', reason: 'local-endpoint-required' })
  })
})
