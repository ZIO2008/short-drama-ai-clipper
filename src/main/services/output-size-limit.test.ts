import { mkdtemp, stat, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { enforceOutputSizeLimit, MAX_OUTPUT_SIZE_BYTES } from './output-size-limit.js'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(directories.splice(0).map(async (directory) => {
    const { rm } = await import('node:fs/promises')
    await rm(directory, { recursive: true, force: true })
  }))
})

describe('enforceOutputSizeLimit', () => {
  it('does not impose a hidden limit when the task did not request one', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'short-drama-output-limit-')); directories.push(directory)
    const path = join(directory, 'valid.mp4')
    await writeFile(path, Buffer.alloc(1))
    await expect(enforceOutputSizeLimit(path)).resolves.toBe(1)
    await expect(stat(path)).resolves.toMatchObject({ size: 1 })
  })

  it('deletes a file reported above the user-selected target', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'short-drama-output-limit-')); directories.push(directory)
    const path = join(directory, 'oversize.mp4')
    await writeFile(path, Buffer.alloc(1))
    await truncate(path, MAX_OUTPUT_SIZE_BYTES + 1)
    await expect(enforceOutputSizeLimit(path, 200)).rejects.toThrow('超过任务设置的 200 MB')
    await expect(stat(path)).rejects.toThrow()
  })
})
