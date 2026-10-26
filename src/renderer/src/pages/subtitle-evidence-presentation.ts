import type { EpisodeAsset, SubtitleAsset, SubtitleEvidenceComparison, SubtitleEvidenceCue, SubtitleEvidenceTrack } from '../../../shared/contracts.js'

export type SubtitleStatusOptions = { loading?: boolean; executing?: boolean; failure?: { kind: 'read' | 'execution'; message: string } }
export type TextEvidence = { label: string; cues: SubtitleEvidenceCue[] }

const MAX_RENDERED_EVIDENCE = 90

export const formatEpisode = (episodeNo: number | null): string => `第 ${String(episodeNo ?? '—').padStart(2, '0')} 集`
export const formatRatio = (episode: EpisodeAsset): string => episode.videoWidth && episode.videoHeight ? `${episode.videoWidth}:${episode.videoHeight}` : '画幅待读取'
export const hasReadableMedia = (episode: EpisodeAsset): boolean => Boolean(episode.sourcePath.trim()) && !['missing', 'unreadable', 'deleted'].includes(episode.status)
export const visualTrack = (tracks: SubtitleEvidenceTrack[]): SubtitleEvidenceTrack | undefined => tracks.find((track) => track.sourceKind === 'ocr')
export const asrTrack = (tracks: SubtitleEvidenceTrack[]): SubtitleEvidenceTrack | undefined => tracks.find((track) => track.sourceKind === 'asr')
export const importedTrack = (tracks: SubtitleEvidenceTrack[]): SubtitleEvidenceTrack | undefined => tracks.find((track) => track.sourceKind === 'import')
export const textTracks = (tracks: SubtitleEvidenceTrack[]): SubtitleEvidenceTrack[] => [asrTrack(tracks), importedTrack(tracks)].filter((track): track is SubtitleEvidenceTrack => Boolean(track))
export const ocrInputTrack = (tracks: SubtitleEvidenceTrack[]): SubtitleEvidenceTrack | undefined => asrTrack(tracks) ?? importedTrack(tracks)

export const renderSubtitleStatus = (episode: EpisodeAsset, tracks: SubtitleEvidenceTrack[], assets: SubtitleAsset[], options: SubtitleStatusOptions = {}): { label: string; tone: 'success' | 'warning' | 'danger'; canView: boolean } => {
  if (options.failure) return { label: options.failure.kind === 'execution' ? '执行失败' : '读取失败', tone: 'danger', canView: false }
  if (options.executing) return { label: '识别中', tone: 'warning', canView: false }
  if (options.loading) return { label: '读取中', tone: 'warning', canView: false }
  if (!hasReadableMedia(episode)) return { label: '媒体缺失', tone: 'danger', canView: false }
  if (tracks.some((track) => track.sourceKind === 'resolved')) return { label: '已校验', tone: 'success', canView: true }
  if (textTracks(tracks).length > 0 || visualTrack(tracks)) return { label: '待校验', tone: 'warning', canView: true }
  if (assets.length > 0) return { label: '待分集校验', tone: 'warning', canView: false }
  return { label: '未导入', tone: 'warning', canView: false }
}

export const renderSubtitleAssetLabel = (tracks: SubtitleEvidenceTrack[], assets: SubtitleAsset[]): string => {
  const labels = tracks.map((track) => track.sourceKind === 'asr' ? 'ASR' : track.sourceKind === 'ocr' ? 'OCR' : track.sourceKind === 'import' ? 'ASR（导入）' : '校对轨')
  if (labels.length > 0) return [...new Set(labels)].join(' + ')
  return assets.length > 0 ? `剧目级导入字幕（${assets.length}）` : '—'
}

export const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character)
const formatTime = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}.${Math.floor((seconds % 1) * 10)}`

export const evidenceRows = (textEvidence: TextEvidence[], visual: SubtitleEvidenceCue[], comparisons: SubtitleEvidenceComparison[]): string => {
  const count = Math.min(MAX_RENDERED_EVIDENCE, Math.max(visual.length, ...textEvidence.map(({ cues }) => cues.length)))
  if (count === 0) return '<div class="r5-evidence-row"><small>—</small><div><small>状态</small><br><b>暂无可用证据</b></div><div><small>下一步</small><br><b>导入字幕或等待 ASR 轨可用</b></div></div>'
  return Array.from({ length: count }, (_, index) => {
    const audio = textEvidence.find(({ cues }) => cues[index])?.cues[index]
    const picture = visual[index]
    const comparison = comparisons[index]
    const conclusion = comparison?.conclusion === 'consistent' ? '一致' : comparison?.conclusion === 'different' ? '画面与音频不同' : comparison?.conclusion === 'needs_review' ? '待校验' : audio && !picture ? '仅音频' : picture && !audio ? '仅画面' : '待校验'
    const text = textEvidence.map(({ label, cues }) => `${textEvidence.length > 1 ? `<small>${escapeHtml(label)}</small><br>` : ''}<b>${escapeHtml(cues[index]?.text ?? '—')}</b>`).join('<br>')
    return `<div class="r5-evidence-row"><small>${audio ? formatTime(audio.startSeconds) : picture ? formatTime(picture.startSeconds) : '—'}</small><div><small>ASR / 导入</small><br>${text || '<b>—</b>'}</div><div><small>OCR</small><br><b>${escapeHtml(picture?.text ?? '—')}</b><br><span class="status">${conclusion}</span></div></div>`
  }).join('')
}

export const evidenceHead = (episode: EpisodeAsset): string => `<div class="r5-evidence-head"><b>${escapeHtml(formatEpisode(episode.episodeNo))} · 对齐差异与校验结论</b><span>原始证据不可覆盖</span></div>`
export const pressureEvidenceHead = (episodeNo: number, durationSeconds: number, cueCount: number): string => `<div class="r5-evidence-head"><b>第 ${String(episodeNo).padStart(2, '0')} 集 · ${Math.floor(durationSeconds / 60)} 分钟完整字幕压力测试</b><span>00:00.0 — 03:00.0 · ${cueCount} 条 ASR / OCR 片段</span></div>`
