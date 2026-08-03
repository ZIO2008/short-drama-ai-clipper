import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { LocalOcrSubtitleService } from './local-ocr-subtitle-service.js'
import { SubtitleEvidenceService } from './subtitle-evidence-service.js'
import type { ProcessResult } from '../media/media-types.js'

describe('LocalOcrSubtitleService', () => {
  it('reports an actionable local-only prerequisite instead of silently falling back to a paid API', () => {
    const database = new Database(':memory:'); migrateDatabase(database)
    try { expect(new LocalOcrSubtitleService(database, new SubtitleEvidenceService(database), () => null).getAvailability()).toEqual(expect.objectContaining({ available: false, executablePath: null, reason: expect.stringContaining('SHORTDRAMA_TESSERACT_PATH') })) } finally { database.close() }
  })

  it('rejects extraction without Tesseract before creating an OCR track', async () => {
    const { database, evidence, asrTrackId } = setup(); const service = new LocalOcrSubtitleService(database, evidence, () => null)
    try { await expect(service.extractFixedRegionFromAsr({ asrTrackId })).rejects.toThrow('SHORTDRAMA_TESSERACT_PATH'); expect(evidence.listTracks('drama', 'episode').map(({ sourceKind }) => sourceKind)).toEqual(['asr']) } finally { database.close() }
  })

  it('extracts the configured fixed region through replaceable local processes and persists an OCR track', async () => {
    const { database, evidence, asrTrackId } = setup(); const calls: Array<{ command: string; args: readonly string[] }> = []; let removed: string | null = null
    const result = (command: string, stdout = ''): ProcessResult => ({ command, stdout, stderr: '', exitCode: 0, signal: null, durationMs: 1 })
    const service = new LocalOcrSubtitleService(database, evidence, () => 'tesseract.exe', {
      resolveFfmpeg: () => 'ffmpeg.exe', createTempDirectory: async () => 'C:\\temp\\ocr', removeTempDirectory: async (path) => { removed = path },
      run: async (command, args) => { calls.push({ command, args }); return result(command, command === 'tesseract.exe' ? '识别字幕\n' : '') }
    })
    try {
      const track = await service.extractFixedRegionFromAsr({ asrTrackId, language: 'chi_sim' })
      expect(track).toEqual(expect.objectContaining({ sourceKind: 'ocr', cueCount: 1 }))
      expect(evidence.listCues(track.id)[0]).toEqual(expect.objectContaining({ text: '识别字幕', startSeconds: 1, endSeconds: 3 }))
      expect(calls).toEqual(expect.arrayContaining([expect.objectContaining({ command: 'ffmpeg.exe', args: expect.arrayContaining(['-vf', 'crop=iw*0.800000:ih*0.200000:iw*0.100000:ih*0.720000']) }), expect.objectContaining({ command: 'tesseract.exe', args: expect.arrayContaining(['-l', 'chi_sim', '--psm', '7']) })]))
      expect(removed).toBe('C:\\temp\\ocr')
    } finally { database.close() }
  })
})

const setup = (): { database: Database.Database; evidence: SubtitleEvidenceService; asrTrackId: string } => {
  const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database); const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Demo', now, now)
  database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('episode', 'drama', 1, 0, 'episode.mp4', 10, 'ready', now, now)
  const evidence = new SubtitleEvidenceService(database); evidence.setOcrRegion('drama', 'episode', { x: 0.1, y: 0.72, width: 0.8, height: 0.2 })
  const asrTrackId = evidence.createTrack({ dramaId: 'drama', episodeId: 'episode', sourceKind: 'asr', label: 'ASR', cues: [{ index: 1, startSeconds: 1, endSeconds: 3, text: '锚点', confidence: 0.9 }] }).id
  return { database, evidence, asrTrackId }
}
