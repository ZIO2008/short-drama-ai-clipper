import { basename } from 'node:path'

export type EpisodeCandidate = { path: string; episodeNo: number | null; sortOrder: number }

export const extractEpisodeNumber = (filePath: string): number | null => {
  const name = basename(filePath).replace(/\.[^.]+$/, '')
  const match = name.match(/s\d+e0*(\d{1,4})(?:[^0-9]|$)/i)
    ?? name.match(/第\s*0*(\d{1,4})\s*集/)
    ?? name.match(/(?:^|[^a-z0-9])(?:ep(?:isode)?|e)\s*[-_ ]*0*(\d{1,4})(?:[^0-9]|$)/i)
    ?? name.match(/^\s*0*(\d{1,4})(?:[^0-9]|$)/)
  if (!match?.[1]) return null
  const value = Number(match[1])
  return Number.isInteger(value) && value > 0 ? value : null
}

export const sortEpisodeCandidates = (paths: readonly string[]): EpisodeCandidate[] => paths
  .map((path, index) => ({ path, episodeNo: extractEpisodeNumber(path), sortOrder: index }))
  .sort((left, right) => {
    if (left.episodeNo === null && right.episodeNo === null) return left.sortOrder - right.sortOrder
    return (left.episodeNo ?? Number.MAX_SAFE_INTEGER) - (right.episodeNo ?? Number.MAX_SAFE_INTEGER) || left.path.localeCompare(right.path)
  })
  .map((candidate, index) => ({ ...candidate, sortOrder: index }))

export const findDuplicateEpisodeNumbers = (candidates: readonly EpisodeCandidate[]): number[] => {
  const counts = new Map<number, number>()
  for (const candidate of candidates) {
    if (candidate.episodeNo !== null) counts.set(candidate.episodeNo, (counts.get(candidate.episodeNo) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([episodeNo]) => episodeNo).sort((a, b) => a - b)
}

export const hasContinuousWindow = (episodeNumbers: readonly number[], start: number, size: number): boolean => {
  const set = new Set(episodeNumbers)
  return Array.from({ length: size }, (_, index) => start + index).every((episodeNo) => set.has(episodeNo))
}

export const buildContinuousWindows = (episodeNumbers: readonly number[], size: number): number[][] => {
  if (!Number.isInteger(size) || size < 1) return []
  const sorted = [...new Set(episodeNumbers)].sort((a, b) => a - b)
  return sorted.filter((start) => hasContinuousWindow(sorted, start, size)).map((start) => Array.from({ length: size }, (_, index) => start + index))
}
