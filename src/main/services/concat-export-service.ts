import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveMediaBinary, runMediaProcess, assertSuccessfulProcess } from '../media/ffmpeg-runner.js'
import type { PackagingConfig } from '../../shared/contracts.js'
import type { EpisodeInput, PlannedWindow } from './window-planner.js'
import { enforceOutputSizeLimit } from './output-size-limit.js'
import { isProductionReady } from '../../shared/production-readiness.js'

export type ConcatExportOptions = { qualityMode?: 'original' | 'bitrate' | 'size'; bitrateKbps?: number; targetSizeMb?: number; encodingPreset?: 'fast' | 'balanced' | 'quality'; fps?: 'source' | number; packagingEnabled?: boolean; packagingTitle?: string; packaging?: PackagingConfig; signal?: AbortSignal }

export const exportConcatWindow = async (window: PlannedWindow, episodes: readonly EpisodeInput[], outputPath: string, options: ConcatExportOptions = {}): Promise<void> => {
  if (window.status !== 'ready' && window.status !== 'reduced') throw new Error('Window is not exportable')
  const byNumber = new Map(episodes.map((episode) => [episode.episodeNo, episode])); const selected = window.episodeNumbers.map((number) => byNumber.get(number)).filter((episode): episode is EpisodeInput => Boolean(episode))
  if (selected.some((episode) => !isProductionReady(episode.status))) throw new Error('Window contains unavailable media')
  const folder = await mkdtemp(join(tmpdir(), 'short-drama-concat-')); const listPath = join(folder, 'inputs.txt'); const list = selected.map((episode) => "file '" + episode.sourcePath.replace(/'/g, "'\\''") + "'").join('\n')
  try { await writeFile(listPath, list, 'utf8'); const binary = resolveMediaBinary('ffmpeg') ?? 'ffmpeg'; const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, ...buildEncodingArgs(window, options), outputPath]; assertSuccessfulProcess(await runMediaProcess(binary, args, { signal: options.signal })); await enforceOutputSizeLimit(outputPath, options.qualityMode === 'size' ? options.targetSizeMb : undefined) } finally { await rm(folder, { recursive: true, force: true }) }
}

export const buildEncodingArgs = (window: PlannedWindow, options: ConcatExportOptions): string[] => {
  const mode = options.qualityMode ?? 'original'; const fps = options.fps ?? 'source'; const encode = mode !== 'original' || fps !== 'source' || options.packagingEnabled === true
  if (!encode) return ['-c', 'copy']
  const preset = options.encodingPreset === 'fast' ? 'veryfast' : options.encodingPreset === 'quality' ? 'slow' : 'medium'
  const args = ['-c:v', 'libx264', '-preset', preset, '-c:a', 'aac', '-b:a', '128k']
  if (typeof fps === 'number') args.push('-r', String(fps))
  if (mode === 'bitrate' && options.bitrateKbps) args.push('-b:v', Math.round(options.bitrateKbps) + 'k')
  if (mode === 'size' && options.targetSizeMb && window.durationSeconds) { const videoKbps = Math.floor((options.targetSizeMb * 8192) / window.durationSeconds - 160); if (videoKbps < 100) throw new Error('目标文件大小无法容纳当前音视频开销。'); args.push('-b:v', videoKbps + 'k') }
  if (options.packagingEnabled) {
    const p: PackagingConfig = options.packaging ?? { title: options.packagingTitle ?? '短剧', titlePosition: 'top', prompt: '', promptPosition: 'left', badge: 'none' }
    const aspect = p.aspect ?? 'portrait'; const titleSize = p.titleSize === 'small' ? 28 : p.titleSize === 'large' ? 38 : 32; const titleColor = p.titleTone === 'accent' ? 'orange' : 'white'; const overlayAlpha = p.overlay === 'strong' ? '0.72' : p.overlay === 'none' ? '0' : '0.55'
    const [targetWidth, targetHeight] = aspect === 'portrait' ? [1080, 1920] : [1920, 1080]
    const filters = [`scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease`, `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black`, "drawtext=text='" + escapeDrawtextText(p.title) + "':x=(w-text_w)/2:y=" + (p.titlePosition === 'top' ? 'h*0.08' : 'h*0.82') + `:fontsize=${titleSize}:fontcolor=${titleColor}:box=1:boxcolor=black@${overlayAlpha}`]
    if (p.prompt.trim()) {
      const vertical = p.prompt.split('').join('\n')
      const promptDecoration = p.promptStyle === 'outline' ? ':box=0:borderw=2:bordercolor=black@0.9' : `:box=1:boxcolor=black@${overlayAlpha}`
      filters.push("drawtext=text='" + escapeDrawtextText(vertical) + "':x=" + (p.promptPosition === 'left' ? 'w*0.06' : 'w*0.91-text_w') + ':y=(h-text_h)/2:fontsize=20:fontcolor=white' + promptDecoration)
    }
    if (p.badge !== 'none') filters.push("drawtext=text='" + escapeDrawtextText(p.badge) + "':x=w-text_w-w*0.06:y=h*0.08:fontsize=18:fontcolor=black:box=1:boxcolor=orange@0.9")
    args.push('-vf', filters.join(','))
  }
  return args
}

/** Escape text while preserving every user character inside an FFmpeg filtergraph. */
export const escapeDrawtextText = (value: string): string => value
  .replace(/\\/g, '\\\\')
  .replace(/\r\n|\r|\n/g, '\\n')
  .replace(/[':,\[\];]/g, '\\$&')
  .replace(/%/g, '\\\\%')
