import { access, constants, statfs } from 'node:fs/promises'
import { MediaError, type MediaProbeResult } from './media-types.js'
import { resolveMediaBinary, runMediaProcess } from './ffmpeg-runner.js'

type JsonRecord = Record<string, unknown>

export const probeMedia = async (filePath: string, ffprobePath?: string): Promise<MediaProbeResult> => {
  await assertReadable(filePath)
  const binary = resolveMediaBinary('ffprobe', ffprobePath)
  if (!binary) throw new MediaError('FFMPEG_UNAVAILABLE', '找不到 ffprobe。', '在设置中配置 ffprobe 路径后重试。')
  let result
  try {
    result = await runMediaProcess(binary, [
      '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath
    ])
    if (result.exitCode !== 0) {
      const unsupported = /invalid data|could not find codec|moov atom not found/i.test(result.stderr)
      throw new MediaError(
        unsupported ? 'UNSUPPORTED_FORMAT' : 'MEDIA_PROBE_FAILED',
        unsupported ? '无法识别视频格式或文件已损坏。' : '媒体探测命令失败。',
        '检查文件格式、权限和 ffprobe 版本后重试。',
        result.exitCode
      )
    }
  } catch (error) {
    if (error instanceof MediaError) throw error
    throw new MediaError('MEDIA_PROBE_FAILED', '媒体探测未完成。', '检查文件权限和媒体格式后重试。')
  }
  try {
    return await parseProbePayload(filePath, JSON.parse(result.stdout) as unknown)
  } catch (error) {
    if (error instanceof MediaError) throw error
    throw new MediaError('UNSUPPORTED_FORMAT', '无法识别视频流信息。', '请选择包含可读视频流的文件。')
  }
}

export const parseProbePayload = async (filePath: string, payload: unknown): Promise<MediaProbeResult> => {
  if (!isRecord(payload)) throw new MediaError('UNSUPPORTED_FORMAT', 'ffprobe 返回了无法识别的数据。', '请选择包含可读视频流的文件。')
  const streams = Array.isArray(payload.streams) ? payload.streams.filter(isRecord) : []
  const video = streams.find((stream) => stream.codec_type === 'video')
  if (!video) throw new MediaError('UNSUPPORTED_FORMAT', '文件没有可读的视频流。', '请选择 MP4、MOV 或其他受支持的视频文件。')
  const format = isRecord(payload.format) ? payload.format : {}
  const durationSeconds = toNumber(format.duration) ?? toNumber(video.duration)
  if (durationSeconds === null || durationSeconds <= 0) {
    throw new MediaError('UNSUPPORTED_FORMAT', '无法读取视频时长。', '请确认文件没有损坏且包含完整视频流。')
  }
  return {
    path: filePath,
    readable: true,
    durationSeconds,
    fps: parseFrameRate(video.r_frame_rate ?? video.avg_frame_rate),
    videoCodec: toString(video.codec_name),
    audioCodec: toString(streams.find((stream) => stream.codec_type === 'audio')?.codec_name),
    container: toString(format.format_name),
    width: toNumber(video.width),
    height: toNumber(video.height),
    diskFreeBytes: await getDiskFreeBytes(filePath)
  }
}

export const parseFrameRate = (value: unknown): number | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  const [numerator, denominator] = value.split('/').map(Number)
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null
  const fps = numerator / denominator
  return Number.isFinite(fps) && fps > 0 ? Math.round(fps * 1000) / 1000 : null
}

export const getDiskFreeBytes = async (path: string): Promise<number | null> => {
  try {
    const stats = await statfs(path)
    return Number(stats.bavail) * Number(stats.bsize)
  } catch {
    return null
  }
}

export const assertReadable = async (filePath: string, accessFn: typeof access = access): Promise<void> => {
  try {
    await accessFn(filePath, constants.R_OK)
  } catch (error) {
    const code = isNodeError(error) && error.code === 'ENOENT' ? 'NOT_FOUND' : 'NOT_READABLE'
    const message = code === 'NOT_FOUND' ? '找不到视频文件。' : '没有读取视频文件的权限。'
    throw new MediaError(code, message, '重新定位文件或检查 Windows 文件权限。')
  }
}

const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value)
const toNumber = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(number) ? number : null
}
const toString = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value : null
const isNodeError = (error: unknown): error is NodeJS.ErrnoException => error instanceof Error && 'code' in error
