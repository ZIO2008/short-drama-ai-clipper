import { describe, expect, it, vi } from 'vitest'
import { DeepSeekConfigurationTestService } from './deepseek-configuration-test-service.js'

const savedRef = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
const input = { capability: 'text-analysis' as const, provider: 'DeepSeek API' as const, endpoint: 'https://api.deepseek.com', model: 'deepseek-v4-flash', timeoutSeconds: 60 }
const profile = { id: 'text', capability: 'text-analysis', region: 'cn', provider: 'DeepSeek API', endpoint: input.endpoint, model: input.model, secretRef: savedRef, timeoutMs: 60_000, pricing: null }
const response = (status: number, payload: unknown): Response => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
const completion = (content: string | null, finishReason = 'stop') => ({ id: 'probe', object: 'chat.completion', created: 1, model: input.model, choices: [{ finish_reason: finishReason, message: { role: 'assistant', content } }] })
const successResult = (): { status: 'success'; elapsedMs: ReturnType<typeof expect.any> } => ({ status: 'success', elapsedMs: expect.any(Number) })
const failureResult = (category: string): { status: 'failure'; category: string; elapsedMs: ReturnType<typeof expect.any> } => ({ status: 'failure', category, elapsedMs: expect.any(Number) })
const expectSuccessResult = (value: unknown): void => { expect(value).toEqual(successResult()) }
const expectFailureResult = (value: unknown, category: string): void => { expect(value).toEqual(failureResult(category)) }

const setup = (fetchImpl: typeof fetch, profiles = [profile]) => {
  const secrets = { readPlaintextForMainProcess: vi.fn().mockReturnValue('saved-secret-value') }
  return { service: new DeepSeekConfigurationTestService({ list: () => profiles }, secrets, fetchImpl), secrets }
}

