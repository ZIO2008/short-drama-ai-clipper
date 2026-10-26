import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { ClipSubtitleVariant } from '../../shared/contracts.js'

type Candidate = { id: string; episodeId: string; startSeconds: number; endSeconds: number; status: string }
const inputSchema = z.object({ candidateId: z.string().trim().min(1), text: z.string().trim().min(1).max(4000), startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().positive(), sourceTrackIds: z.array(z.string().trim().min(1)).min(1).max(8), reason: z.string().trim().min(1).max(1000) }).refine((value) => value.endSeconds > value.startSeconds, 'End must be after start')

export class ClipSubtitleVariantStore {
  constructor(private readonly database: Database.Database, private readonly getCandidate: (candidateId: string) => Candidate) {}

  list(candidateIdInput: unknown): ClipSubtitleVariant[] {
    const candidateId = z.string().trim().min(1).parse(candidateIdInput)
    return (this.database.prepare('SELECT id, candidate_id AS candidateId, text, start_seconds AS startSeconds, end_seconds AS endSeconds, source_track_ids_json AS sourceTrackIdsJson, reason, created_at AS createdAt FROM clip_subtitle_variants WHERE candidate_id = ? ORDER BY start_seconds, created_at').all(candidateId) as Array<{ id: string; candidateId: string; text: string; startSeconds: number; endSeconds: number; sourceTrackIdsJson: string; reason: string; createdAt: string }>).map((row) => ({ ...row, sourceTrackIds: JSON.parse(row.sourceTrackIdsJson) as string[] }))
  }

  save(inputValue: unknown): ClipSubtitleVariant {
    const input = inputSchema.parse(inputValue)
    const candidate = this.getCandidate(input.candidateId)
    if (!['pending_review', 'editing'].includes(candidate.status)) throw new Error('只能在确认候选前优化展示字幕。')
    if (input.endSeconds > candidate.endSeconds - candidate.startSeconds + 0.05) throw new Error('展示字幕必须位于当前候选片段内。')
    const owner = this.database.prepare('SELECT t.drama_id AS dramaId FROM task_items i JOIN production_tasks t ON t.id = i.task_id WHERE i.id = ?').get(candidate.id) as { dramaId: string } | undefined
    const validTracks = this.database.prepare(`SELECT COUNT(*) AS count FROM subtitle_tracks WHERE id IN (${input.sourceTrackIds.map(() => '?').join(',')}) AND drama_id = ? AND (episode_id IS NULL OR episode_id = ?)`).get(...input.sourceTrackIds, owner?.dramaId, candidate.episodeId) as { count: number }
    if (!owner || validTracks.count !== input.sourceTrackIds.length) throw new Error('展示字幕必须引用当前剧目的 ASR、OCR 或导入证据。')
    const now = new Date().toISOString(); const id = randomUUID()
    this.database.prepare('INSERT INTO clip_subtitle_variants (id, candidate_id, text, start_seconds, end_seconds, source_track_ids_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, input.candidateId, input.text, input.startSeconds, input.endSeconds, JSON.stringify(input.sourceTrackIds), input.reason, now, now)
    return { id, candidateId: input.candidateId, text: input.text, startSeconds: input.startSeconds, endSeconds: input.endSeconds, sourceTrackIds: input.sourceTrackIds, reason: input.reason, createdAt: now }
  }
}
