export type EpisodeInput = { episodeNo: number; durationSeconds: number | null; sourcePath: string; status: string }
export type PlannedWindow = { startEpisode: number; endEpisode: number; episodeNumbers: number[]; durationSeconds: number | null; status: 'ready' | 'reduced' | 'skipped' | 'blocked'; reason: string | null }

export const planContinuousWindows = (episodes: readonly EpisodeInput[], groupSize: number, tailStrategy: 'reduce' | 'skip' | 'return'): PlannedWindow[] => {
  if (!Number.isInteger(groupSize) || groupSize < 1) throw new Error('Group size must be positive')
  const byNumber = new Map(episodes.filter((episode) => episode.episodeNo > 0).map((episode) => [episode.episodeNo, episode])); const numbers = [...byNumber.keys()].sort((a, b) => a - b); const windows: PlannedWindow[] = []
  for (let index = 0; index < numbers.length; index += 1) {
    const start = numbers[index] ?? 0; const candidate = Array.from({ length: groupSize }, (_, offset) => start + offset); const found = candidate.map((number) => byNumber.get(number)); const contiguous = found.every(Boolean)
    if (!contiguous) { if (index + groupSize > numbers.length) { if (tailStrategy === 'reduce') { const tail = numbers.slice(index); windows.push(makeWindow(tail, byNumber, 'reduced', '尾部不足，已缩减')) } break } windows.push(makeWindow(candidate, byNumber, 'blocked', '存在缺集')); continue }
    windows.push(makeWindow(candidate, byNumber, 'ready', null))
  }
  return windows
}

const makeWindow = (numbers: number[], byNumber: Map<number, EpisodeInput>, status: PlannedWindow['status'], reason: string | null): PlannedWindow => ({ startEpisode: numbers[0] ?? 0, endEpisode: numbers[numbers.length - 1] ?? 0, episodeNumbers: numbers, durationSeconds: numbers.every((number) => byNumber.get(number)?.durationSeconds !== null && byNumber.get(number)?.durationSeconds !== undefined) ? numbers.reduce((sum, number) => sum + (byNumber.get(number)?.durationSeconds ?? 0), 0) : null, status, reason })
