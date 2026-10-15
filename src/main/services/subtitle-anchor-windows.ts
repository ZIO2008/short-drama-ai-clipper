import { analyzeSubtitleTimeQuality, type SubtitleTimeQuality, type SubtitleTimeQualitySource, type SubtitleTimingCue } from './subtitle-time-quality.js'

/** Select trustworthy local intervals without altering source timestamps or cue identity. */
export const selectSubtitleAnchorWindows = <T extends SubtitleTimingCue>(input: {
  sourceKind: SubtitleTimeQualitySource
  cues: readonly T[]
  durationSeconds?: number | null
  cost?: Readonly<Record<string, unknown>>
}): { cues: T[]; windows: Array<{ startSeconds: number; endSeconds: number; quality: SubtitleTimeQuality }> } => {
  const result: { cues: T[]; windows: Array<{ startSeconds: number; endSeconds: number; quality: SubtitleTimeQuality }> } = { cues: [], windows: [] }
  const trackQuality = analyzeSubtitleTimeQuality(input)
  // Sparsity and coarse ASR rows are recoverable locally; invalid source evidence is not.
  if (trackQuality.status === 'insufficient') return result
  if (typeof input.durationSeconds === 'number' && Number.isFinite(input.durationSeconds) &&
      input.cues.some((cue) => cue.endSeconds > input.durationSeconds!)) return result

  const sorted = input.cues.filter((cue) => input.sourceKind !== 'asr' || cue.endSeconds - cue.startSeconds <= 20)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
  let group: T[] = []
  let coveredEnd = 0
  const finishGroup = (): void => {
    if (!group.length) return
    const startSeconds = group[0].startSeconds
    const endSeconds = Math.max(...group.map((cue) => cue.endSeconds))
    // Count each time range once; preserve legitimate overlap and original cue rows.
    const unique = [...new Map(group.map((cue) => [`${cue.startSeconds}:${cue.endSeconds}`, cue])).values()]
    // A duplicate-only micro-fragment cannot support the minimum three-second candidate.
    if (group.length > 1 && unique.length === 1 && endSeconds - startSeconds < 3) return
    const quality = analyzeSubtitleTimeQuality({
      sourceKind: input.sourceKind,
      cost: input.cost,
      durationSeconds: endSeconds - startSeconds,
      cues: unique.map((cue) => ({ startSeconds: cue.startSeconds - startSeconds, endSeconds: cue.endSeconds - startSeconds }))
    })
    if (quality.status !== 'qualified') return
    result.cues.push(...group)
    result.windows.push({ startSeconds, endSeconds, quality })
  }
  for (const cue of sorted) {
    if (group.length && cue.startSeconds - coveredEnd > 20) {
      finishGroup()
      group = []
    }
    group.push(cue)
    coveredEnd = Math.max(group.length === 1 ? cue.endSeconds : coveredEnd, cue.endSeconds)
  }
  finishGroup()
  return result
}
