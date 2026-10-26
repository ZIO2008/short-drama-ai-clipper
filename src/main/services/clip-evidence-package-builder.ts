import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { fingerprintMediaSource } from '../media/media-source-fingerprint.js'
import { readSourceVideoPtsProbe } from '../media/scene-anchor-pts-verifier.js'
import { analyzeSubtitleTimeQuality, isSafeSubtitleAnchor, type SubtitleTimeQuality } from './subtitle-time-quality.js'
import type { ClipEvidencePackage, ClipEvidenceQualification } from './clip-evidence-package-service.js'

import { selectSubtitleAnchorWindows } from './subtitle-anchor-windows.js'

type EpisodeRow = { sourcePath: string; sourceFingerprint: string | null; durationSeconds: number | null }
type EventRow = { id: string; startSeconds: number; endSeconds: number; conclusion: string; reason: string | null; cueCount: number; sourceKindsJson: string; visualCueCount: number; asrCueCount: number; verifiedCueCount: number; unresolvedConflictCount: number }
type SceneRow = { id: string; startSeconds: number | null; endSeconds: number | null; detailsJson: string }
type TrackRow = { id: string; sourceKind: 'import' | 'ocr' | 'asr'; acquisition: 'imported' | 'generated' | 'manual'; evidenceNature: 'reference_unknown' | 'visual_aligned' | 'audio_aligned' | 'manual_resolved'; costJson: string; updatedAt: string }
type CueRow = { id: string; startSeconds: number; endSeconds: number; text: string; index: number }
type EventTrackQualifications = Map<string, ClipEvidenceQualification[]>
export const CLIP_EVIDENCE_RULE_VERSION = 'evidence-v6'

export class ClipEvidencePackageBuilder {
  constructor(protected readonly database: Database.Database) {}

