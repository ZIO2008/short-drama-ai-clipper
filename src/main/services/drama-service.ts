import { randomUUID } from 'node:crypto'
import { accessSync, constants } from 'node:fs'
import { extname } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { DramaDetail, DramaSummary, EpisodeAsset } from '../../shared/contracts.js'
import { findDuplicateEpisodeNumbers, sortEpisodeCandidates } from './episode-import-service.js'
import { probeMedia } from '../media/media-probe.js'

const idSchema = z.string().trim().min(1).max(120)
const nameSchema = z.string().trim().min(1).max(200)

type DramaRow = { id: string; name: string; updated_at: string; episode_count: number; issue_count: number; tag_names: string | null }
type EpisodeRow = { id: string; episode_no: number | null; sort_order: number; source_path: string; duration_seconds: number | null; fps: number | null; status: string }

export class DramaService {
  constructor(private readonly database: Database.Database) {}

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
    const episodes = this.database.prepare(`SELECT id, episode_no, sort_order, source_path, duration_seconds, fps, status FROM episodes WHERE drama_id = ? ORDER BY sort_order`).all(id) as EpisodeRow[]
    return { ...mapSummary(row), episodes: episodes.map(mapEpisode) }
  }

  create(name: unknown): DramaDetail {
    const value = nameSchema.parse(name)
    const id = randomUUID()
    const now = new Date().toISOString()
    this.database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, value, now, now)
    return this.get(id)
  }

  update(dramaId: unknown, name: unknown): DramaDetail {
    const id = idSchema.parse(dramaId)
    const value = nameSchema.parse(name)
    const result = this.database.prepare('UPDATE dramas SET name = ?, updated_at = ? WHERE id = ?').run(value, new Date().toISOString(), id)
    if (result.changes === 0) throw new Error('Drama not found')
    return this.get(id)
  }

  delete(dramaId: unknown, _deleteTempFiles: unknown): void {
    const id = idSchema.parse(dramaId)
    z.boolean().parse(_deleteTempFiles)
    const result = this.database.prepare('DELETE FROM dramas WHERE id = ?').run(id)
    if (result.changes === 0) throw new Error('Drama not found')
  }

  async importEpisodes(dramaId: unknown, paths: unknown): Promise<DramaDetail> {
    const id = idSchema.parse(dramaId)
    const input = z.array(z.string().trim().min(1).max(2000)).min(1).parse(paths)
    if (input.some((path) => !SUPPORTED_VIDEO_EXTENSIONS.has(extname(path).toLowerCase()))) throw new Error('Unsupported video format')
    this.get(id)
    const candidates = sortEpisodeCandidates(input)
    const duplicates = findDuplicateEpisodeNumbers(candidates)
    if (duplicates.length > 0) throw new Error(`Duplicate episode numbers: ${duplicates.join(', ')}`)
    const existing = this.database.prepare('SELECT episode_no FROM episodes WHERE drama_id = ? AND episode_no IS NOT NULL').all(id) as Array<{ episode_no: number }>
    const existingNumbers = new Set(existing.map(({ episode_no }) => episode_no))
    if (candidates.some(({ episodeNo }) => episodeNo !== null && existingNumbers.has(episodeNo))) throw new Error('Duplicate episode number already exists')
    const now = new Date().toISOString()
    const inspected = await Promise.all(candidates.map(async (candidate) => {
      if (!isReadable(candidate.path)) return { ...candidate, duration: null, fps: null, status: 'missing' }
      try { const media = await probeMedia(candidate.path); return { ...candidate, duration: media.durationSeconds, fps: media.fps, status: 'ready' } }
      catch (error) { return { ...candidate, duration: null, fps: null, status: error instanceof Error && 'code' in error ? String(error.code).toLowerCase() : 'probe_failed' } }
    }))
    const insert = this.database.prepare(`INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    this.database.transaction(() => {
      for (const candidate of inspected) {
        const status = candidate.episodeNo === null ? 'needs_episode_number' : candidate.status
        insert.run(randomUUID(), id, candidate.episodeNo, candidate.sortOrder, candidate.path, candidate.duration, candidate.fps, status, now, now)
      }
    })()
    this.database.prepare('UPDATE dramas SET updated_at = ? WHERE id = ?').run(now, id)
    return this.get(id)
  }

  async updateEpisode(dramaId: unknown, episodeId: unknown, update: unknown): Promise<DramaDetail> {
    const drama = idSchema.parse(dramaId); const episode = idSchema.parse(episodeId)
    const value = z.object({ episodeNo: z.number().int().positive().nullable(), sortOrder: z.number().int().nonnegative(), sourcePath: z.string().trim().min(1).max(2000) }).parse(update)
    if (!SUPPORTED_VIDEO_EXTENSIONS.has(extname(value.sourcePath).toLowerCase())) throw new Error('Unsupported video format')
    let status = value.episodeNo === null ? 'needs_episode_number' : 'missing'; let duration: number | null = null; let fps: number | null = null
    if (value.episodeNo !== null && isReadable(value.sourcePath)) {
      try { const media = await probeMedia(value.sourcePath); status = 'ready'; duration = media.durationSeconds; fps = media.fps } catch (error) { status = error instanceof Error && 'code' in error ? String(error.code).toLowerCase() : 'probe_failed' }
    }
    const result = this.database.prepare('UPDATE episodes SET episode_no = ?, sort_order = ?, source_path = ?, duration_seconds = ?, fps = ?, status = ?, updated_at = ? WHERE id = ? AND drama_id = ?').run(value.episodeNo, value.sortOrder, value.sourcePath, duration, fps, status, new Date().toISOString(), episode, drama)
    if (result.changes === 0) throw new Error('Episode not found')
    return this.get(drama)
  }

  removeEpisode(dramaId: unknown, episodeId: unknown): DramaDetail {
    const drama = idSchema.parse(dramaId); const episode = idSchema.parse(episodeId)
    const result = this.database.prepare('DELETE FROM episodes WHERE id = ? AND drama_id = ?').run(episode, drama)
    if (result.changes === 0) throw new Error('Episode not found')
    return this.get(drama)
  }
}

const isReadable = (path: string): boolean => {
  try { accessSync(path, constants.R_OK); return true } catch { return false }
}
const SUPPORTED_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm'])

const mapSummary = (row: DramaRow): DramaSummary => ({ id: row.id, name: row.name, episodeCount: row.episode_count, issueCount: row.issue_count ?? 0, tagNames: row.tag_names ? row.tag_names.split(',').filter(Boolean) : [], updatedAt: row.updated_at })
const mapEpisode = (row: EpisodeRow): EpisodeAsset => ({ id: row.id, episodeNo: row.episode_no, sortOrder: row.sort_order, sourcePath: row.source_path, durationSeconds: row.duration_seconds, fps: row.fps, status: row.status })
