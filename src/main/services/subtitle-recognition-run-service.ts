import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { SubtitleRecognitionRun, SubtitleRecognitionRunInput, SubtitleRecognitionRunItem, SubtitleRecognitionRunStatus, SubtitleRecognitionSettings } from '../../shared/contracts.js'

const settingsSchema = z.object({ recognitionMode: z.enum(['asr-only', 'ocr-only', 'asr-ocr']), scope: z.enum(['all', 'current', 'missing']), language: z.enum(['zh-CN', 'zh-en', 'auto']), asrMode: z.enum(['audio-first', 'denoise', 'import-only']), ocrMode: z.enum(['auto-region', 'fixed-bottom', 'episode-manual']), differenceThreshold: z.enum(['standard', 'strict', 'loose']), importStrategy: z.enum(['parallel', 'review-only']) })
const runtimeIdentitySchema = z.object({ buildId: z.string().trim().min(1), sha256: z.string().trim().regex(/^[a-f0-9]{64}$/i) })
const inputSchema = z.object({ dramaId: z.string().trim().min(1), settings: settingsSchema, episodeIds: z.array(z.string().trim().min(1)).min(1).max(500).refine((ids) => new Set(ids).size === ids.length, '识别目标不能重复'), ocrRuntime: runtimeIdentitySchema.optional().nullable() })
const runIdSchema = z.string().trim().min(1)
const continuationSchema = z.object({ runId: runIdSchema, ocrRuntime: runtimeIdentitySchema.nullable() })
const itemSchema = z.object({ runId: runIdSchema, episodeId: z.string().trim().min(1) })
const failedItemSchema = itemSchema.extend({ reason: z.string().trim().min(1).max(500) })
type RunRow = { id: string; dramaId: string; status: SubtitleRecognitionRunStatus; settingsJson: string; episodeIdsJson: string; total: number; completed: number; failed: number; currentEpisodeId: string | null; ocrRunnerBuildId: string | null; ocrRunnerSha256: string | null; reason: string | null; createdAt: string; updatedAt: string }

export class SubtitleRecognitionRunService {
  constructor(private readonly database: Database.Database, private readonly now: () => string = () => new Date().toISOString()) {}

  start(input: unknown): SubtitleRecognitionRun {
    const value = inputSchema.parse(input)
    if (value.settings.recognitionMode !== 'asr-only' && !value.ocrRuntime) throw new Error('本地 OCR 批次缺少已通过自检的 runner 身份，不能开始识别')
    const existing = this.database.prepare('SELECT id FROM episodes WHERE drama_id = ? AND id IN (' + value.episodeIds.map(() => '?').join(',') + ')').all(value.dramaId, ...value.episodeIds) as Array<{ id: string }>
    if (existing.length !== value.episodeIds.length) throw new Error('识别目标包含不属于当前剧目的分集。')
    const id = randomUUID(); const now = this.now()
    this.database.transaction(() => {
      this.database.prepare('INSERT INTO subtitle_recognition_runs (id, drama_id, status, settings_json, episode_ids_json, total_count, completed_count, failed_count, current_episode_id, ocr_runner_build_id, ocr_runner_sha256, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?, NULL, ?, ?)').run(id, value.dramaId, 'running', JSON.stringify(value.settings), JSON.stringify(value.episodeIds), value.episodeIds.length, value.ocrRuntime?.buildId ?? null, value.ocrRuntime?.sha256 ?? null, now, now)
      const insert = this.database.prepare('INSERT INTO subtitle_recognition_run_items (run_id, episode_id, status, reason, updated_at) VALUES (?, ?, ?, NULL, ?)')
      value.episodeIds.forEach((episodeId) => insert.run(id, episodeId, 'pending', now))
    })()
    return this.require(id)
  }

  latest(dramaId: unknown): SubtitleRecognitionRun | null {
    const id = this.database.prepare('SELECT id FROM subtitle_recognition_runs WHERE drama_id = ? ORDER BY updated_at DESC, created_at DESC LIMIT 1').get(z.string().trim().min(1).parse(dramaId)) as { id: string } | undefined
    return id ? this.require(id.id) : null
  }

