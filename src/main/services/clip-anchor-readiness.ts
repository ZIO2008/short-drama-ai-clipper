import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { fingerprintMediaSource } from '../media/media-source-fingerprint.js'
import { isSourceFramePtsRange, readSourceVideoFramePts, SCENE_ANCHOR_PTS_VERIFIER_VERSION, type SourceVideoFramePts } from '../media/scene-anchor-pts-verifier.js'
import { alignSemanticEvents, type SemanticEvent, type SemanticEvidenceCue } from './semantic-event-alignment-service.js'
import { analyzeSubtitleTimeQuality, type SubtitleTimeQuality, type SubtitleTimeQualitySource } from './subtitle-time-quality.js'
import { overlapRatio } from './clip-service-utils.js'
import { selectSubtitleAnchorWindows } from './subtitle-anchor-windows.js'

type CutAnchorSourceKind = Exclude<SubtitleTimeQualitySource, 'resolved'>
export type CutAnchor = { startSeconds: number; endSeconds: number; semanticEventId?: string; sceneAnchorId?: string; blocksAutomaticCandidate?: boolean }
export type CandidateAnchorRange = { startSeconds: number; endSeconds: number; semanticEventIds: string[]; sceneAnchorIds: string[] }
export type AnchorReadiness = { sourceKind: CutAnchorSourceKind | 'multi' | 'scene' | null; quality: SubtitleTimeQuality | null; reason: string | null; anchors: CutAnchor[] }

const verifiedSceneAnchorSchema = z.object({ anchorKind: z.enum(['shot-transition', 'scene-transition']), ptsVerified: z.literal(true), sourceMediaFingerprint: z.string().trim().min(1).max(256), verifierVersion: z.literal(SCENE_ANCHOR_PTS_VERIFIER_VERSION) })
const subtitleQualityReason = (sourceKind: CutAnchorSourceKind, reasonCode: SubtitleTimeQuality['reasonCode']): string => {
  if (reasonCode === 'missing-cues') return `${sourceKind.toUpperCase()} 轨道没有可用字幕时间条目。`
  if (reasonCode === 'invalid-timing') return `${sourceKind.toUpperCase()} 轨道存在无效字幕起止时间。`
  if (reasonCode === 'legacy-asr-format') return 'ASR 轨道不是官方字幕句级返回格式，需使用 ResTextFormat=3 重新识别。'
  if (reasonCode === 'missing-asr-metadata') return 'ASR 轨道缺少 ResTextFormat=3 的验证元数据，按历史结果阻断智能切点。'
  if (reasonCode === 'coarse-asr-time-axis') return 'ASR 时间轴过粗（字幕条数过少或单条过长），不能作为智能切点依据。'
  if (reasonCode === 'sparse-asr-time-axis') return 'ASR 时间锚点分布或覆盖不足，不能支撑智能切点；请重跑识别或使用导入/OCR 字幕。'
  return `${sourceKind.toUpperCase()} 字幕时间锚点分布或覆盖不足，不能支撑智能切点。`
}

