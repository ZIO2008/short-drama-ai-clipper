import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { parseSubtitleFile } from './subtitle-service.js'
import { extractEpisodeNoFromSubtitlePath } from './subtitle-episode-matcher.js'

export type SubtitleAsset = { id: string; dramaId: string; episodeId: string | null; sourcePath: string; format: string; cueCount: number; status: string }
export type SubtitleBatchImportedAsset = SubtitleAsset & { episodeNo: number }
export type SubtitleBatchImportResult = { assets: SubtitleBatchImportedAsset[]; skipped: Array<{ sourcePath: string; reason: string }> }
export type SubtitleBatchImportPreview = { matches: Array<{ episodeId: string; episodeNo: number; sourcePath: string; format: string }>; skipped: Array<{ sourcePath: string; reason: string }> }

export class SubtitleAssetService {
  constructor(private readonly database: Database.Database) {}

  async importFile(dramaIdInput: unknown, episodeIdInput: unknown, pathInput: unknown): Promise<SubtitleAsset> {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const episodeId = z.string().trim().min(1).nullable().parse(episodeIdInput); const sourcePath = z.string().trim().min(1).parse(pathInput); const format = z.enum(['srt', 'vtt']).parse(extname(sourcePath).slice(1).toLowerCase())
    if (!this.database.prepare('SELECT 1 FROM dramas WHERE id = ?').get(dramaId)) throw new Error('Drama not found')
    if (episodeId && !this.database.prepare('SELECT 1 FROM episodes WHERE id = ? AND drama_id = ?').get(episodeId, dramaId)) throw new Error('Episode does not belong to drama')
    const cues = await parseSubtitleFile(sourcePath); const id = randomUUID(); const now = new Date().toISOString(); const status = cues.length > 0 ? 'ready' : 'empty'
    return this.database.transaction(() => {
      const inserted = this.database.prepare("INSERT OR IGNORE INTO subtitle_assets (id, drama_id, episode_id, source_path, format, cue_count, status, acquisition, evidence_nature, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'imported', 'reference_unknown', ?, ?)").run(id, dramaId, episodeId, sourcePath, format, cues.length, status, now, now)
      if (inserted.changes === 0) {
        const existing = this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, source_path AS sourcePath, format, cue_count AS cueCount, status FROM subtitle_assets WHERE drama_id = ? AND episode_id IS ? AND source_path = ?').get(dramaId, episodeId, sourcePath) as SubtitleAsset | undefined
        if (existing) return existing
        throw new Error('Subtitle import did not create an asset')
      }
      if (cues.length > 0) {
        const trackId = randomUUID()
        this.database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, asset_id, source_kind, acquisition, evidence_nature, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, ?, ?, 'import', 'imported', 'reference_unknown', ?, ?, 'active', ?, ?, ?, ?)").run(trackId, dramaId, episodeId, id, `导入 ${format.toUpperCase()}`, 'zh-CN', cues.length, JSON.stringify({ acquisition: 'imported', evidenceNature: 'reference_unknown' }), now, now)
        const insertCue = this.database.prepare('INSERT INTO subtitle_cues (id, track_id, cue_index, start_seconds, end_seconds, text, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)')
        for (const cue of cues) insertCue.run(randomUUID(), trackId, cue.index, cue.startSeconds, cue.endSeconds, cue.text, now, now)
      }
      return { id, dramaId, episodeId, sourcePath, format, cueCount: cues.length, status }
    })()
  }

  list(dramaIdInput: unknown): SubtitleAsset[] { const dramaId = z.string().trim().min(1).parse(dramaIdInput); return this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, source_path AS sourcePath, format, cue_count AS cueCount, status FROM subtitle_assets WHERE drama_id = ? ORDER BY created_at DESC').all(dramaId) as SubtitleAsset[] }

  previewByEpisodeNumbers(dramaIdInput: unknown, pathsInput: unknown): SubtitleBatchImportPreview {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput)
    const paths = z.array(z.string().trim().min(1)).min(1).parse(pathsInput)
    if (!this.database.prepare('SELECT 1 FROM dramas WHERE id = ?').get(dramaId)) throw new Error('Drama not found')
    const uniquePaths = [...new Map(paths.map((path) => [path.toLocaleLowerCase(), path])).values()]
    const episodes = this.database.prepare('SELECT id, episode_no AS episodeNo FROM episodes WHERE drama_id = ? AND episode_no IS NOT NULL').all(dramaId) as Array<{ id: string; episodeNo: number }>
    const episodeByNo = new Map<number, { id: string; episodeNo: number } | null>()
    for (const episode of episodes) {
      episodeByNo.set(episode.episodeNo, episodeByNo.has(episode.episodeNo) ? null : episode)
    }
    const groups = new Map<string, { episodeNo: number; sourcePaths: string[] }>()
    const skipped: SubtitleBatchImportResult['skipped'] = []
    for (const sourcePath of uniquePaths) {
      const episodeNo = extractEpisodeNoFromSubtitlePath(sourcePath)
      if (episodeNo === null) { skipped.push({ sourcePath, reason: '文件名未包含可识别的完整剧集号' }); continue }
      const episodeId = episodeByNo.get(episodeNo)
      if (episodeId === undefined) { skipped.push({ sourcePath, reason: `当前剧目不存在第 ${episodeNo} 集` }); continue }
      if (episodeId === null) { skipped.push({ sourcePath, reason: `当前剧目第 ${episodeNo} 集存在多个剧集记录，无法安全匹配` }); continue }
      groups.set(episodeId.id, { episodeNo: episodeId.episodeNo, sourcePaths: [...(groups.get(episodeId.id)?.sourcePaths ?? []), sourcePath] })
    }
    const matches: SubtitleBatchImportPreview['matches'] = []
    for (const [episodeId, { episodeNo, sourcePaths }] of groups) {
      if (sourcePaths.length !== 1) {
        sourcePaths.forEach((sourcePath) => skipped.push({ sourcePath, reason: '同次导入中多个字幕文件命中同一剧集，需人工处理' }))
        continue
      }
      const sourcePath = sourcePaths[0]
      const format = extname(sourcePath).slice(1).toLowerCase()
      if (format !== 'srt' && format !== 'vtt') { skipped.push({ sourcePath, reason: '仅支持 SRT 或 VTT 字幕文件' }); continue }
      const existing = this.database.prepare('SELECT 1 FROM subtitle_assets WHERE drama_id = ? AND episode_id = ? AND lower(source_path) = lower(?)').get(dramaId, episodeId, sourcePath)
      if (existing) { skipped.push({ sourcePath, reason: `第 ${episodeNo} 集已导入同一字幕文件` }); continue }
      matches.push({ episodeId, episodeNo, sourcePath, format })
    }
    return { matches, skipped }
  }

  async importByEpisodeNumbers(dramaIdInput: unknown, pathsInput: unknown): Promise<SubtitleBatchImportResult> {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput)
    const preview = this.previewByEpisodeNumbers(dramaId, pathsInput)
    const assets: SubtitleBatchImportedAsset[] = []
    const skipped = [...preview.skipped]
    for (const match of preview.matches) {
      try { assets.push({ ...await this.importFile(dramaId, match.episodeId, match.sourcePath), episodeNo: match.episodeNo }) }
      catch (cause) { skipped.push({ sourcePath: match.sourcePath, reason: cause instanceof Error ? cause.message : '字幕导入失败' }) }
    }
    return { assets, skipped }
  }

  remove(assetIdInput: unknown): void {
    const assetId = z.string().trim().min(1).parse(assetIdInput); const asset = this.database.prepare('SELECT id FROM subtitle_assets WHERE id = ?').get(assetId) as { id: string } | undefined
    if (!asset) throw new Error('Subtitle source not found')
    this.database.transaction(() => {
      this.database.prepare('DELETE FROM subtitle_tracks WHERE asset_id = ?').run(asset.id)
      this.database.prepare('DELETE FROM subtitle_assets WHERE id = ?').run(asset.id)
    })()
  }

  removeByEpisode(dramaIdInput: unknown, episodeIdInput: unknown): number {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput)
    const episodeId = z.string().trim().min(1).parse(episodeIdInput)
    if (!this.database.prepare('SELECT 1 FROM episodes WHERE id = ? AND drama_id = ?').get(episodeId, dramaId)) throw new Error('Episode does not belong to drama')
    return this.database.transaction(() => {
      const assets = this.database.prepare('SELECT id FROM subtitle_assets WHERE drama_id = ? AND episode_id = ?').all(dramaId, episodeId) as Array<{ id: string }>
      for (const asset of assets) this.database.prepare('DELETE FROM subtitle_tracks WHERE asset_id = ?').run(asset.id)
      this.database.prepare('DELETE FROM subtitle_assets WHERE drama_id = ? AND episode_id = ?').run(dramaId, episodeId)
      return assets.length
    })()
  }
}
