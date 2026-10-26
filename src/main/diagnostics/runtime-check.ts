import { access, constants, mkdir, statfs } from 'node:fs/promises'
import { resolveMediaBinary, runMediaProcess } from '../media/ffmpeg-runner.js'
import type { RuntimeCheckResult, RuntimeToolCheck } from '../media/media-types.js'

export const checkRuntime = async (dataDirectory: string): Promise<RuntimeCheckResult> => {
  const dataStatus = await checkDataDirectory(dataDirectory)
  const [ffmpeg, ffprobe] = await Promise.all([checkTool('ffmpeg'), checkTool('ffprobe')])
  const diskFreeBytes = dataStatus.writable ? await getDiskFreeBytes(dataDirectory) : null
  return { ok: ffmpeg.available && ffprobe.available && dataStatus.writable, ffmpeg, ffprobe, dataDirectory: dataStatus, diskFreeBytes }
}

const checkTool = async (binary: 'ffmpeg' | 'ffprobe'): Promise<RuntimeToolCheck> => {
  const path = resolveMediaBinary(binary)
  if (!path) return { available: false, path: null, version: null, error: `${binary} is unavailable` }
  try {
    const result = await runMediaProcess(path, ['-version'])
    if (result.exitCode !== 0) return { available: false, path, version: null, error: result.stderr.trim() || `${binary} exited with ${result.exitCode ?? 'unknown'}` }
    return { available: true, path, version: firstLine(result.stdout), error: null }
  } catch (error) {
    return { available: false, path, version: null, error: error instanceof Error ? error.message : `${binary} failed to start` }
  }
}

const checkDataDirectory = async (path: string): Promise<{ path: string; writable: boolean; error: string | null }> => {
  try {
    await mkdir(path, { recursive: true })
    await access(path, constants.R_OK | constants.W_OK)
    return { path, writable: true, error: null }
  } catch (error) {
    return { path, writable: false, error: error instanceof Error ? error.message : 'Data directory is not writable' }
  }
}

const getDiskFreeBytes = async (path: string): Promise<number | null> => {
  try {
    const stats = await statfs(path)
    return Number(stats.bavail) * Number(stats.bsize)
  } catch {
    return null
  }
}

const firstLine = (value: string): string | null => value.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? null
