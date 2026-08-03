import { randomUUID } from 'node:crypto'
import { access, constants } from 'node:fs/promises'
import { stat } from 'node:fs/promises'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { isProductionReady } from '../../shared/production-readiness.js'
import { probeMedia } from '../media/media-probe.js'
import { TaskQueue, type TaskExecutor } from '../tasks/task-queue.js'
import { exportConcatWindow } from './concat-export-service.js'
import { MAX_TARGET_SIZE_MB } from './output-size-limit.js'
import { createUniqueOutputPath } from './output-path-service.js'
import { preflightWindows, type PreflightItem } from './preflight-service.js'
import { planContinuousWindows, type EpisodeInput, type PlannedWindow } from './window-planner.js'

const PREFLIGHT_TTL_MS = 15 * 60 * 1000
const fpsSchema = z.union([z.literal('source'), z.number().positive()])
const baseConfigSchema = z.object({ startEpisode: z.number().int().positive(), endEpisode: z.number().int().positive(), groupSize: z.number().int().min(2).max(20), tailStrategy: z.enum(['reduce', 'skip', 'return']), maxMinutes: z.number().positive(), outputDirectory: z.string().trim().min(1), qualityMode: z.enum(['original', 'bitrate', 'size']).default('original'), bitrateKbps: z.number().positive().optional(), targetSizeMb: z.number().int().positive().max(MAX_TARGET_SIZE_MB).optional(), encodingPreset: z.enum(['fast', 'balanced', 'quality']).default('balanced'), fps: fpsSchema.default('source'), packagingEnabled: z.boolean().default(false), performanceMode: z.enum(['background', 'speed']).default('background'), packaging: z.object({ aspect: z.enum(['portrait', 'landscape']).default('portrait'), preset: z.enum(['default', 'conflict', 'clean']).default('default'), title: z.string().max(120), titlePosition: z.enum(['top', 'bottom']), prompt: z.string().max(120), promptPosition: z.enum(['left', 'right']), badge: z.enum(['热门短剧', '热播中', '爆款推荐', 'none']), titleSize: z.enum(['small', 'medium', 'large']).default('medium'), titleTone: z.enum(['warm', 'accent']).default('warm'), promptStyle: z.enum(['solid', 'outline']).default('solid'), overlay: z.enum(['subtle', 'strong', 'none']).default('subtle') }).optional() })
const configSchema = baseConfigSchema.extend({ preflightConfirmed: z.literal(true), preflightId: z.string().uuid() })
export type MultiEpisodeConfig = z.infer<typeof configSchema>
type BaseConfig = z.infer<typeof baseConfigSchema>
export type MultiEpisodeWindow = PreflightItem & { actualRange?: number[]; sourcePaths?: string[]; estimatedSizeMb: number | null; estimatedBitrateKbps: number | null }
export type MultiEpisodePreflight = { preflightId: string; windows: MultiEpisodeWindow[] }
export type MultiEpisodePlan = { taskId: string; windows: MultiEpisodeWindow[] }
type PreparedPlan = { dramaId: string; drama: { name: string }; windows: MultiEpisodeWindow[] }
type StoredPreflight = { dramaId: string; config: BaseConfig; windows: MultiEpisodeWindow[]; createdAtMs: number; reserved: boolean }

export class MultiEpisodeService {
  private readonly preflights = new Map<string, StoredPreflight>()

  constructor(private readonly database: Database.Database, private readonly queue: TaskQueue, private readonly now = (): number => Date.now()) {}

  async preflight(dramaIdInput: unknown, input: unknown): Promise<MultiEpisodePreflight> {
    this.prunePreflights()
    const config = baseConfigSchema.parse(input)
    const prepared = await this.prepare(dramaIdInput, config)
    const preflightId = randomUUID()
    this.preflights.set(preflightId, { dramaId: prepared.dramaId, config, windows: structuredClone(prepared.windows), createdAtMs: this.now(), reserved: false })
    return { preflightId, windows: structuredClone(prepared.windows) }
  }

