import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ app: { quit: vi.fn(), exit: vi.fn() } }))
vi.mock('electron', () => electron)

import { runPackagedEvidenceCli } from './packaged-evidence-dispatcher.js'

const originalArgv = [...process.argv]

describe('runPackagedEvidenceCli', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    electron.app.quit.mockClear()
    electron.app.exit.mockClear()
    process.exitCode = undefined
  })

  afterEach(() => {
    process.argv = [...originalArgv]
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it.each([
    ['供应商预检', ['--real-provider-preflight', '--real-provider-preflight-result', 'relative.json']],
    ['原剧切片闭环', ['--real-original-clip-e2e-sample', 'dev-01', '--real-original-clip-e2e-result', 'relative.json']],
    ['ASR', ['--real-asr-evidence-sample', 'dev-01', '--real-asr-evidence-result', 'relative.json']],
    ['文本语义', ['--real-semantic-evidence-sample', 'dev-01', '--real-semantic-evidence-result', 'relative.json']],
    ['视频连通性', ['--real-multimodal-probe', '--real-multimodal-probe-result', 'relative.json']],
    ['视频帧级', ['--real-multimodal-evidence-sample', 'dev-04', '--real-multimodal-evidence-result', 'relative.json']]
  ])('closes the %s CLI without leaking an invalid result path', async (_label, args) => {
    process.argv = [...originalArgv, ...args]

    await expect(runPackagedEvidenceCli()).resolves.toBe(true)
    expect(process.exitCode).toBe(1)
    expect(electron.app.quit).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledOnce()
    expect(vi.mocked(console.error).mock.calls.flat().join(' ')).not.toContain('relative.json')
    expect(electron.app.exit).toHaveBeenCalledWith(1)
  })
})
