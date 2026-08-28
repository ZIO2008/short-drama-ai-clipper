export type SemanticEvidenceSource = 'import' | 'ocr' | 'asr'

export type SemanticEvidenceCue = {
  id: string
  trackId: string
  sourceKind: SemanticEvidenceSource
  index: number
  startSeconds: number
  endSeconds: number
  text: string
  evidenceNature?: 'reference_unknown' | 'visual_aligned' | 'audio_aligned' | 'manual_resolved'
}

export type SemanticEvent = {
  visualCueIds: string[]
  asrCueIds: string[]
  sourceKinds: SemanticEvidenceSource[]
  startSeconds: number
  endSeconds: number
  cutStartSeconds: number
  cutEndSeconds: number
  conclusion: 'aligned' | 'content-difference' | 'visual-only' | 'asr-only' | 'time-conflict'
  textSimilarity: number | null
  ruleVersion: 'semantic-event-v1'
  reason: string | null
}

const maximumAdjacentGapSeconds = 1.5
const maximumConflictSkewSeconds = 4
const maximumMergedEventDurationSeconds = 15

export const alignSemanticEvents = (cues: readonly SemanticEvidenceCue[]): SemanticEvent[] => {
  // Only evidence with a visual declaration may own a frame-cut boundary.
  // An imported audio alignment is deliberately handled with the ASR chain so
  // its speech timing can never masquerade as visible-text timing.
  const visual = cues.filter((cue) => cue.sourceKind === 'ocr' || (cue.sourceKind === 'import' && cue.evidenceNature === 'visual_aligned')).sort(compareCue)
  const asr = cues.filter((cue) => cue.sourceKind === 'asr' || (cue.sourceKind === 'import' && cue.evidenceNature === 'audio_aligned')).sort(compareCue)
  const usedVisual = new Set<string>()
  const usedAsr = new Set<string>()
  const events: SemanticEvent[] = []

  // Visual sources describe the same frame boundary. Resolve their incompatible
  // timestamps before ASR pairing so an audio match cannot hide a cut conflict.
  const visualConflicts = visualTimeConflicts(visual)
  for (const conflict of visualConflicts) {
    conflict.cues.forEach((cue) => usedVisual.add(cue.id))
    // The audio proof for either conflicting visual window belongs to that
    // unresolved semantic claim.  It must not be emitted later as an
    // apparently independent ASR-only boundary.
    const conflictTexts = [
      joinText(conflict.cues.filter((cue) => cue.sourceKind === 'import')),
      joinText(conflict.cues.filter((cue) => cue.sourceKind === 'ocr'))
    ]
    const conflictAudio = asr.filter((cue) => !usedAsr.has(cue.id) && conflictTexts.some((text) => textSimilarity(cue.text, text) >= 0.82) && conflict.cues.some((visualCue) => rangesNear([cue], [visualCue])))
    conflictAudio.forEach((cue) => usedAsr.add(cue.id))
    events.push(eventFromVisualConflict(conflict.cues, conflictAudio))
  }

  for (let visualStart = 0; visualStart < visual.length; visualStart += 1) {
    const firstVisual = visual[visualStart]!
    if (usedVisual.has(firstVisual.id)) continue
    const candidate = bestMatch(visual, asr, visualStart, usedVisual, usedAsr)
    if (!candidate) continue
    candidate.visual.forEach((cue) => usedVisual.add(cue.id))
    candidate.asr.forEach((cue) => usedAsr.add(cue.id))
    events.push(eventFromPair(candidate.visual, candidate.asr, candidate.similarity, candidate.timeCompatible))
  }

  for (const cue of visual) if (!usedVisual.has(cue.id)) events.push(eventFromSingle([cue], [], 'visual-only'))
  for (const cue of asr) if (!usedAsr.has(cue.id)) events.push(eventFromSingle([], [cue], 'asr-only'))
  return events.sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
}