  async createTask(dramaIdInput: unknown, input: unknown): Promise<MultiEpisodePlan> {
    this.prunePreflights()
    const dramaId = z.string().trim().min(1).parse(dramaIdInput)
    const config = configSchema.parse(input)
    const stored = this.preflights.get(config.preflightId)
    const baseConfig = baseConfigSchema.parse(config)
    if (!stored || stored.dramaId !== dramaId || !sameValue(stored.config, baseConfig)) throw new Error('预检已失效，请重新预检后再确认。')

    if (stored.reserved) throw new Error('预检正在确认，请勿重复提交。')
    stored.reserved = true
    try {
      const prepared = await this.prepare(dramaId, baseConfig)
      if (!sameValue(stored.windows, prepared.windows)) {
        this.preflights.delete(config.preflightId)
        throw new Error('资产或输出环境已变化，请重新预检并确认最新结果。')
      }
      const runnable = stored.windows.filter((window) => window.ok)
      if (runnable.length === 0) throw new Error('预检没有可运行的连续窗口，请修复缺集或调整范围。')
      const taskId = randomUUID()
      const now = new Date(this.now()).toISOString()
      const snapshot = JSON.stringify({ ...config, dramaName: prepared.drama.name, outputRunAt: now, preflight: stored.windows })
      this.database.transaction(() => {
        this.database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(taskId, dramaId, 'multi_episode', snapshot, 'pending', 0, runnable.length, now, now)
        const insertItem = this.database.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, reason, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)')
        for (const window of stored.windows) insertItem.run(randomUUID(), taskId, JSON.stringify(window), window.ok ? 'pending' : 'skipped', window.reason, now, now)
      })()
      this.preflights.delete(config.preflightId)
      return { taskId, windows: structuredClone(stored.windows) }
    } catch (error) {
      if (this.preflights.get(config.preflightId) === stored) stored.reserved = false
      throw error
    }
  }

  run(taskIdInput: unknown): Promise<unknown> {
    const taskId = z.string().trim().min(1).parse(taskIdInput)
    return this.queue.run(taskId, this.createExecutor(taskId), { mode: this.modeFor(taskId) })
  }

  retryFailed(taskIdInput: unknown): Promise<unknown> {
    const taskId = z.string().trim().min(1).parse(taskIdInput)
    return this.queue.retryFailed(taskId, this.createExecutor(taskId), { mode: 'background' })
  }

  recover(taskIdInput: unknown): Promise<unknown> {
    const taskId = z.string().trim().min(1).parse(taskIdInput)
    return this.queue.recover(taskId, this.createExecutor(taskId), { mode: this.modeFor(taskId) })
  }

  private async prepare(dramaIdInput: unknown, config: BaseConfig): Promise<PreparedPlan> {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput)
    const drama = this.database.prepare('SELECT name FROM dramas WHERE id = ?').get(dramaId) as { name: string } | undefined
    if (!drama) throw new Error('剧目不存在。')
    if (config.qualityMode === 'bitrate' && !config.bitrateKbps) throw new Error('固定码率模式需要填写视频码率。')
    if (config.qualityMode === 'size' && !config.targetSizeMb) throw new Error('目标大小模式需要填写目标 MB。')
    const episodes = this.database.prepare('SELECT episode_no AS episodeNo, duration_seconds AS durationSeconds, source_path AS sourcePath, status FROM episodes WHERE drama_id = ? ORDER BY episode_no').all(dramaId) as EpisodeInput[]
    await assertRangeBounds(episodes, config.startEpisode, config.endEpisode)
    const selected = episodes.filter((episode) => episode.episodeNo >= config.startEpisode && episode.episodeNo <= config.endEpisode)
    const planned = planContinuousWindows(selected, config.groupSize, config.tailStrategy)
    const checked = await preflightWindows(planned, selected, config.outputDirectory, { estimateRequiredBytes: (window) => estimateRequiredBytes(window, config) })
    const windows = checked.map((window) => normalizeLimit(window, config.maxMinutes * 60, selected, config.tailStrategy)).map((window) => addEstimate(window, config)).map((window) => ({ ...window, sourcePaths: (window.actualRange ?? window.episodeNumbers).map((number) => selected.find((episode) => episode.episodeNo === number)?.sourcePath ?? '') }))
    return { dramaId, drama, windows }
  }

  private modeFor(taskId: string): 'background' | 'speed' {
    const row = this.database.prepare('SELECT config_snapshot AS configSnapshot FROM production_tasks WHERE id = ?').get(taskId) as { configSnapshot: string } | undefined
    return row && JSON.parse(row.configSnapshot).performanceMode === 'speed' ? 'speed' : 'background'
  }

  private createExecutor(taskId: string): TaskExecutor {
    return async (item, context) => {
      const task = this.database.prepare('SELECT drama_id AS dramaId, config_snapshot AS configSnapshot, created_at AS createdAt FROM production_tasks WHERE id = ?').get(taskId) as { dramaId: string; configSnapshot: string; createdAt: string } | undefined
      if (!task) throw new Error('任务不存在。')
      const config = JSON.parse(task.configSnapshot) as MultiEpisodeConfig & { dramaName: string; outputRunAt?: string }
      const range = item.plannedRange as MultiEpisodeWindow
      const numbers = range.actualRange ?? range.episodeNumbers
      const placeholders = numbers.map(() => '?').join(',')
      const episodes = this.database.prepare(`SELECT episode_no AS episodeNo, duration_seconds AS durationSeconds, source_path AS sourcePath, status FROM episodes WHERE drama_id = ? AND episode_no IN (${placeholders}) ORDER BY episode_no`).all(task.dramaId, ...numbers) as EpisodeInput[]
      if (episodes.length !== numbers.length || episodes.some((episode, index) => episode.episodeNo !== numbers[index]) || (range.sourcePaths && episodes.some((episode, index) => episode.sourcePath !== range.sourcePaths?.[index] || !isProductionReady(episode.status)))) throw new Error('确认后的资产已变化，请重新预检。')
      const outputPath = await createUniqueOutputPath(config.outputDirectory, numbers[0] ?? range.startEpisode, numbers.at(-1) ?? range.endEpisode, new Date(config.outputRunAt ?? task.createdAt), config.dramaName)
      const outputWindow: PlannedWindow = { startEpisode: numbers[0] ?? 0, endEpisode: numbers.at(-1) ?? 0, episodeNumbers: numbers, durationSeconds: range.durationSeconds, status: range.status === 'reduced' ? 'reduced' : 'ready', reason: range.reason }
      await exportConcatWindow(outputWindow, episodes, outputPath, { qualityMode: config.qualityMode, bitrateKbps: config.bitrateKbps, targetSizeMb: config.targetSizeMb, encodingPreset: config.encodingPreset, fps: config.fps, packagingEnabled: config.packagingEnabled, packaging: config.packaging ?? { aspect: 'portrait', preset: 'default', title: config.dramaName, titlePosition: 'top', prompt: '', promptPosition: 'left', badge: 'none', titleSize: 'medium', titleTone: 'warm', promptStyle: 'solid', overlay: 'subtle' }, signal: context.signal })
      const metadata = await probeMedia(outputPath)
      const size = (await stat(outputPath)).size
      const now = new Date(this.now()).toISOString()
      this.database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, duration_seconds, fps, size_bytes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), task.dramaId, taskId, item.id, outputPath, metadata.durationSeconds, metadata.fps, size, now, now)
      return { status: outputWindow.status === 'reduced' ? 'reduced' as const : 'succeeded' as const, actualRange: numbers }
    }
  }

  private prunePreflights(): void {
    const cutoff = this.now() - PREFLIGHT_TTL_MS
    for (const [id, snapshot] of this.preflights) if (snapshot.createdAtMs < cutoff) this.preflights.delete(id)
  }
}

