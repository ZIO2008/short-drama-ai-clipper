import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { SubtitleEvidenceService } from './subtitle-evidence-service.js'

const setup = (): { database: Database.Database; service: SubtitleEvidenceService } => {
  const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database); const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Demo', now, now)
  database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('episode', 'drama', 1, 0, 'episode.mp4', 20, 'ready', now, now)
  return { database, service: new SubtitleEvidenceService(database) }
}

describe('SubtitleEvidenceService', () => {
  it('uses an episode OCR region over the drama default and retains a portable evidence track', () => {
    const { database, service } = setup()
    try {
      service.setOcrRegion('drama', null, { x: 0.1, y: 0.72, width: 0.8, height: 0.2 })
      service.setOcrRegion('drama', 'episode', { x: 0.15, y: 0.7, width: 0.7, height: 0.24 })
      expect(service.getEffectiveOcrRegion('drama', 'episode')).toEqual(expect.objectContaining({ scope: 'episode_override', x: 0.15 }))
      const track = service.createTrack({ dramaId: 'drama', episodeId: 'episode', sourceKind: 'asr', label: '本地识别', cues: [{ index: 1, startSeconds: 1, endSeconds: 2, text: '你回来了', confidence: 0.95 }] })
      expect(service.exportTrackAsSrt(track.id)).toContain('00:00:01,000 --> 00:00:02,000')
    } finally { database.close() }
  })

  it('persists only OCR/ASR disagreements and records the human choice with cost evidence', () => {
    const { database, service } = setup()
    try {
      const asr = service.createTrack({ dramaId: 'drama', episodeId: 'episode', sourceKind: 'asr', label: '本地 ASR', cues: [{ index: 1, startSeconds: 1, endSeconds: 3, text: '不要走' }] })
      const ocr = service.createTrack({ dramaId: 'drama', episodeId: 'episode', sourceKind: 'ocr', label: '固定区域 OCR', cues: [{ index: 1, startSeconds: 1.2, endSeconds: 2.8, text: '别走' }] })
      const [conflict] = service.compareAsrAndOcr(asr.id, ocr.id)
      expect(conflict).toEqual(expect.objectContaining({ status: 'open', dramaId: 'drama' }))
      expect(() => service.resolveConflict(conflict?.id, { source: 'asr' })).toThrow()
      expect(service.resolveConflict(conflict?.id, { source: 'reviewed' })).toEqual(expect.objectContaining({ status: 'reviewed', resolvedText: null }))
      expect(JSON.parse(service.exportTrackAudit(asr.id))).toEqual(expect.objectContaining({ decisions: [expect.objectContaining({ status: 'reviewed', resolvedText: null })] }))
      const evaluationId = service.recordQualityEvaluation({ dramaId: 'drama', episodeId: 'episode', sourceKind: 'ocr', sampleLabel: '第一集抽样', referenceCharacters: 10, differingCharacters: 1, conflictCount: 1, evaluatedCueCount: 2, elapsedMs: 3500, estimatedCost: 0, actualCost: 0, notes: '本地 OCR' })
      expect(database.prepare('SELECT actual_cost AS actualCost FROM subtitle_quality_evaluations WHERE id = ?').get(evaluationId)).toEqual({ actualCost: 0 })
      expect(service.getQualityReport('drama', 'episode')).toEqual(expect.objectContaining({ characterErrorRate: 0.1, conflictRate: 0.5, elapsedMs: 3500 }))
    } finally { database.close() }
  })

  it('exposes consistent, different, audio-only, visual-only and low-confidence conclusions by cue', () => {
    const { database, service } = setup()
    try {
      const asr = service.createTrack({ dramaId: 'drama', episodeId: 'episode', sourceKind: 'asr', label: 'ASR', cues: [{ index: 1, startSeconds: 1, endSeconds: 2, text: '一致', confidence: 0.95 }, { index: 2, startSeconds: 3, endSeconds: 4, text: '不同', confidence: 0.95 }, { index: 3, startSeconds: 5, endSeconds: 6, text: '只有声音', confidence: 0.95 }, { index: 4, startSeconds: 7, endSeconds: 8, text: '低置信', confidence: 0.5 }] })
      const visual = service.createTrack({ dramaId: 'drama', episodeId: 'episode', sourceKind: 'ocr', label: '固定区域 OCR', cues: [{ index: 1, startSeconds: 1, endSeconds: 2, text: '一致', confidence: 0.95 }, { index: 2, startSeconds: 3, endSeconds: 4, text: '差异', confidence: 0.95 }, { index: 3, startSeconds: 6, endSeconds: 6.8, text: '只有画面', confidence: 0.95 }, { index: 4, startSeconds: 7, endSeconds: 8, text: '低置信', confidence: 0.95 }] })
      expect(service.getComparisonResults(asr.id, visual.id).map(({ conclusion }) => conclusion)).toEqual(expect.arrayContaining(['consistent', 'different', 'asr_only', 'ocr_only', 'needs_review']))
      expect(service.compareAsrAndOcr(asr.id, visual.id)).toHaveLength(2)
    } finally { database.close() }
  })

  it('allows an archived manual track and OCR-region clearing without leaving active stale state', () => {
    const { database, service } = setup()
    try {
      const imported = service.createTrack({ dramaId: 'drama', episodeId: 'episode', sourceKind: 'resolved', label: '外部字幕校对副本', cues: [{ index: 1, startSeconds: 1, endSeconds: 2, text: '原句' }] })
      const cue = service.listCues(imported.id)[0]
      expect(() => service.updateResolvedCue(imported.id, cue?.id, { text: '修改' })).not.toThrow()
      service.archiveTrack(imported.id)
      expect(service.listTracks('drama', 'episode').find(({ id }) => id === imported.id)).toBeUndefined()
      service.setOcrRegion('drama', null, { x: 0.1, y: 0.72, width: 0.8, height: 0.2 })
      service.clearOcrRegion('drama', null)
      expect(service.getEffectiveOcrRegion('drama', null)).toBeNull()
    } finally { database.close() }
  })
})