const bestMatch = (visual: readonly SemanticEvidenceCue[], asr: readonly SemanticEvidenceCue[], visualStart: number, usedVisual: ReadonlySet<string>, usedAsr: ReadonlySet<string>): { visual: SemanticEvidenceCue[]; asr: SemanticEvidenceCue[]; similarity: number; timeCompatible: boolean } | null => {
  let best: { visual: SemanticEvidenceCue[]; asr: SemanticEvidenceCue[]; similarity: number; timeCompatible: boolean; score: number } | null = null
  const visualGroups = consecutiveGroups(visual, visualStart, usedVisual)
  for (const left of visualGroups) {
    for (let asrStart = 0; asrStart < asr.length; asrStart += 1) {
      if (usedAsr.has(asr[asrStart]!.id)) continue
      for (const right of consecutiveGroups(asr, asrStart, usedAsr)) {
        const similarity = textSimilarity(joinText(left), joinText(right))
        const timeCompatible = rangesNear(left, right)
        // Exact/near text can bridge a modest timestamp drift; low-similarity text is
        // still an event when the evidence shares the same time window (e.g. censored wording).
        if (!timeCompatible && (similarity < 0.82 || temporalSkewSeconds(left, right) > maximumConflictSkewSeconds)) continue
        const score = similarity + (timeCompatible ? 0.35 : 0) - Math.abs(left.length - right.length) * 0.03
        if (!best || score > best.score) best = { visual: left, asr: right, similarity, timeCompatible, score }
      }
    }
  }
  return best
}

const consecutiveGroups = (cues: readonly SemanticEvidenceCue[], start: number, used: ReadonlySet<string>): SemanticEvidenceCue[][] => {
  const groups: SemanticEvidenceCue[][] = []
  const group: SemanticEvidenceCue[] = []
  for (let index = start; index < cues.length; index += 1) {
    const cue = cues[index]!
    if (used.has(cue.id)) break
    const previous = group[group.length - 1]
    if (previous && cue.startSeconds - previous.endSeconds > maximumAdjacentGapSeconds) break
    if (cue.endSeconds - cues[start]!.startSeconds > maximumMergedEventDurationSeconds) break
    group.push(cue)
    groups.push([...group])
  }
  return groups
}

const visualTimeConflicts = (cues: readonly SemanticEvidenceCue[]): Array<{ cues: SemanticEvidenceCue[] }> => {
  const conflicts: Array<{ cues: SemanticEvidenceCue[] }> = []
  const used = new Set<string>()
  const importCues = cues.filter((cue) => cue.sourceKind === 'import')
  const ocrCues = cues.filter((cue) => cue.sourceKind === 'ocr')
  for (let leftIndex = 0; leftIndex < importCues.length; leftIndex += 1) {
    if (used.has(importCues[leftIndex]!.id)) continue
    let best: { cues: SemanticEvidenceCue[]; score: number } | null = null
    for (const left of consecutiveGroups(importCues, leftIndex, used)) {
      for (let rightIndex = 0; rightIndex < ocrCues.length; rightIndex += 1) {
        if (used.has(ocrCues[rightIndex]!.id)) continue
        for (const right of consecutiveGroups(ocrCues, rightIndex, used)) {
          const similarity = textSimilarity(joinText(left), joinText(right))
          if (similarity < 0.82 || rangesNear(left, right)) continue
          const score = similarity - Math.abs(left.length - right.length) * 0.03
          if (!best || score > best.score) best = { cues: [...left, ...right], score }
        }
      }
    }
    if (!best) continue
    best.cues.forEach((cue) => used.add(cue.id))
    conflicts.push({ cues: best.cues })
  }
  return conflicts
}

const eventFromVisualConflict = (cues: readonly SemanticEvidenceCue[], audio: readonly SemanticEvidenceCue[] = []): SemanticEvent => ({
  visualCueIds: cues.map((cue) => cue.id), asrCueIds: audio.map((cue) => cue.id), sourceKinds: [...new Set<SemanticEvidenceSource>([...cues.map((cue) => cue.sourceKind), ...audio.map((cue) => cue.sourceKind)])],
  startSeconds: Math.min(...[...cues, ...audio].map((cue) => cue.startSeconds)), endSeconds: Math.max(...[...cues, ...audio].map((cue) => cue.endSeconds)),
  cutStartSeconds: Math.min(...cues.map((cue) => cue.startSeconds)), cutEndSeconds: Math.max(...cues.map((cue) => cue.endSeconds)),
  conclusion: 'time-conflict', textSimilarity: textSimilarity(joinText(cues.filter((cue) => cue.sourceKind === 'import')), joinText(cues.filter((cue) => cue.sourceKind === 'ocr'))), ruleVersion: 'semantic-event-v1', reason: '两条画面文字证据语义相近但时间窗不相容，不能作为自动切点。'
})