  build(dramaId: string, episodeId: string): ClipEvidencePackage {
    const episode = this.database.prepare('SELECT source_path AS sourcePath, source_fingerprint AS sourceFingerprint, duration_seconds AS durationSeconds FROM episodes WHERE id = ? AND drama_id = ?').get(episodeId, dramaId) as EpisodeRow | undefined
    if (!episode) throw new Error('源分集不存在或不属于当前剧目。')
    const fingerprint = fingerprintMediaSource(episode.sourcePath)
    const sourceFingerprint = fingerprint && episode.sourceFingerprint && episode.sourceFingerprint === fingerprint ? fingerprint : null
    const pts = sourceFingerprint ? readSourceVideoPtsProbe(episode.sourcePath) : null
    const tracks = this.database.prepare("SELECT id, source_kind AS sourceKind, acquisition, evidence_nature AS evidenceNature, cost_json AS costJson, updated_at AS updatedAt FROM subtitle_tracks WHERE drama_id = ? AND episode_id = ? AND status = 'active' AND source_kind IN ('import', 'ocr', 'asr') ORDER BY updated_at, id").all(dramaId, episodeId) as TrackRow[]
    const trackFacts = tracks.map((track) => this.trackFact(track, episode.durationSeconds))
    const eventTrackQualifications = this.readEventTrackQualifications(episodeId, new Map(trackFacts.flatMap((fact) => [...fact.cueQualifications])))
    const versionRow = this.database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM clip_evidence_packages WHERE episode_id = ?').get(episodeId) as { version: number }
    const version = versionRow.version + 1
    const id = randomUUID(); const now = new Date().toISOString()
    const events = this.database.prepare(`SELECT event.id, event.start_seconds AS startSeconds, event.end_seconds AS endSeconds, event.conclusion, event.reason, event.source_kinds_json AS sourceKindsJson,
      COUNT(link.cue_id) AS cueCount, SUM(CASE WHEN link.role = 'visual' THEN 1 ELSE 0 END) AS visualCueCount, SUM(CASE WHEN link.role = 'asr' THEN 1 ELSE 0 END) AS asrCueCount,
      SUM(CASE WHEN track.acquisition = 'generated' AND ((track.source_kind = 'ocr' AND track.evidence_nature = 'visual_aligned') OR (track.source_kind = 'asr' AND track.evidence_nature = 'audio_aligned')) THEN 1 ELSE 0 END) AS verifiedCueCount,
      SUM(CASE WHEN conflict.id IS NOT NULL AND conflict.status = 'open' THEN 1 ELSE 0 END) AS unresolvedConflictCount
      FROM subtitle_semantic_events event LEFT JOIN subtitle_semantic_event_cues link ON link.event_id = event.id LEFT JOIN subtitle_cues cue ON cue.id = link.cue_id
      LEFT JOIN subtitle_tracks track ON track.id = cue.track_id LEFT JOIN subtitle_conflicts conflict ON (conflict.asr_cue_id = cue.id OR conflict.ocr_cue_id = cue.id)
      WHERE event.drama_id = ? AND event.episode_id = ? GROUP BY event.id ORDER BY event.start_seconds, event.id`).all(dramaId, episodeId) as EventRow[]
    const scenes = this.database.prepare("SELECT id, start_seconds AS startSeconds, end_seconds AS endSeconds, details_json AS detailsJson FROM ai_evidence WHERE drama_id = ? AND episode_id = ? AND source_type = 'scene' ORDER BY start_seconds, id").all(dramaId, episodeId) as SceneRow[]
    const inputFingerprint = JSON.stringify({
      sourceFingerprint, ptsReadable: Boolean(pts),
      tracks: trackFacts.map(({ track, cues, quality, qualification, cueQualifications }) => ({ id: track.id, sourceKind: track.sourceKind, acquisition: track.acquisition, evidenceNature: track.evidenceNature, updatedAt: track.updatedAt, cueIds: cues.map((cue) => cue.id), localQualifiedCueIds: [...cueQualifications].filter(([, q]) => q === 'A').map(([id]) => id), quality: quality.reasonCode, qualification })),
      events: events.map((event) => ({ id: event.id, startSeconds: event.startSeconds, endSeconds: event.endSeconds, conclusion: event.conclusion, sourceKindsJson: event.sourceKindsJson, cueCount: event.cueCount, verifiedCueCount: event.verifiedCueCount, unresolvedConflictCount: event.unresolvedConflictCount })),
      scenes: scenes.map((scene) => ({ id: scene.id, startSeconds: scene.startSeconds, endSeconds: scene.endSeconds, detailsJson: scene.detailsJson })), ruleVersion: CLIP_EVIDENCE_RULE_VERSION,
    })
    const reusable = this.findReusablePackage(dramaId, episodeId, inputFingerprint)
    if (reusable) return reusable
    const status: ClipEvidencePackage['status'] = sourceFingerprint && pts ? 'ready' : 'failed'
    const reason = !sourceFingerprint ? '当前源媒体指纹不存在或已变化，不能发布证据包。' : !pts ? '当前源媒体无法读取可验证的帧 PTS，不能发布自动候选证据包。' : null
    this.database.transaction(() => {
      const qualifications = events.map((event) => ({ id: event.id, qualification: this.eventQualification(event, eventTrackQualifications), reason: this.eventReason(event, eventTrackQualifications), coverage: this.eventCoverage(event, eventTrackQualifications) }))
      const coveredSeconds = events.filter((event) => this.eventQualification(event, eventTrackQualifications) === 'A').reduce((total, event) => total + Math.max(0, event.endSeconds - event.startSeconds), 0)
      this.database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, dramaId, episodeId, version, sourceFingerprint ?? fingerprint ?? 'unverified', CLIP_EVIDENCE_RULE_VERSION, status, JSON.stringify({ inputFingerprint, durationSeconds: episode.durationSeconds, media: { fingerprint: sourceFingerprint, ptsReadable: Boolean(pts), ptsVerifier: 'ffprobe-frame-pts-v1', decodeStatus: pts ? 'available' : 'missing' }, tracks: trackFacts.map(({ track, cues, quality, qualification, cueQualifications }) => ({ id: track.id, sourceKind: track.sourceKind, acquisition: track.acquisition, evidenceNature: track.evidenceNature, updatedAt: track.updatedAt, cueCount: cues.length, localQualifiedCueIds: [...cueQualifications].filter(([, q]) => q === 'A').map(([id]) => id), quality: { safe: isSafeSubtitleAnchor(quality), reasonCode: quality.reasonCode, coverageRatio: quality.coverageRatio, averageCueDurationSeconds: quality.averageCueDurationSeconds, maxCueDurationSeconds: quality.maxCueDurationSeconds }, qualification })), semanticEventIds: events.map((event) => event.id), sceneAnchorIds: scenes.map((scene) => scene.id), coverage: { qualifiedEventSeconds: Number(coveredSeconds.toFixed(3)), episodeDurationSeconds: episode.durationSeconds, qualifications, validationOrder: ['media', 'tracks', 'time-axis', 'cross-track', 'coverage', 'candidate-dependencies'], calibration: { subtitleTimeQuality: 'subtitle-anchor-windows-v2', pts: 'ffprobe-frame-pts-v1', semanticRelationship: 'semantic-event-v1' } } }), reason, now, now)
      const insert = this.database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, coverage_json, source_version, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      for (const fact of trackFacts) for (const cue of fact.cues) insert.run(randomUUID(), id, 'subtitle-cue', cue.startSeconds, cue.endSeconds, JSON.stringify([cue.id]), status === 'ready' ? fact.cueQualifications.get(cue.id)! : 'D', JSON.stringify({ scope: 'subtitle-cue', text: fact.cueQualifications.get(cue.id) === 'A' ? 'available' : fact.cueQualifications.get(cue.id) === 'B' ? 'limited' : 'missing', visualSubtitle: fact.track.evidenceNature === 'visual_aligned' ? 'available' : 'not-applicable', audioText: fact.track.evidenceNature === 'audio_aligned' ? 'available' : 'not-applicable', relationship: 'unresolved', trackId: fact.track.id, sourceKind: fact.track.sourceKind, acquisition: fact.track.acquisition, evidenceNature: fact.track.evidenceNature }), fact.track.updatedAt, fact.cueQualifications.get(cue.id) === 'A' ? null : fact.reason, now, now)
      for (const event of events) insert.run(randomUUID(), id, 'semantic-event', event.startSeconds, event.endSeconds, JSON.stringify([event.id]), this.eventQualification(event, eventTrackQualifications), JSON.stringify(this.eventCoverage(event, eventTrackQualifications)), 'semantic-event-v1', this.eventReason(event, eventTrackQualifications), now, now)
      for (const scene of scenes) if (scene.startSeconds !== null && scene.endSeconds !== null && scene.endSeconds > scene.startSeconds) { const qualification = this.sceneQualification(scene, sourceFingerprint); insert.run(randomUUID(), id, 'scene-anchor', scene.startSeconds, scene.endSeconds, JSON.stringify([scene.id]), status === 'ready' ? qualification : 'D', JSON.stringify(this.sceneCoverage(scene, sourceFingerprint, qualification)), 'scene-anchor-pts-v1', status === 'ready' ? this.sceneReason(qualification) : reason, now, now) }
    })()
    return { id, dramaId, episodeId, version, sourceMediaFingerprint: sourceFingerprint ?? fingerprint ?? 'unverified', ruleVersion: CLIP_EVIDENCE_RULE_VERSION, status, reason }
  }

  private trackFact(track: TrackRow, durationSeconds: number | null): { track: TrackRow; cues: CueRow[]; quality: SubtitleTimeQuality; qualification: ClipEvidenceQualification; cueQualifications: Map<string, ClipEvidenceQualification>; reason: string } {
    const cues = this.database.prepare('SELECT id, start_seconds AS startSeconds, end_seconds AS endSeconds, text, cue_index AS `index` FROM subtitle_cues WHERE track_id = ? ORDER BY cue_index').all(track.id) as CueRow[]
    let cost: Record<string, unknown> = {}; try { const value: unknown = JSON.parse(track.costJson); if (value && typeof value === 'object' && !Array.isArray(value)) cost = value as Record<string, unknown> } catch { /* Legacy metadata stays unverified. */ }
    const quality = analyzeSubtitleTimeQuality({ sourceKind: track.sourceKind, cues, durationSeconds: durationSeconds ?? 0, cost })
    const provenance = track.sourceKind === 'ocr' ? track.acquisition === 'generated' && track.evidenceNature === 'visual_aligned' : track.sourceKind === 'asr' ? track.acquisition === 'generated' && track.evidenceNature === 'audio_aligned' : track.acquisition === 'imported' && (track.evidenceNature === 'visual_aligned' || track.evidenceNature === 'audio_aligned')
    const local = selectSubtitleAnchorWindows({ sourceKind: track.sourceKind, cues, durationSeconds, cost })
    const qualification: ClipEvidenceQualification = provenance && isSafeSubtitleAnchor(quality) && local.cues.length === cues.length && cues.length > 0 ? 'A' : track.evidenceNature === 'reference_unknown' ? 'D' : 'B'
    const qualifiedIds = new Set(provenance ? local.cues.map((cue) => cue.id) : [])
    const cueQualifications = new Map(cues.map((cue) => [cue.id, qualifiedIds.has(cue.id) ? 'A' as const : track.evidenceNature === 'reference_unknown' ? 'D' as const : 'B' as const]))
    return { track, cues, quality, qualification, cueQualifications, reason: qualification === 'A' ? '来源、时间质量与声明范围已核验。' : qualification === 'B' ? `轨道存在但时间质量或来源核验不足：${quality.reasonCode}。` : '导入来源性质或时间质量不可核验，不能作为自动候选主证据。' }
  }

  private findReusablePackage(dramaId: string, episodeId: string, inputFingerprint: string): ClipEvidencePackage | null {
    const rows = this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, version, source_media_fingerprint AS sourceMediaFingerprint, rule_version AS ruleVersion, status, reason, evidence_json AS evidenceJson FROM clip_evidence_packages WHERE drama_id = ? AND episode_id = ? AND rule_version = ? ORDER BY version DESC').all(dramaId, episodeId, CLIP_EVIDENCE_RULE_VERSION) as Array<ClipEvidencePackage & { evidenceJson: string }>
    for (const row of rows) { try { const evidence = JSON.parse(row.evidenceJson) as { inputFingerprint?: unknown }; if (evidence.inputFingerprint === inputFingerprint) { const { evidenceJson: _evidenceJson, ...record } = row; return record } } catch { /* Legacy or corrupt package is never reused. */ } }
    return null
  }

  private readEventTrackQualifications(episodeId: string, qualificationsByCueId: Map<string, ClipEvidenceQualification>): EventTrackQualifications {
    const rows = this.database.prepare('SELECT link.event_id AS eventId, cue.id AS cueId FROM subtitle_semantic_event_cues link JOIN subtitle_cues cue ON cue.id = link.cue_id JOIN subtitle_semantic_events event ON event.id = link.event_id WHERE event.episode_id = ?').all(episodeId) as Array<{ eventId: string; cueId: string }>
    const result: EventTrackQualifications = new Map()
    for (const row of rows) { const qualification = qualificationsByCueId.get(row.cueId) ?? 'D'; const values = result.get(row.eventId) ?? []; values.push(qualification); result.set(row.eventId, values) }
    return result
  }

  private eventQualification(event: EventRow, trackQualifications: EventTrackQualifications): ClipEvidenceQualification { if (event.conclusion === 'time-conflict' || event.unresolvedConflictCount > 0) return 'C'; const qualifications = trackQualifications.get(event.id) ?? []; if (event.cueCount <= 0 || !qualifications.length || qualifications.some((item) => item === 'C' || item === 'D')) return 'D'; return qualifications.some((item) => item === 'B') ? 'B' : 'A' }
  private eventReason(event: EventRow, trackQualifications: EventTrackQualifications): string | null { if (event.conclusion === 'time-conflict' || event.unresolvedConflictCount > 0) return event.reason ?? '多源时间冲突尚未闭合，不能用于自动候选。'; const qualifications = trackQualifications.get(event.id) ?? []; if (event.cueCount <= 0 || !qualifications.length) return '语义事件缺少经来源与时间质量核验的 OCR/ASR 原始 cue，不能升级为自动候选主证据。'; if (qualifications.some((item) => item !== 'A')) return '语义事件关联轨道未全部达到来源、时间质量和关系可复核的主证据门槛。'; return event.reason }
  private eventCoverage(event: EventRow, trackQualifications: EventTrackQualifications): Record<string, unknown> { const qualifications = trackQualifications.get(event.id) ?? []; const allPrimary = qualifications.length > 0 && qualifications.every((item) => item === 'A'); return { scope: 'semantic-event', text: allPrimary ? 'available' : 'limited', visualSubtitle: event.visualCueCount > 0 && allPrimary ? 'available' : 'unverified', audioText: event.asrCueCount > 0 && allPrimary ? 'available' : 'unverified', sceneStructure: 'not-applicable', visualFact: 'unverified', audioStructure: 'unverified', ambience: 'unverified', relationship: event.unresolvedConflictCount > 0 || event.conclusion === 'time-conflict' ? 'conflict' : allPrimary ? 'available' : 'unverified', sourceKinds: JSON.parse(event.sourceKindsJson), trackQualifications: qualifications, calibrationVersion: 'subtitle-anchor-windows-v2' } }
  private sceneCoverage(scene: SceneRow, sourceFingerprint: string | null, qualification: ClipEvidenceQualification): Record<string, unknown> { return { scope: 'scene-anchor', text: 'missing', visualSubtitle: 'missing', audioText: 'missing', sceneStructure: qualification === 'B' ? 'available' : 'missing', visualFact: 'unverified', audioStructure: 'unverified', ambience: 'unverified', sourceMediaFingerprint: sourceFingerprint, sourceDetails: scene.detailsJson } }
  private sceneQualification(scene: SceneRow, sourceFingerprint: string | null): ClipEvidenceQualification { if (!sourceFingerprint) return 'D'; try { const value: unknown = JSON.parse(scene.detailsJson); const verification = value && typeof value === 'object' && !Array.isArray(value) ? (value as { sourceMediaVerification?: unknown }).sourceMediaVerification : undefined; return verification && typeof verification === 'object' && (verification as { ptsVerified?: unknown; sourceMediaFingerprint?: unknown }).ptsVerified === true && (verification as { sourceMediaFingerprint?: unknown }).sourceMediaFingerprint === sourceFingerprint ? 'B' : 'D' } catch { return 'D' } }
  private sceneReason(qualification: ClipEvidenceQualification): string { return qualification === 'B' ? '同源媒体 PTS 已验证的结构锚点；未证明具体视觉剧情事实，需视频复核后才能作为关键视觉结论。' : '镜头/场景锚点缺少当前源媒体 PTS 验证，不能用于自动候选。' }
}