  get(runId: unknown): SubtitleRecognitionRun { return this.require(runIdSchema.parse(runId)) }

  resume(input: unknown): SubtitleRecognitionRun {
    const value = continuationSchema.parse(input); const id = value.runId; const run = this.require(id)
    if (run.status !== 'interrupted') throw new Error('只有已中断的字幕识别批次可以继续。')
    this.assertCurrentOcrRuntime(run, value.ocrRuntime)
    const now = this.now()
    this.database.transaction(() => {
      this.database.prepare("UPDATE subtitle_recognition_run_items SET status = 'pending', reason = NULL, updated_at = ? WHERE run_id = ? AND status = 'interrupted'").run(now, id)
      this.database.prepare("UPDATE subtitle_recognition_runs SET status = 'running', current_episode_id = NULL, reason = NULL, updated_at = ? WHERE id = ?").run(now, id)
    })()
    return this.require(id)
  }

  retryFailed(input: unknown): SubtitleRecognitionRun {
    const value = continuationSchema.parse(input); const id = value.runId; const run = this.require(id)
    if (run.status !== 'partial' && run.status !== 'failed') throw new Error('只有部分失败或全部失败的字幕识别批次可以重试失败项。')
    if (!run.items.some((item) => item.status === 'failed')) throw new Error('当前批次没有可重试的失败项。')
    this.assertCurrentOcrRuntime(run, value.ocrRuntime)
    const now = this.now()
    this.database.transaction(() => {
      this.database.prepare("UPDATE subtitle_recognition_run_items SET status = 'pending', reason = NULL, updated_at = ? WHERE run_id = ? AND status = 'failed'").run(now, id)
      this.database.prepare("UPDATE subtitle_recognition_runs SET status = 'running', failed_count = 0, current_episode_id = NULL, reason = NULL, updated_at = ? WHERE id = ?").run(now, id)
    })()
    return this.require(id)
  }

  interrupt(input: unknown): SubtitleRecognitionRun {
    const value = failedItemSchema.pick({ runId: true, reason: true }).parse(input)
    const run = this.require(value.runId)
    if (run.status !== 'running') return run
    const now = this.now()
    this.database.transaction(() => {
      this.database.prepare("UPDATE subtitle_recognition_run_items SET status = 'interrupted', reason = ?, updated_at = ? WHERE run_id = ? AND status = 'running'").run(value.reason, now, value.runId)
      this.database.prepare("UPDATE subtitle_recognition_runs SET status = 'interrupted', reason = ?, current_episode_id = NULL, updated_at = ? WHERE id = ?").run(value.reason, now, value.runId)
    })()
    return this.require(value.runId)
  }

  markRunning(input: unknown): SubtitleRecognitionRun { const value = itemSchema.parse(input); this.updateItem(value.runId, value.episodeId, 'running', null); return this.require(value.runId) }
  markSucceeded(input: unknown): SubtitleRecognitionRun { const value = itemSchema.parse(input); this.updateItem(value.runId, value.episodeId, 'succeeded', null); return this.require(value.runId) }
  markFailed(input: unknown): SubtitleRecognitionRun { const value = failedItemSchema.parse(input); this.updateItem(value.runId, value.episodeId, 'failed', value.reason); return this.require(value.runId) }

  finish(runId: unknown): SubtitleRecognitionRun {
    const id = runIdSchema.parse(runId); const run = this.require(id); const items = this.items(id)
    if (items.some((item) => item.status === 'pending' || item.status === 'running' || item.status === 'interrupted')) throw new Error('字幕识别批次仍有未完成分集，不能结束。')
    const completed = items.filter((item) => item.status === 'succeeded').length; const failed = items.filter((item) => item.status === 'failed').length
    const status: SubtitleRecognitionRunStatus = failed === 0 ? 'completed' : completed === 0 ? 'failed' : 'partial'
    this.database.prepare('UPDATE subtitle_recognition_runs SET status = ?, completed_count = ?, failed_count = ?, current_episode_id = NULL, reason = ?, updated_at = ? WHERE id = ?').run(status, completed, failed, failed > 0 ? `${failed} 集执行失败。` : null, this.now(), id)
    return this.require(id)
  }

