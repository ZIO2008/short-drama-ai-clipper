export type SubtitleTimeQualitySource = 'import' | 'asr' | 'ocr' | 'resolved'
export type SubtitleTimeQualityStatus = 'qualified' | 'limited' | 'insufficient'
export type SubtitleTimeQualityReasonCode =
  | 'qualified'
  | 'missing-cues'
  | 'invalid-timing'
  | 'legacy-asr-format'
  | 'missing-asr-metadata'
  | 'coarse-asr-time-axis'
  | 'sparse-asr-time-axis'
  | 'limited-cues'

export type SubtitleTimingCue = { startSeconds: number; endSeconds: number }
export type SubtitleTimeQuality = {
  sourceKind: SubtitleTimeQualitySource
  status: SubtitleTimeQualityStatus
  reasonCode: SubtitleTimeQualityReasonCode
  cueCount: number
  validCueCount: number
  invalidCueCount: number
  averageCueDurationSeconds: number | null
  maxCueDurationSeconds: number | null
  coveredSeconds: number
  coverageRatio: number | null
  maxGapSeconds: number | null
  cueDensityPerMinute: number | null
  minimumCueCount: number
  resultFormat: number | null
  sentenceMaxLength: number | null
}

type Input = {
  sourceKind: SubtitleTimeQualitySource
  cues: readonly SubtitleTimingCue[]
  durationSeconds?: number | null
  cost?: Readonly<Record<string, unknown>>
}

const finiteNumber = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
const round = (value: number): number => Math.round(value * 1000) / 1000

export const analyzeSubtitleTimeQuality = (input: Input): SubtitleTimeQuality => {
  const valid = input.cues
    .filter((cue) => Number.isFinite(cue.startSeconds) && Number.isFinite(cue.endSeconds) && cue.startSeconds >= 0 && cue.endSeconds > cue.startSeconds)
    .map((cue) => ({ startSeconds: cue.startSeconds, endSeconds: cue.endSeconds }))
    .sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
  const invalidCueCount = input.cues.length - valid.length
  const durations = valid.map((cue) => cue.endSeconds - cue.startSeconds)
  const averageCueDurationSeconds = durations.length ? round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null
  const maxCueDurationSeconds = durations.length ? round(Math.max(...durations)) : null
  let coveredSeconds = 0
  let maxGapSeconds: number | null = null
  let coveredEnd = 0
  for (const cue of valid) {
    // The gap before the first real cue is an unanchored section too. The tail is
    // intentionally not treated as a gap: automatic candidates must end on a cue.
    maxGapSeconds = Math.max(maxGapSeconds ?? 0, Math.max(0, cue.startSeconds - coveredEnd))
    if (cue.endSeconds > coveredEnd) {
      coveredSeconds += Math.max(0, cue.endSeconds - Math.max(coveredEnd, cue.startSeconds))
      coveredEnd = cue.endSeconds
    }
  }
  const durationSeconds = finiteNumber(input.durationSeconds)
  const coverageRatio = durationSeconds !== null && durationSeconds > 0 ? round(Math.min(1, coveredSeconds / durationSeconds)) : null
  const cueDensityPerMinute = durationSeconds !== null && durationSeconds > 0 ? round(valid.length / (durationSeconds / 60)) : null
  const minimumCueCount = input.sourceKind === 'asr' && durationSeconds !== null && durationSeconds > 0
    ? Math.max(1, Math.ceil(durationSeconds / 20))
    : durationSeconds !== null && durationSeconds <= 20 ? 1 : 2
  const resultFormat = finiteNumber(input.cost?.resultFormat)
  const sentenceMaxLength = finiteNumber(input.cost?.sentenceMaxLength)

  let status: SubtitleTimeQualityStatus = 'qualified'
  let reasonCode: SubtitleTimeQualityReasonCode = 'qualified'
  if (valid.length === 0) {
    status = 'insufficient'; reasonCode = 'missing-cues'
  } else if (invalidCueCount > 0) {
    status = 'insufficient'; reasonCode = 'invalid-timing'
  } else if (input.sourceKind === 'asr' && resultFormat !== 3) {
    status = 'insufficient'; reasonCode = resultFormat === null ? 'missing-asr-metadata' : 'legacy-asr-format'
  } else if (input.sourceKind === 'asr' && sentenceMaxLength !== null && (sentenceMaxLength < 6 || sentenceMaxLength > 40)) {
    status = 'insufficient'; reasonCode = 'missing-asr-metadata'
  } else {
    // One anchor per 20 seconds is the minimum needed for automatic cut-point generation.
    // It does not judge subtitle completeness, and never restricts manual clipping.
    const insufficientCoverage = coverageRatio !== null && coverageRatio < 0.05
    const sparseDistribution = maxGapSeconds !== null && maxGapSeconds > 20
    if (valid.length < minimumCueCount || insufficientCoverage || sparseDistribution) {
      status = 'limited'; reasonCode = input.sourceKind === 'asr' ? 'sparse-asr-time-axis' : 'limited-cues'
    } else if (input.sourceKind === 'asr' && (maxCueDurationSeconds ?? 0) > 20) {
      status = 'limited'; reasonCode = 'coarse-asr-time-axis'
    }
  }
  return { sourceKind: input.sourceKind, status, reasonCode, cueCount: input.cues.length, validCueCount: valid.length, invalidCueCount, averageCueDurationSeconds, maxCueDurationSeconds, coveredSeconds: round(coveredSeconds), coverageRatio, maxGapSeconds: maxGapSeconds === null ? null : round(maxGapSeconds), cueDensityPerMinute, minimumCueCount, resultFormat, sentenceMaxLength }
}

export const isSafeSubtitleAnchor = (quality: SubtitleTimeQuality): boolean => quality.status === 'qualified'
