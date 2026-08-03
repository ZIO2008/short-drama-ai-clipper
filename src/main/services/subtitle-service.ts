import { readFile } from 'node:fs/promises'

export type SubtitleCue = { index: number; startSeconds: number; endSeconds: number; text: string; confidence?: number | null }
export type SubtitleCueComparison = { asrIndex: number | null; ocrIndex: number | null; timeOverlapSeconds: number; textSimilarity: number; asrConfidence: number | null; ocrConfidence: number | null; conclusion: 'consistent' | 'different' | 'asr_only' | 'ocr_only' | 'needs_review'; needsReview: boolean }

export const parseSubtitleFile = async (filePath: string): Promise<SubtitleCue[]> => parseSubtitleText(await readFile(filePath, 'utf8'))

export const parseSubtitleText = (text: string): SubtitleCue[] => {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  let cueIndex = 0
  return normalized.split(/\n{2,}/).map((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    const timingIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingIndex < 0) return null
    const timing = lines[timingIndex]?.split('-->') ?? []
    const startSeconds = parseTimestamp(timing[0] ?? '')
    const endSeconds = parseTimestamp((timing[1] ?? '').trim().split(/[ \t]/)[0] ?? '')
    if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) return null
    const declaredIndex = Number(lines[0]); const resolvedIndex = Number.isInteger(declaredIndex) && declaredIndex > 0 ? declaredIndex : cueIndex + 1
    cueIndex = Math.max(cueIndex, resolvedIndex)
    return { index: resolvedIndex || index + 1, startSeconds, endSeconds, text: lines.slice(timingIndex + 1).join('\n') }
  }).filter((cue): cue is SubtitleCue => cue !== null)
}

export const findCuesForRange = (cues: readonly SubtitleCue[], startSeconds: number, endSeconds: number): SubtitleCue[] => cues.filter((cue) => cue.endSeconds > startSeconds && cue.startSeconds < endSeconds)

export const formatSrt = (cues: readonly SubtitleCue[]): string => cues.map((cue, index) => `${index + 1}\n${formatTimestamp(cue.startSeconds)} --> ${formatTimestamp(cue.endSeconds)}\n${cue.text.trim()}`).join('\n\n') + (cues.length > 0 ? '\n' : '')
export const formatVtt = (cues: readonly SubtitleCue[]): string => `WEBVTT\n\n${cues.map((cue) => `${formatTimestamp(cue.startSeconds, '.')} --> ${formatTimestamp(cue.endSeconds, '.')}\n${cue.text.trim()}`).join('\n\n')}${cues.length > 0 ? '\n' : ''}`

