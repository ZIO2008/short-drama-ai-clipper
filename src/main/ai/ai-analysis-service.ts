import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { readPerRequestPrice } from './provider-pricing.js'

const inputSchema = z.object({ dramaId: z.string().min(1), maxDrafts: z.number().int().min(1).max(5), episodeStart: z.number().int().positive(), episodeEnd: z.number().int().positive(), durationMinSeconds: z.number().positive(), durationMaxSeconds: z.number().positive(), controlledMode: z.enum(['success', 'low-confidence', 'timeout', 'cost-limit', 'failure']).default('success'), costLimit: z.number().nonnegative().default(0) }).refine((value) => value.episodeEnd >= value.episodeStart && value.durationMaxSeconds >= value.durationMinSeconds, '分析范围无效')

export type AiRemixInput = z.infer<typeof inputSchema>

export class AiAnalysisService {
  constructor(private readonly database: Database.Database) {}

  create(input: unknown): { taskId: string } {
    const value = inputSchema.parse(input); const now = new Date().toISOString(); const taskId = randomUUID(); const taskItemId = randomUUID()
    const drama = this.database.prepare('SELECT id FROM dramas WHERE id = ?').get(value.dramaId)
    if (!drama) throw new Error('剧目不存在。')
    const episodeNumbers = this.database.prepare(`
      SELECT episode_no AS episodeNo, status, source_path AS sourcePath FROM episodes
      WHERE drama_id = ? AND episode_no BETWEEN ? AND ?
      ORDER BY episode_no
    `).all(value.dramaId, value.episodeStart, value.episodeEnd) as Array<{ episodeNo: number | null; status: string; sourcePath: string }>
    const expected = Array.from(
      { length: value.episodeEnd - value.episodeStart + 1 },
      (_, index) => value.episodeStart + index
    )
    if (episodeNumbers.length !== expected.length || episodeNumbers.some(({ episodeNo, status, sourcePath }, index) => episodeNo !== expected[index] || status !== 'ready' || (isAbsolute(sourcePath) && !existsSync(sourcePath)))) {
      throw new Error('所选剧集必须连续且可读取，修复缺集或失联文件后再分析。')
    }
    const profile = this.database.prepare(`
      SELECT region, provider, pricing_json AS pricing, secret_ref AS secretRef
      FROM provider_profiles WHERE capability = ?
    `).get('text-analysis') as { region: string; provider: string; pricing: string | null; secretRef: string | null } | undefined
    const estimated = profile?.secretRef ? readPerRequestPrice(profile.pricing) ?? 0 : 0
    if (value.costLimit > 0 && estimated > value.costLimit) throw new Error(`预计费用 ¥${estimated.toFixed(2)} 超过本次上限 ¥${value.costLimit.toFixed(2)}。`)
    const cost = { estimated, actual: 0, mode: 'controlled' as const, region: profile?.secretRef ? profile.region : 'local', provider: profile?.secretRef ? profile.provider : 'controlled', costLimit: value.costLimit }
    this.database.transaction(() => {
      this.database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, cost_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)').run(taskId, value.dramaId, 'ai_remix', JSON.stringify(value), 'pending', JSON.stringify({ version: 1, stage: 'evidence', startedAt: null, drafts: [] }), JSON.stringify(cost), now, now)
      this.database.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, retry_count, reason, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 0, NULL, ?, ?)').run(taskItemId, taskId, JSON.stringify({ episodeStart: value.episodeStart, episodeEnd: value.episodeEnd, maxDrafts: value.maxDrafts }), 'pending', now, now)
    })()
    return { taskId }
  }
}
