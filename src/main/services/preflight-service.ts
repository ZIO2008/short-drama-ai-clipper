import { access, constants, stat, statfs } from 'node:fs/promises'
import type { EpisodeInput, PlannedWindow } from './window-planner.js'
import { isProductionReady } from '../../shared/production-readiness.js'

export type PreflightItem = PlannedWindow & { ok: boolean; checks: { episodes: boolean; media: boolean; disk: boolean } }
export type PreflightOptions = { estimateRequiredBytes?: (window: PlannedWindow, episodes: readonly EpisodeInput[]) => number | null | Promise<number | null>; availableBytes?: number }
const DISK_RESERVE_BYTES = 64 * 1024 * 1024
export const preflightWindows = async (windows: readonly PlannedWindow[], episodes: readonly EpisodeInput[], outputDirectory: string, options: PreflightOptions = {}): Promise<PreflightItem[]> => {
  const byNumber = new Map(episodes.map((episode) => [episode.episodeNo, episode])); let diskFree = Number.isFinite(options.availableBytes) ? Math.max(0, options.availableBytes ?? 0) : 0
  if (!Number.isFinite(options.availableBytes)) try { const stats = await statfs(outputDirectory); diskFree = Number(stats.bavail) * Number(stats.bsize) } catch { diskFree = 0 }
  const estimates = await Promise.all(windows.map(async (window) => options.estimateRequiredBytes ? await options.estimateRequiredBytes(window, episodes) : await sourceBytes(window.episodeNumbers.map((number) => byNumber.get(number)))) )
  let reservedBytes = 0
  const results: PreflightItem[] = []
  for (const [index, window] of windows.entries()) {
    const selected = window.episodeNumbers.map((number) => byNumber.get(number)); const media = (await Promise.all(selected.map(async (episode) => episode ? await isReadableMedia(episode.sourcePath) && isProductionReady(episode.status) : false))).every(Boolean); const episodesOk = window.status === 'ready' || window.status === 'reduced'; const estimated = estimates[index] ?? 0; const disk = isDiskEnough(Math.max(0, diskFree - reservedBytes), estimated); if (episodesOk && media && disk) reservedBytes += estimated
    results.push({ ...window, ok: episodesOk && media && disk, reason: !media ? '窗口包含失联或不可读媒体。' : !disk ? '输出目录磁盘空间不足。' : window.reason, checks: { episodes: episodesOk, media, disk } })
  }
  return results
}

export const isDiskEnough = (freeBytes: number, requiredBytes: number): boolean => freeBytes > 0 && requiredBytes >= 0 && freeBytes >= requiredBytes + DISK_RESERVE_BYTES
const sourceBytes = async (episodes: Array<EpisodeInput | undefined>): Promise<number> => { const sizes = await Promise.all(episodes.map(async (episode) => { if (!episode) return 0; try { return (await stat(episode.sourcePath)).size } catch { return 0 } })); return sizes.reduce((sum, size) => sum + size, 0) }
const isReadableMedia = async (path: string): Promise<boolean> => { try { await access(path, constants.R_OK); return (await stat(path)).isFile() } catch { return false } }
