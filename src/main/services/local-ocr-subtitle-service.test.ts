import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { LocalOcrSubtitleService } from './local-ocr-subtitle-service.js'
import { SubtitleEvidenceService } from './subtitle-evidence-service.js'
import type { ProcessResult } from '../media/media-types.js'

describe('LocalOcrSubtitleService', () => {
  it('reports an actionable Paddle prerequisite instead of silently falling back to a paid API or Tesseract', () => {
    const { database, evidence } = setup()
    try {
      expect(new LocalOcrSubtitleService(database, evidence, () => null).getAvailability()).toEqual(expect.objectContaining({ available: false, executablePath: null, reason: expect.stringContaining('SHORTDRAMA_LOCAL_OCR_PYTHON') }))
    } finally { database.close() }
  })

  it('reports runtime identity only after a real Paddle self-test response', async () => {
    const { database, evidence } = setup()
    const service = new LocalOcrSubtitleService(database, evidence, () => 'python.exe', {
      resolveFfmpeg: () => 'ffmpeg.exe',
      resolvePythonRunner: () => 'temporal_ocr_runner.py',
      run: async (command) => ({ ...processResult(command), stdout: JSON.stringify({ ok: true, runnerBuildId: 'runner-r1', engine: 'paddleocr', detector: true, recognizer: true }) }),
      createTempDirectory: async () => 'C:\\temp\\ocr',
      removeTempDirectory: async () => undefined,
      writeJson: async () => undefined,
      readJson: async () => ({})
    })
    try {
      await expect(service.getRuntimeInfo()).resolves.toEqual(expect.objectContaining({ available: true, buildId: 'runner-r1', selfTest: true, reason: null }))
    } finally { database.close() }
  })

  it('rejects extraction without the local Paddle environment before creating an OCR track', async () => {
    const { database, evidence } = setup()
    const service = new LocalOcrSubtitleService(database, evidence, () => null)
    try {
      await expect(service.extractFixedRegionIndependently({ dramaId: 'drama', episodeId: 'episode' })).rejects.toThrow('SHORTDRAMA_LOCAL_OCR_PYTHON')
      expect(evidence.listTracks('drama', 'episode').map(({ sourceKind }) => sourceKind)).toEqual(['asr'])
    } finally { database.close() }
  })

  it('persists only a successful independent temporal OCR result and cleans its temporary workspace', async () => {
    const { database, evidence } = setup()
    const calls: Array<{ command: string; args: readonly string[] }> = []
    const written: unknown[] = []
    let removed: string | null = null
    const service = new LocalOcrSubtitleService(database, evidence, () => 'python.exe', {
      resolveFfmpeg: () => 'ffmpeg.exe',
      resolvePythonRunner: () => 'temporal_ocr_runner.py',
      createTempDirectory: async () => 'C:\\temp\\ocr',
      removeTempDirectory: async (path) => { removed = path },
      writeJson: async (_path, value) => { written.push(value) },
      readJson: async () => ({ ok: true, stats: { sampledFrameCount: 15, visualCandidateCount: 2 }, cues: [{ startSeconds: 1, endSeconds: 2.4, text: '区域内字幕', confidence: 0.94 }] }),
      run: async (command, args) => { calls.push({ command, args }); return processResult(command) }
    })
    try {
      const track = await service.extractFixedRegionIndependently({ dramaId: 'drama', episodeId: 'episode', language: 'chi_sim' })
      expect(track).toEqual(expect.objectContaining({ sourceKind: 'ocr', cueCount: 1 }))
      expect(evidence.listCues(track.id)[0]).toEqual(expect.objectContaining({ text: '区域内字幕', startSeconds: 1, endSeconds: 2.4, confidence: 0.94 }))
      expect(calls).toEqual([expect.objectContaining({ command: 'python.exe', args: expect.arrayContaining(['temporal_ocr_runner.py', '--input', '--output']) })])
      expect(written).toEqual([expect.objectContaining({ ffmpegPath: 'ffmpeg.exe', videoPath: 'episode.mp4', language: 'chi_sim', region: { x: 0.1, y: 0.72, width: 0.8, height: 0.2 } })])
      expect(removed).toBe('C:\\temp\\ocr')
    } finally { database.close() }
  })

  it('lets automatic region mode run without a saved region and never persists the machine proposal as a manual region', async () => {
    const { database, evidence } = setup()
    const written: unknown[] = []
    evidence.clearOcrRegion('drama', 'episode')
    const service = new LocalOcrSubtitleService(database, evidence, () => 'python.exe', temporalRuntime({ writeJson: async (_path, value) => { written.push(value) } }))
    try {
      const track = await service.extractFixedRegionIndependently({ dramaId: 'drama', episodeId: 'episode', regionMode: 'auto-region' })
      expect(written[0]).toEqual(expect.objectContaining({ region: null }))
      expect(evidence.getEffectiveOcrRegion('drama', 'episode')).toBeNull()
      expect(track.label).toBe('本地机器选区 OCR（chi_sim）')
    } finally { database.close() }
  })

  it('does not constrain automatic region detection with the saved drama baseline', async () => {
    const { database, evidence } = setup()
    const written: unknown[] = []
    const service = new LocalOcrSubtitleService(database, evidence, () => 'python.exe', temporalRuntime({ writeJson: async (_path, value) => { written.push(value) } }))
    try {
      await service.extractFixedRegionIndependently({ dramaId: 'drama', episodeId: 'episode', regionMode: 'auto-region' })
      expect(written[0]).toEqual(expect.objectContaining({ region: null }))
    } finally { database.close() }
  })

  it('does not use ASR cue timestamps when an existing ASR track invokes OCR compatibility entrypoint', async () => {
    const { database, evidence, asrTrackId } = setup()
    const written: unknown[] = []
    const service = new LocalOcrSubtitleService(database, evidence, () => 'python.exe', temporalRuntime({ writeJson: async (_path, value) => { written.push(value) } }))
    try {
      await service.extractFixedRegionFromAsr({ asrTrackId })
      expect(written[0]).toEqual(expect.objectContaining({ videoPath: 'episode.mp4', region: { x: 0.1, y: 0.72, width: 0.8, height: 0.2 } }))
      expect(JSON.stringify(written[0])).not.toContain('锚点')
      expect(evidence.listTracks('drama', 'episode').filter(({ sourceKind }) => sourceKind === 'ocr')).toHaveLength(1)
    } finally { database.close() }
  })

  it('does not write a half-finished OCR track when the temporal runner returns no subtitle result', async () => {
    const { database, evidence } = setup()
    const service = new LocalOcrSubtitleService(database, evidence, () => 'python.exe', temporalRuntime({ readJson: async () => ({ ok: false, error: { message: '固定区域 OCR 没有识别到字幕' } }) }))
    try {
      await expect(service.extractFixedRegionIndependently({ dramaId: 'drama', episodeId: 'episode' })).rejects.toThrow('没有识别到字幕')
      expect(evidence.listTracks('drama', 'episode').map(({ sourceKind }) => sourceKind)).toEqual(['asr'])
    } finally { database.close() }
  })

  it('archives an older OCR result only after a replacement result is ready', async () => {
    const { database, evidence } = setup()
    const service = new LocalOcrSubtitleService(database, evidence, () => 'python.exe', temporalRuntime())
    try {
      const first = await service.extractFixedRegionIndependently({ dramaId: 'drama', episodeId: 'episode' })
      const second = await service.extractFixedRegionIndependently({ dramaId: 'drama', episodeId: 'episode' })
      expect(evidence.listTracks('drama', 'episode').filter(({ sourceKind }) => sourceKind === 'ocr')).toEqual([expect.objectContaining({ id: second.id })])
      expect(database.prepare('SELECT status FROM subtitle_tracks WHERE id = ?').get(first.id)).toEqual({ status: 'archived' })
    } finally { database.close() }
  })

  it('keeps an existing OCR result active when the replacement attempt fails', async () => {
    const { database, evidence } = setup()
    const existing = evidence.createTrack({ dramaId: 'drama', episodeId: 'episode', sourceKind: 'ocr', label: 'OCR', cues: [{ index: 1, startSeconds: 1, endSeconds: 2, text: 'previous result' }] })
    const service = new LocalOcrSubtitleService(database, evidence, () => 'python.exe', temporalRuntime({ readJson: async () => ({ ok: false, error: { message: 'OCR failed' } }) }))
    try {
      await expect(service.extractFixedRegionIndependently({ dramaId: 'drama', episodeId: 'episode' })).rejects.toThrow('OCR failed')
      expect(evidence.listTracks('drama', 'episode').filter(({ sourceKind }) => sourceKind === 'ocr')).toEqual([expect.objectContaining({ id: existing.id })])
      expect(database.prepare('SELECT status FROM subtitle_tracks WHERE id = ?').get(existing.id)).toEqual({ status: 'active' })
    } finally { database.close() }
  })
})

