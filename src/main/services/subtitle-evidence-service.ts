import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { compareSubtitleCues, formatSrt, formatVtt, type SubtitleCue } from './subtitle-service.js'
import type { SubtitleEvidenceComparison } from '../../shared/contracts.js'

export type SubtitleTrackSource = 'import' | 'asr' | 'ocr' | 'resolved'
export type PersistedSubtitleCue = SubtitleCue & { id: string; confidence: number | null }
export type SubtitleTrack = { id: string; dramaId: string; episodeId: string | null; assetId: string | null; baseTrackId: string | null; sourceKind: SubtitleTrackSource; label: string; language: string; status: 'active' | 'archived'; cueCount: number; cost: Record<string, unknown> }
export type OcrRegion = { id: string; dramaId: string; episodeId: string | null; scope: 'drama_default' | 'episode_override'; x: number; y: number; width: number; height: number }
export type SubtitleConflict = { id: string; dramaId: string; episodeId: string | null; asrCueId: string; ocrCueId: string; timeOverlapSeconds: number; textSimilarity: number; asrConfidence: number | null; ocrConfidence: number | null; status: 'open' | 'resolved_asr' | 'resolved_ocr' | 'resolved_manual' | 'reviewed'; resolvedText: string | null; resolvedStartSeconds: number | null; resolvedEndSeconds: number | null }
export type SubtitleQualityReport = { evaluationCount: number; referenceCharacters: number; differingCharacters: number; conflictCount: number; evaluatedCueCount: number; elapsedMs: number; estimatedCost: number; actualCost: number; characterErrorRate: number | null; conflictRate: number | null }

const cueSchema = z.object({ index: z.number().int().positive(), startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().positive(), text: z.string().trim().min(1), confidence: z.number().finite().min(0).max(1).nullable().optional() }).refine((cue) => cue.endSeconds > cue.startSeconds, 'Cue end must be after cue start')
const cueUpdateSchema = z.object({ startSeconds: z.number().finite().nonnegative().optional(), endSeconds: z.number().finite().positive().optional(), text: z.string().trim().min(1).optional(), confidence: z.number().finite().min(0).max(1).nullable().optional() }).refine((value) => Object.keys(value).length > 0, 'Cue update is empty')
const regionSchema = z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1), width: z.number().finite().positive().max(1), height: z.number().finite().positive().max(1) }).refine((region) => region.x + region.width <= 1 && region.y + region.height <= 1, 'OCR region must remain inside the source frame')
const trackInputSchema = z.object({ dramaId: z.string().trim().min(1), episodeId: z.string().trim().min(1).nullable(), sourceKind: z.enum(['asr', 'ocr', 'resolved']), label: z.string().trim().min(1).max(120), language: z.string().trim().min(1).max(40).default('zh-CN'), cost: z.record(z.string(), z.unknown()).default({}), cues: z.array(cueSchema).min(1) })

export class SubtitleEvidenceService {
  constructor(private readonly database: Database.Database) {}

  createTrack(input: unknown): SubtitleTrack {
    const value = trackInputSchema.parse(input); this.assertDramaAndEpisode(value.dramaId, value.episodeId)
    const now = new Date().toISOString(); const trackId = randomUUID()
    this.database.transaction(() => {
      this.database.prepare('INSERT INTO subtitle_tracks (id, drama_id, episode_id, asset_id, base_track_id, source_kind, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?)').run(trackId, value.dramaId, value.episodeId, value.sourceKind, value.label, value.language, 'active', value.cues.length, JSON.stringify(value.cost), now, now)
      this.insertCues(trackId, value.cues, now)
    })()
    return this.getTrack(trackId)
  }

  listTracks(dramaIdInput: unknown, episodeIdInput: unknown = undefined): SubtitleTrack[] {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const episodeId = episodeIdInput === undefined ? undefined : z.string().trim().min(1).nullable().parse(episodeIdInput)
    const rows = episodeId === undefined
      ? this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, asset_id AS assetId, base_track_id AS baseTrackId, source_kind AS sourceKind, label, language, status, cue_count AS cueCount, cost_json AS costJson FROM subtitle_tracks WHERE drama_id = ? AND status = ? ORDER BY created_at DESC').all(dramaId, 'active')
      : this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, asset_id AS assetId, base_track_id AS baseTrackId, source_kind AS sourceKind, label, language, status, cue_count AS cueCount, cost_json AS costJson FROM subtitle_tracks WHERE drama_id = ? AND episode_id IS ? AND status = ? ORDER BY created_at DESC').all(dramaId, episodeId, 'active')
    return (rows as Array<SubtitleTrack & { costJson: string }>).map((row) => this.mapTrack(row))
  }

