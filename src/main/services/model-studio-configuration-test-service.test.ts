import { describe, expect, it, vi } from 'vitest'
import { ModelStudioConfigurationTestService } from './model-studio-configuration-test-service.js'

const secretRef = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
const input = { capability: 'multimodal-review' as const, provider: '阿里云百炼 / Model Studio' as const, endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', timeoutSeconds: 60 }
const profile = { id: 'review', capability: 'multimodal-review', region: 'cn', provider: input.provider, endpoint: input.endpoint, model: '请按开通模型填写', secretRef, timeoutMs: 60_000, pricing: null }
const response = (status: number, payload: unknown): Response => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })

const setup = (fetchImpl: typeof fetch, readSecret = (_secretRef: unknown) => 'secret-that-must-stay-main') => new ModelStudioConfigurationTestService(
  { list: () => [profile] },
  { readPlaintextForMainProcess: vi.fn(readSecret), canUseForModelStudioConfiguration: vi.fn().mockReturnValue(true) },
  fetchImpl,
)

describe('ModelStudioConfigurationTestService', () => {
  it('uses only the official model directory and chooses the product-priority compatible model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { object: 'list', data: [{ id: 'text-model' }, { id: 'qwen3.7-plus' }, { id: 'qwen3.7-flash' }] })) as unknown as typeof fetch

    await expect(setup(fetchImpl).test(input)).resolves.toEqual({ status: 'success', selectedModelLabel: '已自动选择兼容模型', selectionToken: expect.any(String), elapsedMs: expect.any(Number) })
    expect(String(vi.mocked(fetchImpl).mock.calls[0]![0])).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/models')
  })

  it('does not claim that a model list without a compatible vision model is usable', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { object: 'list', data: [{ id: 'text-model' }] })) as unknown as typeof fetch

    await expect(setup(fetchImpl).test(input)).resolves.toEqual({ status: 'failure', category: 'no-compatible-model', elapsedMs: expect.any(Number) })
  })

  it('never lets a Renderer-supplied path choose the bearer-token request target', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { object: 'list', data: [{ id: 'qwen3.7-flash' }] })) as unknown as typeof fetch

    await expect(setup(fetchImpl).test({ ...input, endpoint: 'https://dashscope.aliyuncs.com/arbitrary/path?keep=no' })).resolves.toMatchObject({ status: 'success', selectedModelLabel: '已自动选择兼容模型' })
    expect(String(vi.mocked(fetchImpl).mock.calls[0]![0])).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1/models')
  })

  it('rejects unlisted regional subdomains before a bearer request is made', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch

    await expect(setup(fetchImpl).test({ ...input, endpoint: 'https://not-a-real-model-studio-host.cn-beijing.maas.aliyuncs.com/compatible-mode/v1' })).resolves.toEqual({ status: 'failure', category: 'invalid-configuration', elapsedMs: expect.any(Number) })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('does not read or send a secret reference that is not eligible for this Model Studio capability', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const secrets = { readPlaintextForMainProcess: vi.fn(), canUseForModelStudioConfiguration: vi.fn().mockReturnValue(false) }
    const service = new ModelStudioConfigurationTestService({ list: () => [profile] }, secrets, fetchImpl)

    await expect(service.test({ ...input, secretRef: 'e2719c5e-4a18-4f2a-9f8d-6d9877a4b321' })).resolves.toEqual({ status: 'failure', category: 'missing-key', elapsedMs: expect.any(Number) })
    expect(secrets.readPlaintextForMainProcess).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects Renderer transientSecret input before reading a key or making a bearer request', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const secrets = { readPlaintextForMainProcess: vi.fn(), canUseForModelStudioConfiguration: vi.fn() }
    const service = new ModelStudioConfigurationTestService({ list: () => [] }, secrets, fetchImpl)

    await expect(service.test({ ...input, transientSecret: 'renderer-plaintext-must-not-be-used' })).resolves.toEqual({ status: 'failure', category: 'invalid-configuration', elapsedMs: expect.any(Number) })
    expect(secrets.readPlaintextForMainProcess).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('chooses the controlled compatible model for text analysis without requiring a model ID', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { object: 'list', data: [{ id: 'qwen3.6-plus' }, { id: 'qwen3.7-flash' }] })) as unknown as typeof fetch

    await expect(setup(fetchImpl).test({ ...input, capability: 'text-analysis', secretRef })).resolves.toEqual({ status: 'success', selectedModelLabel: '已自动选择兼容模型', selectionToken: expect.any(String), elapsedMs: expect.any(Number) })
  })

  it('chooses the documented ASR model from the discovered account directory without accepting a Renderer model ID', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { object: 'list', data: [{ id: 'unrelated-asr' }, { id: 'paraformer-v2' }] })) as unknown as typeof fetch
    const service = setup(fetchImpl)
    const result = await service.test({ ...input, capability: 'asr', secretRef })
    if (result.status !== 'success') throw new Error('expected an ASR selection')

    expect(result).toEqual({ status: 'success', selectedModelLabel: '已自动选择兼容模型', selectionToken: expect.any(String), elapsedMs: expect.any(Number) })
    expect(service.consumeSelection({ capability: 'asr', provider: input.provider, endpoint: input.endpoint, secretRef, modelStudioSelectionToken: result.selectionToken })).toMatchObject({ selectedModel: 'paraformer-v2' })
  })

  it('issues a one-time selection token bound to the stored credential and selected model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { object: 'list', data: [{ id: 'qwen3.7-flash' }] })) as unknown as typeof fetch
    const service = setup(fetchImpl)
    const result = await service.test(input)
    if (result.status !== 'success') throw new Error('expected a selection')
    const selected = { capability: 'multimodal-review', provider: input.provider, endpoint: input.endpoint, secretRef, modelStudioSelectionToken: result.selectionToken }

    expect(service.consumeSelection(selected)).toMatchObject({ selectedModel: 'qwen3.7-flash' })
    expect(service.consumeSelection(selected)).toBeNull()
  })

  it('does not consume a selection token for a different stored credential, even when it holds the same key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { object: 'list', data: [{ id: 'qwen3.7-flash' }] })) as unknown as typeof fetch
    const service = setup(fetchImpl, () => 'same-key-for-two-refs')
    const result = await service.test(input)
    if (result.status !== 'success') throw new Error('expected a selection')

    expect(service.consumeSelection({ capability: 'multimodal-review', provider: input.provider, endpoint: input.endpoint, secretRef: 'e2719c5e-4a18-4f2a-9f8d-6d9877a4b321', modelStudioSelectionToken: result.selectionToken })).toBeNull()
    expect(service.consumeSelection({ capability: 'multimodal-review', provider: input.provider, endpoint: input.endpoint, secretRef, modelStudioSelectionToken: result.selectionToken })).toMatchObject({ selectedModel: 'qwen3.7-flash' })
  })

  it('rejects a Renderer plaintext field on save before reading a key or consuming the selection proof', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { object: 'list', data: [{ id: 'qwen3.7-flash' }] })) as unknown as typeof fetch
    const secrets = { readPlaintextForMainProcess: vi.fn().mockReturnValue('secret-that-must-stay-main'), canUseForModelStudioConfiguration: vi.fn().mockReturnValue(true) }
    const service = new ModelStudioConfigurationTestService({ list: () => [profile] }, secrets, fetchImpl)
    const result = await service.test(input, 'window-1')
    if (result.status !== 'success') throw new Error('expected a selection')
    const selection = { capability: 'multimodal-review', provider: input.provider, endpoint: input.endpoint, secretRef, modelStudioSelectionToken: result.selectionToken, transientSecret: 'must-not-cross-save-ipc' }

    secrets.readPlaintextForMainProcess.mockClear()
    expect(service.consumeSelection(selection, 'window-1')).toBeNull()
    expect(secrets.readPlaintextForMainProcess).not.toHaveBeenCalled()
    const validSelection = { capability: selection.capability, provider: selection.provider, endpoint: selection.endpoint, secretRef: selection.secretRef, modelStudioSelectionToken: selection.modelStudioSelectionToken }
    expect(service.consumeSelection(validSelection, 'window-1')).toMatchObject({ selectedModel: 'qwen3.7-flash' })
  })

  it('does not consume a selection token from a different Electron window before reading a key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { object: 'list', data: [{ id: 'qwen3.7-flash' }] })) as unknown as typeof fetch
    const secrets = { readPlaintextForMainProcess: vi.fn().mockReturnValue('secret-that-must-stay-main'), canUseForModelStudioConfiguration: vi.fn().mockReturnValue(true) }
    const service = new ModelStudioConfigurationTestService({ list: () => [profile] }, secrets, fetchImpl)
    const result = await service.test(input, 'window-1')
    if (result.status !== 'success') throw new Error('expected a selection')
    const selection = { capability: 'multimodal-review', provider: input.provider, endpoint: input.endpoint, secretRef, modelStudioSelectionToken: result.selectionToken }

    secrets.readPlaintextForMainProcess.mockClear()
    expect(service.consumeSelection(selection, 'window-2')).toBeNull()
    expect(secrets.readPlaintextForMainProcess).not.toHaveBeenCalled()
    expect(service.consumeSelection(selection, 'window-1')).toMatchObject({ selectedModel: 'qwen3.7-flash' })
    expect(secrets.readPlaintextForMainProcess).toHaveBeenCalledOnce()
  })

  it('rejects an expired provisional reference before consuming an otherwise valid selection token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(200, { object: 'list', data: [{ id: 'qwen3.7-flash' }] })) as unknown as typeof fetch
    const secrets = { readPlaintextForMainProcess: vi.fn().mockReturnValue('secret-that-must-stay-main'), canUseForModelStudioConfiguration: vi.fn().mockReturnValue(true) }
    const service = new ModelStudioConfigurationTestService({ list: () => [profile] }, secrets, fetchImpl)
    const result = await service.test(input, 'window-1')
    if (result.status !== 'success') throw new Error('expected a selection')
    secrets.canUseForModelStudioConfiguration.mockReturnValue(false)
    secrets.readPlaintextForMainProcess.mockClear()

    expect(service.consumeSelection({ capability: 'multimodal-review', provider: input.provider, endpoint: input.endpoint, secretRef, modelStudioSelectionToken: result.selectionToken }, 'window-1')).toBeNull()
    expect(secrets.readPlaintextForMainProcess).not.toHaveBeenCalled()
  })
})
