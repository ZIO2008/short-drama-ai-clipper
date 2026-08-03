import { randomUUID } from 'node:crypto'
import { accessSync, constants, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { DramaDetail, DramaSummary, EpisodeAsset, EpisodeImportConflict, EpisodeImportResult } from '../../shared/contracts.js'
import { sortEpisodeCandidates } from './episode-import-service.js'
import { probeMedia } from '../media/media-probe.js'

const idSchema = z.string().trim().min(1).max(120)
const nameSchema = z.string().trim().min(1).max(200)

type DramaRow = { id: string; name: string; updated_at: string; episode_count: number; issue_count: number; tag_names: string | null }
type EpisodeRow = { id: string; episode_no: number | null; sort_order: number; source_path: string; duration_seconds: number | null; fps: number | null; video_width: number | null; video_height: number | null; status: string }
type ExistingEpisodeRow = { episode_no: number | null; source_path: string }

export class DramaService {
  constructor(private readonly database: Database.Database, private readonly cacheRoot: string | null = null) {}

  list(): DramaSummary[] {
    const rows = this.database.prepare(`
      SELECT d.id, d.name, d.updated_at,
        COUNT(DISTINCT e.id) AS episode_count,
        SUM(CASE WHEN e.status <> 'ready' THEN 1 ELSE 0 END) AS issue_count,
        GROUP_CONCAT(DISTINCT t.name) AS tag_names
      FROM dramas d
      LEFT JOIN episodes e ON e.drama_id = d.id
      LEFT JOIN drama_tags dt ON dt.drama_id = d.id
      LEFT JOIN tags t ON t.id = dt.tag_id
      GROUP BY d.id ORDER BY d.updated_at DESC, d.id DESC
    `).all() as DramaRow[]
    return rows.map(mapSummary)
  }

  get(dramaId: unknown): DramaDetail {
    const id = idSchema.parse(dramaId)
    const row = this.database.prepare(`
      SELECT d.id, d.name, d.updated_at, COUNT(DISTINCT e.id) AS episode_count,
        SUM(CASE WHEN e.status <> 'ready' THEN 1 ELSE 0 END) AS issue_count,
        GROUP_CONCAT(DISTINCT t.name) AS tag_names
      FROM dramas d LEFT JOIN episodes e ON e.drama_id = d.id
      LEFT JOIN drama_tags dt ON dt.drama_id = d.id LEFT JOIN tags t ON t.id = dt.tag_id
      WHERE d.id = ? GROUP BY d.id
    `).get(id) as DramaRow | undefined
    if (!row) throw new Error('Drama not found')
    const episodes = this.database.prepare(`SELECT id, episode_no, sort_order, source_path, duration_seconds, fps, video_width, video_height, status FROM episodes WHERE drama_id = ? ORDER BY CASE WHEN episode_no IS NULL THEN 1 ELSE 0 END, episode_no, source_path, id`).all(id) as EpisodeRow[]
    return { ...mapSummary(row), episodes: episodes.map(mapEpisode) }
  }

  create(name: unknown): DramaDetail {
    const value = nameSchema.parse(name)
    this.assertUniqueName(value)
    const id = randomUUID()
    const now = new Date().toISOString()
    this.database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, value, now, now)
    if (this.cacheRoot) mkdirSync(join(this.cacheRoot, id), { recursive: true })
    return this.get(id)
  }

  update(dramaId: unknown, name: unknown): DramaDetail {
    const id = idSchema.parse(dramaId)
    const value = nameSchema.parse(name)
    this.assertUniqueName(value, id)
    const result = this.database.prepare('UPDATE dramas SET name = ?, updated_at = ? WHERE id = ?').run(value, new Date().toISOString(), id)
    if (result.changes === 0) throw new Error('Drama not found')
    return this.get(id)
  }

  delete(dramaId: unknown, deleteTempFiles: unknown): void {
    const id = idSchema.parse(dramaId)
    const removeTemporaryFiles = z.boolean().parse(deleteTempFiles)
    if (this.cacheRoot) {
      const root = resolve(this.cacheRoot); const target = resolve(root, id)
      if (target.startsWith(`${root}\\`) || target.startsWith(`${root}/`)) {
        // Covers are always application-owned cache and must never survive a deleted drama.
        rmSync(join(target, 'cover'), { recursive: true, force: true })
        if (removeTemporaryFiles) rmSync(target, { recursive: true, force: true })
      }
    }
    const result = this.database.prepare('DELETE FROM dramas WHERE id = ?').run(id)
    if (result.changes === 0) throw new Error('Drama not found')
  }

  estimateCacheBytes(dramaId: unknown): number {
    const id = idSchema.parse(dramaId)
    if (!this.cacheRoot) return 0
    const root = resolve(this.cacheRoot); const target = resolve(root, id)
    if (!(target.startsWith(`${root}\\`) || target.startsWith(`${root}/`)) || !existsSync(target)) return 0
    return directoryBytes(target)
  }

  getLastImportDirectory(dramaId: unknown): string | null {
    const id = idSchema.parse(dramaId)
    this.get(id)
    const row = this.database.prepare('SELECT last_import_directory FROM drama_import_preferences WHERE drama_id = ?').get(id) as { last_import_directory: string } | undefined
    return row?.last_import_directory ?? null
  }

  async importEpisodes(dramaId: unknown, paths: unknown): Promise<EpisodeImportResult> {
    const id = idSchema.parse(dramaId)
    const input = z.array(z.string().trim().min(1).max(2000)).min(1).parse(paths)
    const visited = new Set<string>(); const counter = { count: 0 }
    const sourcePaths = [...new Set(input.flatMap((path) => expandVideoPaths(path, visited, 0, counter)))]
    if (sourcePaths.length === 0) throw new Error('No supported video files found')
    if (sourcePaths.length > 2000) throw new Error('Too many video files selected')
    if (sourcePaths.some((path) => !SUPPORTED_VIDEO_EXTENSIONS.has(extname(path).toLowerCase()))) throw new Error('Unsupported video format')
    this.get(id)
    const candidates = sortEpisodeCandidates(sourcePaths)
    const existing = this.database.prepare('SELECT episode_no, source_path FROM episodes WHERE drama_id = ?').all(id) as ExistingEpisodeRow[]
    const existingByPath = new Map(existing.map((episode) => [normalizedPath(episode.source_path), episode]))
    const existingByEpisode = new Map(existing.filter((episode) => episode.episode_no !== null).map((episode) => [episode.episode_no as number, episode]))
    const accepted: typeof candidates = []
    const acceptedByEpisode = new Map<number, typeof candidates[number]>()
    const skipped: string[] = []
    const conflicts: EpisodeImportConflict[] = []
    for (const candidate of candidates) {
      if (existingByPath.has(normalizedPath(candidate.path))) { skipped.push(candidate.path); continue }
      if (candidate.episodeNo !== null) {
        const existingEpisode = existingByEpisode.get(candidate.episodeNo)
        if (existingEpisode) { conflicts.push({ episodeNo: candidate.episodeNo, sourcePath: candidate.path, existingSourcePath: existingEpisode.source_path }); continue }
        const acceptedEpisode = acceptedByEpisode.get(candidate.episodeNo)
        if (acceptedEpisode) { conflicts.push({ episodeNo: candidate.episodeNo, sourcePath: candidate.path, existingSourcePath: acceptedEpisode.path }); continue }
        acceptedByEpisode.set(candidate.episodeNo, candidate)
      }
      accepted.push(candidate)
    }
    const now = new Date().toISOString()
    const inspected = await Promise.all(accepted.map(async (candidate) => {
      if (!isReadable(candidate.path)) return { ...candidate, duration: null, fps: null, width: null, height: null, status: 'missing' }
      try { const media = await probeMedia(candidate.path); return { ...candidate, duration: media.durationSeconds, fps: media.fps, width: media.width, height: media.height, status: 'ready' } }
      catch (error) { return { ...candidate, duration: null, fps: null, width: null, height: null, status: error instanceof Error && 'code' in error ? String(error.code).toLowerCase() : 'probe_failed' } }
    }))
    const insert = this.database.prepare(`INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, video_width, video_height, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    this.database.transaction(() => {
      for (const candidate of inspected) {
        const status = candidate.episodeNo === null ? 'needs_episode_number' : candidate.status
        insert.run(randomUUID(), id, candidate.episodeNo, candidate.sortOrder, candidate.path, candidate.duration, candidate.fps, candidate.width, candidate.height, status, now, now)
      }
      this.rebalanceSortOrder(id)
      if (inspected.length > 0) this.database.prepare('INSERT INTO drama_import_preferences (drama_id, last_import_directory, updated_at) VALUES (?, ?, ?) ON CONFLICT(drama_id) DO UPDATE SET last_import_directory = excluded.last_import_directory, updated_at = excluded.updated_at').run(id, importDirectory(input[0]!), now)
    })()
    this.database.prepare('UPDATE dramas SET updated_at = ? WHERE id = ?').run(now, id)
    return { drama: this.get(id), summary: { imported: inspected.length, skipped: skipped.length, conflicts } }
  }

  async updateEpisode(dramaId: unknown, episodeId: unknown, update: unknown): Promise<DramaDetail> {
    const drama = idSchema.parse(dramaId); const episode = idSchema.parse(episodeId)
    const value = z.object({ episodeNo: z.number().int().positive().nullable(), sortOrder: z.number().int().nonnegative(), sourcePath: z.string().trim().min(1).max(2000) }).parse(update)
    if (!SUPPORTED_VIDEO_EXTENSIONS.has(extname(value.sourcePath).toLowerCase())) throw new Error('Unsupported video format')
    const previous = this.database.prepare('SELECT video_width, video_height FROM episodes WHERE id = ? AND drama_id = ?').get(episode, drama) as { video_width: number | null; video_height: number | null } | undefined
    if (!previous) throw new Error('Episode not found')
    let status = value.episodeNo === null ? 'needs_episode_number' : 'missing'; let duration: number | null = null; let fps: number | null = null; let width: number | null = previous.video_width; let height: number | null = previous.video_height
    if (value.episodeNo !== null && isReadable(value.sourcePath)) {
      try { const media = await probeMedia(value.sourcePath); status = 'ready'; duration = media.durationSeconds; fps = media.fps; width = media.width; height = media.height } catch (error) { status = error instanceof Error && 'code' in error ? String(error.code).toLowerCase() : 'probe_failed' }
    }
    const result = this.database.prepare('UPDATE episodes SET episode_no = ?, sort_order = ?, source_path = ?, duration_seconds = ?, fps = ?, video_width = ?, video_height = ?, status = ?, updated_at = ? WHERE id = ? AND drama_id = ?').run(value.episodeNo, value.sortOrder, value.sourcePath, duration, fps, width, height, status, new Date().toISOString(), episode, drama)
    this.rebalanceSortOrder(drama)
    return this.get(drama)
  }

  removeEpisode(dramaId: unknown, episodeId: unknown): DramaDetail {
    const drama = idSchema.parse(dramaId); const episode = idSchema.parse(episodeId)
    const now = new Date().toISOString()
    this.database.transaction(() => {
      const target = this.database.prepare('SELECT episode_no FROM episodes WHERE id = ? AND drama_id = ?').get(episode, drama) as { episode_no: number | null } | undefined
      if (!target) throw new Error('Episode not found')
      const scriptAssetIds = this.database.prepare(`
        SELECT id FROM script_assets WHERE episode_id = ?
        UNION
        SELECT script_asset_id AS id FROM script_asset_segments WHERE episode_id = ?
      `).all(episode, episode) as Array<{ id: string }>
      this.database.prepare('DELETE FROM episodes WHERE id = ? AND drama_id = ?').run(episode, drama)
      const taskIds = this.database.prepare(`
        SELECT DISTINCT task_id FROM task_items
        WHERE json_extract(planned_range, '$.episodeId') = ?
          OR (json_valid(planned_range) AND (
            EXISTS (SELECT 1 FROM json_each(planned_range, '$.episodeNumbers') WHERE value = ?)
            OR (? IS NOT NULL AND json_extract(planned_range, '$.episodeStart') <= ? AND json_extract(planned_range, '$.episodeEnd') >= ?)
          ))
      `).all(episode, target.episode_no, target.episode_no, target.episode_no, target.episode_no) as Array<{ task_id: string }>
      this.database.prepare("DELETE FROM task_items WHERE json_extract(planned_range, '$.episodeId') = ?").run(episode)
      const markRangeItem = this.database.prepare(`
        UPDATE task_items SET status = 'skipped', reason = ?, updated_at = ?
        WHERE task_id = ? AND json_extract(planned_range, '$.episodeId') IS NULL AND json_valid(planned_range) AND (
          EXISTS (SELECT 1 FROM json_each(planned_range, '$.episodeNumbers') WHERE value = ?)
          OR (? IS NOT NULL AND json_extract(planned_range, '$.episodeStart') <= ? AND json_extract(planned_range, '$.episodeEnd') >= ?)
        )
      `)
      const preserveTaskWithMaterials = this.database.prepare("UPDATE production_tasks SET status = 'partial', updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM generated_materials WHERE task_id = ?)")
      const removeEmptyTask = this.database.prepare('DELETE FROM production_tasks WHERE id = ? AND NOT EXISTS (SELECT 1 FROM task_items WHERE task_id = ?) AND NOT EXISTS (SELECT 1 FROM generated_materials WHERE task_id = ?)')
      for (const { task_id } of taskIds) {
        markRangeItem.run('关联剧集已删除，请重建任务。', now, task_id, target.episode_no, target.episode_no, target.episode_no, target.episode_no)
        preserveTaskWithMaterials.run(now, task_id, task_id)
        removeEmptyTask.run(task_id, task_id, task_id)
      }
      this.refreshScriptLinkStatus(scriptAssetIds.map(({ id }) => id), now)
      this.rebalanceSortOrder(drama)
      this.database.prepare('UPDATE dramas SET updated_at = ? WHERE id = ?').run(now, drama)
    })()
    return this.get(drama)
  }

  private rebalanceSortOrder(dramaId: string): void {
    const rows = this.database.prepare('SELECT id FROM episodes WHERE drama_id = ? ORDER BY CASE WHEN episode_no IS NULL THEN 1 ELSE 0 END, episode_no, source_path, id').all(dramaId) as Array<{ id: string }>
    const update = this.database.prepare('UPDATE episodes SET sort_order = ? WHERE id = ? AND drama_id = ?')
    for (const [index, row] of rows.entries()) update.run(index, row.id, dramaId)
  }

  private assertUniqueName(name: string, exceptId?: string): void {
    const duplicate = this.database.prepare('SELECT id FROM dramas WHERE lower(trim(name)) = lower(trim(?)) AND (? IS NULL OR id <> ?) LIMIT 1').get(name, exceptId ?? null, exceptId ?? null) as { id: string } | undefined
    if (duplicate) throw new Error('已存在同名剧目。请使用能区分项目的剧名。')
  }

  private refreshScriptLinkStatus(scriptAssetIds: string[], now: string): void {
    const update = this.database.prepare(`
      UPDATE script_assets
      SET link_status = CASE
        WHEN EXISTS (SELECT 1 FROM script_asset_segments segment WHERE segment.script_asset_id = script_assets.id)
          THEN CASE WHEN EXISTS (SELECT 1 FROM script_asset_segments segment WHERE segment.script_asset_id = script_assets.id AND segment.episode_id IS NULL) THEN 'needs_confirmation' ELSE 'linked' END
        WHEN episode_id IS NULL THEN 'unlinked'
        ELSE 'linked'
      END,
      updated_at = ?
      WHERE id = ?
    `)
    for (const id of scriptAssetIds) update.run(now, id)
  }
}

const isReadable = (path: string): boolean => {
  try { accessSync(path, constants.R_OK); return true } catch { return false }
}
const SUPPORTED_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm'])
const normalizedPath = (path: string): string => resolve(path).toLocaleLowerCase('en-US')
const importDirectory = (path: string): string => existsSync(path) && lstatSync(path).isDirectory() ? resolve(path) : dirname(resolve(path))

const directoryBytes = (path: string): number => {
  const info = statSync(path)
  if (info.isFile()) return info.size
  if (!info.isDirectory()) return 0
  return readdirSync(path, { withFileTypes: true }).reduce((total, entry) => total + directoryBytes(join(path, entry.name)), 0)
}

const expandVideoPaths = (path: string, visited: Set<string> = new Set<string>(), depth = 0, counter = { count: 0 }): string[] => {
  if (depth > 20) return []
  if (!existsSync(path)) return [path]
  const info = lstatSync(path)
  if (info.isSymbolicLink()) return []
  if (info.isFile()) { if (SUPPORTED_VIDEO_EXTENSIONS.has(extname(path).toLowerCase()) && ++counter.count > 2000) throw new Error('Too many video files selected'); return [path] }
  if (!info.isDirectory()) return []
  try {
    const realPath = realpathSync(path)
    if (visited.has(realPath)) return []
    visited.add(realPath)
    return readdirSync(path, { withFileTypes: true }).flatMap((entry) => expandVideoPaths(join(path, entry.name), visited, depth + 1, counter)).filter((entry) => SUPPORTED_VIDEO_EXTENSIONS.has(extname(entry).toLowerCase()))
  } catch (error) { if (error instanceof Error && error.message === 'Too many video files selected') throw error; return [] }
}

const mapSummary = (row: DramaRow): DramaSummary => ({ id: row.id, name: row.name, episodeCount: row.episode_count, issueCount: row.issue_count ?? 0, tagNames: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [], updatedAt: row.updated_at })
const mapEpisode = (row: EpisodeRow): EpisodeAsset => ({ id: row.id, episodeNo: row.episode_no, sortOrder: row.sort_order, sourcePath: row.source_path, durationSeconds: row.duration_seconds, fps: row.fps, videoWidth: row.video_width, videoHeight: row.video_height, status: row.status })