const temporalRuntime = (overrides: Partial<{
  writeJson: (path: string, value: unknown) => Promise<void>
  readJson: (path: string) => Promise<unknown>
}> = {}) => ({
  resolveFfmpeg: () => 'ffmpeg.exe',
  resolvePythonRunner: () => 'temporal_ocr_runner.py',
  createTempDirectory: async () => 'C:\\temp\\ocr',
  removeTempDirectory: async () => undefined,
  writeJson: overrides.writeJson ?? (async () => undefined),
  readJson: overrides.readJson ?? (async () => ({ ok: true, stats: {}, cues: [{ startSeconds: 1, endSeconds: 2, text: '字幕', confidence: 0.9 }] })),
  run: async (command: string) => processResult(command)
})

const processResult = (command: string): ProcessResult => ({ command, stdout: '', stderr: '', exitCode: 0, signal: null, durationMs: 1 })

const setup = (): { database: Database.Database; evidence: SubtitleEvidenceService; asrTrackId: string } => {
  const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database); const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Demo', now, now)
  database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('episode', 'drama', 1, 0, 'episode.mp4', 10, 'ready', now, now)
  const evidence = new SubtitleEvidenceService(database); evidence.setOcrRegion('drama', 'episode', { x: 0.1, y: 0.72, width: 0.8, height: 0.2 })
  const asrTrackId = evidence.createTrack({ dramaId: 'drama', episodeId: 'episode', sourceKind: 'asr', label: 'ASR', cues: [{ index: 1, startSeconds: 1, endSeconds: 3, text: '锚点', confidence: 0.9 }] }).id
  return { database, evidence, asrTrackId }
}
