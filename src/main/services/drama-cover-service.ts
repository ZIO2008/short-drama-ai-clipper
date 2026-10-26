import { access, copyFile, mkdir, rm, stat } from 'node:fs/promises'
import { constants, existsSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { DramaCover } from '../../shared/contracts.js'
import { assertSuccessfulProcess, resolveMediaBinary, runMediaProcess } from '../media/ffmpeg-runner.js'

const idSchema = z.string().trim().min(1).max(120)
const imagePathSchema = z.string().trim().min(1).max(2000)
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp'])
const MAX_COVER_BYTES = 20 * 1024 * 1024

type CoverRow = { source_kind: 'uploaded' | 'auto_frame'; path: string }
type EpisodeRow = { source_path: string; duration_seconds: number | null }

/** Owns only application cache files. Original images and videos are never modified. */
export class DramaCoverService {
  constructor(private readonly database: Database.Database, private readonly cacheRoot: string) {}

  async get(dramaId: unknown): Promise<DramaCover | null> {
    const id = idSchema.parse(dramaId)
    this.assertDrama(id)
    const existing = this.readExisting(id)
    if (existing) return existing
    return this.createAutomatic(id)
  }

  async upload(dramaId: unknown, sourcePath: unknown): Promise<DramaCover> {
    const id = idSchema.parse(dramaId)
    const source = imagePathSchema.parse(sourcePath)
    this.assertDrama(id)
    const extension = extname(source).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(extension)) throw new Error('封面仅支持 JPG、JPEG、PNG 或 WebP 图片。')
    const sourceInfo = await stat(source)
    if (!sourceInfo.isFile()) throw new Error('请选择一个图片文件。')
    if (sourceInfo.size > MAX_COVER_BYTES) throw new Error('封面图片不能超过 20 MB。')
    const folder = this.coverDirectory(id)
    await mkdir(folder, { recursive: true })
    const target = join(folder, `cover-upload${extension === '.jpeg' ? '.jpg' : extension}`)
    const previous = this.readRow(id)
    if (previous) await this.removePathIfOwned(id, previous.path)
    await copyFile(source, target)
    await this.removeCachedAuto(id)
    this.save(id, 'uploaded', target)
    return this.toCover('uploaded', target)
  }

  async removeUpload(dramaId: unknown): Promise<DramaCover | null> {
    const id = idSchema.parse(dramaId)
    this.assertDrama(id)
    const current = this.readRow(id)
    if (current?.source_kind === 'uploaded') {
      await this.removePathIfOwned(id, current.path)
      this.database.prepare('DELETE FROM drama_covers WHERE drama_id = ?').run(id)
    }
    return this.get(id)
  }

  async clearCache(dramaId: unknown): Promise<void> {
    const id = idSchema.parse(dramaId)
    await rm(this.coverDirectory(id), { recursive: true, force: true })
  }

  private async createAutomatic(dramaId: string): Promise<DramaCover | null> {
    const episode = this.database.prepare("SELECT source_path, duration_seconds FROM episodes WHERE drama_id = ? AND status IN ('ready', 'available') ORDER BY sort_order, id LIMIT 1").get(dramaId) as EpisodeRow | undefined
    if (!episode) return null
    try {
      await access(episode.source_path, constants.R_OK)
      const binary = resolveMediaBinary('ffmpeg')
      if (!binary) return null
      const folder = this.coverDirectory(dramaId)
      await mkdir(folder, { recursive: true })
      const target = join(folder, 'cover-auto.jpg')
      // Seek past the opening: title cards and fades are the common black-frame source.
      const duration = episode.duration_seconds ?? 0
      const offset = duration > 0 ? Math.min(Math.max(duration * 0.12, 1), Math.max(duration - 0.25, 0)) : 1
      const result = await runMediaProcess(binary, ['-y', '-ss', offset.toFixed(3), '-i', episode.source_path, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '2', target])
      assertSuccessfulProcess(result)
      const output = await stat(target)
      if (!output.isFile() || output.size === 0) return null
      this.save(dramaId, 'auto_frame', target)
      return this.toCover('auto_frame', target)
    } catch {
      return null
    }
  }

  private readExisting(dramaId: string): DramaCover | null {
    const row = this.readRow(dramaId)
    if (!row) return null
    try {
      const target = resolve(row.path)
      if (!target.startsWith(`${this.coverDirectory(dramaId)}${pathSeparator()}`) && target !== this.coverDirectory(dramaId)) throw new Error('outside cover cache')
      if (!existsSync(target)) throw new Error('missing')
      return this.toCover(row.source_kind, target)
    } catch {
      this.database.prepare('DELETE FROM drama_covers WHERE drama_id = ?').run(dramaId)
      return null
    }
  }

  private readRow(dramaId: string): CoverRow | undefined {
    return this.database.prepare('SELECT source_kind, path FROM drama_covers WHERE drama_id = ?').get(dramaId) as CoverRow | undefined
  }

  private save(dramaId: string, sourceKind: DramaCover['sourceKind'], path: string): void {
    const now = new Date().toISOString()
    this.database.prepare('INSERT INTO drama_covers (drama_id, source_kind, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(drama_id) DO UPDATE SET source_kind = excluded.source_kind, path = excluded.path, updated_at = excluded.updated_at').run(dramaId, sourceKind, path, now, now)
  }

  private toCover(sourceKind: DramaCover['sourceKind'], path: string): DramaCover {
    return { sourceKind, path, url: pathToFileURL(path).toString() }
  }

  private assertDrama(dramaId: string): void {
    if (!this.database.prepare('SELECT 1 FROM dramas WHERE id = ?').get(dramaId)) throw new Error('Drama not found')
  }

  private coverDirectory(dramaId: string): string {
    const root = resolve(this.cacheRoot)
    const target = resolve(root, dramaId, 'cover')
    if (!target.startsWith(`${root}${pathSeparator()}`)) throw new Error('Invalid drama cache path')
    return target
  }

  private async removeCachedAuto(dramaId: string): Promise<void> {
    const auto = join(this.coverDirectory(dramaId), 'cover-auto.jpg')
    await rm(auto, { force: true })
  }

  private async removePathIfOwned(dramaId: string, path: string): Promise<void> {
    const directory = this.coverDirectory(dramaId)
    const target = resolve(path)
    if (target.startsWith(`${directory}${pathSeparator()}`)) await rm(target, { force: true })
  }
}

const pathSeparator = (): string => process.platform === 'win32' ? '\\' : '/'
