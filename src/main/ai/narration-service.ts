import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { assertSuccessfulProcess, resolveMediaBinary, runMediaProcess } from '../media/ffmpeg-runner.js'
import { runControlledCapability, type ControlledMode } from './controlled-provider.js'
import { readPerRequestPrice } from './provider-pricing.js'

const inputSchema = z.object({ dramaId: z.string().min(1), episodeStart: z.number().int().positive(), episodeEnd: z.number().int().positive(), mode: z.enum(['standard', 'conflict-insert']), durationMinSeconds: z.number().positive(), durationMaxSeconds: z.number().positive(), maxDrafts: z.number().int().min(1).max(5), voice: z.literal('general-mandarin').default('general-mandarin'), controlledMode: z.enum(['success', 'low-confidence', 'timeout', 'cost-limit', 'failure']).default('success'), costLimit: z.number().nonnegative().default(0) }).refine((input) => input.episodeEnd >= input.episodeStart && input.durationMaxSeconds >= input.durationMinSeconds, '解说范围无效')

export type NarrationInput = z.infer<typeof inputSchema>
export type NarrationSegment = { id: string; draftId: string; evidenceId: string; narrationAssetId: string | null; assetPath: string | null; text: string; targetDurationSeconds: number; insertStartSeconds: number | null; insertEndSeconds: number | null; confidence: number | null; mode: 'standard' | 'conflict-insert'; status: string }

type TaskRow = { dramaId: string; configSnapshot: string; status: string }

export class NarrationService {
  constructor(private readonly database: Database.Database, private readonly assetDirectory: string) {}

