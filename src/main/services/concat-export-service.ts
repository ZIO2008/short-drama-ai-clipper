import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveMediaBinary, runMediaProcess, assertSuccessfulProcess } from '../media/ffmpeg-runner.js'
import type { EpisodeInput, PlannedWindow } from './window-planner.js'

export type ConcatExportOptions = { qualityMode?: 'original' | 'bitrate' | 'size'; bitrateKbps?: number; targetSizeMb?: number; fps?: 'source' | number; packagingEnabled?: boolean; packagingTitle?: string }

export const exportConcatWindow = async (window: PlannedWindow, episodes: readonly EpisodeInput[], outputPath: string, options: ConcatExportOptions = {}): Promise<void> => {
  if (window.status !== 'ready' && window.status !== 'reduced') throw new Error('Window is not exportable')
  const byNumber = new Map(episodes.map((episode) => [episode.episodeNo, episode])); const selected = window.episodeNumbers.map((number) => byNumber.get(number)).filter((episode): episode is EpisodeInput => Boolean(episode))
  if (selected.some((episode) => episode.status !== 'ready')) throw new Error('Window contains unavailable media')
  const folder = await mkdtemp(join(tmpdir(), 'short-drama-concat-')); const listPath = join(folder, 'inputs.txt'); const list = selected.map((episode) => `file '${episode.sourcePath.replace(/'/g, "'\\''")}'`).join('\n')
  try { await writeFile(listPath, list, 'utf8'); const binary = resolveMediaBinary('ffmpeg') ?? 'ffmpeg'; const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, ...buildEncodingArgs(window, options), outputPath]; assertSuccessfulProcess(await runMediaProcess(binary, args)) } finally { await rm(folder, { recursive: true, force: true }) }
}

export const buildEncodingArgs = (window: PlannedWindow, options: ConcatExportOptions): string[] => {
  const mode = options.qualityMode ?? 'original'; const fps = options.fps ?? 'source'; const encode = mode !== 'original' || fps !== 'source' || options.packagingEnabled === true
  if (!encode) return ['-c', 'copy']
  const args = ['-c:v', 'libx264', '-preset', 'medium', '-c:a', 'aac', '-b:a', '128k']
  if (typeof fps === 'number') args.push('-r', String(fps))
  if (mode === 'bitrate' && options.bitrateKbps) args.push('-b:v', `${Math.round(options.bitrateKbps)}k`)
  if (mode === 'size' && options.targetSizeMb && window.durationSeconds) { const videoKbps = Math.floor((options.targetSizeMb * 8192) / window.durationSeconds - 160); if (videoKbps < 100) throw new Error('目标文件大小无法容纳当前音视频开销。'); args.push('-b:v', `${videoKbps}k`) }
  if (options.packagingEnabled) { const title = (options.packagingTitle ?? '短剧').replace(/[\\':%]/g, ''); args.push('-vf', `drawtext=text='${title}':x=(w-text_w)/2:y=h*0.08:fontsize=32:fontcolor=white:box=1:boxcolor=black@0.55`) }
  return args
}