const persistSemanticEvents = (database: Database.Database, dramaId: string, episodeId: string, events: readonly SemanticEvent[]): Array<SemanticEvent & { id: string }> => {
  const now = new Date().toISOString(); const persisted = events.map((event) => ({ ...event, id: randomUUID() }))
  database.transaction(() => {
    database.prepare("DELETE FROM subtitle_semantic_events WHERE drama_id = ? AND episode_id = ? AND rule_version = 'semantic-event-v1' AND id NOT IN (SELECT semantic_event_id FROM clip_candidate_semantic_events)").run(dramaId, episodeId)
    const insertEvent = database.prepare('INSERT INTO subtitle_semantic_events (id, drama_id, episode_id, rule_version, conclusion, source_kinds_json, start_seconds, end_seconds, cut_start_seconds, cut_end_seconds, text_similarity, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    const insertCue = database.prepare('INSERT INTO subtitle_semantic_event_cues (event_id, cue_id, role) VALUES (?, ?, ?)')
    for (const event of persisted) { insertEvent.run(event.id, dramaId, episodeId, event.ruleVersion, event.conclusion, JSON.stringify(event.sourceKinds), event.startSeconds, event.endSeconds, event.cutStartSeconds, event.cutEndSeconds, event.textSimilarity, event.reason, now, now); for (const cueId of event.visualCueIds) insertCue.run(event.id, cueId, 'visual'); for (const cueId of event.asrCueIds) insertCue.run(event.id, cueId, 'asr') }
  })()
  return persisted
}

export const readAnchorReadiness = (database: Database.Database, ptsCache: Map<string, SourceVideoFramePts | null>, dramaId: string, episodeId: string, durationSeconds: number): AnchorReadiness => {
  const rows = database.prepare("SELECT id, source_kind AS sourceKind, acquisition, evidence_nature AS evidenceNature, cost_json AS costJson FROM subtitle_tracks WHERE drama_id = ? AND episode_id = ? AND status = 'active' AND source_kind IN ('import', 'ocr', 'asr') ORDER BY created_at DESC, id DESC").all(dramaId, episodeId) as Array<{ id: string; sourceKind: CutAnchorSourceKind; acquisition: 'imported' | 'generated' | 'manual'; evidenceNature: 'reference_unknown' | 'visual_aligned' | 'audio_aligned' | 'manual_resolved'; costJson: string }>
  let firstReason: string | null = null
  const qualified: Array<{ sourceKind: CutAnchorSourceKind; quality: SubtitleTimeQuality; cues: SemanticEvidenceCue[] }> = []
  for (const row of rows) {
    let cost: Record<string, unknown> = {}; try { const parsed: unknown = JSON.parse(row.costJson); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) cost = parsed as Record<string, unknown> } catch { /* Legacy rows are assessed as unverified. */ }
    const cues = database.prepare('SELECT id, cue_index AS `index`, start_seconds AS startSeconds, end_seconds AS endSeconds, text FROM subtitle_cues WHERE track_id = ? ORDER BY cue_index').all(row.id) as SemanticEvidenceCue[]
    const quality = analyzeSubtitleTimeQuality({ sourceKind: row.sourceKind, cues, durationSeconds, cost })
    const eligible = row.sourceKind === 'ocr' ? row.acquisition === 'generated' && row.evidenceNature === 'visual_aligned' : row.sourceKind === 'asr' ? row.acquisition === 'generated' && row.evidenceNature === 'audio_aligned' : row.acquisition === 'imported' && (row.evidenceNature === 'visual_aligned' || row.evidenceNature === 'audio_aligned')
    const local = selectSubtitleAnchorWindows({ sourceKind: row.sourceKind, cues, durationSeconds, cost })
    if (local.cues.length > 0 && eligible) qualified.push({ sourceKind: row.sourceKind, quality, cues: local.cues.map((cue) => ({ ...cue, trackId: row.id, sourceKind: row.sourceKind, evidenceNature: row.evidenceNature })) })
    else if (row.sourceKind === 'import' && !eligible) firstReason ??= '导入字幕尚未完成可追溯的画面对齐或声音对齐核验，当前仅可作文本参考，不能自动生成切点。'
    else firstReason ??= subtitleQualityReason(row.sourceKind, quality.reasonCode)
  }
  const persisted = qualified.length > 0 ? persistSemanticEvents(database, dramaId, episodeId, alignSemanticEvents(qualified.flatMap(({ cues }) => cues))) : []
  const subtitleAnchors = persisted.filter((event) => event.conclusion !== 'time-conflict').map((event) => ({ startSeconds: event.cutStartSeconds, endSeconds: event.cutEndSeconds, semanticEventId: event.id })).filter((cue) => cue.endSeconds > cue.startSeconds).sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
  const conflictAnchors = persisted.filter((event) => event.conclusion === 'time-conflict').map((event) => ({ startSeconds: event.cutStartSeconds, endSeconds: event.cutEndSeconds, blocksAutomaticCandidate: true })).filter((cue) => cue.endSeconds > cue.startSeconds)
  const conflictReason = persisted.some((event) => event.conclusion === 'time-conflict') ? '已排除画面文字时间不相容的边界；其余合格证据继续参与候选生成。' : null
  const subtitle = { sourceKind: subtitleAnchors.length > 0 ? qualified.length === 1 ? qualified[0]!.sourceKind : 'multi' : null, quality: subtitleAnchors.length > 0 ? qualified[0]!.quality : null, reason: subtitleAnchors.length > 0 ? conflictReason : firstReason ?? '没有导入、OCR 或已验证 ASR 字幕时间轴；请先完成字幕识别或导入。', anchors: subtitleAnchors } satisfies AnchorReadiness
  if (conflictReason && subtitleAnchors.length === 0) return { sourceKind: null, quality: null, reason: '画面文字证据均为不相容时间窗，当前没有其它合格边界可用于自动生成切点。', anchors: [] }
  const episode = database.prepare('SELECT source_path AS sourcePath, source_fingerprint AS sourceFingerprint FROM episodes WHERE id = ? AND drama_id = ?').get(episodeId, dramaId) as { sourcePath: string; sourceFingerprint: string | null } | undefined
  const fingerprint = episode ? fingerprintMediaSource(episode.sourcePath) : null
  if (!episode || !episode.sourceFingerprint || !fingerprint || fingerprint !== episode.sourceFingerprint) return subtitleAnchors.length > 0 ? subtitle : { ...subtitle, reason: [subtitle.reason, '当前源媒体身份未验证或已变化，旧镜头/场景锚点不能用于自动候选；请重新关联并完成验证。'].join('；') }
  const sceneRows = database.prepare("SELECT id, start_seconds AS startSeconds, end_seconds AS endSeconds, details_json AS detailsJson FROM ai_evidence WHERE drama_id = ? AND episode_id = ? AND source_type = 'scene' ORDER BY created_at, id").all(dramaId, episodeId) as Array<{ id: string; startSeconds: number | null; endSeconds: number | null; detailsJson: string }>
  if (!sceneRows.length) return subtitleAnchors.length > 0 ? subtitle : { ...subtitle, reason: [subtitle.reason, '没有质量合格的字幕端点，也没有同集、源媒体 PTS 已验证的镜头/场景转场锚点。'].join('；') }
  const cached = ptsCache.get(fingerprint); const framePts = cached === undefined ? readSourceVideoFramePts(episode.sourcePath) : cached
  if (cached === undefined) ptsCache.set(fingerprint, framePts)
  if (!framePts) return subtitleAnchors.length > 0 ? subtitle : { ...subtitle, reason: [subtitle.reason, '无法读取当前源媒体的视频帧 PTS，镜头/场景锚点不能用于自动候选。'].join('；') }
  let rejected = 0; const anchors: CutAnchor[] = []
  for (const row of sceneRows) { let details: unknown; try { details = JSON.parse(row.detailsJson) } catch { rejected += 1; continue }; const verification = verifiedSceneAnchorSchema.safeParse(details && typeof details === 'object' && !Array.isArray(details) ? (details as Record<string, unknown>).sourceMediaVerification : undefined); if (!verification.success || verification.data.sourceMediaFingerprint !== fingerprint || row.startSeconds === null || row.endSeconds === null || !Number.isFinite(row.startSeconds) || !Number.isFinite(row.endSeconds) || row.startSeconds < 0 || row.endSeconds <= row.startSeconds || row.endSeconds > durationSeconds + 0.05 || !isSourceFramePtsRange(framePts, row.startSeconds, row.endSeconds)) { rejected += 1; continue }; anchors.push({ startSeconds: row.startSeconds, endSeconds: Math.min(row.endSeconds, durationSeconds), sceneAnchorId: row.id }) }
  if (anchors.length > 0) return { sourceKind: subtitleAnchors.length > 0 ? 'multi' : 'scene', quality: subtitle.quality, reason: subtitleAnchors.length > 0 ? conflictReason : '未找到合格字幕端点，已改用同集且经源媒体 PTS 验证的镜头/场景转场锚点。', anchors: [...subtitleAnchors, ...conflictAnchors, ...anchors].sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds) }
  const sceneReason = sceneRows.length > 0 && rejected > 0 ? '镜头/场景记录缺少同源媒体指纹、PTS 验证或有效转场范围，不能作为自动候选锚点。' : '没有质量合格的字幕端点，也没有同集、源媒体 PTS 已验证的镜头/场景转场锚点。'
  return { ...subtitle, reason: [subtitle.reason, sceneReason].join('；') }
}

