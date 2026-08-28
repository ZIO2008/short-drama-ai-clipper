import type { SubtitleEvidenceComparison, SubtitleEvidenceCue } from '../../../shared/contracts.js'

export const SUBTITLE_PRESSURE_SAMPLE_ID = 'subtitle-pressure-sample'
export const SUBTITLE_PRESSURE_EPISODE_NO = 12
export const SUBTITLE_PRESSURE_DURATION_SECONDS = 180
export const SUBTITLE_PRESSURE_CUE_COUNT = 90

const asrLines = ['门外的脚步声停在走廊尽头', '先把窗帘拉上，别让人看见', '我刚才在楼下看到那辆车了', '你确定这封信不是今天送来的', '等一下，电话里还有一段录音', '他们已经在门口等很久了']
const ocrLines = ['门外的脚步声停在走廊尽头', '先把窗帘拉上，别让人看见', '我刚才在楼下看到那辆车了', '你确定这封信不是今天送来的。', '等一下，电话里还有一段录音', '他们已经在门口等很久了']

export const subtitlePressureSample = (): { asr: SubtitleEvidenceCue[]; ocr: SubtitleEvidenceCue[]; comparisons: SubtitleEvidenceComparison[] } => {
  const asr = Array.from({ length: SUBTITLE_PRESSURE_CUE_COUNT }, (_, index) => ({
    id: `pressure-asr-${index + 1}`,
    index: index + 1,
    startSeconds: index * 2,
    endSeconds: index * 2 + 2,
    text: asrLines[index % asrLines.length],
    confidence: 0.94
  }))
  const ocr = Array.from({ length: SUBTITLE_PRESSURE_CUE_COUNT }, (_, index) => ({
    id: `pressure-ocr-${index + 1}`,
    index: index + 1,
    startSeconds: index * 2,
    endSeconds: index * 2 + 2,
    text: ocrLines[index % ocrLines.length],
    confidence: 0.91
  }))
  const comparisons = asr.map((cue, index) => ({
    asrCueId: cue.id,
    ocrCueId: ocr[index].id,
    timeOverlapSeconds: 2,
    textSimilarity: cue.text === ocr[index].text ? 1 : 0.94,
    asrConfidence: cue.confidence,
    ocrConfidence: ocr[index].confidence,
    conclusion: cue.text === ocr[index].text ? 'consistent' as const : 'different' as const
  }))
  return { asr, ocr, comparisons }
}
