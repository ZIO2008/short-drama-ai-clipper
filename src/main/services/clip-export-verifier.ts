import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { readFile, unlink } from 'node:fs/promises'
import type { ClipCandidate } from './original-clip-service.js'
import type { ClipExportConfig, PackagingConfig } from '../../shared/contracts.js'
import { assertSuccessfulProcess, resolveMediaBinary, runMediaProcess } from '../media/ffmpeg-runner.js'

const escapeDrawtextText = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[':,\[\];]/g, '\\$&').replace(/%/g, '\\\\%')

export const outputFilters = (config: Pick<ClipExportConfig, 'outputSize' | 'subtitleStrategy' | 'packagingEnabled' | 'packaging'>, subtitlePath: string | null): string[] => {
  const filters: string[] = []
  if (config.packagingEnabled) {
    const packaging: PackagingConfig = config.packaging ?? { title: '短剧', titlePosition: 'top', prompt: '', promptPosition: 'left', badge: 'none' }
    const [width, height] = (packaging.aspect ?? 'portrait') === 'portrait' ? [1080, 1920] : [1920, 1080]
    const size = packaging.titleSize === 'small' ? 28 : packaging.titleSize === 'large' ? 38 : 32
    const color = packaging.titleTone === 'accent' ? 'orange' : 'white'
    const alpha = packaging.overlay === 'strong' ? '0.72' : packaging.overlay === 'none' ? '0' : '0.55'
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`, `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`, `drawtext=text='${escapeDrawtextText(packaging.title)}':x=(w-text_w)/2:y=${packaging.titlePosition === 'top' ? 'h*0.08' : 'h*0.82'}:fontsize=${size}:fontcolor=${color}:box=1:boxcolor=black@${alpha}`)
    if (packaging.prompt.trim()) { const decoration = packaging.promptStyle === 'outline' ? ':box=0:borderw=2:bordercolor=black@0.9' : `:box=1:boxcolor=black@${alpha}`; filters.push(`drawtext=text='${escapeDrawtextText(packaging.prompt.split('').join('\n'))}':x=${packaging.promptPosition === 'left' ? 'w*0.06' : 'w*0.91-text_w'}:y=(h-text_h)/2:fontsize=20:fontcolor=white${decoration}`) }
    if (packaging.badge !== 'none') filters.push(`drawtext=text='${escapeDrawtextText(packaging.badge)}':x=w-text_w-w*0.06:y=h*0.08:fontsize=18:fontcolor=black:box=1:boxcolor=orange@0.9`)
  } else if (config.outputSize !== 'source') { const [width, height] = config.outputSize.split('x'); filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`) }
  if (config.subtitleStrategy === 'burn' && subtitlePath) { const escaped = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'"); filters.push(`subtitles='${escaped}'`) }
  return filters
}

export const assertFinalOutputDuration = (candidate: ClipCandidate, actualDurationSeconds: number, fps: number | null): void => {
  const expected = candidate.endSeconds - candidate.startSeconds
  const frameTolerance = fps && fps > 0 ? 1 / fps + 0.05 : 0.15
  if (!Number.isFinite(actualDurationSeconds) || Math.abs(actualDurationSeconds - expected) > frameTolerance) throw new Error(`正式导出时长与已确认切点不一致（期望 ${expected.toFixed(3)} 秒，实际 ${actualDurationSeconds.toFixed(3)} 秒）。`)
}

const finalOutputFrameTimestamps = async (outputPath: string): Promise<number[]> => {
  const binary = resolveMediaBinary('ffprobe')
  if (!binary) throw new Error('找不到 ffprobe，无法验证正式导出首尾帧时间。')
  const result = await runMediaProcess(binary, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=best_effort_timestamp_time', '-show_frames', '-of', 'json', outputPath])
  assertSuccessfulProcess(result)
  let frames: Array<{ best_effort_timestamp_time?: unknown }> = []
  try { const payload = JSON.parse(result.stdout) as { frames?: Array<{ best_effort_timestamp_time?: unknown }> }; frames = Array.isArray(payload.frames) ? payload.frames : [] } catch { throw new Error('无法读取正式导出首尾帧时间。') }
  const timestamps = frames.map((frame) => Number(frame.best_effort_timestamp_time)).filter((value) => Number.isFinite(value))
  if (timestamps.length === 0) throw new Error('正式导出没有可验证的视频帧时间。')
  return timestamps
}

export const assertFinalOutputFrameTiming = async (candidate: ClipCandidate, outputPath: string, fps: number | null): Promise<number[]> => {
  const timestamps = await finalOutputFrameTimestamps(outputPath)
  const tolerance = fps && fps > 0 ? 1 / fps + 0.05 : 0.15
  const expectedDuration = candidate.endSeconds - candidate.startSeconds
  const first = timestamps[0]!
  const last = timestamps[timestamps.length - 1]!
  if (Math.abs(first) > tolerance || Math.abs(last - expectedDuration) > tolerance) throw new Error(`正式导出首尾帧时间与已确认切点不一致（首帧 ${first.toFixed(3)} 秒，末帧 ${last.toFixed(3)} 秒，期望时长 ${expectedDuration.toFixed(3)} 秒）。`)
  return timestamps
}

export const assertFinalOutputSourceBoundaries = async (candidate: ClipCandidate, sourcePath: string, outputPath: string, config: Pick<ClipExportConfig, 'outputSize' | 'subtitleStrategy' | 'packagingEnabled' | 'packaging'>, subtitlePath: string | null, frameTimestamps: readonly number[], fps: number | null): Promise<void> => {
  const binary = resolveMediaBinary('ffmpeg')
  if (!binary) throw new Error('找不到 ffmpeg，无法验证正式导出首尾画面。')
  const outputFiltersForSource = outputFilters(config, subtitlePath)
  const outputTimes = [frameTimestamps[0]!, frameTimestamps[frameTimestamps.length - 1]!]
  for (const outputSeconds of outputTimes) {
    const frameSeconds = fps && fps > 0 ? 1 / fps : 1 / 25
    const sampleOutputSeconds = outputSeconds === outputTimes[0] ? outputSeconds : Math.max(0, outputSeconds - 2 * frameSeconds)
    const nominalSourceSeconds = candidate.startSeconds + sampleOutputSeconds
    const sourceTimes = outputSeconds === outputTimes[0] ? [nominalSourceSeconds, Math.min(candidate.endSeconds, nominalSourceSeconds + frameSeconds)] : [nominalSourceSeconds, Math.max(candidate.startSeconds, nominalSourceSeconds - frameSeconds)]
    const scores: number[] = []
    for (const sourceSeconds of [...new Set(sourceTimes)]) {
      const sourceFilter = [`trim=start=${sourceSeconds}:end=${sourceSeconds + frameSeconds}`, `setpts=PTS-STARTPTS+${sampleOutputSeconds}/TB`, ...outputFiltersForSource, 'scale=320:180:flags=bicubic', 'format=yuv420p', 'setpts=0'].join(',')
      const outputFilter = [`trim=start=${sampleOutputSeconds}:end=${sampleOutputSeconds + frameSeconds}`, `setpts=PTS-STARTPTS+${sampleOutputSeconds}/TB`, 'scale=320:180:flags=bicubic', 'format=yuv420p', 'setpts=0'].join(',')
      const sourceFramePath = join(dirname(outputPath), `.clip-boundary-source-${randomUUID()}.rgb`)
      const outputFramePath = join(dirname(outputPath), `.clip-boundary-output-${randomUUID()}.rgb`)
      try {
        const [sourceResult, outputResult] = await Promise.all([runMediaProcess(binary, ['-v', 'error', '-i', sourcePath, '-vf', sourceFilter, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-y', sourceFramePath]), runMediaProcess(binary, ['-v', 'error', '-i', outputPath, '-vf', outputFilter, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-y', outputFramePath])])
        assertSuccessfulProcess(sourceResult); assertSuccessfulProcess(outputResult)
        const [sourceFrame, outputFrame] = await Promise.all([readFile(sourceFramePath), readFile(outputFramePath)])
        if (sourceFrame.length === outputFrame.length && sourceFrame.length === 320 * 180 * 3) { let totalDifference = 0; let samples = 0; for (let index = 0; index < sourceFrame.length; index += 12) { totalDifference += Math.abs(sourceFrame[index]! - outputFrame[index]!); samples += 1 }; scores.push(1 - totalDifference / Math.max(1, samples * 255)) }
      } finally { await Promise.all([unlink(sourceFramePath).catch(() => undefined), unlink(outputFramePath).catch(() => undefined)]) }
    }
    const similarity = Math.max(...scores)
    if (!Number.isFinite(similarity) || similarity < 0.94) throw new Error(`正式导出${outputSeconds === outputTimes[0] ? '首' : '尾'}帧无法证明来自已确认源片边界（画面相似度 ${Number.isFinite(similarity) ? similarity.toFixed(6) : '不可用'}）。`)
  }
}