const normalizeLimit = (window: PreflightItem, maxSeconds: number, episodes: readonly EpisodeInput[], tailStrategy: 'reduce' | 'skip' | 'return'): PreflightItem & { actualRange?: number[] } => {
  if (!window.ok || window.durationSeconds === null || window.durationSeconds <= maxSeconds) return window
  if (tailStrategy === 'return') return { ...window, ok: false, status: 'blocked', reason: `总时长超过 ${Math.round(maxSeconds / 60)} 分钟上限，请返回修改时长上限。` }
  if (tailStrategy === 'reduce') {
    const byNumber = new Map(episodes.map((episode) => [episode.episodeNo, episode]))
    const actual = [...window.episodeNumbers]
    const duration = (): number => actual.reduce((sum, number) => sum + (byNumber.get(number)?.durationSeconds ?? 0), 0)
    while (actual.length > 2 && duration() > maxSeconds) actual.pop()
    if (actual.length >= 2 && duration() <= maxSeconds) return { ...window, ok: true, status: 'reduced', actualRange: actual, endEpisode: actual.at(-1) ?? window.endEpisode, durationSeconds: duration(), reason: `超时已从第 ${window.startEpisode}–${window.endEpisode} 集缩减为第 ${actual[0]}–${actual.at(-1)} 集。` }
  }
  return { ...window, ok: false, status: 'skipped', reason: `总时长超过 ${Math.round(maxSeconds / 60)} 分钟上限。` }
}

