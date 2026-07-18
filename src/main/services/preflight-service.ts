import { statfs } from 'node:fs/promises'
import type { EpisodeInput, PlannedWindow } from './window-planner.js'

export type PreflightItem = PlannedWindow & { ok: boolean; checks: { episodes: boolean; media: boolean; disk: boolean } }
export const preflightWindows = async (windows: readonly PlannedWindow[], episodes: readonly EpisodeInput[], outputDirectory: string): Promise<PreflightItem[]> => {
  const byNumber = new Map(episodes.map((episode) => [episode.episodeNo, episode])); let diskFree = 0
  try { const stats = await statfs(outputDirectory); diskFree = Number(stats.bavail) * Number(stats.bsize) } catch { diskFree = 0 }
  return windows.map((window) => { const selected = window.episodeNumbers.map((number) => byNumber.get(number)); const media = selected.every((episode) => episode?.status === 'ready'); const episodesOk = window.status === 'ready' || window.status === 'reduced'; const disk = diskFree > 0; return { ...window, ok: episodesOk && media && disk, checks: { episodes: episodesOk, media, disk } } })
}
