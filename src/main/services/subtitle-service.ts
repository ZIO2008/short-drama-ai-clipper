import { readFile } from 'node:fs/promises'

export type SubtitleCue = { index: number; startSeconds: number; endSeconds: number; text: string }

export const parseSubtitleFile = async (filePath: string): Promise<SubtitleCue[]> => parseSubtitleText(await readFile(filePath, 'utf8'))

export const parseSubtitleText = (text: string): SubtitleCue[] => {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []
  return normalized.split(/\n{2,}/).map((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    const timingIndex = lines.findIndex((line) => line.includes('-->'))
    if (timingIndex < 0) return null
    const timing = lines[timingIndex]?.split('-->') ?? []
    const startSeconds = parseTimestamp(timing[0] ?? '')
    const endSeconds = parseTimestamp((timing[1] ?? '').trim().split(/[ \t]/)[0] ?? '')
    if (startSeconds === null || endSeconds === null || endSeconds <= startSeconds) return null
    return { index: Number(lines[0]) || index + 1, startSeconds, endSeconds, text: lines.slice(timingIndex + 1).join('\n') }
  }).filter((cue): cue is SubtitleCue => cue !== null)
}

export const findCuesForRange = (cues: readonly SubtitleCue[], startSeconds: number, endSeconds: number): SubtitleCue[] => cues.filter((cue) => cue.endSeconds > startSeconds && cue.startSeconds < endSeconds)

const parseTimestamp = (value: string): number | null => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/)
  if (!match) return null
  const [, hour, minute, second, millisecond] = match
  return Number(hour) * 3600 + Number(minute) * 60 + Number(second) + Number(millisecond) / 1000
}
