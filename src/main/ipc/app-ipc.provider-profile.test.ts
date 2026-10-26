import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppIpcDependencies } from './app-ipc.js'

type Handler = (_event: unknown, ...args: unknown[]) => unknown
const handlers = vi.hoisted(() => new Map<string, Handler>())

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  shell: { openExternal: vi.fn(), showItemInFolder: vi.fn() }
}))

const { registerAppIpc } = await import('./app-ipc.js')
const input = { capability: 'multimodal-review', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3.7-flash', secretRef: 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321', timeoutMs: 60_000, pricing: null, modelStudioSelectionToken: 'e2719c5e-4a18-4f2a-9f8d-6d9877a4b321' }
const senderEvent = { sender: { id: 17 } }

describe('provider profile IPC boundary', () => {
  beforeEach(() => handlers.clear())

  it('does not register legacy bare-secret write channels', () => {
    registerAppIpc({} as AppIpcDependencies)

    expect(handlers.has('secrets:save')).toBe(false)
    expect(handlers.has('providers:save-model-studio-provisional-secret')).toBe(false)
  })

  it('rejects a Renderer-supplied Model Studio allowlist model without consuming a matching selection proof', async () => {
    const profiles = { save: vi.fn(), saveModelStudioSelection: vi.fn() }
    const modelStudio = { consumeSelection: vi.fn().mockReturnValue(null) }
    registerAppIpc({ requireProviderProfileService: () => profiles, requireModelStudioConfigurationTestService: () => modelStudio } as unknown as AppIpcDependencies)
    const save = handlers.get('providers:save')
    if (!save) throw new Error('providers:save handler missing')

    expect(() => save(senderEvent, input)).toThrow('自动选型结果已失效')
    expect(modelStudio.consumeSelection).toHaveBeenCalledWith(input, '17')
    expect(profiles.save).not.toHaveBeenCalled()
    expect(profiles.saveModelStudioSelection).not.toHaveBeenCalled()
  })

  it('persists Model Studio only after the main-process selection proof is consumed', () => {
    const selectionProof = { selectedModel: 'qwen3.7-flash' }
    const profiles = { save: vi.fn(), saveModelStudioSelection: vi.fn().mockReturnValue('profile-id') }
    const modelStudio = { consumeSelection: vi.fn().mockReturnValue(selectionProof) }
    registerAppIpc({ requireProviderProfileService: () => profiles, requireModelStudioConfigurationTestService: () => modelStudio } as unknown as AppIpcDependencies)
    const save = handlers.get('providers:save')
    if (!save) throw new Error('providers:save handler missing')

    expect(save(senderEvent, input)).toBe('profile-id')
    expect(profiles.saveModelStudioSelection).toHaveBeenCalledWith(input, selectionProof)
    expect(profiles.save).not.toHaveBeenCalled()
  })

  it('rejects a Renderer transientSecret on the Model Studio save IPC before consuming its selection proof', () => {
    const profiles = { save: vi.fn(), saveModelStudioSelection: vi.fn() }
    const modelStudio = { consumeSelection: vi.fn().mockReturnValue(null) }
    registerAppIpc({ requireProviderProfileService: () => profiles, requireModelStudioConfigurationTestService: () => modelStudio } as unknown as AppIpcDependencies)
    const save = handlers.get('providers:save')
    if (!save) throw new Error('providers:save handler missing')

    expect(() => save(senderEvent, { ...input, transientSecret: 'must-not-cross-save-ipc' })).toThrow('自动选型结果已失效')
    expect(modelStudio.consumeSelection).toHaveBeenCalledWith(expect.objectContaining({ transientSecret: 'must-not-cross-save-ipc' }), '17')
    expect(profiles.saveModelStudioSelection).not.toHaveBeenCalled()
  })

  it('does not let a zero-width provider variant enter the ordinary save path', () => {
    const profiles = { save: vi.fn(), saveModelStudioSelection: vi.fn() }
    const modelStudio = { consumeSelection: vi.fn().mockReturnValue(null) }
    registerAppIpc({ requireProviderProfileService: () => profiles, requireModelStudioConfigurationTestService: () => modelStudio } as unknown as AppIpcDependencies)
    const save = handlers.get('providers:save')
    if (!save) throw new Error('providers:save handler missing')

    expect(() => save(senderEvent, { ...input, provider: `${input.provider}\u200B` })).toThrow('自动选型结果已失效')
    expect(modelStudio.consumeSelection).toHaveBeenCalledWith(expect.objectContaining({ provider: input.provider }), '17')
    expect(profiles.save).not.toHaveBeenCalled()
    expect(profiles.saveModelStudioSelection).not.toHaveBeenCalled()
  })

  it('normalizes legacy Model Studio capabilities before consuming a selection proof', () => {
    const selectionProof = { selectedModel: 'qwen3.7-flash' }
    const profiles = { save: vi.fn(), saveModelStudioSelection: vi.fn().mockReturnValue('profile-id') }
    const modelStudio = { consumeSelection: vi.fn().mockReturnValue(selectionProof) }
    registerAppIpc({ requireProviderProfileService: () => profiles, requireModelStudioConfigurationTestService: () => modelStudio } as unknown as AppIpcDependencies)
    const save = handlers.get('providers:save')
    if (!save) throw new Error('providers:save handler missing')

    expect(save(senderEvent, { ...input, capability: 'text_semantics', provider: `${input.provider}\u200E` })).toBe('profile-id')
    expect(modelStudio.consumeSelection).toHaveBeenCalledWith(expect.objectContaining({ capability: 'text-analysis', provider: input.provider }), '17')
    expect(profiles.saveModelStudioSelection).toHaveBeenCalledWith(expect.objectContaining({ capability: 'text-analysis', provider: input.provider }), selectionProof)
    expect(profiles.save).not.toHaveBeenCalled()
  })

  it('normalizes the legacy video-understanding capability before consuming a selection proof', () => {
    const selectionProof = { selectedModel: 'qwen3.7-flash' }
    const profiles = { save: vi.fn(), saveModelStudioSelection: vi.fn().mockReturnValue('profile-id') }
    const modelStudio = { consumeSelection: vi.fn().mockReturnValue(selectionProof) }
    registerAppIpc({ requireProviderProfileService: () => profiles, requireModelStudioConfigurationTestService: () => modelStudio } as unknown as AppIpcDependencies)
    const save = handlers.get('providers:save')
    if (!save) throw new Error('providers:save handler missing')

    expect(save(senderEvent, { ...input, capability: 'video_understanding', provider: `${input.provider}\u200F` })).toBe('profile-id')
    expect(modelStudio.consumeSelection).toHaveBeenCalledWith(expect.objectContaining({ capability: 'multimodal-review', provider: input.provider }), '17')
    expect(profiles.saveModelStudioSelection).toHaveBeenCalledWith(expect.objectContaining({ capability: 'multimodal-review', provider: input.provider }), selectionProof)
    expect(profiles.save).not.toHaveBeenCalled()
  })

  it('requires a Model Studio selection proof for ASR instead of entering the ordinary save path', () => {
    const selectionProof = { selectedModel: 'paraformer-v2' }
    const profiles = { save: vi.fn(), saveModelStudioSelection: vi.fn().mockReturnValue('asr-profile-id') }
    const modelStudio = { consumeSelection: vi.fn().mockReturnValue(selectionProof) }
    registerAppIpc({ requireProviderProfileService: () => profiles, requireModelStudioConfigurationTestService: () => modelStudio } as unknown as AppIpcDependencies)
    const save = handlers.get('providers:save')
    if (!save) throw new Error('providers:save handler missing')
    const asrInput = { ...input, capability: 'asr', model: 'paraformer-v2' }

    expect(save(senderEvent, asrInput)).toBe('asr-profile-id')
    expect(modelStudio.consumeSelection).toHaveBeenCalledWith(asrInput, '17')
    expect(profiles.saveModelStudioSelection).toHaveBeenCalledWith(asrInput, selectionProof)
    expect(profiles.save).not.toHaveBeenCalled()
  })

  it('masks an automatically selected Model Studio ID before returning profiles to the Renderer', () => {
    const profiles = { list: vi.fn().mockReturnValue([{ ...input, id: 'profile-id', modelSelectionSource: 'model-studio-automatic' }]) }
    registerAppIpc({ requireProviderProfileService: () => profiles } as unknown as AppIpcDependencies)
    const list = handlers.get('providers:list')
    if (!list) throw new Error('providers:list handler missing')

    expect(list(null)).toEqual([expect.objectContaining({ model: '已自动选择兼容模型' })])
  })

  it('does not return legacy Model Studio model IDs to the Renderer', () => {
    const profiles = { list: vi.fn().mockReturnValue([
      { ...input, id: 'manual', model: 'manual-model' },
      { ...input, id: 'guidance', capability: 'text-analysis', model: '请按开通模型填写' },
    ]) }
    registerAppIpc({ requireProviderProfileService: () => profiles } as unknown as AppIpcDependencies)
    const list = handlers.get('providers:list')
    if (!list) throw new Error('providers:list handler missing')

    expect(list(null)).toEqual([
      expect.objectContaining({ model: '等待自动选择' }),
      expect.objectContaining({ model: '等待自动选择' }),
    ])
  })

  it('returns the automatic label for an automatically selected Model Studio ASR profile', () => {
    const profiles = { list: vi.fn().mockReturnValue([{ ...input, id: 'asr', capability: 'asr', model: 'paraformer-v2', modelSelectionSource: 'model-studio-automatic' }]) }
    registerAppIpc({ requireProviderProfileService: () => profiles } as unknown as AppIpcDependencies)
    const list = handlers.get('providers:list')
    if (!list) throw new Error('providers:list handler missing')

    expect(list(null)).toEqual([expect.objectContaining({ provider: input.provider, model: '已自动选择兼容模型' })])
  })

  it('returns the waiting label for a historical Model Studio ASR profile without automatic-selection proof', () => {
    const profiles = { list: vi.fn().mockReturnValue([{ ...input, id: 'asr', capability: 'asr', model: 'paraformer-v2', modelSelectionSource: null }]) }
    registerAppIpc({ requireProviderProfileService: () => profiles } as unknown as AppIpcDependencies)
    const list = handlers.get('providers:list')
    if (!list) throw new Error('providers:list handler missing')

    expect(list(null)).toEqual([expect.objectContaining({ provider: input.provider, model: '等待自动选择' })])
  })
})
