import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'

const inputSchema = z.object({ capability: z.enum(['asr', 'text-analysis', 'multimodal-review', 'tts']), mode: z.enum(['controlled', 'configured']), metrics: z.record(z.string(), z.number().finite()), notes: z.string().trim().max(1000).nullable().optional() })
export type EvaluationRun = { id: string; capability: string; mode: 'controlled' | 'configured'; metrics: Record<string, number>; notes: string | null; createdAt: string }

export class EvaluationService {
  constructor(private readonly database: Database.Database) {}

  record(input: unknown): EvaluationRun {
    const value = inputSchema.parse(input); const id = randomUUID(); const now = new Date().toISOString()
    this.database.prepare('INSERT INTO evaluation_runs (id, capability, mode, metrics_json, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, value.capability, value.mode, JSON.stringify(value.metrics), value.notes ?? null, now, now)
    return { id, capability: value.capability, mode: value.mode, metrics: value.metrics, notes: value.notes ?? null, createdAt: now }
  }
}
