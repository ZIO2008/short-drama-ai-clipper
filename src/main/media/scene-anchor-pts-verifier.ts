import { spawnSync } from 'node:child_process'
import { resolveMediaBinary } from './ffmpeg-runner.js'

export const SCENE_ANCHOR_PTS_VERIFIER_VERSION = 'ffprobe-frame-pts-v1'
const FRAME_PTS_TOLERANCE_SECONDS = 0.002

export type SourceVideoFramePts = { timestamps: number[]; toleranceSeconds: number }

const readFramePts = (sourcePath: string, readIntervals?: string): SourceVideoFramePts | null => {
  const binary = resolveMediaBinary('ffprobe')
  if (!binary) return null
  try {
    const result = spawnSync(binary, ['-v', 'error', '-select_streams', 'v:0', ...(readIntervals ? ['-read_intervals', readIntervals] : []), '-show_entries', 'frame=best_effort_timestamp_time', '-show_frames', '-of', 'json', sourcePath], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 90_000,
      maxBuffer: 64 * 1024 * 1024
    })
    if (result.error || result.status !== 0) return null
    const payload = JSON.parse(result.stdout) as { frames?: Array<{ best_effort_timestamp_time?: unknown }> }
    const timestamps = [...new Set((payload.frames ?? []).map((frame) => Number(frame.best_effort_timestamp_time)).filter((value) => Number.isFinite(value)))].sort((left, right) => left - right)
    return timestamps.length > 0 ? { timestamps, toleranceSeconds: FRAME_PTS_TOLERANCE_SECONDS } : null
  } catch {
    return null
  }
}

/** A package only needs proof that the current source exposes decodable video PTS. */
export const readSourceVideoPtsProbe = (sourcePath: string): SourceVideoFramePts | null => readFramePts(sourcePath, '%+#1')

/** Scene anchors need the full frame table to prove both exact boundary PTS values. */
export const readSourceVideoFramePts = (sourcePath: string): SourceVideoFramePts | null => readFramePts(sourcePath)

export const isSourceFramePtsRange = (framePts: SourceVideoFramePts, startSeconds: number, endSeconds: number): boolean => {
  const includesTimestamp = (target: number): boolean => framePts.timestamps.some((timestamp) => Math.abs(timestamp - target) <= framePts.toleranceSeconds)
  return includesTimestamp(startSeconds) && includesTimestamp(endSeconds)
}
