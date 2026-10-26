type NumberedCandidate = { id: string; sequenceNumber?: number }
export const clipSequence = (value: number | undefined): string | null => Number.isSafeInteger(value) && value! > 0 ? String(value).padStart(2, '0') : null
export const clipCandidateLabel = (candidate: NumberedCandidate, fallback = `C-${candidate.id.slice(0, 8)}`): string => {
  const sequence = clipSequence(candidate.sequenceNumber)
  return sequence ? `切片${sequence}` : fallback
}
export const clipExportBaseName = (pattern: string, episodeNo: number | null | undefined, candidate: NumberedCandidate): string => {
  let name = pattern.replaceAll('{episode}', String(episodeNo ?? 'NA').padStart(2, '0')).replaceAll('{candidate}', candidate.id.slice(0, 8))
  if (name.includes('{sequence}')) {
    const sequence = clipSequence(candidate.sequenceNumber)
    if (!sequence) throw new Error('该切片尚无可核验编号，请刷新候选后再导出。')
    name = name.replaceAll('{sequence}', sequence)
  }
  return name.replace(/[\\/:*?"<>|]/g, '_')
}