  listCues(trackIdInput: unknown): PersistedSubtitleCue[] {
    const trackId = z.string().trim().min(1).parse(trackIdInput)
    return this.database.prepare('SELECT id, cue_index AS "index", start_seconds AS startSeconds, end_seconds AS endSeconds, text, confidence FROM subtitle_cues WHERE track_id = ? ORDER BY cue_index').all(trackId) as PersistedSubtitleCue[]
  }

  setOcrRegion(dramaIdInput: unknown, episodeIdInput: unknown, regionInput: unknown): OcrRegion {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const episodeId = z.string().trim().min(1).nullable().parse(episodeIdInput); const region = regionSchema.parse(regionInput); this.assertDramaAndEpisode(dramaId, episodeId)
    const scope = episodeId ? 'episode_override' : 'drama_default'; const now = new Date().toISOString(); const existing = this.database.prepare('SELECT id FROM subtitle_ocr_regions WHERE drama_id = ? AND episode_id IS ? AND scope = ?').get(dramaId, episodeId, scope) as { id: string } | undefined; const id = existing?.id ?? randomUUID()
    if (existing) this.database.prepare('UPDATE subtitle_ocr_regions SET x = ?, y = ?, width = ?, height = ?, updated_at = ? WHERE id = ?').run(region.x, region.y, region.width, region.height, now, id)
    else this.database.prepare('INSERT INTO subtitle_ocr_regions (id, drama_id, episode_id, scope, x, y, width, height, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, dramaId, episodeId, scope, region.x, region.y, region.width, region.height, now, now)
    return this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, scope, x, y, width, height FROM subtitle_ocr_regions WHERE id = ?').get(id) as OcrRegion
  }

  getEffectiveOcrRegion(dramaIdInput: unknown, episodeIdInput: unknown): OcrRegion | null {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const episodeId = z.string().trim().min(1).nullable().parse(episodeIdInput); this.assertDramaAndEpisode(dramaId, episodeId)
    const row = episodeId
      ? this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, scope, x, y, width, height FROM subtitle_ocr_regions WHERE drama_id = ? AND ((scope = 'episode_override' AND episode_id = ?) OR (scope = 'drama_default' AND episode_id IS NULL)) ORDER BY CASE scope WHEN 'episode_override' THEN 0 ELSE 1 END LIMIT 1").get(dramaId, episodeId)
      : this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, scope, x, y, width, height FROM subtitle_ocr_regions WHERE drama_id = ? AND scope = 'drama_default' AND episode_id IS NULL LIMIT 1").get(dramaId)
    return (row as OcrRegion | undefined) ?? null
  }

  clearOcrRegion(dramaIdInput: unknown, episodeIdInput: unknown): void {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const episodeId = z.string().trim().min(1).nullable().parse(episodeIdInput); this.assertDramaAndEpisode(dramaId, episodeId)
    this.database.prepare('DELETE FROM subtitle_ocr_regions WHERE drama_id = ? AND episode_id IS ? AND scope = ?').run(dramaId, episodeId, episodeId ? 'episode_override' : 'drama_default')
  }

  startManualRevision(trackIdInput: unknown, labelInput: unknown = undefined): SubtitleTrack {
    const baseTrack = this.getTrack(z.string().trim().min(1).parse(trackIdInput)); const label = labelInput === undefined ? `人工校对 ${baseTrack.label}` : z.string().trim().min(1).max(120).parse(labelInput)
    if (baseTrack.sourceKind === 'resolved') return baseTrack
    return this.getOrCreateResolvedTrack(baseTrack, label)
  }

  updateResolvedCue(trackIdInput: unknown, cueIdInput: unknown, updateInput: unknown): PersistedSubtitleCue {
    const track = this.getTrack(z.string().trim().min(1).parse(trackIdInput)); if (track.sourceKind !== 'resolved') throw new Error('Only a resolved track can be manually edited')
    const cueId = z.string().trim().min(1).parse(cueIdInput); const update = cueUpdateSchema.parse(updateInput)
    const current = this.database.prepare('SELECT id, cue_index AS "index", start_seconds AS startSeconds, end_seconds AS endSeconds, text, confidence FROM subtitle_cues WHERE id = ? AND track_id = ?').get(cueId, track.id) as PersistedSubtitleCue | undefined
    if (!current) throw new Error('Subtitle cue not found in resolved track')
    const next = { ...current, ...update }; if (next.endSeconds <= next.startSeconds) throw new Error('Cue end must be after cue start')
    this.database.prepare('UPDATE subtitle_cues SET start_seconds = ?, end_seconds = ?, text = ?, confidence = ?, updated_at = ? WHERE id = ?').run(next.startSeconds, next.endSeconds, next.text, next.confidence ?? null, new Date().toISOString(), cueId)
    return this.database.prepare('SELECT id, cue_index AS "index", start_seconds AS startSeconds, end_seconds AS endSeconds, text, confidence FROM subtitle_cues WHERE id = ?').get(cueId) as PersistedSubtitleCue
  }

  archiveTrack(trackIdInput: unknown): void {
    const track = this.getTrack(z.string().trim().min(1).parse(trackIdInput)); this.database.prepare('UPDATE subtitle_tracks SET status = ?, updated_at = ? WHERE id = ?').run('archived', new Date().toISOString(), track.id)
  }

  compareAsrAndOcr(asrTrackIdInput: unknown, ocrTrackIdInput: unknown, minimumSimilarityInput: unknown = 0.85, minimumConfidenceInput: unknown = 0.75): SubtitleConflict[] {
    const asrTrack = this.getTrack(z.string().trim().min(1).parse(asrTrackIdInput)); const ocrTrack = this.getTrack(z.string().trim().min(1).parse(ocrTrackIdInput)); const minimumSimilarity = z.number().finite().min(0).max(1).parse(minimumSimilarityInput); const minimumConfidence = z.number().finite().min(0).max(1).parse(minimumConfidenceInput)
    const comparisons = this.getComparisons(asrTrack, ocrTrack, minimumSimilarity, minimumConfidence).filter((comparison) => comparison.conclusion === 'different' || comparison.conclusion === 'needs_review'); const now = new Date().toISOString()
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM subtitle_conflicts WHERE status = 'open' AND asr_cue_id IN (SELECT id FROM subtitle_cues WHERE track_id = ?) AND ocr_cue_id IN (SELECT id FROM subtitle_cues WHERE track_id = ?)").run(asrTrack.id, ocrTrack.id)
      const insert = this.database.prepare('INSERT INTO subtitle_conflicts (id, drama_id, episode_id, asr_cue_id, ocr_cue_id, time_overlap_seconds, text_similarity, asr_confidence, ocr_confidence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      for (const comparison of comparisons) {
        if (!comparison.asrCueId || !comparison.ocrCueId) continue
        insert.run(randomUUID(), asrTrack.dramaId, asrTrack.episodeId, comparison.asrCueId, comparison.ocrCueId, comparison.timeOverlapSeconds, comparison.textSimilarity, comparison.asrConfidence, comparison.ocrConfidence, 'open', now, now)
      }
    })()
    return this.database.prepare(`
      SELECT c.id, c.drama_id AS dramaId, c.episode_id AS episodeId, c.asr_cue_id AS asrCueId, c.ocr_cue_id AS ocrCueId,
             c.time_overlap_seconds AS timeOverlapSeconds, c.text_similarity AS textSimilarity, c.asr_confidence AS asrConfidence, c.ocr_confidence AS ocrConfidence, c.status,
             c.resolved_text AS resolvedText, c.resolved_start_seconds AS resolvedStartSeconds, c.resolved_end_seconds AS resolvedEndSeconds
      FROM subtitle_conflicts c
      JOIN subtitle_cues asrCue ON asrCue.id = c.asr_cue_id
      JOIN subtitle_cues ocrCue ON ocrCue.id = c.ocr_cue_id
      WHERE asrCue.track_id = ? AND ocrCue.track_id = ? AND c.status = 'open'
      ORDER BY c.created_at DESC
    `).all(asrTrack.id, ocrTrack.id) as SubtitleConflict[]
  }

  getComparisonResults(asrTrackIdInput: unknown, visualTrackIdInput: unknown, minimumSimilarityInput: unknown = 0.85, minimumConfidenceInput: unknown = 0.75): SubtitleEvidenceComparison[] {
    const asrTrack = this.getTrack(z.string().trim().min(1).parse(asrTrackIdInput)); const visualTrack = this.getTrack(z.string().trim().min(1).parse(visualTrackIdInput))
    const minimumSimilarity = z.number().finite().min(0).max(1).parse(minimumSimilarityInput); const minimumConfidence = z.number().finite().min(0).max(1).parse(minimumConfidenceInput)
    return this.getComparisons(asrTrack, visualTrack, minimumSimilarity, minimumConfidence)
  }

  listConflicts(dramaIdInput: unknown, episodeIdInput: unknown = undefined): SubtitleConflict[] {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const episodeId = episodeIdInput === undefined ? undefined : z.string().trim().min(1).nullable().parse(episodeIdInput)
    const rows = episodeId === undefined
      ? this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, asr_cue_id AS asrCueId, ocr_cue_id AS ocrCueId, time_overlap_seconds AS timeOverlapSeconds, text_similarity AS textSimilarity, asr_confidence AS asrConfidence, ocr_confidence AS ocrConfidence, status, resolved_text AS resolvedText, resolved_start_seconds AS resolvedStartSeconds, resolved_end_seconds AS resolvedEndSeconds FROM subtitle_conflicts WHERE drama_id = ? ORDER BY created_at DESC').all(dramaId)
      : this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, asr_cue_id AS asrCueId, ocr_cue_id AS ocrCueId, time_overlap_seconds AS timeOverlapSeconds, text_similarity AS textSimilarity, asr_confidence AS asrConfidence, ocr_confidence AS ocrConfidence, status, resolved_text AS resolvedText, resolved_start_seconds AS resolvedStartSeconds, resolved_end_seconds AS resolvedEndSeconds FROM subtitle_conflicts WHERE drama_id = ? AND episode_id IS ? ORDER BY created_at DESC').all(dramaId, episodeId)
    return rows as SubtitleConflict[]
  }

  resolveConflict(conflictIdInput: unknown, decisionInput: unknown): SubtitleConflict {
    const id = z.string().trim().min(1).parse(conflictIdInput); z.object({ source: z.literal('reviewed') }).parse(decisionInput)
    const conflict = this.database.prepare('SELECT id FROM subtitle_conflicts WHERE id = ?').get(id) as { id: string } | undefined
    if (!conflict) throw new Error('Subtitle conflict not found')
    const changed = this.database.prepare('UPDATE subtitle_conflicts SET status = ?, resolved_text = NULL, resolved_start_seconds = NULL, resolved_end_seconds = NULL, updated_at = ? WHERE id = ? AND status = ?').run('reviewed', new Date().toISOString(), id, 'open')
    if (changed.changes === 0) throw new Error('Subtitle conflict is not open')
    const resolved = this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, asr_cue_id AS asrCueId, ocr_cue_id AS ocrCueId, time_overlap_seconds AS timeOverlapSeconds, text_similarity AS textSimilarity, asr_confidence AS asrConfidence, ocr_confidence AS ocrConfidence, status, resolved_text AS resolvedText, resolved_start_seconds AS resolvedStartSeconds, resolved_end_seconds AS resolvedEndSeconds FROM subtitle_conflicts WHERE id = ?').get(id) as SubtitleConflict
    if (resolved.status === 'open') throw new Error('Subtitle conflict is not open')
    return resolved
  }

  exportTrackAsSrt(trackIdInput: unknown): string { return formatSrt(this.listCues(trackIdInput)) }
  exportTrackAsVtt(trackIdInput: unknown): string { return formatVtt(this.listCues(trackIdInput)) }

  exportTrackAudit(trackIdInput: unknown): string {
    const track = this.getTrack(z.string().trim().min(1).parse(trackIdInput)); const baseTrackId = track.sourceKind === 'resolved' ? track.baseTrackId : track.id
    const conflicts = baseTrackId ? this.database.prepare('SELECT c.id, c.status, c.resolved_text AS resolvedText, c.resolved_start_seconds AS resolvedStartSeconds, c.resolved_end_seconds AS resolvedEndSeconds, c.text_similarity AS textSimilarity, c.asr_confidence AS asrConfidence, c.ocr_confidence AS ocrConfidence FROM subtitle_conflicts c JOIN subtitle_cues asrCue ON asrCue.id = c.asr_cue_id WHERE asrCue.track_id = ? ORDER BY c.created_at').all(baseTrackId) : []
    return JSON.stringify({ exportedAt: new Date().toISOString(), track, cues: this.listCues(track.id), decisions: conflicts }, null, 2)
  }

  recordQualityEvaluation(input: unknown): string {
    const value = z.object({ dramaId: z.string().trim().min(1), episodeId: z.string().trim().min(1).nullable(), sourceKind: z.enum(['import', 'asr', 'ocr', 'resolved']), sampleLabel: z.string().trim().min(1).max(120), referenceCharacters: z.number().int().nonnegative(), differingCharacters: z.number().int().nonnegative(), conflictCount: z.number().int().nonnegative(), evaluatedCueCount: z.number().int().nonnegative(), elapsedMs: z.number().int().nonnegative(), estimatedCost: z.number().finite().nonnegative().default(0), actualCost: z.number().finite().nonnegative().default(0), notes: z.string().trim().max(2000).nullable().default(null) }).refine((value) => value.differingCharacters <= value.referenceCharacters, 'Differing characters cannot exceed reference characters').parse(input)
    this.assertDramaAndEpisode(value.dramaId, value.episodeId); const id = randomUUID(); const now = new Date().toISOString()
    this.database.prepare('INSERT INTO subtitle_quality_evaluations (id, drama_id, episode_id, source_kind, sample_label, reference_characters, differing_characters, conflict_count, evaluated_cue_count, elapsed_ms, estimated_cost, actual_cost, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, value.dramaId, value.episodeId, value.sourceKind, value.sampleLabel, value.referenceCharacters, value.differingCharacters, value.conflictCount, value.evaluatedCueCount, value.elapsedMs, value.estimatedCost, value.actualCost, value.notes, now, now)
    return id
  }

  getQualityReport(dramaIdInput: unknown, episodeIdInput: unknown = undefined): SubtitleQualityReport {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const episodeId = episodeIdInput === undefined ? undefined : z.string().trim().min(1).nullable().parse(episodeIdInput)
    const row = (episodeId === undefined
      ? this.database.prepare('SELECT COUNT(*) AS evaluationCount, COALESCE(SUM(reference_characters), 0) AS referenceCharacters, COALESCE(SUM(differing_characters), 0) AS differingCharacters, COALESCE(SUM(conflict_count), 0) AS conflictCount, COALESCE(SUM(evaluated_cue_count), 0) AS evaluatedCueCount, COALESCE(SUM(elapsed_ms), 0) AS elapsedMs, COALESCE(SUM(estimated_cost), 0) AS estimatedCost, COALESCE(SUM(actual_cost), 0) AS actualCost FROM subtitle_quality_evaluations WHERE drama_id = ?').get(dramaId)
      : this.database.prepare('SELECT COUNT(*) AS evaluationCount, COALESCE(SUM(reference_characters), 0) AS referenceCharacters, COALESCE(SUM(differing_characters), 0) AS differingCharacters, COALESCE(SUM(conflict_count), 0) AS conflictCount, COALESCE(SUM(evaluated_cue_count), 0) AS evaluatedCueCount, COALESCE(SUM(elapsed_ms), 0) AS elapsedMs, COALESCE(SUM(estimated_cost), 0) AS estimatedCost, COALESCE(SUM(actual_cost), 0) AS actualCost FROM subtitle_quality_evaluations WHERE drama_id = ? AND episode_id IS ?').get(dramaId, episodeId)) as Omit<SubtitleQualityReport, 'characterErrorRate' | 'conflictRate'>
    return { ...row, characterErrorRate: row.referenceCharacters > 0 ? row.differingCharacters / row.referenceCharacters : null, conflictRate: row.evaluatedCueCount > 0 ? row.conflictCount / row.evaluatedCueCount : null }
  }

  getTrack(idInput: unknown): SubtitleTrack {
    const id = z.string().trim().min(1).parse(idInput); const row = this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, asset_id AS assetId, base_track_id AS baseTrackId, source_kind AS sourceKind, label, language, status, cue_count AS cueCount, cost_json AS costJson FROM subtitle_tracks WHERE id = ?').get(id) as (SubtitleTrack & { costJson: string }) | undefined
    if (!row) throw new Error('Subtitle track not found')
    return this.mapTrack(row)
  }

  private mapTrack(row: SubtitleTrack & { costJson: string }): SubtitleTrack {
    let cost: Record<string, unknown> = {}
    try { const parsed = JSON.parse(row.costJson); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) cost = parsed as Record<string, unknown> } catch { /* Legacy rows retain an empty cost record. */ }
    const { costJson: _costJson, ...track } = row
    return { ...track, cost }
  }

  private insertCues(trackId: string, cues: Array<z.infer<typeof cueSchema>>, now: string): void {
    const insert = this.database.prepare('INSERT INTO subtitle_cues (id, track_id, cue_index, start_seconds, end_seconds, text, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (const cue of cues) insert.run(randomUUID(), trackId, cue.index, cue.startSeconds, cue.endSeconds, cue.text, cue.confidence ?? null, now, now)
  }

  private getOrCreateResolvedTrack(baseTrack: SubtitleTrack, label: string): SubtitleTrack {
    const row = this.database.prepare("SELECT id FROM subtitle_tracks WHERE base_track_id = ? AND source_kind = 'resolved' AND status = 'active' ORDER BY created_at LIMIT 1").get(baseTrack.id) as { id: string } | undefined
    if (row) return this.getTrack(row.id)
    const now = new Date().toISOString(); const trackId = randomUUID(); const sourceCues = this.listCues(baseTrack.id)
    this.database.transaction(() => {
      this.database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, asset_id, base_track_id, source_kind, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 'resolved', ?, ?, 'active', ?, '{}', ?, ?)").run(trackId, baseTrack.dramaId, baseTrack.episodeId, baseTrack.id, label, baseTrack.language, sourceCues.length, now, now)
      this.insertCues(trackId, sourceCues, now)
    })()
    return this.getTrack(trackId)
  }

  private getComparisons(asrTrack: SubtitleTrack, visualTrack: SubtitleTrack, minimumSimilarity: number, minimumConfidence: number): SubtitleEvidenceComparison[] {
    if (asrTrack.sourceKind !== 'asr' || !['ocr', 'import'].includes(visualTrack.sourceKind)) throw new Error('互证需要 ASR 音频实录和 OCR / 导入画面字幕证据。')
    if (asrTrack.dramaId !== visualTrack.dramaId || asrTrack.episodeId !== visualTrack.episodeId) throw new Error('ASR 与画面字幕证据必须属于同一分集。')
    const asrCues = this.listCues(asrTrack.id); const visualCues = this.listCues(visualTrack.id); const asrByIndex = new Map(asrCues.map((cue) => [cue.index, cue])); const visualByIndex = new Map(visualCues.map((cue) => [cue.index, cue]))
    return compareSubtitleCues(asrCues, visualCues, minimumSimilarity, minimumConfidence).map((comparison) => ({ asrCueId: comparison.asrIndex === null ? null : asrByIndex.get(comparison.asrIndex)?.id ?? null, ocrCueId: comparison.ocrIndex === null ? null : visualByIndex.get(comparison.ocrIndex)?.id ?? null, timeOverlapSeconds: comparison.timeOverlapSeconds, textSimilarity: comparison.textSimilarity, asrConfidence: comparison.asrConfidence, ocrConfidence: comparison.ocrConfidence, conclusion: comparison.conclusion }))
  }

  private assertDramaAndEpisode(dramaId: string, episodeId: string | null): void {
    if (!this.database.prepare('SELECT 1 FROM dramas WHERE id = ?').get(dramaId)) throw new Error('Drama not found')
    if (episodeId && !this.database.prepare('SELECT 1 FROM episodes WHERE id = ? AND drama_id = ?').get(episodeId, dramaId)) throw new Error('Episode does not belong to drama')
  }
}
