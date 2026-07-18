import { existsSync } from 'node:fs'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { MediaError, type ProcessResult } from './media-types.js'

type ProcessOptions = { signal?: AbortSignal; cwd?: string; env?: NodeJS.ProcessEnv }

export const resolveMediaBinary = (binary: 'ffmpeg' | 'ffprobe', explicitPath?: string): string | null => {
  const envKey = binary === 'ffmpeg' ? 'SHORTDRAMA_FFMPEG_PATH' : 'SHORTDRAMA_FFPROBE_PATH'
  const override = explicitPath ?? process.env[envKey]
  const candidates = [
    override,
    ...(override ? [] : [
      process.env.SHORTDRAMA_RUNTIME_ROOT ? join(process.env.SHORTDRAMA_RUNTIME_ROOT, 'models', `${binary}.exe`) : undefined,
      process.resourcesPath ? join(process.resourcesPath, 'models', `${binary}.exe`) : undefined,
      join(process.cwd(), 'models', `${binary}.exe`),
      join(process.cwd(), 'node_modules', binary === 'ffmpeg' ? 'ffmpeg-static' : 'ffprobe-static', binary === 'ffmpeg' ? `${binary}.exe` : 'bin/win32/x64/ffprobe.exe')
    ]),
    ...pathCandidates(binary)
  ].filter((candidate): candidate is string => Boolean(candidate))
  return candidates.find((candidate) => existsSync(candidate)) ?? findOnPath(binary)
}

export const runMediaProcess = (command: string, args: readonly string[], options: ProcessOptions = {}): Promise<ProcessResult> => {
  if (options.signal?.aborted) return Promise.reject(new MediaError('CANCELLED', '媒体任务已取消。', '无需重试。'))
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: 'pipe',
        windowsHide: true
      })
    } catch (error) {
      reject(toProcessError(error, command))
      return
    }
    const startedAt = performance.now()
    let stdout = ''
    let stderr = ''
    let settled = false
    let cancelled = false
    const finish = (result: ProcessResult): void => {
      if (settled) return
      settled = true
      resolve(result)
    }
    const abort = (): void => {
      if (settled) return
      cancelled = true
      child.kill()
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      reject(toProcessError(error, command))
    })
    child.on('close', (exitCode, signal) => {
      options.signal?.removeEventListener('abort', abort)
      if (cancelled) {
        settled = true
        reject(new MediaError('CANCELLED', '媒体任务已取消。', '可从任务中心重新运行。'))
        return
      }
      finish({ command, stdout, stderr, exitCode, signal, durationMs: Math.round(performance.now() - startedAt) })
    })
  })
}

export const assertSuccessfulProcess = (result: ProcessResult): ProcessResult => {
  if (result.exitCode === 0) return result
  throw new MediaError('FFMPEG_FAILED', `媒体命令失败（退出码 ${result.exitCode ?? '未知'}）。`, '检查文件权限、磁盘空间和媒体格式后重试。', result.exitCode)
}

export const parseProgressLine = (line: string): { key: string; value: string } | null => {
  const separator = line.indexOf('=')
  if (separator <= 0) return null
  return { key: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() }
}

const pathCandidates = (binary: string): string[] => {
  const home = homedir()
  return [join(home, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages', `${binary}.exe`), join(home, 'scoop', 'shims', `${binary}.exe`)]
}

const findOnPath = (binary: string): string | null => {
  const pathValue = process.env.PATH ?? ''
  for (const directory of pathValue.split(delimiter)) {
    const candidate = join(directory, process.platform === 'win32' ? `${binary}.exe` : binary)
    if (existsSync(candidate)) return candidate
  }
  return null
}

const toProcessError = (error: unknown, command: string): MediaError => {
  const code = isNodeError(error) && (error.code === 'ENOENT' || error.code === 'EACCES') ? 'FFMPEG_UNAVAILABLE' : 'FFMPEG_FAILED'
  const message = code === 'FFMPEG_UNAVAILABLE' ? `${command} 未找到。` : `${command} 无法启动。`
  return new MediaError(code, message, '在设置中配置 FFmpeg/ffprobe 路径，或安装受支持的本地版本。')
}

const isNodeError = (error: unknown): error is NodeJS.ErrnoException => error instanceof Error && 'code' in error
