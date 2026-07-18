import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { parseSubtitleFile } from './subtitle-service.js'

export type SubtitleAsset = { id: string; dramaId: string; episodeId: string | null; sourcePath: string; format: string; cueCount: number; status: string }

export class SubtitleAssetService {
  constructor(private readonly database: Database.Database) {}

  async importFile(dramaIdInput: unknown, episodeIdInput: unknown, pathInput: unknown): Promise<SubtitleAsset> {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const episodeId = z.string().trim().min(1).nullable().parse(episodeIdInput); const sourcePath = z.string().trim().min(1).parse(pathInput)
    const cues = await parseSubtitleFile(sourcePath); const format = extname(sourcePath).slice(1).toLowerCase(); const id = randomUUID(); const now = new Date().toISOString()
    this.database.prepare('INSERT INTO subtitle_assets (id, drama_id, episode_id, source_path, format, cue_count, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, dramaId, episodeId, sourcePath, format, cues.length, cues.length > 0 ? 'ready' : 'empty', now, now)
    return { id, dramaId, episodeId, sourcePath, format, cueCount: cues.length, status: cues.length > 0 ? 'ready' : 'empty' }
  }

  list(dramaIdInput: unknown): SubtitleAsset[] { const dramaId = z.string().trim().min(1).parse(dramaIdInput); return this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, source_path AS sourcePath, format, cue_count AS cueCount, status FROM subtitle_assets WHERE drama_id = ? ORDER BY created_at DESC').all(dramaId) as SubtitleAsset[] }
}