  recoverInterruptedRuns(): void {
    const now = this.now()
    this.database.transaction(() => {
      this.database.prepare("UPDATE subtitle_recognition_run_items SET status = 'interrupted', reason = '工具已关闭或重启', updated_at = ? WHERE status = 'running'").run(now)
      this.database.prepare("UPDATE subtitle_recognition_runs SET status = 'interrupted', reason = '工具已关闭或重启', current_episode_id = NULL, updated_at = ? WHERE status = 'running'").run(now)
    })()
  }

  private updateItem(runId: string, episodeId: string, status: 'running' | 'succeeded' | 'failed', reason: string | null): void {
    const run = this.require(runId)
    if (run.status !== 'running') throw new Error('字幕识别批次当前未在运行。')
    const now = this.now()
    this.database.transaction(() => {
      const result = this.database.prepare('UPDATE subtitle_recognition_run_items SET status = ?, reason = ?, updated_at = ? WHERE run_id = ? AND episode_id = ? AND status IN (\'pending\', \'running\')').run(status, reason, now, runId, episodeId)
      if (result.changes !== 1) throw new Error('当前分集不属于可执行的字幕识别检查点。')
      const items = this.items(runId); const completed = items.filter((item) => item.status === 'succeeded').length; const failed = items.filter((item) => item.status === 'failed').length
      this.database.prepare('UPDATE subtitle_recognition_runs SET completed_count = ?, failed_count = ?, current_episode_id = ?, updated_at = ? WHERE id = ?').run(completed, failed, status === 'running' ? episodeId : null, now, runId)
    })()
  }

  private assertCurrentOcrRuntime(run: SubtitleRecognitionRun, currentRuntime: { buildId: string; sha256: string } | null): void {
    if (run.settings.recognitionMode === 'asr-only') return
    if (!run.ocrRuntime || !currentRuntime || run.ocrRuntime.buildId !== currentRuntime.buildId || run.ocrRuntime.sha256 !== currentRuntime.sha256) {
      throw new Error('当前 OCR runner 与该历史批次不一致；旧批次已保留，请新建批次处理未完成或失败分集。')
    }
  }

  private require(id: string): SubtitleRecognitionRun {
    const row = this.database.prepare('SELECT id, drama_id AS dramaId, status, settings_json AS settingsJson, episode_ids_json AS episodeIdsJson, total_count AS total, completed_count AS completed, failed_count AS failed, current_episode_id AS currentEpisodeId, ocr_runner_build_id AS ocrRunnerBuildId, ocr_runner_sha256 AS ocrRunnerSha256, reason, created_at AS createdAt, updated_at AS updatedAt FROM subtitle_recognition_runs WHERE id = ?').get(id) as RunRow | undefined
    if (!row) throw new Error('字幕识别批次不存在。')
    return { ...row, ocrRuntime: row.ocrRunnerBuildId && row.ocrRunnerSha256 ? { buildId: row.ocrRunnerBuildId, sha256: row.ocrRunnerSha256 } : null, settings: settingsSchema.parse(JSON.parse(row.settingsJson)) as SubtitleRecognitionSettings, episodeIds: z.array(z.string()).parse(JSON.parse(row.episodeIdsJson)), items: this.items(id) }
  }

  private items(runId: string): SubtitleRecognitionRunItem[] {
    return this.database.prepare('SELECT episode_id AS episodeId, status, reason FROM subtitle_recognition_run_items WHERE run_id = ? ORDER BY rowid').all(runId) as SubtitleRecognitionRunItem[]
  }
}
