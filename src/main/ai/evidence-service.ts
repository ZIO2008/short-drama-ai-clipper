import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'

const evidenceSchema = z.object({ dramaId: z.string().min(1), episodeId: z.string().min(1).nullable().optional(), sourceType: z.enum(['subtitle', 'script', 'scene']), startSeconds: z.number().nonnegative().nullable().optional(), endSeconds: z.number().nonnegative().nullable().optional(), confidence: z.number().min(0).max(1).nullable().optional(), summary: z.string().trim().min(1).max(1000), details: z.record(z.string(), z.unknown()).default({}) }).refine((value) => value.startSeconds == null || value.endSeconds == null || value.endSeconds >= value.startSeconds, '结束时间不得早于开始时间')

export type AiEvidence = { id: string; dramaId: string; episodeId: string | null; sourceType: 'subtitle' | 'script' | 'scene'; startSeconds: number | null; endSeconds: number | null; confidence: number | null; summary: string; details: Record<string, unknown>; createdAt: string }

export class EvidenceService {
  constructor(private readonly database: Database.Database) {}

  record(input: unknown): AiEvidence {
    const value = evidenceSchema.parse(input); const id = randomUUID(); const now = new Date().toISOString()
    this.database.prepare('INSERT INTO ai_evidence (id, drama_id, episode_id, source_type, start_seconds, end_seconds, confidence, summary, details_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, value.dramaId, value.episodeId ?? null, value.sourceType, value.startSeconds ?? null, value.endSeconds ?? null, value.confidence ?? null, value.summary, JSON.stringify(value.details), now, now)
    return { id, dramaId: value.dramaId, episodeId: value.episodeId ?? null, sourceType: value.sourceType, startSeconds: value.startSeconds ?? null, endSeconds: value.endSeconds ?? null, confidence: value.confidence ?? null, summary: value.summary, details: value.details, createdAt: now }
  }

  list(dramaId: unknown): AiEvidence[] {
    const id = z.string().min(1).parse(dramaId)
    return (this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, source_type AS sourceType, start_seconds AS startSeconds, end_seconds AS endSeconds, confidence, summary, details_json AS detailsJson, created_at AS createdAt FROM ai_evidence WHERE drama_id = ? ORDER BY created_at DESC').all(id) as Array<Omit<AiEvidence, 'details'> & { detailsJson: string }>).map((row) => ({ ...row, details: JSON.parse(row.detailsJson) as Record<string, unknown>, detailsJson: undefined }))
  }
}