describe('DeepSeekConfigurationTestService', () => {
  it('sends exactly one fixed non-business probe with the saved secret and returns only elapsed success data', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, completion('do not expose'))) as unknown as typeof fetch
    const { service, secrets } = setup(fetchImpl)

    const result = await service.test(input)

    expectSuccessResult(result)
    expect(secrets.readPlaintextForMainProcess).toHaveBeenCalledWith(savedRef)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url] = vi.mocked(fetchImpl).mock.calls[0]!
    expect(String(url)).toBe('https://api.deepseek.com/v1/chat/completions')
  })

  it('uses a transient credential package without reading, saving, or replacing the saved key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, completion('ok'))) as unknown as typeof fetch
    const { service, secrets } = setup(fetchImpl)

    const result = await service.test({ ...input, transientCredential: { version: 1, schema: 'api-key', values: { apiKey: 'draft-secret-value' } } })
    expectSuccessResult(result)
    expect(secrets.readPlaintextForMainProcess).not.toHaveBeenCalled()
  })

  it.each([
    [401, { error: { message: 'invalid key' } }, 'authentication'],
    [403, { error: { message: 'forbidden' } }, 'authentication'],
    [400, { error: { code: 'model_not_found' } }, 'model'],
    [404, { error: { message: 'not found' } }, 'address'],
    [429, { error: { message: 'rate limited' } }, 'rate-limit'],
    [402, { error: { code: 'model_not_found' } }, 'insufficient-balance'],
    [503, { error: { message: 'internal response should stay private' } }, 'server']
  ] as const)('classifies HTTP %s with the fixed failure result shape', async (status, payload, category) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(status, payload)) as unknown as typeof fetch
    const { service } = setup(fetchImpl)
    const result = await service.test(input)

    expectFailureResult(result, category)
  })

  it('classifies timeout and network failures without forwarding error text', async () => {
    const timeoutError = Object.assign(new Error('do not disclose'), { name: 'TimeoutError' })
    const timeoutFetch = vi.fn().mockRejectedValue(timeoutError) as unknown as typeof fetch
    await expect(setup(timeoutFetch).service.test(input)).resolves.toEqual(failureResult('timeout'))
    const networkFetch = vi.fn().mockRejectedValue(new Error('private DNS details')) as unknown as typeof fetch
    const result = await setup(networkFetch).service.test(input)
    expectFailureResult(result, 'network')
  })

  it('rejects non-DeepSeek scopes, invalid addresses, and missing saved keys without sending a request', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { service } = setup(fetchImpl, [])

    await expect(service.test({ ...input, provider: 'OpenAI API' })).resolves.toEqual(failureResult('invalid-configuration'))
    await expect(service.test({ ...input, endpoint: 'http://api.deepseek.com' })).resolves.toEqual(failureResult('invalid-configuration'))
    await expect(service.test({ ...input, endpoint: 'https://user:pass@api.deepseek.com' })).resolves.toEqual(failureResult('invalid-configuration'))
    await expect(service.test(input)).resolves.toEqual(failureResult('missing-key'))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never resolves or sends a saved key to a non-DeepSeek host', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { service, secrets } = setup(fetchImpl)
    await expect(service.test({ ...input, endpoint: 'https://attacker.example/v1' })).resolves.toEqual(failureResult('invalid-configuration'))
    expect(secrets.readPlaintextForMainProcess).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never uses a saved non-DeepSeek text-analysis key for a DeepSeek test', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const otherProfile = { ...profile, provider: 'OpenAI API', secretRef: 'openai-secret-ref' }
    const { service, secrets } = setup(fetchImpl, [otherProfile])

    await expect(service.test(input)).resolves.toEqual(failureResult('missing-key'))
    expect(secrets.readPlaintextForMainProcess).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never sends a structured credential from another schema as a DeepSeek bearer key', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const protectedCredential = JSON.stringify({ version: 1, schema: 'tencent-cloud-secret-pair', values: { secretId: 'must-not-cross-provider-boundary', secretKey: 'must-not-leak' } })
    const guarded = new DeepSeekConfigurationTestService({ list: () => [profile] }, { readPlaintextForMainProcess: () => protectedCredential }, fetchImpl)

    await expect(guarded.test(input)).resolves.toEqual(failureResult('missing-key'))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('never sends a transient credential package from another schema as a DeepSeek bearer key', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { service } = setup(fetchImpl)

    await expect(service.test({ ...input, transientCredential: { version: 1, schema: 'tencent-cloud-secret-pair', values: { secretId: 'must-not-cross-provider-boundary', secretKey: 'must-not-leak' } } })).resolves.toEqual(failureResult('invalid-configuration'))
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects the removed transient plaintext field before reading or sending anything', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { service, secrets } = setup(fetchImpl)

    await expect(service.test({ ...input, transientSecret: 'removed-plaintext-field' })).resolves.toEqual(failureResult('invalid-configuration'))
    expect(secrets.readPlaintextForMainProcess).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not treat a successful HTTP status with an unparseable API result as connected', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { id: 'missing-choices' })) as unknown as typeof fetch
    await expect(setup(fetchImpl).service.test(input)).resolves.toEqual(failureResult('unexpected'))
  })

  it('does not treat an empty completion list as connected', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { choices: [] })) as unknown as typeof fetch
    await expect(setup(fetchImpl).service.test(input)).resolves.toEqual(failureResult('unexpected'))
  })

  it('accepts a valid completion whose content is empty because generation was truncated', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, completion('', 'length'))) as unknown as typeof fetch
    await expect(setup(fetchImpl).service.test(input)).resolves.toEqual(successResult())
  })

  it('accepts a valid completion whose nullable content is absent from the generated answer', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, completion(null))) as unknown as typeof fetch
    await expect(setup(fetchImpl).service.test(input)).resolves.toEqual(successResult())
  })

  it('does not accept an incomplete response merely because its nullable content exists', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { choices: [{ message: { content: null } }] })) as unknown as typeof fetch
    await expect(setup(fetchImpl).service.test(input)).resolves.toEqual(failureResult('unexpected'))
  })

  it('does not forward endpoint query or fragment data to the probe request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, completion('ok'))) as unknown as typeof fetch
    await expect(setup(fetchImpl).service.test({ ...input, endpoint: 'https://api.deepseek.com/v1/chat/completions?unsafe=value#fragment' })).resolves.toEqual(successResult())
    expect(String(vi.mocked(fetchImpl).mock.calls[0]?.[0])).toBe('https://api.deepseek.com/v1/chat/completions')
  })
})
