export type MediaErrorCode =
  | 'NOT_FOUND'
  | 'NOT_READABLE'
  | 'UNSUPPORTED_FORMAT'
  | 'FFMPEG_UNAVAILABLE'
  | 'MEDIA_PROBE_FAILED'
  | 'FFMPEG_FAILED'
  | 'CANCELLED'

export class MediaError extends Error {
  constructor(
    public readonly code: MediaErrorCode,
    message: string,
    public readonly actionable: string,
    public readonly exitCode: number | null = null
  ) {
    super(message)
    this.name = 'MediaError'
  }
}

export type MediaProbeResult = {
  path: string
  readable: true
  durationSeconds: number
  fps: number | null
  videoCodec: string | null
  audioCodec: string | null
  container: string | null
  width: number | null
  height: number | null
  diskFreeBytes: number | null
}

export type ProcessResult = {
  command: string
  stdout: string
  stderr: string
  exitCode: number | null
  signal: NodeJS.Signals | null
  durationMs: number
}

export type RuntimeToolCheck = {
  available: boolean
  path: string | null
  version: string | null
  error: string | null
}

export type RuntimeCheckResult = {
  ok: boolean
  ffmpeg: RuntimeToolCheck
  ffprobe: RuntimeToolCheck
  dataDirectory: { path: string; writable: boolean; error: string | null }
  diskFreeBytes: number | null
}
