import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { probeMedia } from '../media/media-probe.js'
import { assertSuccessfulProcess, resolveMediaBinary, runMediaProcess } from '../media/ffmpeg-runner.js'
import { TaskQueue } from '../tasks/task-queue.js'
import { enforceOutputSizeLimit } from './output-size-limit.js'
import { isProductionReady } from '../../shared/production-readiness.js'
import type { ClipCandidateGenerationInput, ClipEpisodeStatus, ClipExportBatch, ClipExportConfig, ClipExportPreflight, ClipExportProgress, ClipExportResult, ClipGenerationPreflight, ClipSubtitleVariant, PackagingConfig } from '../../shared/contracts.js'
import { formatSrt } from './subtitle-service.js'
import { ClipSubtitleVariantStore } from './clip-subtitle-variant-store.js'
import { persistClipExportConfig, readClipExportConfig } from './clip-export-task-config.js'
import { overlapRatio, uniqueOutputPath } from './clip-service-utils.js'

export type ClipCandidate = { id: string; episodeId: string; startSeconds: number; endSeconds: number; status: 'pending_review' | 'editing' | 'confirmed' | 'exporting' | 'exported' | 'failed'; reason: string | null; createdAt?: string }
const rangeSchema = z.object({ startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().positive() }).refine((range) => range.endSeconds > range.startSeconds, 'End must be after start')
const batchRangeSchema = rangeSchema.extend({ episodeId: z.string().trim().min(1) })
const generationSchema = z.object({ episodeIds: z.array(z.string().trim().min(1)).min(1).max(100), candidatesPerEpisode: z.number().int().min(1).max(50), targetDurationSeconds: z.number().finite().min(3).max(180), maxOverlapRatio: z.number().min(0).max(0.95), allowRepeat: z.boolean() })
const packagingSchema = z.object({ aspect: z.enum(['portrait', 'landscape']).optional(), preset: z.enum(['default', 'conflict', 'clean']).optional(), title: z.string().max(240), titlePosition: z.enum(['top', 'bottom']), prompt: z.string().max(240), promptPosition: z.enum(['left', 'right']), badge: z.enum(['热门短剧', '热播中', '爆款推荐', 'none']), titleSize: z.enum(['small', 'medium', 'large']).optional(), titleTone: z.enum(['warm', 'accent']).optional(), promptStyle: z.enum(['solid', 'outline']).optional(), overlay: z.enum(['subtle', 'strong', 'none']).optional() })
const exportConfigSchema = z.object({ candidateIds: z.array(z.string().trim().min(1)).min(1).max(500), outputDirectory: z.string().trim().min(1), namingPattern: z.string().trim().min(1).max(160), encoding: z.enum(['copy', 'h264-balanced', 'h264-quality']), outputSize: z.enum(['source', '1080x1920', '1920x1080']), subtitleStrategy: z.enum(['none', 'soft', 'burn']), conflictStrategy: z.literal('append'), qualityMode: z.enum(['original', 'bitrate', 'size']).optional(), bitrateKbps: z.number().finite().positive().optional(), targetSizeMb: z.number().finite().positive().optional(), fps: z.union([z.literal('source'), z.number().finite().positive().max(120)]).optional(), packagingEnabled: z.boolean().optional(), packaging: packagingSchema.optional() }).superRefine((config, context) => { if (config.qualityMode === 'bitrate' && !config.bitrateKbps) context.addIssue({ code: z.ZodIssueCode.custom, path: ['bitrateKbps'], message: '固定码率必须大于 0。' }); if (config.qualityMode === 'size' && !config.targetSizeMb) context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetSizeMb'], message: '目标大小必须大于 0。' }) }).refine((config) => new Set(config.candidateIds).size === config.candidateIds.length, { message: '同一候选不能重复加入一次导出。', path: ['candidateIds'] })
const errorMessage = (error: unknown): string => error instanceof Error ? error.message : '导出失败。'
const escapeDrawtextText = (value: string): string => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[':,\[\];]/g, '\\$&').replace(/%/g, '\\\\%')
const outputFilters = (config: Pick<ClipExportConfig, 'outputSize' | 'subtitleStrategy' | 'packagingEnabled' | 'packaging'>, subtitlePath: string | null): string[] => {
  const filters: string[] = []
  if (config.packagingEnabled) {
    const packaging: PackagingConfig = config.packaging ?? { title: '短剧', titlePosition: 'top', prompt: '', promptPosition: 'left', badge: 'none' }
    const [width, height] = (packaging.aspect ?? 'portrait') === 'portrait' ? [1080, 1920] : [1920, 1080]
    const size = packaging.titleSize === 'small' ? 28 : packaging.titleSize === 'large' ? 38 : 32
    const color = packaging.titleTone === 'accent' ? 'orange' : 'white'
    const alpha = packaging.overlay === 'strong' ? '0.72' : packaging.overlay === 'none' ? '0' : '0.55'
    filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease`, `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`, `drawtext=text='${escapeDrawtextText(packaging.title)}':x=(w-text_w)/2:y=${packaging.titlePosition === 'top' ? 'h*0.08' : 'h*0.82'}:fontsize=${size}:fontcolor=${color}:box=1:boxcolor=black@${alpha}`)
    if (packaging.prompt.trim()) { const decoration = packaging.promptStyle === 'outline' ? ':box=0:borderw=2:bordercolor=black@0.9' : `:box=1:boxcolor=black@${alpha}`; filters.push(`drawtext=text='${escapeDrawtextText(packaging.prompt.split('').join('\n'))}':x=${packaging.promptPosition === 'left' ? 'w*0.06' : 'w*0.91-text_w'}:y=(h-text_h)/2:fontsize=20:fontcolor=white${decoration}`) }
    if (packaging.badge !== 'none') filters.push(`drawtext=text='${escapeDrawtextText(packaging.badge)}':x=w-text_w-w*0.06:y=h*0.08:fontsize=18:fontcolor=black:box=1:boxcolor=orange@0.9`)
  } else if (config.outputSize !== 'source') { const [width, height] = config.outputSize.split('x'); filters.push(`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`) }
  if (config.subtitleStrategy === 'burn' && subtitlePath) { const escaped = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'"); filters.push(`subtitles='${escaped}'`) }
  return filters
}

export class OriginalClipService {
  private readonly exportJobs = new Map<string, { controller: AbortController; progress: ClipExportProgress; config: ClipExportConfig; batchId: string; completion: Promise<void> }>()
  private readonly subtitleVariants: ClipSubtitleVariantStore
  constructor(private readonly database: Database.Database, private readonly queue = new TaskQueue(database)) {
    this.subtitleVariants = new ClipSubtitleVariantStore(database, (candidateId) => this.getCandidate(candidateId))
    this.recoverInterruptedExportBatches()
  }

  createCandidate(dramaId: unknown, episodeId: unknown, range: unknown): ClipCandidate {
    const [candidate] = this.createCandidates(dramaId, [{ episodeId: z.string().trim().min(1).parse(episodeId), ...rangeSchema.parse(range) }])
    if (!candidate) throw new Error('Could not create clip candidate')
    return candidate
  }

  createCandidates(dramaIdInput: unknown, rangesInput: unknown): ClipCandidate[] {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const ranges = z.array(batchRangeSchema).min(1).max(500).parse(rangesInput); const seen = new Set<string>()
    const validated = ranges.map((range) => {
      const duplicateKey = `${range.episodeId}:${range.startSeconds}:${range.endSeconds}`
      if (seen.has(duplicateKey)) throw new Error('Duplicate clip range in batch')
      seen.add(duplicateKey)
      const episode = this.database.prepare('SELECT duration_seconds AS durationSeconds, status FROM episodes WHERE id = ? AND drama_id = ?').get(range.episodeId, dramaId) as { durationSeconds: number | null; status: string } | undefined
      if (!episode) throw new Error('Episode not found')
      if (!isProductionReady(episode.status)) throw new Error(`Episode is not ready for production: ${episode.status}`)
      if (episode.durationSeconds !== null && range.endSeconds > episode.durationSeconds + 0.05) throw new Error('Clip range exceeds episode duration')
      return range
    })
    const taskId = randomUUID(); const now = new Date().toISOString(); const candidates: ClipCandidate[] = validated.map((range) => ({ id: randomUUID(), episodeId: range.episodeId, startSeconds: range.startSeconds, endSeconds: range.endSeconds, status: 'pending_review', reason: null, createdAt: now }))
    this.database.transaction(() => {
      this.database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(taskId, dramaId, 'original_clip', JSON.stringify({ batch: true, candidateCount: candidates.length }), 'reviewing', 0, candidates.length, now, now)
      const insert = this.database.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)')
      for (const candidate of candidates) insert.run(candidate.id, taskId, JSON.stringify({ episodeId: candidate.episodeId, startSeconds: candidate.startSeconds, endSeconds: candidate.endSeconds }), 'pending_review', now, now)
    })()
    return candidates
  }

  generateCandidates(dramaIdInput: unknown, inputValue: unknown): ClipCandidate[] {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput)
    const input = generationSchema.parse(inputValue) satisfies ClipCandidateGenerationInput
    const episodeIds = [...new Set(input.episodeIds)]
    if (episodeIds.length !== input.episodeIds.length) throw new Error('同一源分集只能选择一次。')
    const existing = this.listCandidates(dramaId)
    const ranges: Array<{ episodeId: string; startSeconds: number; endSeconds: number }> = []
    for (const episodeId of episodeIds) {
      const episode = this.database.prepare('SELECT duration_seconds AS durationSeconds, status FROM episodes WHERE id = ? AND drama_id = ?').get(episodeId, dramaId) as { durationSeconds: number | null; status: string } | undefined
      if (!episode) throw new Error('Episode not found')
      if (!isProductionReady(episode.status) || episode.durationSeconds === null) throw new Error('源分集不可用于生成候选。')
      const duration = Math.min(input.targetDurationSeconds, episode.durationSeconds)
      if (duration < 3) throw new Error('源分集时长不足以生成候选。')
      const step = Math.max(0.1, duration * (1 - input.maxOverlapRatio))
      const maxStart = Math.max(0, episode.durationSeconds - duration)
      const occupied = existing.filter((candidate) => candidate.episodeId === episodeId).map((candidate) => ({ start: candidate.startSeconds, end: candidate.endSeconds }))
      let accepted = 0; let probe = 0
      while (accepted < input.candidatesPerEpisode && probe < input.candidatesPerEpisode * 30) {
        const start = maxStart === 0 ? 0 : Math.min(maxStart, Number(((probe * step) % (maxStart + step)).toFixed(3)))
        const end = Number(Math.min(episode.durationSeconds, start + duration).toFixed(3))
        const overlaps = occupied.some((other) => overlapRatio(start, end, other.start, other.end) > input.maxOverlapRatio)
        if (input.allowRepeat || !overlaps) { ranges.push({ episodeId, startSeconds: start, endSeconds: end }); occupied.push({ start, end }); accepted += 1 }
        probe += 1
      }
    }
    if (ranges.length === 0) throw new Error('低重合约束下没有可生成的候选；请降低数量或显式允许重复。')
    const generated: ClipCandidate[] = []
    for (let offset = 0; offset < ranges.length; offset += 500) generated.push(...this.createCandidates(dramaId, ranges.slice(offset, offset + 500)))
    return generated
  }

  preflightGeneration(dramaIdInput: unknown, inputValue: unknown): ClipGenerationPreflight {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput)
    const input = generationSchema.parse(inputValue) satisfies ClipCandidateGenerationInput
    const episodeIds = [...new Set(input.episodeIds)]
    if (episodeIds.length !== input.episodeIds.length) throw new Error('同一源分集只能选择一次。')
    const skipped: ClipGenerationPreflight['skipped'] = []
    const eligibleEpisodeIds: string[] = []
    for (const episodeId of episodeIds) {
      const episode = this.database.prepare('SELECT duration_seconds AS durationSeconds, status FROM episodes WHERE id = ? AND drama_id = ?').get(episodeId, dramaId) as { durationSeconds: number | null; status: string } | undefined
      if (!episode) { skipped.push({ episodeId, reason: '源分集不属于当前剧目。' }); continue }
      if (!isProductionReady(episode.status) || episode.durationSeconds === null) { skipped.push({ episodeId, reason: '媒体未就绪，已跳过。' }); continue }
      if (Math.min(input.targetDurationSeconds, episode.durationSeconds) < 3) { skipped.push({ episodeId, reason: '源分集时长不足 3 秒，已跳过。' }); continue }
      eligibleEpisodeIds.push(episodeId)
    }
    return { episodeIds, eligibleEpisodeIds, requestedCandidates: episodeIds.length * input.candidatesPerEpisode, estimatedCandidates: eligibleEpisodeIds.length * input.candidatesPerEpisode, candidatesPerEpisode: input.candidatesPerEpisode, targetDurationSeconds: input.targetDurationSeconds, maxOverlapRatio: input.maxOverlapRatio, allowRepeat: input.allowRepeat, skipped }
  }

  listCandidates(dramaIdInput: unknown): ClipCandidate[] {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput)
    const rows = this.database.prepare(`
      SELECT i.id, i.planned_range AS plannedRange, i.status, i.reason, i.created_at AS createdAt
      FROM task_items i JOIN production_tasks t ON t.id = i.task_id
      WHERE t.drama_id = ? AND t.type = ? ORDER BY i.created_at ASC, i.id ASC
    `).all(dramaId, 'original_clip') as Array<{ id: string; plannedRange: string; status: ClipCandidate['status']; reason: string | null; createdAt: string }>
    return rows.map((row) => {
      const range = JSON.parse(row.plannedRange) as { episodeId: string; startSeconds: number; endSeconds: number }
      return { id: row.id, episodeId: range.episodeId, startSeconds: range.startSeconds, endSeconds: range.endSeconds, status: row.status, reason: row.reason, createdAt: row.createdAt }
    })
  }

  listEpisodeStatuses(dramaIdInput: unknown): ClipEpisodeStatus[] {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput)
    const episodes = this.database.prepare('SELECT id, episode_no AS episodeNo, status FROM episodes WHERE drama_id = ? ORDER BY sort_order, id').all(dramaId) as Array<{ id: string; episodeNo: number | null; status: string }>
    const candidates = this.listCandidates(dramaId)
    return episodes.map((episode) => {
      const items = candidates.filter((candidate) => candidate.episodeId === episode.id)
      const count = (status: ClipCandidate['status']): number => items.filter((item) => item.status === status).length
      const pendingCount = count('pending_review') + count('editing'); const confirmedCount = count('confirmed'); const exportedCount = count('exported'); const failedCount = count('failed')
      const productionStatus: ClipEpisodeStatus['productionStatus'] = !isProductionReady(episode.status)
        ? 'missing_media'
        : failedCount > 0 ? 'failed'
          : count('exporting') > 0 ? 'exporting'
            : items.length > 0 && exportedCount === items.length ? 'exported'
              : confirmedCount > 0 && pendingCount === 0 ? 'confirmed'
                : pendingCount > 0 ? 'pending_confirmation'
                  : 'ready_to_generate'
      return { episodeId: episode.id, episodeNo: episode.episodeNo, sourceStatus: episode.status, candidateCount: items.length, pendingCount, confirmedCount, exportedCount, failedCount, productionStatus }
    })
  }

  getLatestExportBatch(dramaIdInput: unknown): ClipExportBatch | null {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput)
    const row = this.database.prepare("SELECT id, drama_id AS dramaId, candidate_ids_json AS candidateIdsJson, status, reason, created_at AS createdAt, updated_at AS updatedAt FROM clip_export_batches WHERE drama_id = ? AND status = 'completed' ORDER BY updated_at DESC LIMIT 1").get(dramaId) as { id: string; dramaId: string; candidateIdsJson: string; status: ClipExportBatch['status']; reason: string | null; createdAt: string; updatedAt: string } | undefined
    if (!row) return null
    let candidateIds: unknown
    try { candidateIds = JSON.parse(row.candidateIdsJson) } catch { return null }
    if (!Array.isArray(candidateIds) || candidateIds.some((id) => typeof id !== 'string')) return null
    return { id: row.id, dramaId: row.dramaId, candidateIds, status: row.status, reason: row.reason, createdAt: row.createdAt, updatedAt: row.updatedAt }
  }

  preflightExport(dramaIdInput: unknown, configValue: unknown): ClipExportPreflight {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const config = exportConfigSchema.parse(configValue) satisfies ClipExportConfig
    const candidates = this.listCandidates(dramaId); const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
    const blocked = config.candidateIds.flatMap((candidateId) => { const candidate = byId.get(candidateId); return !candidate ? [{ candidateId, reason: '候选不属于当前剧目。' }] : candidate.status !== 'confirmed' ? [{ candidateId, reason: '候选尚未确认，不能导出。' }] : [] })
    if (config.subtitleStrategy !== 'none') blocked.push(...config.candidateIds.filter((id) => !blocked.some((item) => item.candidateId === id) && this.listSubtitleVariants(id).length === 0).map((candidateId) => ({ candidateId, reason: '该候选还没有可导出的展示字幕变体；请先在候选工作区创建并保留来源。' })))
    const valid = config.candidateIds.map((id) => byId.get(id)).filter((value): value is ClipCandidate => value !== undefined && value.status === 'confirmed')
    const totalDurationSeconds = valid.reduce((sum, candidate) => sum + candidate.endSeconds - candidate.startSeconds, 0)
    const bytesPerSecond = config.encoding === 'copy' ? 750_000 : config.encoding === 'h264-quality' ? 900_000 : 550_000
    return { candidateIds: config.candidateIds, count: config.candidateIds.length, totalDurationSeconds, estimatedSizeBytes: Math.round(totalDurationSeconds * bytesPerSecond), outputDirectory: config.outputDirectory, namingPattern: config.namingPattern, encoding: config.encoding, outputSize: config.outputSize, subtitleStrategy: config.subtitleStrategy, conflictStrategy: 'append', blocked }
  }

  async exportCandidates(dramaIdInput: unknown, configValue: unknown): Promise<ClipExportResult[]> {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const config = exportConfigSchema.parse(configValue) satisfies ClipExportConfig
    const preflight = this.preflightExport(dramaId, config)
    if (preflight.blocked.length > 0) throw new Error(`导出预检未通过：${preflight.blocked[0]?.reason ?? '候选不可导出。'}`)
    persistClipExportConfig(this.database, config)
    const batchId = this.beginExportBatch(dramaId, config.candidateIds, ['confirmed'])
    try {
      const results = await this.runExportBatch(config, batchId)
      const outcome = this.batchOutcome(results)
      this.finishExportBatch(batchId, outcome.status, outcome.reason)
      return results
    } catch (error) {
      this.releaseExportCandidates(batchId, config.candidateIds)
      this.finishExportBatch(batchId, 'failed', errorMessage(error))
      throw error
    }
  }

  startExportCandidates(dramaIdInput: unknown, configValue: unknown): ClipExportProgress {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const config = exportConfigSchema.parse(configValue) satisfies ClipExportConfig
    const preflight = this.preflightExport(dramaId, config)
    if (preflight.blocked.length > 0) throw new Error(`导出预检未通过：${preflight.blocked[0]?.reason ?? '候选不可导出。'}`)
    persistClipExportConfig(this.database, config)
    const exportId = randomUUID(); const batchId = this.beginExportBatch(dramaId, config.candidateIds, ['confirmed']); const controller = new AbortController(); const progress: ClipExportProgress = { exportId, total: config.candidateIds.length, completed: 0, status: 'running', results: [] }
    const job = { controller, progress, config, batchId, completion: Promise.resolve() }
    this.exportJobs.set(exportId, job)
    job.completion = this.finishBackgroundExport(batchId, config, controller, progress)
    return progress
  }

  getExportProgress(exportIdInput: unknown): ClipExportProgress {
    const exportId = z.string().trim().min(1).parse(exportIdInput); const job = this.exportJobs.get(exportId)
    if (!job) throw new Error('导出任务不存在或已过期。')
    return { ...job.progress, results: [...job.progress.results] }
  }

  async cancelExport(exportIdInput: unknown): Promise<ClipExportProgress> {
    const exportId = z.string().trim().min(1).parse(exportIdInput); const job = this.exportJobs.get(exportId)
    if (!job) throw new Error('导出任务不存在或已过期。')
    if (job.progress.status === 'running') { job.controller.abort(); job.progress.status = 'cancelled' }
    await job.completion
    return this.getExportProgress(exportId)
  }

  private async runExportBatch(config: ClipExportConfig, batchId: string, signal?: AbortSignal, progress?: ClipExportProgress): Promise<ClipExportResult[]> {
    const results: ClipExportResult[] = progress?.results ?? []
    for (const candidateId of config.candidateIds) {
      if (signal?.aborted) break
      try { const result = await this.exportCandidateWithConfig(candidateId, config, batchId, signal); results.push({ candidateId, status: 'exported', outputPath: result.outputPath, reason: null }) }
      catch (error) {
        if (signal?.aborted) break
        results.push({ candidateId, status: 'failed', outputPath: null, reason: errorMessage(error) })
      }
      if (progress) progress.completed = results.length
    }
    return results
  }

  confirmCandidate(candidateId: unknown): ClipCandidate {
    const id = z.string().trim().min(1).parse(candidateId); const now = new Date().toISOString()
    const result = this.database.prepare('UPDATE task_items SET status = ?, updated_at = ? WHERE id = ? AND status IN (?, ?)').run('confirmed', now, id, 'pending_review', 'editing')
    if (result.changes === 0) throw new Error('Candidate is not editable')
    return this.getCandidate(id)
  }

  updateCandidate(candidateId: unknown, range: unknown): ClipCandidate {
    const id = z.string().trim().min(1).parse(candidateId)
    const value = rangeSchema.parse(range)
    const row = this.database.prepare("SELECT e.duration_seconds AS durationSeconds FROM task_items i JOIN episodes e ON e.id = json_extract(i.planned_range, '$.episodeId') WHERE i.id = ?").get(id) as { durationSeconds: number | null } | undefined
    if (!row) throw new Error('Candidate not found')
    if (row.durationSeconds !== null && value.endSeconds > row.durationSeconds + 0.05) throw new Error('Clip range exceeds episode duration')
    const result = this.database.prepare("UPDATE task_items SET planned_range = json_set(planned_range, '$.startSeconds', ?, '$.endSeconds', ?), status = ?, updated_at = ? WHERE id = ? AND status IN (?, ?)").run(value.startSeconds, value.endSeconds, 'editing', new Date().toISOString(), id, 'pending_review', 'editing')
    if (result.changes === 0) throw new Error('Candidate is not editable')
    return this.getCandidate(id)
  }

  deleteCandidate(candidateId: unknown): void {
    const id = z.string().trim().min(1).parse(candidateId)
    const candidate = this.database.prepare("SELECT i.task_id AS taskId, i.status FROM task_items i JOIN production_tasks t ON t.id = i.task_id WHERE i.id = ? AND t.type = 'original_clip'").get(id) as { taskId: string; status: ClipCandidate['status'] } | undefined
    if (!candidate) throw new Error('候选不存在或不属于原剧切片。')
    if (candidate.status === 'exporting') throw new Error('候选正在导出，无法删除。')
    if (candidate.status === 'exported') throw new Error('已导出候选保留完成报告与成果审计，无法删除。')
    this.database.transaction(() => {
      const result = this.database.prepare('DELETE FROM task_items WHERE id = ? AND status IN (?, ?, ?, ?)').run(id, 'pending_review', 'editing', 'confirmed', 'failed')
      if (result.changes !== 1) throw new Error('候选状态已变化，无法删除。')
      this.refreshTask(candidate.taskId)
    })()
  }

  getCandidate(candidateId: string): ClipCandidate {
    const row = this.database.prepare('SELECT id, planned_range, status, reason, created_at AS createdAt FROM task_items WHERE id = ?').get(candidateId) as { id: string; planned_range: string; status: ClipCandidate['status']; reason: string | null; createdAt: string } | undefined
    if (!row) throw new Error('Candidate not found')
    const range = JSON.parse(row.planned_range) as { episodeId: string; startSeconds: number; endSeconds: number }
    return { id: row.id, episodeId: range.episodeId, startSeconds: range.startSeconds, endSeconds: range.endSeconds, status: row.status, reason: row.reason, createdAt: row.createdAt }
  }

  async exportCandidate(candidateId: unknown, outputDirectory: unknown): Promise<{ candidate: ClipCandidate; outputPath: string }> {
    const id = z.string().trim().min(1).parse(candidateId)
    const config = { candidateIds: [id], outputDirectory: z.string().trim().min(1).parse(outputDirectory), namingPattern: 'E{episode}_C{candidate}', encoding: 'copy' as const, outputSize: 'source' as const, subtitleStrategy: 'none' as const, conflictStrategy: 'append' as const }
    persistClipExportConfig(this.database, config)
    const batchId = this.beginExportBatch(this.getCandidateDramaId(id), [id], ['confirmed'])
    try {
      const result = await this.exportCandidateWithConfig(id, config, batchId)
      this.finishExportBatch(batchId, 'completed')
      return result
    } catch (error) {
      this.releaseExportCandidates(batchId, [id])
      this.finishExportBatch(batchId, 'failed', errorMessage(error))
      throw error
    }
  }

  private async exportCandidateWithConfig(candidateId: string, config: ClipExportConfig, batchId: string, signal?: AbortSignal): Promise<{ candidate: ClipCandidate; outputPath: string }> {
    const candidate = this.getCandidate(candidateId)
    const claim = this.database.prepare('SELECT export_batch_id AS batchId FROM task_items WHERE id = ? AND status = ?').get(candidateId, 'exporting') as { batchId: string | null } | undefined
    if (candidate.status !== 'exporting' || claim?.batchId !== batchId) throw new Error('候选没有被当前导出批次抢占。')
    await this.runCandidateItem(candidateId, config.outputDirectory, batchId, signal, config)
    const material = this.database.prepare('SELECT path FROM generated_materials WHERE task_item_id = ? ORDER BY created_at DESC LIMIT 1').get(candidateId) as { path: string } | undefined
    if (!material) throw new Error('候选导出未生成成果。')
    return { candidate: this.getCandidate(candidateId), outputPath: material.path }
  }

  async runCandidateItem(candidateId: string, outputDirectory: string, batchId: string, signal?: AbortSignal, config: Pick<ClipExportConfig, 'namingPattern' | 'encoding' | 'outputSize' | 'subtitleStrategy' | 'qualityMode' | 'bitrateKbps' | 'targetSizeMb' | 'fps' | 'packagingEnabled' | 'packaging'> = { namingPattern: 'E{episode}_C{candidate}', encoding: 'copy', outputSize: 'source', subtitleStrategy: 'none' }): Promise<{ status: 'succeeded' }> {
    const candidate = this.getCandidate(candidateId)
    const claim = this.database.prepare('SELECT id FROM task_items WHERE id = ? AND status = ? AND export_batch_id = ?').get(candidateId, 'exporting', batchId)
    if (!claim) throw new Error('候选导出批次所有权已失效。')
    const source = this.database.prepare(`SELECT e.source_path, t.drama_id, i.task_id FROM episodes e JOIN task_items i ON json_extract(i.planned_range, '$.episodeId') = e.id JOIN production_tasks t ON t.id = i.task_id WHERE i.id = ?`).get(candidateId) as { source_path: string; drama_id: string; task_id: string } | undefined
    if (!source) throw new Error('Source episode not found')
    const variants = config.subtitleStrategy === 'none' ? [] : this.subtitleVariants.list(candidateId)
    if (config.subtitleStrategy !== 'none' && variants.length === 0) throw new Error('当前候选没有可导出的展示字幕变体。')
    await mkdir(outputDirectory, { recursive: true }); const episode = this.database.prepare('SELECT episode_no AS episodeNo FROM episodes WHERE id = ?').get(candidate.episodeId) as { episodeNo: number | null } | undefined
    const baseName = config.namingPattern.replaceAll('{episode}', String(episode?.episodeNo ?? 'NA').padStart(2, '0')).replaceAll('{candidate}', candidateId.slice(0, 8)).replace(/[\\/:*?"<>|]/g, '_')
    const outputPath = await uniqueOutputPath(outputDirectory, `${baseName || `clip-${candidateId.slice(0, 8)}`}.mp4`); const now = new Date().toISOString()
    this.database.prepare('UPDATE task_items SET updated_at = ? WHERE id = ? AND status = ? AND export_batch_id = ?').run(now, candidateId, 'exporting', batchId)
    const subtitlePath = variants.length ? join(outputDirectory, `.clip-${candidateId}.srt`) : null
    try {
      if (subtitlePath) await writeFile(subtitlePath, formatSrt(variants.map((variant, index) => ({ index: index + 1, startSeconds: variant.startSeconds, endSeconds: variant.endSeconds, text: variant.text }))), 'utf8')
      const args = ['-n', '-ss', String(candidate.startSeconds), '-to', String(candidate.endSeconds), '-i', source.source_path]
      if (config.subtitleStrategy === 'soft' && subtitlePath) args.push('-i', subtitlePath, '-map', '0', '-map', '1')
      const requiresEncoding = config.encoding !== 'copy' || config.outputSize !== 'source' || config.subtitleStrategy === 'burn' || config.qualityMode === 'bitrate' || config.qualityMode === 'size' || (config.fps !== undefined && config.fps !== 'source') || config.packagingEnabled === true
      if (!requiresEncoding) args.push('-c', 'copy', ...(config.subtitleStrategy === 'soft' ? ['-c:s', 'mov_text'] : []))
      else {
        args.push('-c:v', 'libx264', '-preset', config.encoding === 'h264-quality' ? 'slow' : 'medium', '-c:a', 'aac', '-b:a', '128k')
        if (config.qualityMode === 'bitrate' && config.bitrateKbps) args.push('-b:v', `${Math.round(config.bitrateKbps)}k`)
        else if (config.qualityMode === 'size' && config.targetSizeMb) { const videoKbps = Math.floor((config.targetSizeMb * 8192) / (candidate.endSeconds - candidate.startSeconds) - 160); if (videoKbps < 100) throw new Error('目标文件大小无法容纳当前音视频开销。'); args.push('-b:v', `${videoKbps}k`) }
        else args.push('-crf', config.encoding === 'h264-quality' ? '18' : '22')
        if (typeof config.fps === 'number') args.push('-r', String(config.fps))
        if (config.subtitleStrategy === 'soft') args.push('-c:s', 'mov_text')
        const filters = outputFilters(config, subtitlePath)
        if (filters.length) args.push('-vf', filters.join(','))
      }
      args.push(outputPath)
      const result = await runMediaProcess(resolveMediaBinary('ffmpeg') ?? 'ffmpeg', args, { signal })
      assertSuccessfulProcess(result); const outputSize = await enforceOutputSizeLimit(outputPath, config.qualityMode === 'size' ? config.targetSizeMb : undefined); const metadata = await probeMedia(outputPath)
      const completed = this.database.prepare('UPDATE task_items SET status = ?, export_batch_id = NULL, actual_range = ?, updated_at = ? WHERE id = ? AND status = ? AND export_batch_id = ?').run('exported', JSON.stringify({ startSeconds: candidate.startSeconds, endSeconds: candidate.endSeconds }), now, candidateId, 'exporting', batchId)
      if (completed.changes !== 1) throw new Error('候选导出批次所有权已失效。')
      this.database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, duration_seconds, fps, size_bytes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), source.drama_id, source.task_id, candidateId, outputPath, metadata.durationSeconds, metadata.fps, outputSize, now, now)
      this.refreshTask(source.task_id)
      return { status: 'succeeded' }
    } catch (error) {
      if (signal?.aborted) this.database.prepare('UPDATE task_items SET status = ?, export_batch_id = NULL, reason = NULL, updated_at = ? WHERE id = ? AND status = ? AND export_batch_id = ?').run('confirmed', new Date().toISOString(), candidateId, 'exporting', batchId)
      else this.database.prepare('UPDATE task_items SET status = ?, export_batch_id = NULL, reason = ?, updated_at = ? WHERE id = ? AND status = ? AND export_batch_id = ?').run('failed', errorMessage(error), new Date().toISOString(), candidateId, 'exporting', batchId)
      this.refreshTaskByItem(candidateId)
      throw error
    } finally { if (subtitlePath) await unlink(subtitlePath).catch(() => undefined) }
  }
  async retryFailedCandidate(candidateId: unknown, outputDirectory: unknown): Promise<{ candidate: ClipCandidate; outputPath: string }> {
    const id = z.string().trim().min(1).parse(candidateId)
    const directory = z.string().trim().min(1).parse(outputDirectory)
    const row = this.database.prepare('SELECT status, task_id AS taskId FROM task_items WHERE id = ?').get(id) as { status: string; taskId: string } | undefined
    if (!row || !['failed', 'pending', 'running', 'paused'].includes(row.status)) throw new Error('该候选没有可重试或恢复的导出。')
    const snapshot = readClipExportConfig(this.database, row.taskId)
    const config: ClipExportConfig = { candidateIds: [id], ...snapshot, outputDirectory: directory }
    persistClipExportConfig(this.database, config)
    const source = this.database.prepare('SELECT t.drama_id AS dramaId FROM task_items i JOIN production_tasks t ON t.id = i.task_id WHERE i.id = ?').get(id) as { dramaId: string } | undefined
    if (!source) throw new Error('该候选所属剧目不存在。')
    const batchId = this.beginExportBatch(source.dramaId, [id], ['failed'])
    return this.runCandidateItem(id, config.outputDirectory, batchId, undefined, config)
      .then(() => { const material = this.database.prepare('SELECT path FROM generated_materials WHERE task_item_id = ? ORDER BY created_at DESC LIMIT 1').get(id) as { path: string } | undefined; if (!material) throw new Error('候选导出未生成成果。'); this.finishExportBatch(batchId, 'completed'); return { candidate: this.getCandidate(id), outputPath: material.path } }).catch((error) => { this.releaseExportCandidates(batchId, [id]); this.finishExportBatch(batchId, 'failed', errorMessage(error)); throw error })
  }
  async retryFailedTask(taskIdInput: unknown): Promise<{ status: 'completed' | 'failed' }> {
    const taskId = z.string().trim().min(1).parse(taskIdInput); const config = readClipExportConfig(this.database, taskId)
    const failedIds = (this.database.prepare("SELECT id FROM task_items WHERE task_id = ? AND status = 'failed' ORDER BY created_at, id").all(taskId) as Array<{ id: string }>).map(({ id }) => id)
    if (failedIds.length === 0) throw new Error('该任务没有可重试的失败项。')
    const drama = this.database.prepare('SELECT drama_id AS dramaId FROM production_tasks WHERE id = ? AND type = ?').get(taskId, 'original_clip') as { dramaId: string } | undefined
    if (!drama) throw new Error('原剧切片任务不存在或已被删除。')
    const exportConfig: ClipExportConfig = { candidateIds: failedIds, ...config }
    const batchId = this.beginExportBatch(drama.dramaId, failedIds, ['failed'])
    try {
      const results = await this.runExportBatch(exportConfig, batchId)
      const outcome = this.batchOutcome(results)
      this.finishExportBatch(batchId, outcome.status, outcome.reason)
    } catch (error) {
      this.releaseExportCandidates(batchId, failedIds)
      this.finishExportBatch(batchId, 'failed', errorMessage(error))
    }
    this.refreshTask(taskId)
    const task = this.database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(taskId) as { status: string }
    return { status: task.status === 'completed' ? 'completed' : 'failed' }
  }
  private async finishBackgroundExport(batchId: string, config: ClipExportConfig, controller: AbortController, progress: ClipExportProgress): Promise<void> {
    try {
      await this.runExportBatch(config, batchId, controller.signal, progress)
      if (controller.signal.aborted) {
        this.releaseExportCandidates(batchId, config.candidateIds)
        progress.status = 'cancelled'
        this.finishExportBatch(batchId, 'cancelled', '导出已取消。')
      } else {
        const outcome = this.batchOutcome(progress.results)
        progress.status = outcome.status
        this.finishExportBatch(batchId, outcome.status, outcome.reason)
      }
    } catch (error) {
      this.releaseExportCandidates(batchId, config.candidateIds)
      progress.status = 'failed'
      this.finishExportBatch(batchId, 'failed', errorMessage(error))
    }
  }

  private beginExportBatch(dramaId: string, candidateIds: string[], allowedStatuses: ClipCandidate['status'][]): string {
    if (new Set(candidateIds).size !== candidateIds.length) throw new Error('同一候选不能重复加入一次导出。')
    const id = randomUUID(); const now = new Date().toISOString()
    const candidates = candidateIds.map(() => '?').join(', '); const statuses = allowedStatuses.map(() => '?').join(', ')
    this.database.transaction(() => {
      this.database.prepare('INSERT INTO clip_export_batches (id, drama_id, candidate_ids_json, status, reason, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?)').run(id, dramaId, JSON.stringify(candidateIds), 'running', now, now)
      const claimed = this.database.prepare(`UPDATE task_items SET status = ?, export_batch_id = ?, reason = NULL, updated_at = ? WHERE id IN (${candidates}) AND status IN (${statuses}) AND task_id IN (SELECT id FROM production_tasks WHERE drama_id = ? AND type = 'original_clip')`).run('exporting', id, now, ...candidateIds, ...allowedStatuses, dramaId)
      if (claimed.changes !== candidateIds.length) throw new Error('候选已在导出、未确认或不属于当前剧目。')
    })()
    candidateIds.forEach((candidateId) => this.refreshTaskByItem(candidateId))
    return id
  }

  private getCandidateDramaId(candidateId: string): string {
    const row = this.database.prepare('SELECT task.drama_id AS dramaId FROM task_items item JOIN production_tasks task ON task.id = item.task_id WHERE item.id = ? AND task.type = ?').get(candidateId, 'original_clip') as { dramaId: string } | undefined
    if (!row) throw new Error('候选不属于原剧切片任务。')
    return row.dramaId
  }

  private releaseExportCandidates(batchId: string, candidateIds: string[]): void {
    if (candidateIds.length === 0) return
    const placeholders = candidateIds.map(() => '?').join(', ')
    this.database.prepare(`UPDATE task_items SET status = ?, export_batch_id = NULL, reason = NULL, updated_at = ? WHERE id IN (${placeholders}) AND status = ? AND export_batch_id = ?`).run('confirmed', new Date().toISOString(), ...candidateIds, 'exporting', batchId)
    candidateIds.forEach((candidateId) => this.refreshTaskByItem(candidateId))
  }

  private batchOutcome(results: ClipExportResult[]): { status: 'completed' | 'failed'; reason: string | null } {
    const failed = results.filter((result) => result.status === 'failed')
    return failed.length === 0 ? { status: 'completed', reason: null } : { status: 'failed', reason: `${failed.length} 项导出失败：${failed[0]?.reason ?? '未记录原因'}` }
  }

  private finishExportBatch(id: string, status: ClipExportBatch['status'], reason: string | null = null): void { this.database.prepare('UPDATE clip_export_batches SET status = ?, reason = ?, updated_at = ? WHERE id = ?').run(status, reason, new Date().toISOString(), id) }
  listSubtitleVariants(candidateIdInput: unknown): ClipSubtitleVariant[] { return this.subtitleVariants.list(candidateIdInput) }
  saveSubtitleVariant(inputValue: unknown): ClipSubtitleVariant { return this.subtitleVariants.save(inputValue) }
  private recoverInterruptedExportBatches(): void {
    const interrupted = this.database.prepare("SELECT id FROM clip_export_batches WHERE status = 'running'").all() as Array<{ id: string }>
    if (interrupted.length === 0) return
    const recoveredTaskIds = new Set<string>(); const now = new Date().toISOString()
    this.database.transaction(() => {
      for (const { id } of interrupted) {
        const affected = this.database.prepare('SELECT task_id AS taskId FROM task_items WHERE status = ? AND export_batch_id = ?').all('exporting', id) as Array<{ taskId: string }>
        affected.forEach(({ taskId }) => recoveredTaskIds.add(taskId))
        this.database.prepare('UPDATE task_items SET status = ?, export_batch_id = NULL, reason = NULL, updated_at = ? WHERE status = ? AND export_batch_id = ?').run('confirmed', now, 'exporting', id)
        this.database.prepare("UPDATE clip_export_batches SET status = ?, reason = ?, updated_at = ? WHERE id = ? AND status = 'running'").run('cancelled', '应用重启，未完成导出已取消。', now, id)
      }
    })()
    recoveredTaskIds.forEach((taskId) => this.refreshTask(taskId))
  }
  private refreshTaskByItem(itemId: string): void {
    const row = this.database.prepare('SELECT task_id AS taskId FROM task_items WHERE id = ?').get(itemId) as { taskId: string } | undefined
    if (row) this.refreshTask(row.taskId)
  }

  private refreshTask(taskId: string): void {
    const rows = this.database.prepare('SELECT status FROM task_items WHERE task_id = ?').all(taskId) as Array<{ status: string }>
    const done = rows.filter(({ status }) => status === 'exported' || status === 'succeeded').length
    const processed = rows.filter(({ status }) => ['exported', 'succeeded', 'failed'].includes(status)).length
    const failed = rows.some(({ status }) => status === 'failed')
    // Candidates not yet confirmed are a review backlog, not a background job.  Treating
    // them as "running" blocks application shutdown with a misleading task warning.
    const status = failed ? 'failed' : done === rows.length && done > 0 ? 'completed' : rows.some(({ status }) => status === 'exporting') ? 'running' : 'reviewing'
    this.database.prepare('UPDATE production_tasks SET status = ?, progress_current = ?, progress_total = ?, updated_at = ? WHERE id = ?').run(status, processed, rows.length, new Date().toISOString(), taskId)
  }
}
