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

const asrSettings = { recognitionMode: 'asr-only', scope: 'all', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'auto-region', differenceThreshold: 'standard', importStrategy: 'parallel' } as const
const ocrSettings = { ...asrSettings, recognitionMode: 'ocr-only' as const }
const runtime = { buildId: 'runner-r8', sha256: 'a'.repeat(64) }

const setup = () => {
  const recognition = { start: vi.fn((input) => input), get: vi.fn(), resume: vi.fn((input) => input), retryFailed: vi.fn((input) => input) }
  const localOcr = { getRuntimeInfo: vi.fn().mockResolvedValue({ available: true, ...runtime, runnerPath: 'runner.exe', selfTest: true, reason: null }) }
  registerAppIpc({ requireSubtitleRecognitionRunService: () => recognition, requireLocalOcrSubtitleService: () => localOcr } as unknown as AppIpcDependencies)
  return { recognition, localOcr }
}

const handler = (channel: string): Handler => {
  const registered = handlers.get(channel)
  if (!registered) throw new Error(`IPC handler missing: ${channel}`)
  return registered
}

describe('subtitle recognition IPC runner boundary', () => {
  beforeEach(() => handlers.clear())

  it('overwrites a renderer-supplied OCR runtime on start, resume, and retry', async () => {
    const { recognition, localOcr } = setup()
    const forged = { buildId: 'forged-runner', sha256: 'b'.repeat(64) }
    await handler('subtitles:recognition-runs:start')(null, { dramaId: 'd', settings: ocrSettings, episodeIds: ['e'], ocrRuntime: forged })
    expect(recognition.start).toHaveBeenCalledWith(expect.objectContaining({ ocrRuntime: runtime }))

    recognition.get.mockReturnValue({ settings: ocrSettings })
    await handler('subtitles:recognition-runs:resume')(null, 'run-1')
    await handler('subtitles:recognition-runs:retry-failed')(null, 'run-1')
    expect(recognition.resume).toHaveBeenCalledWith({ runId: 'run-1', ocrRuntime: runtime })
    expect(recognition.retryFailed).toHaveBeenCalledWith({ runId: 'run-1', ocrRuntime: runtime })
    expect(localOcr.getRuntimeInfo).toHaveBeenCalledTimes(3)
  })

  it('does not read the OCR runner for ASR-only starts or continuations', async () => {
    const { recognition, localOcr } = setup()
    await handler('subtitles:recognition-runs:start')(null, { dramaId: 'd', settings: asrSettings, episodeIds: ['e'], ocrRuntime: runtime })
    recognition.get.mockReturnValue({ settings: asrSettings })
    await handler('subtitles:recognition-runs:resume')(null, 'run-2')
    await handler('subtitles:recognition-runs:retry-failed')(null, 'run-2')
    expect(recognition.start).toHaveBeenCalledWith(expect.objectContaining({ ocrRuntime: null }))
    expect(recognition.resume).toHaveBeenCalledWith({ runId: 'run-2', ocrRuntime: null })
    expect(recognition.retryFailed).toHaveBeenCalledWith({ runId: 'run-2', ocrRuntime: null })
    expect(localOcr.getRuntimeInfo).not.toHaveBeenCalled()
  })
})