const addEstimate = (window: PreflightItem & { actualRange?: number[] }, config: BaseConfig): MultiEpisodeWindow => {
  const estimatedBitrateKbps = config.qualityMode === 'size' && config.targetSizeMb && window.durationSeconds ? Math.floor((config.targetSizeMb * 8192) / window.durationSeconds - 160) : config.qualityMode === 'bitrate' ? config.bitrateKbps ?? null : null
  const estimatedSizeMb = config.qualityMode === 'size' ? config.targetSizeMb ?? null : config.qualityMode === 'bitrate' && window.durationSeconds !== null && estimatedBitrateKbps !== null ? Number(((window.durationSeconds * (estimatedBitrateKbps + 160)) / 8192).toFixed(1)) : null
  if (config.qualityMode === 'size' && estimatedBitrateKbps !== null && estimatedBitrateKbps < 100) return { ...window, ok: false, status: 'blocked', reason: '目标文件大小无法容纳当前音视频开销。', estimatedBitrateKbps, estimatedSizeMb }
  return { ...window, estimatedBitrateKbps, estimatedSizeMb }
}

const estimateRequiredBytes = (window: PlannedWindow, config: BaseConfig): number | null => {
  if (config.qualityMode === 'size' && config.targetSizeMb) return config.targetSizeMb * 1024 * 1024
  if (config.qualityMode === 'bitrate' && config.bitrateKbps && window.durationSeconds) return window.durationSeconds * (config.bitrateKbps + 160) * 1000 / 8
  return null
}

const sameValue = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right)

const assertRangeBounds = async (episodes: readonly EpisodeInput[], startEpisode: number, endEpisode: number): Promise<void> => {
  const byNumber = new Map(episodes.map((episode) => [episode.episodeNo, episode]))
  for (const [label, number] of [['起始集', startEpisode], ['结束集', endEpisode]] as const) {
    const episode = byNumber.get(number)
    if (!episode) throw new Error(`${label}第 ${number} 集不存在。`)
    if (!isProductionReady(episode.status)) throw new Error(`${label}第 ${number} 集不可用，当前状态为 ${episode.status}。`)
    try {
      await access(episode.sourcePath, constants.R_OK)
    } catch {
      throw new Error(`${label}第 ${number} 集不可读，请重新定位文件。`)
    }
  }
}