  create(input: unknown): { taskId: string } {
    const value = inputSchema.parse(input); const now = new Date().toISOString(); const taskId = randomUUID(); const itemId = randomUUID()
    const episodes = this.database.prepare('SELECT episode_no AS episodeNo, status, source_path AS sourcePath FROM episodes WHERE drama_id = ? AND episode_no BETWEEN ? AND ? ORDER BY episode_no').all(value.dramaId, value.episodeStart, value.episodeEnd) as Array<{ episodeNo: number | null; status: string; sourcePath: string }>
    const expected = Array.from({ length: value.episodeEnd - value.episodeStart + 1 }, (_, index) => value.episodeStart + index)
    if (episodes.length !== expected.length || episodes.some(({ episodeNo, status, sourcePath }, index) => episodeNo !== expected[index] || status !== 'ready' || (isAbsolute(sourcePath) && !existsSync(sourcePath)))) throw new Error('所选剧集必须连续且可读取，修复资产后再生成解说。')
    const profile = this.database.prepare('SELECT region, provider, pricing_json AS pricing, secret_ref AS secretRef FROM provider_profiles WHERE capability = ?').get('tts') as { region: string; provider: string; pricing: string | null; secretRef: string | null } | undefined
    const estimated = profile?.secretRef ? readPerRequestPrice(profile.pricing) ?? 0 : 0
    if (value.costLimit > 0 && estimated > value.costLimit) throw new Error(`预计费用 ¥${estimated.toFixed(2)} 超过本次上限 ¥${value.costLimit.toFixed(2)}。`)
    const cost = { estimated, actual: 0, mode: 'controlled', region: profile?.secretRef ? profile.region : 'local', provider: profile?.secretRef ? profile.provider : 'controlled', costLimit: value.costLimit }
    this.database.transaction(() => {
      this.database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, cost_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)').run(taskId, value.dramaId, 'ai_narration', JSON.stringify(value), 'pending', JSON.stringify({ version: 1, stage: 'evidence', outcome: null, reason: null, segments: [] }), JSON.stringify(cost), now, now)
      this.database.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, retry_count, reason, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 0, NULL, ?, ?)').run(itemId, taskId, JSON.stringify({ episodeStart: value.episodeStart, episodeEnd: value.episodeEnd, maxDrafts: value.maxDrafts }), 'pending', now, now)
    })()
    return { taskId }
  }

  async run(taskIdInput: unknown): Promise<{ taskId: string; segments: NarrationSegment[]; outcome: 'segments-ready' | 'no-recommendation' }> {
    const taskId = z.string().uuid().parse(taskIdInput); const task = this.database.prepare('SELECT drama_id AS dramaId, config_snapshot AS configSnapshot, status FROM production_tasks WHERE id = ? AND type = ?').get(taskId, 'ai_narration') as TaskRow | undefined
    if (!task) throw new Error('AI 解说任务不存在。')
    if (task.status === 'completed') throw new Error('AI 解说任务已经完成，请进入审核时间线。')
    const claimedAt = new Date().toISOString()
    const claimed = this.database.transaction(() => {
      const result = this.database.prepare("UPDATE production_tasks SET status = 'running', updated_at = ? WHERE id = ? AND type = ? AND status IN ('pending', 'paused')").run(claimedAt, taskId, 'ai_narration')
      if (result.changes === 0) return false
      this.database.prepare("UPDATE task_items SET status = 'running', updated_at = ? WHERE task_id = ? AND status IN ('pending', 'paused')").run(claimedAt, taskId)
      return true
    })()
    if (!claimed) throw new Error('AI 解说任务正在运行或不能恢复，请刷新任务状态。')
    const config = inputSchema.parse(JSON.parse(task.configSnapshot))
    let capability: ReturnType<typeof runControlledCapability>
    try {
      capability = runControlledCapability('tts', config.controlledMode)
    } catch (error) {
      const reason = error instanceof Error ? error.message : '受控 TTS 任务失败。'
      this.markStopped(taskId, reason)
      throw error
    }
    const evidence = this.database.prepare(`
      SELECT evidence.id, evidence.summary, evidence.start_seconds AS startSeconds,
             evidence.end_seconds AS endSeconds, evidence.confidence
      FROM ai_evidence evidence JOIN episodes episode ON episode.id = evidence.episode_id
      WHERE evidence.drama_id = ? AND episode.episode_no BETWEEN ? AND ?
        AND evidence.confidence >= 0.6 AND evidence.start_seconds IS NOT NULL AND evidence.end_seconds IS NOT NULL
        AND evidence.end_seconds - evidence.start_seconds <= ?
      ORDER BY evidence.confidence DESC, evidence.created_at DESC LIMIT ?
    `).all(task.dramaId, config.episodeStart, config.episodeEnd, config.durationMaxSeconds, config.maxDrafts) as Array<{ id: string; summary: string; startSeconds: number; endSeconds: number; confidence: number | null }>
    const selected = capability.mode === 'low-confidence' ? [] : evidence
    const now = new Date().toISOString()
    const assets = await Promise.all(selected.map(async (entry) => {
      const targetDurationSeconds = Math.max(config.durationMinSeconds, entry.endSeconds - entry.startSeconds)
      return { targetDurationSeconds, asset: await this.createControlledAsset(taskId, targetDurationSeconds) }
    }))
    const segments: NarrationSegment[] = selected.map((entry, index) => {
      const prepared = assets[index]
      if (!prepared) throw new Error('无法准备受控旁白资产。')
      return { id: randomUUID(), draftId: randomUUID(), evidenceId: entry.id, narrationAssetId: prepared.asset.id, assetPath: prepared.asset.path, text: `根据原片证据：${entry.summary}`, targetDurationSeconds: prepared.targetDurationSeconds, insertStartSeconds: config.mode === 'conflict-insert' ? entry.startSeconds : null, insertEndSeconds: config.mode === 'conflict-insert' ? entry.endSeconds : null, confidence: entry.confidence, mode: config.mode, status: 'pending_review' }
    })
    const outcome = segments.length === 0 ? 'no-recommendation' as const : 'segments-ready' as const
    const reason = outcome === 'no-recommendation' ? (capability.mode === 'low-confidence' ? capability.message : '没有足够可信且可定位的剧情证据。') : null
    this.database.transaction(() => {
      for (const segment of segments) {
        const source = selected.find((entry) => entry.id === segment.evidenceId)
        this.database.prepare('INSERT INTO ai_drafts (id, task_id, evidence_id, summary, start_seconds, end_seconds, confidence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(segment.draftId, taskId, segment.evidenceId, segment.text, source?.startSeconds ?? 0, source?.endSeconds ?? 1, segment.confidence, segment.status, now, now)
        this.database.prepare('INSERT INTO narration_segments (id, task_id, draft_id, evidence_id, narration_asset_id, text, target_duration_seconds, insert_start_seconds, insert_end_seconds, confidence, mode, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(segment.id, taskId, segment.draftId, segment.evidenceId, segment.narrationAssetId, segment.text, segment.targetDurationSeconds, segment.insertStartSeconds, segment.insertEndSeconds, segment.confidence, segment.mode, segment.status, now, now)
      }
      this.database.prepare('UPDATE task_items SET status = ?, reason = ?, updated_at = ? WHERE task_id = ?').run('succeeded', reason, now, taskId)
      this.database.prepare('UPDATE production_tasks SET status = ?, progress_current = 1, checkpoint = ?, updated_at = ? WHERE id = ?').run('completed', JSON.stringify({ version: 1, stage: 'segments', outcome, reason, segments }), now, taskId)
    })()
    return { taskId, segments, outcome }
  }

  list(taskIdInput: unknown): NarrationSegment[] {
    const taskId = z.string().uuid().parse(taskIdInput)
    return this.database.prepare('SELECT segment.id, segment.draft_id AS draftId, segment.evidence_id AS evidenceId, segment.narration_asset_id AS narrationAssetId, asset.path AS assetPath, segment.text, segment.target_duration_seconds AS targetDurationSeconds, segment.insert_start_seconds AS insertStartSeconds, segment.insert_end_seconds AS insertEndSeconds, segment.confidence, segment.mode, segment.status FROM narration_segments segment LEFT JOIN narration_assets asset ON asset.id = segment.narration_asset_id WHERE segment.task_id = ? ORDER BY segment.created_at').all(taskId) as NarrationSegment[]
  }

  get(taskIdInput: unknown): { id: string; dramaId: string; status: string; config: Omit<NarrationInput, 'dramaId'>; cost: { estimated: number; actual: number; mode: 'controlled' | 'configured'; region: string; provider: string; costLimit: number }; checkpoint: unknown } {
    const taskId = z.string().uuid().parse(taskIdInput)
    const row = this.database.prepare('SELECT id, drama_id AS dramaId, status, config_snapshot AS configSnapshot, cost_json AS costJson, checkpoint FROM production_tasks WHERE id = ? AND type = ?').get(taskId, 'ai_narration') as { id: string; dramaId: string; status: string; configSnapshot: string; costJson: string; checkpoint: string | null } | undefined
    if (!row) throw new Error('AI 解说任务不存在。')
    const { dramaId: _dramaId, ...config } = inputSchema.parse(JSON.parse(row.configSnapshot))
    const rawCost = JSON.parse(row.costJson) as Partial<{ estimated: number; actual: number; mode: 'controlled' | 'configured'; region: string; provider: string; costLimit: number }>
    return { id: row.id, dramaId: row.dramaId, status: row.status, config, cost: { estimated: rawCost.estimated ?? 0, actual: rawCost.actual ?? 0, mode: rawCost.mode ?? 'controlled', region: rawCost.region ?? 'local', provider: rawCost.provider ?? 'controlled', costLimit: rawCost.costLimit ?? 0 }, checkpoint: row.checkpoint ? JSON.parse(row.checkpoint) : null }
  }

  private markStopped(taskId: string, reason: string): void {
    const now = new Date().toISOString()
    this.database.transaction(() => {
      this.database.prepare('UPDATE task_items SET status = ?, reason = ?, updated_at = ? WHERE task_id = ?').run('failed', reason, now, taskId)
      this.database.prepare('UPDATE production_tasks SET status = ?, checkpoint = ?, updated_at = ? WHERE id = ?').run('failed', JSON.stringify({ version: 1, stage: 'stopped', outcome: 'no-recommendation', reason, segments: [] }), now, taskId)
    })()
  }

  private async createControlledAsset(taskId: string, durationSeconds: number): Promise<{ id: string; path: string }> {
    await mkdir(this.assetDirectory, { recursive: true }); const id = randomUUID(); const path = join(this.assetDirectory, `${taskId}-${id}.wav`)
    assertSuccessfulProcess(await runMediaProcess(resolveMediaBinary('ffmpeg') ?? 'ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', String(durationSeconds), path]))
    const now = new Date().toISOString()
    this.database.prepare('INSERT INTO narration_assets (id, task_id, path, mode, provider, region, estimated_cost, actual_cost, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)').run(id, taskId, path, 'controlled', 'controlled', 'local', now, now)
    return { id, path }
  }
}