const eventFromPair = (visual: SemanticEvidenceCue[], asr: SemanticEvidenceCue[], similarity: number, timeCompatible: boolean): SemanticEvent => {
  const visualStart = Math.min(...visual.map((cue) => cue.startSeconds)); const visualEnd = Math.max(...visual.map((cue) => cue.endSeconds))
  const asrStart = Math.min(...asr.map((cue) => cue.startSeconds)); const asrEnd = Math.max(...asr.map((cue) => cue.endSeconds))
  const sameText = similarity >= 0.82
  return {
    visualCueIds: visual.map((cue) => cue.id), asrCueIds: asr.map((cue) => cue.id), sourceKinds: [...new Set<SemanticEvidenceSource>([...visual.map((cue) => cue.sourceKind), 'asr'])],
    startSeconds: Math.min(visualStart, asrStart), endSeconds: Math.max(visualEnd, asrEnd),
    // Visual text is deliberately the cut reference whenever an OCR/import event and
    // an ASR event describe the same semantic event. ASR remains linked as audio evidence.
    cutStartSeconds: visualStart, cutEndSeconds: visualEnd,
    // Textual agreement is enough to connect the two evidence chains. Their
    // timestamp drift is diagnostic context, not a reason to discard a visual
    // cut boundary: OCR/import owns the cut while ASR remains the audio proof.
    conclusion: sameText ? 'aligned' : 'content-difference',
    textSimilarity: similarity, ruleVersion: 'semantic-event-v1',
    reason: timeCompatible
      ? (sameText ? null : '同一时间窗文本不同，保留为内容差异。')
      : (sameText ? 'ASR 时间码与画面文字存在偏移，切点采用画面文字时间，ASR 保留为声音证据。' : '文本存在差异且时间码有偏移，切点采用画面文字时间并保留两源证据。')
  }
}

const eventFromSingle = (visual: SemanticEvidenceCue[], asr: SemanticEvidenceCue[], conclusion: 'visual-only' | 'asr-only'): SemanticEvent => {
  const cue = (visual[0] ?? asr[0])!
  return { visualCueIds: visual.map((item) => item.id), asrCueIds: asr.map((item) => item.id), sourceKinds: [...new Set([...visual.map((item) => item.sourceKind), ...asr.map((item) => item.sourceKind)])], startSeconds: cue.startSeconds, endSeconds: cue.endSeconds, cutStartSeconds: cue.startSeconds, cutEndSeconds: cue.endSeconds, conclusion, textSimilarity: null, ruleVersion: 'semantic-event-v1', reason: conclusion === 'visual-only' ? '仅有画面文字证据。' : '仅有声音证据。' }
}

const rangesNear = (left: readonly SemanticEvidenceCue[], right: readonly SemanticEvidenceCue[]): boolean => {
  const start = Math.max(Math.min(...left.map((cue) => cue.startSeconds)), Math.min(...right.map((cue) => cue.startSeconds)))
  const end = Math.min(Math.max(...left.map((cue) => cue.endSeconds)), Math.max(...right.map((cue) => cue.endSeconds)))
  if (end >= start) return true
  return Math.min(Math.abs(Math.min(...left.map((cue) => cue.startSeconds)) - Math.max(...right.map((cue) => cue.endSeconds))), Math.abs(Math.min(...right.map((cue) => cue.startSeconds)) - Math.max(...left.map((cue) => cue.endSeconds)))) <= maximumAdjacentGapSeconds
}

const temporalSkewSeconds = (left: readonly SemanticEvidenceCue[], right: readonly SemanticEvidenceCue[]): number => Math.abs(Math.min(...left.map((cue) => cue.startSeconds)) - Math.min(...right.map((cue) => cue.startSeconds)))

const joinText = (cues: readonly SemanticEvidenceCue[]): string => cues.map((cue) => cue.text).join('')
const normalize = (value: string): string => value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
const textSimilarity = (left: string, right: string): number => {
  const a = normalize(left); const b = normalize(right)
  if (!a || !b) return 0
  if (a === b) return 1
  const rows = Array.from({ length: b.length + 1 }, (_value, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = rows[0]!
    rows[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const previous = rows[j]!
      rows[j] = Math.min(rows[j]! + 1, rows[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = previous
    }
  }
  return Number((1 - rows[b.length]! / Math.max(a.length, b.length)).toFixed(4))
}

const compareCue = (left: SemanticEvidenceCue, right: SemanticEvidenceCue): number => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds || left.index - right.index
