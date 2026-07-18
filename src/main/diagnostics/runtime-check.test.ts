import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkRuntime } from './runtime-check.js'

describe('runtime diagnostics', () => {
  it('reports an isolated writable data directory and tool statuses', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'short-drama-runtime-'))
    const directory = join(parent, 'nested', 'data')
    try {
      const result = await checkRuntime(directory)
      expect(result.dataDirectory).toMatchObject({ path: directory, writable: true, error: null })
      expect(typeof result.ffmpeg.available).toBe('boolean')
      expect(typeof result.ffprobe.available).toBe('boolean')
      expect(result.diskFreeBytes).toBeGreaterThan(0)
      if (result.ffmpeg.available) expect(result.ffmpeg.version).toBeTruthy()
      if (result.ffprobe.available) expect(result.ffprobe.version).toBeTruthy()
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
})