const spreadRanges = <T>(ranges: ReadonlyArray<T>, requested: number): T[] => {
  if (ranges.length <= requested) return [...ranges]
  const selected = new Set(Array.from({ length: requested }, (_, index) => Math.round(index * (ranges.length - 1) / Math.max(1, requested - 1))))
  const result: T[] = []
  for (const index of selected) result.push(ranges[index]!)
  for (const [index, range] of ranges.entries()) if (!selected.has(index)) result.push(range)
  return result
}
const rangesForAnchorSource = (anchors: readonly CutAnchor[], episodeDurationSeconds: number, targetDurationSeconds: number): CandidateAnchorRange[] => {
  const target = Math.min(targetDurationSeconds, episodeDurationSeconds); const maximumEndOffset = target + Math.max(0.5, target * 0.15); const ranges = new Map<string, CandidateAnchorRange>()
  for (const startAnchor of anchors) { const desiredEnd = Math.min(episodeDurationSeconds, startAnchor.startSeconds + target); const endings = anchors.filter((endAnchor) => endAnchor.endSeconds >= startAnchor.startSeconds + 3 && endAnchor.endSeconds <= Math.min(episodeDurationSeconds, startAnchor.startSeconds + maximumEndOffset)); if (!endings.length) continue; const bestEnd = endings.reduce((best, candidate) => Math.abs(candidate.endSeconds - desiredEnd) < Math.abs(best.endSeconds - desiredEnd) ? candidate : best); const startSeconds = Number(startAnchor.startSeconds.toFixed(3)); const endSeconds = Number(bestEnd.endSeconds.toFixed(3)); ranges.set(`${startSeconds}:${endSeconds}`, { startSeconds, endSeconds, semanticEventIds: [...new Set(anchors.filter((anchor) => anchor.endSeconds >= startSeconds && anchor.startSeconds <= endSeconds).map((anchor) => anchor.semanticEventId).filter((id): id is string => Boolean(id)))], sceneAnchorIds: [...new Set(anchors.filter((anchor) => anchor.endSeconds >= startSeconds && anchor.startSeconds <= endSeconds).map((anchor) => anchor.sceneAnchorId).filter((id): id is string => Boolean(id)))] }) }
  return [...ranges.values()]
}
const anchorIslands = (anchors: readonly CutAnchor[]): CutAnchor[][] => {
  const islands: CutAnchor[][] = []
  let coveredEnd = 0
  for (const anchor of [...anchors].sort((a, b) => a.startSeconds - b.startSeconds)) {
    if (!islands.length || anchor.startSeconds - coveredEnd > 20) { islands.push([]); coveredEnd = anchor.endSeconds }
    islands.at(-1)!.push(anchor); coveredEnd = Math.max(coveredEnd, anchor.endSeconds)
  }
  return islands
}
export const anchorCandidateRanges = (anchors: readonly CutAnchor[], episodeDurationSeconds: number, targetDurationSeconds: number): CandidateAnchorRange[] => {
  const semantic = anchors.filter((anchor) => anchor.semanticEventId); const scene = anchors.filter((anchor) => anchor.sceneAnchorId); const conflicts = anchors.filter((anchor) => anchor.blocksAutomaticCandidate)
  const touchesConflict = (range: CandidateAnchorRange): boolean => conflicts.some((anchor) => anchor.endSeconds >= range.startSeconds && anchor.startSeconds <= range.endSeconds)
  const semanticRanges = anchorIslands(semantic).flatMap((island) => rangesForAnchorSource(island, episodeDurationSeconds, targetDurationSeconds)).filter((range) => !touchesConflict(range))
  const sceneRanges = anchorIslands(scene).flatMap((island) => rangesForAnchorSource(island, episodeDurationSeconds, targetDurationSeconds)).filter((range) => !touchesConflict(range) && !semantic.some((anchor) => anchor.endSeconds >= range.startSeconds && anchor.startSeconds <= range.endSeconds))
  return [...semanticRanges, ...sceneRanges].sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
}
export const hasLongAnchorGap = (anchors: readonly { startSeconds: number; endSeconds: number }[], start: number, end: number): boolean => {
  let coveredEnd = start
  for (const anchor of [...anchors].filter((item) => item.endSeconds > start && item.startSeconds < end).sort((a, b) => a.startSeconds - b.startSeconds)) {
    if (anchor.startSeconds - coveredEnd > 20) return true
    coveredEnd = Math.max(coveredEnd, Math.min(end, anchor.endSeconds))
  }
  return end - coveredEnd > 20
}
export const selectAnchorRanges = (ranges: ReadonlyArray<CandidateAnchorRange>, requested: number, occupiedInput: ReadonlyArray<{ start: number; end: number }>, maxOverlapRatio: number, allowRepeat: boolean): CandidateAnchorRange[] => { const occupied = [...occupiedInput]; const selected: CandidateAnchorRange[] = []; for (const candidate of spreadRanges(ranges, requested)) { if (selected.length >= requested) break; if (!allowRepeat && occupied.some((other) => overlapRatio(candidate.startSeconds, candidate.endSeconds, other.start, other.end) > maxOverlapRatio)) continue; selected.push(candidate); occupied.push({ start: candidate.startSeconds, end: candidate.endSeconds }) }; return selected }