export const compareSubtitleCues = (asrCues: readonly SubtitleCue[], ocrCues: readonly SubtitleCue[], minimumSimilarity = 0.85, minimumConfidence = 0.75): SubtitleCueComparison[] => {
  if (!Number.isFinite(minimumSimilarity) || minimumSimilarity < 0 || minimumSimilarity > 1) throw new Error('minimumSimilarity must be between 0 and 1')
  if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1) throw new Error('minimumConfidence must be between 0 and 1')
  const pairs = asrCues.flatMap((asrCue) => ocrCues.map((ocrCue) => ({ asrCue, ocrCue, timeOverlapSeconds: Math.max(0, Math.min(asrCue.endSeconds, ocrCue.endSeconds) - Math.max(asrCue.startSeconds, ocrCue.startSeconds)) }))).filter(({ timeOverlapSeconds }) => timeOverlapSeconds > 0).sort((left, right) => right.timeOverlapSeconds - left.timeOverlapSeconds)
  const matchedAsr = new Set<number>(); const matchedOcr = new Set<number>(); const comparisons: SubtitleCueComparison[] = []
  for (const { asrCue, ocrCue, timeOverlapSeconds } of pairs) {
    if (matchedAsr.has(asrCue.index) || matchedOcr.has(ocrCue.index)) continue
    matchedAsr.add(asrCue.index); matchedOcr.add(ocrCue.index)
    const textSimilarity = calculateTextSimilarity(asrCue.text, ocrCue.text); const asrConfidence = asrCue.confidence ?? null; const ocrConfidence = ocrCue.confidence ?? null
    const lowConfidence = (asrConfidence !== null && asrConfidence < minimumConfidence) || (ocrConfidence !== null && ocrConfidence < minimumConfidence)
    const conclusion = lowConfidence ? 'needs_review' : textSimilarity >= minimumSimilarity ? 'consistent' : 'different'
    comparisons.push({ asrIndex: asrCue.index, ocrIndex: ocrCue.index, timeOverlapSeconds, textSimilarity, asrConfidence, ocrConfidence, conclusion, needsReview: conclusion !== 'consistent' })
  }
  for (const cue of asrCues) if (!matchedAsr.has(cue.index)) comparisons.push({ asrIndex: cue.index, ocrIndex: null, timeOverlapSeconds: 0, textSimilarity: 0, asrConfidence: cue.confidence ?? null, ocrConfidence: null, conclusion: 'asr_only', needsReview: true })
  for (const cue of ocrCues) if (!matchedOcr.has(cue.index)) comparisons.push({ asrIndex: null, ocrIndex: cue.index, timeOverlapSeconds: 0, textSimilarity: 0, asrConfidence: null, ocrConfidence: cue.confidence ?? null, conclusion: 'ocr_only', needsReview: true })
  return comparisons.sort((left, right) => (left.asrIndex ?? left.ocrIndex ?? 0) - (right.asrIndex ?? right.ocrIndex ?? 0))
}

export const calculateTextSimilarity = (left: string, right: string): number => {
  const normalizedLeft = normalizeSubtitleText(left); const normalizedRight = normalizeSubtitleText(right)
  if (normalizedLeft === normalizedRight) return 1
  if (!normalizedLeft || !normalizedRight) return 0
  const previous = Array.from({ length: normalizedRight.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= normalizedLeft.length; leftIndex += 1) {
    let diagonal = previous[0] ?? 0; previous[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= normalizedRight.length; rightIndex += 1) {
      const above = previous[rightIndex] ?? rightIndex; const leftValue = previous[rightIndex - 1] ?? leftIndex; const substitution = diagonal + (normalizedLeft[leftIndex - 1] === normalizedRight[rightIndex - 1] ? 0 : 1)
      diagonal = above; previous[rightIndex] = Math.min(above + 1, leftValue + 1, substitution)
    }
  }
  return 1 - (previous[normalizedRight.length] ?? 0) / Math.max(normalizedLeft.length, normalizedRight.length)
}

const normalizeSubtitleText = (value: string): string => value.replace(/\s+/g, '').replace(/[，。！？、；：“”‘’,.!?;:'"`~()（）【】\[\]{}]/g, '').toLocaleLowerCase()

const formatTimestamp = (seconds: number, separator = ','): string => {
  const milliseconds = Math.max(0, Math.round(seconds * 1000)); const hours = Math.floor(milliseconds / 3_600_000); const minutes = Math.floor((milliseconds % 3_600_000) / 60_000); const remainingSeconds = Math.floor((milliseconds % 60_000) / 1000); const remainder = milliseconds % 1000
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}${separator}${String(remainder).padStart(3, '0')}`
}

const parseTimestamp = (value: string): number | null => {
  const normalized = value.trim()
  const long = normalized.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/)
  if (long) return Number(long[1]) * 3600 + Number(long[2]) * 60 + Number(long[3]) + Number(long[4]) / 1000
  const short = normalized.match(/^(\d{1,2}):(\d{2})[,.](\d{3})$/)
  if (!short) return null
  return Number(short[1]) * 60 + Number(short[2]) + Number(short[3]) / 1000
}
