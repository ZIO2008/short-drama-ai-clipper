import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { parseSubtitleFile } from './subtitle-service.js'

export type SubtitleAsset = { id: string; dramaId: string; episodeId: string | null; sourcePath: string; format: string; cueCount: number; status: string }

export class SubtitleAssetService {
  constructor(private readonly database: Database.Database) {}

  async importFile(dramaIdInput: unknown, episodeIdInput: unknown, pathInput: unknown): Promise<SubtitleAsset> {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const episodeId = z.string().trim().min(1).nullable().parse(episodeIdInput); const sourcePath = z.string().trim().min(1).parse(pathInput); const format = z.enum(['srt', 'vtt']).parse(extname(sourcePath).slice(1).toLowerCase())
    if (!this.database.prepare('SELECT 1 FROM dramas WHERE id = ?').get(dramaId)) throw new Error('Drama not found')
    if (episodeId && !this.database.prepare('SELECT 1 FROM episodes WHERE id = ? AND drama_id = ?').get(episodeId, dramaId)) throw new Error('Episode does not belong to drama')
    const cues = await parseSubtitleFile(sourcePath); const id = randomUUID(); const now = new Date().toISOString(); const status = cues.length > 0 ? 'ready' : 'empty'
    return this.database.transaction(() => {
      const inserted = this.database.prepare('INSERT OR IGNORE INTO subtitle_assets (id, drama_id, episode_id, source_path, format, cue_count, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, dramaId, episodeId, sourcePath, format, cues.length, status, now, now)
      if (inserted.changes === 0) {
        const existing = this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, source_path AS sourcePath, format, cue_count AS cueCount, status FROM subtitle_assets WHERE drama_id = ? AND episode_id IS ? AND source_path = ?').get(dramaId, episodeId, sourcePath) as SubtitleAsset | undefined
        if (existing) return existing
        throw new Error('Subtitle import did not create an asset')
      }
      if (cues.length > 0) {
        const trackId = randomUUID()
        this.database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, asset_id, source_kind, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'import', ?, ?, 'active', ?, '{}', ?, ?)").run(trackId, dramaId, episodeId, id, `导入 ${format.toUpperCase()}`, 'zh-CN', cues.length, now, now)
        const insertCue = this.database.prepare('INSERT INTO subtitle_cues (id, track_id, cue_index, start_seconds, end_seconds, text, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)')
        for (const cue of cues) insertCue.run(randomUUID(), trackId, cue.index, cue.startSeconds, cue.endSeconds, cue.text, now, now)
      }
      return { id, dramaId, episodeId, sourcePath, format, cueCount: cues.length, status }
    })()
  }

  list(dramaIdInput: unknown): SubtitleAsset[] { const dramaId = z.string().trim().min(1).parse(dramaIdInput); return this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, source_path AS sourcePath, format, cue_count AS cueCount, status FROM subtitle_assets WHERE drama_id = ? ORDER BY created_at DESC').all(dramaId) as SubtitleAsset[] }

  remove(assetIdInput: unknown): void {
    const assetId = z.string().trim().min(1).parse(assetIdInput); const asset = this.database.prepare('SELECT id FROM subtitle_assets WHERE id = ?').get(assetId) as { id: string } | undefined
    if (!asset) throw new Error('Subtitle source not found')
    const now = new Date().toISOString()
    this.database.transaction(() => {
      this.database.prepare('UPDATE subtitle_tracks SET asset_id = NULL, status = ?, updated_at = ? WHERE asset_id = ?').run('archived', now, asset.id)
      this.database.prepare('DELETE FROM subtitle_assets WHERE id = ?').run(asset.id)
    })()
  }
}
