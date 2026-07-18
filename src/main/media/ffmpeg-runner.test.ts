import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseProgressLine, resolveMediaBinary, runMediaProcess } from './ffmpeg-runner.js'

describe('ffmpeg runner', () => {
  it('captures stdout and exit code from a successful process', async () => {
    const result = await runMediaProcess(process.execPath, ['-e', 'process.stdout.write("ok")'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('ok')
  })

  it('terminates a cancelled process with an actionable media error', async () => {
    const controller = new AbortController()
    const marker = join(tmpdir(), `short-drama-runner-${process.pid}.txt`)
    const script = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid)); setInterval(() => {}, 1000)`
    const running = runMediaProcess(process.execPath, ['-e', script], { signal: controller.signal })
    for (let attempt = 0; attempt < 20 && !(await fileExists(marker)); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 25))
    controller.abort()
    await expect(running).rejects.toMatchObject({ code: 'CANCELLED' })
    const childPid = Number(await readFile(marker, 'utf8'))
    expect(Number.isInteger(childPid)).toBe(true)
    expect(isProcessAlive(childPid)).toBe(false)
    await rm(marker, { force: true })
  })

  it('parses ffmpeg progress key-value output', () => {
    expect(parseProgressLine('out_time_ms=1200000')).toEqual({ key: 'out_time_ms', value: '1200000' })
    expect(parseProgressLine('progress=end')).toEqual({ key: 'progress', value: 'end' })
    expect(parseProgressLine('not-progress')).toBeNull()
  })

  it('resolves bundled development media binaries', () => {
    expect(resolveMediaBinary('ffmpeg')).toBeTruthy()
    expect(resolveMediaBinary('ffprobe')).toBeTruthy()
  })
})

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await readFile(path)
    return true
  } catch {
    return false
  }
}

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
