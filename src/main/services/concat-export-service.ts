import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveMediaBinary, runMediaProcess, assertSuccessfulProcess } from '../media/ffmpeg-runner.js'
import type { EpisodeInput, PlannedWindow } from './window-planner.js'

export const exportConcatWindow = async (window: PlannedWindow, episodes: readonly EpisodeInput[], outputPath: string): Promise<void> => {
  if (window.status !== 'ready' && window.status !== 'reduced') throw new Error('Window is not exportable')
  const byNumber = new Map(episodes.map((episode) => [episode.episodeNo, episode])); const selected = window.episodeNumbers.map((number) => byNumber.get(number)).filter((episode): episode is EpisodeInput => Boolean(episode))
  if (selected.some((episode) => episode.status !== 'ready')) throw new Error('Window contains unavailable media')
  const folder = await mkdtemp(join(tmpdir(), 'short-drama-concat-')); const listPath = join(folder, 'inputs.txt'); const list = selected.map((episode) => `file '${episode.sourcePath.replace(/'/g, "'\\''")}'`).join('\n')
  try { await writeFile(listPath, list, 'utf8'); const binary = resolveMediaBinary('ffmpeg') ?? 'ffmpeg'; const result = await runMediaProcess(binary, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', outputPath]); assertSuccessfulProcess(result) } finally { await rm(folder, { recursive: true, force: true }) }
}
