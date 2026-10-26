import type Database from 'better-sqlite3'
import { EvidenceService } from './evidence-service.js'
import { parseSubtitleFile, type SubtitleCue } from '../services/subtitle-service.js'

type SubtitleAssetRow = { episodeId: string; sourcePath: string }
type EvidenceWindow = { startSeconds: number; endSeconds: number; summary: string; confidence: number; cueCount: number }

const CONFLICT_TERMS = /真相|背叛|复仇|离婚|杀|死|威胁|秘密|出轨|孩子|报警|滚|跪|不要|救命/u

export const buildEvidenceWindows = (cues: readonly SubtitleCue[], minSeconds: number, maxSeconds: number): EvidenceWindow[] => {
  const windows: EvidenceWindow[] = []
  for (let index = 0; index < cues.length; index += 1) {
    const first = cues[index]
    if (!first) continue
    const selected: SubtitleCue[] = []
    for (const cue of cues.slice(index)) {
      if (cue.endSeconds - first.startSeconds > maxSeconds) break
      selected.push(cue)
      if (cue.endSeconds - first.startSeconds >= minSeconds) {
        const text = selected.map(({ text }) => text.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' / ')
        const confidence = CONFLICT_TERMS.test(text) ? 0.86 : 0.64
        windows.push({ startSeconds: first.startSeconds, endSeconds: cue.endSeconds, summary: text.slice(0, 900) || '本地字幕片段', confidence, cueCount: selected.length })
        break
      }
    }
  }
  return windows
}

export class LocalEvidenceService {
  private readonly evidence: EvidenceService

  constructor(private readonly database: Database.Database) { this.evidence = new EvidenceService(database) }

  async prepare(input: { dramaId: string; episodeStart: number; episodeEnd: number; durationMinSeconds: number; durationMaxSeconds: number }): Promise<{ created: number; unreadableAssets: number }> {
    const assets = this.database.prepare(`
      SELECT subtitle.episode_id AS episodeId, subtitle.source_path AS sourcePath
      FROM subtitle_assets subtitle
      JOIN episodes episode ON episode.id = subtitle.episode_id
      WHERE subtitle.drama_id = ?
        AND subtitle.status = 'ready'
        AND episode.episode_no BETWEEN ? AND ?
      ORDER BY episode.episode_no, subtitle.created_at
    `).all(input.dramaId, input.episodeStart, input.episodeEnd) as SubtitleAssetRow[]
    let created = 0; let unreadableAssets = 0
    for (const asset of assets) {
      try {
        const windows = buildEvidenceWindows(await parseSubtitleFile(asset.sourcePath), input.durationMinSeconds, input.durationMaxSeconds)
        for (const window of windows) {
          const existing = this.database.prepare(`
            SELECT 1 FROM ai_evidence
            WHERE drama_id = ? AND episode_id = ? AND source_type = 'subtitle'
              AND start_seconds = ? AND end_seconds = ? AND summary = ?
          `).get(input.dramaId, asset.episodeId, window.startSeconds, window.endSeconds, window.summary)
          if (existing) continue
          this.evidence.record({ dramaId: input.dramaId, episodeId: asset.episodeId, sourceType: 'subtitle', startSeconds: window.startSeconds, endSeconds: window.endSeconds, confidence: window.confidence, summary: window.summary, details: { cueCount: window.cueCount, generator: 'controlled-local-v1' } })
          created += 1
        }
      } catch { unreadableAssets += 1 }
    }
    return { created, unreadableAssets }
  }
}
