import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { ScriptAssetSummary } from '../../shared/contracts.js'
import { importScript, type ScriptEpisodePreview } from './script-import-service.js'

type Row = { id: string; source_path: string; format: string; link_status: string; episode_id: string | null; extracted_text: string | null }
const idSchema = z.string().trim().min(1)

export class ScriptAssetService {
  constructor(private readonly database: Database.Database) {}
  list(dramaId: unknown): ScriptAssetSummary[] {
    const id = idSchema.parse(dramaId)
    return (this.database.prepare('SELECT id, source_path, format, link_status, episode_id, extracted_text FROM script_assets WHERE drama_id = ? ORDER BY created_at DESC').all(id) as Row[]).map(mapRow)
  }
  async import(dramaId: unknown, filePath: unknown): Promise<{ asset: ScriptAssetSummary; episodes: ScriptEpisodePreview[] }> {
    const id = idSchema.parse(dramaId); const path = z.string().trim().min(1).parse(filePath); const parsed = await importScript(path); const now = new Date().toISOString(); const assetId = randomUUID()
    if (!this.database.prepare('SELECT 1 FROM dramas WHERE id = ?').get(id)) throw new Error('Drama not found')
    const previews = parsed.episodes.map((segment) => ({ ...segment, segmentId: randomUUID() }))
    const transaction = this.database.transaction(() => {
      this.database.prepare('INSERT INTO script_assets (id, drama_id, source_path, format, extracted_text, link_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(assetId, id, path, parsed.format, parsed.text, parsed.episodes.length > 0 ? 'needs_confirmation' : 'unlinked', now, now)
      const insertSegment = this.database.prepare('INSERT INTO script_asset_segments (id, script_asset_id, episode_no, title, extracted_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const segment of previews) insertSegment.run(segment.segmentId, assetId, segment.episodeNo, segment.title, segment.text, now, now)
    })
    transaction()
    return { asset: mapRow({ id: assetId, source_path: path, format: parsed.format, link_status: previews.length > 0 ? 'needs_confirmation' : 'unlinked', episode_id: null, extracted_text: parsed.text }), episodes: previews }
  }
  link(scriptId: unknown, episodeId: unknown): void {
    const script = idSchema.parse(scriptId); const episode = episodeId === null ? null : idSchema.parse(episodeId); const now = new Date().toISOString()
    if (episode) {
      const valid = this.database.prepare('SELECT 1 FROM script_assets s JOIN episodes e ON e.drama_id = s.drama_id WHERE s.id = ? AND e.id = ?').get(script, episode)
      if (!valid) throw new Error('Script and episode belong to different dramas')
    }
    const result = this.database.prepare('UPDATE script_assets SET episode_id = ?, link_status = ?, updated_at = ? WHERE id = ?').run(episode, episode ? 'linked' : 'unlinked', now, script)
    if (result.changes === 0) throw new Error('Script asset not found')
  }
  linkSegment(segmentId: unknown, episodeId: unknown): void {
    const segment = idSchema.parse(segmentId); const episode = episodeId === null ? null : idSchema.parse(episodeId); const now = new Date().toISOString()
    if (episode && !this.database.prepare('SELECT 1 FROM script_asset_segments s JOIN script_assets a ON a.id = s.script_asset_id JOIN episodes e ON e.drama_id = a.drama_id WHERE s.id = ? AND e.id = ?').get(segment, episode)) throw new Error('Script segment and episode belong to different dramas')
    const owner = this.database.prepare('SELECT script_asset_id AS scriptAssetId FROM script_asset_segments WHERE id = ?').get(segment) as { scriptAssetId: string } | undefined
    const result = this.database.prepare('UPDATE script_asset_segments SET episode_id = ?, updated_at = ? WHERE id = ?').run(episode, now, segment)
    if (result.changes === 0) throw new Error('Script segment not found')
    if (owner) {
      const remaining = this.database.prepare('SELECT COUNT(*) AS count FROM script_asset_segments WHERE script_asset_id = ? AND episode_id IS NULL').get(owner.scriptAssetId) as { count: number }
      this.database.prepare('UPDATE script_assets SET link_status = ?, updated_at = ? WHERE id = ?').run(remaining.count === 0 ? 'linked' : 'needs_confirmation', now, owner.scriptAssetId)
    }
  }
}

const mapRow = (row: Row): ScriptAssetSummary => ({ id: row.id, sourcePath: row.source_path, format: row.format, linkStatus: row.link_status, episodeId: row.episode_id, extractedText: row.extracted_text })
