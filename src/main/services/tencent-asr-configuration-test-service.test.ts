import { describe, expect, it, vi } from 'vitest'
import { TencentAsrConfigurationTestService } from './tencent-asr-configuration-test-service.js'

const secretRef = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
const input = { capability: 'asr' as const, provider: '腾讯云 ASR' as const, endpoint: 'https://asr.tencentcloudapi.com', timeoutSeconds: 60 }
const profile = { id: 'asr', capability: 'asr', region: 'cn', provider: '腾讯云 ASR', endpoint: input.endpoint, model: '16k_zh', secretRef, timeoutMs: 60_000, pricing: null }
const response = (status: number, payload: unknown): Response => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
const success = (): { status: 'success'; elapsedMs: ReturnType<typeof expect.any> } => ({ status: 'success', elapsedMs: expect.any(Number) })
const failure = (category: string): { status: 'failure'; category: string; elapsedMs: ReturnType<typeof expect.any> } => ({ status: 'failure', category, elapsedMs: expect.any(Number) })
const storedCredential = JSON.stringify({ version: 1, provider: 'tencent-cloud-asr', secretId: 'secret-id-value', secretKey: 'secret-key-value' })

const setup = (fetchImpl: typeof fetch, profiles = [profile]) => {
  const secrets = { readPlaintextForMainProcess: vi.fn().mockReturnValue(storedCredential) }
  return { service: new TencentAsrConfigurationTestService({ list: () => profiles }, secrets, fetchImpl, () => 1_700_000_000_000), secrets }
}

describe('TencentAsrConfigurationTestService', () => {
  it('reports malformed saved credentials as invalid without exposing their contents', () => {
    const secrets = { readPlaintextForMainProcess: vi.fn().mockReturnValue('legacy-single-secret') }
    const service = new TencentAsrConfigurationTestService({ list: () => [profile] }, secrets)

    expect(service.getStoredCredentialStatus()).toBe('invalid')
    expect(secrets.readPlaintextForMainProcess).toHaveBeenCalledWith(secretRef)
  })

  it('reports absent saved credentials without attempting to read a secret', () => {
    const secrets = { readPlaintextForMainProcess: vi.fn() }
    const service = new TencentAsrConfigurationTestService({ list: () => [{ ...profile, secretRef: null }] }, secrets)

    expect(service.getStoredCredentialStatus()).toBe('missing')
    expect(secrets.readPlaintextForMainProcess).not.toHaveBeenCalled()
  })

  it('sends one fixed TC3-signed probe and treats the expected missing-task response as success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { Response: { Error: { Code: 'InvalidParameterValue.InvalidTaskId' } } })) as unknown as typeof fetch
    const { service, secrets } = setup(fetchImpl)

    await expect(service.test(input)).resolves.toEqual(success())
    expect(secrets.readPlaintextForMainProcess).toHaveBeenCalledWith(secretRef)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, options] = vi.mocked(fetchImpl).mock.calls[0]!
    expect(String(url)).toBe('https://asr.tencentcloudapi.com')
    expect(options?.method).toBe('POST')
    expect(options?.body).toBe('{"TaskId":0}')
    expect(options?.headers).toEqual(expect.objectContaining({ 'X-TC-Action': 'DescribeTaskStatus', 'X-TC-Version': '2019-06-14', 'X-TC-Timestamp': '1700000000' }))
    expect(String((options?.headers as Record<string, string>).Authorization)).toMatch(/^TC3-HMAC-SHA256 Credential=secret-id-value\//)
    expect(JSON.stringify(options)).not.toContain('secret-key-value')
  })

  it('uses a transient credential package without reading or replacing the saved credential', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { Response: { Error: { Code: 'ResourceNotFound.TaskNotExist' } } })) as unknown as typeof fetch
    const { service, secrets } = setup(fetchImpl)

    await expect(service.test({ ...input, transientCredential: { version: 1, schema: 'tencent-cloud-secret-pair', values: { secretId: 'draft-id', secretKey: 'draft-key' } } })).resolves.toEqual(success())
    expect(secrets.readPlaintextForMainProcess).not.toHaveBeenCalled()
  })

  it.each([
    [200, { Response: { Error: { Code: 'AuthFailure.SignatureFailure' } } }, 'authentication'],
    [200, { Response: { Error: { Code: 'SignatureFailure' } } }, 'authentication'],
    [429, { Response: { Error: { Code: 'RequestLimitExceeded' } } }, 'rate-limit'],
    [503, { Response: { Error: { Code: 'InternalError' } } }, 'server']
  ] as const)('classifies Tencent response failures without returning their body', async (status, payload, category) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(status, payload)) as unknown as typeof fetch
    await expect(setup(fetchImpl).service.test(input)).resolves.toEqual(failure(category))
  })

  it('rejects a transient credential package with the wrong schema and an unsafe endpoint before reading or sending anything', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { service, secrets } = setup(fetchImpl)
    await expect(service.test({ ...input, transientCredential: { version: 1, schema: 'api-key', values: { apiKey: 'only-one' } } })).resolves.toEqual(failure('invalid-configuration'))
    await expect(service.test({ ...input, endpoint: 'https://user:pass@asr.tencentcloudapi.com' })).resolves.toEqual(failure('invalid-configuration'))
    await expect(service.test({ ...input, endpoint: 'https://attacker.example' })).resolves.toEqual(failure('invalid-configuration'))
    expect(secrets.readPlaintextForMainProcess).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('classifies timeout and network failures without forwarding error details', async () => {
    const timeout = Object.assign(new Error('private timeout'), { name: 'TimeoutError' })
    await expect(setup(vi.fn().mockRejectedValue(timeout) as unknown as typeof fetch).service.test(input)).resolves.toEqual(failure('timeout'))
    await expect(setup(vi.fn().mockRejectedValue(new Error('private DNS')) as unknown as typeof fetch).service.test(input)).resolves.toEqual(failure('network'))
  })
})
