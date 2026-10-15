import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { anchorCandidateRanges, readAnchorReadiness } from './clip-anchor-readiness.js'
import { ClipEvidencePackageService } from './clip-evidence-package-service.js'
import { readSourceVideoFramePts } from '../media/scene-anchor-pts-verifier.js'

vi.mock('../media/media-source-fingerprint.js', () => ({ fingerprintMediaSource: () => 'media' }))
vi.mock('../media/scene-anchor-pts-verifier.js', () => ({ readSourceVideoPtsProbe: () => ({ durationSeconds: 180 }), readSourceVideoFramePts: vi.fn(() => null), isSourceFramePtsRange: () => false, SCENE_ANCHOR_PTS_VERIFIER_VERSION: 'test' }))

const fixture = (): Database.Database => {
  const db = new Database(':memory:'); db.pragma('foreign_keys = ON'); migrateDatabase(db)
  const now = new Date().toISOString()
  db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Local windows', now, now)
  db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'test.mp4', 'media', 180, 'ready', now, now)
  for (const kind of ['ocr', 'asr']) {
    db.prepare('INSERT INTO subtitle_tracks (id, drama_id, episode_id, source_kind, acquisition, evidence_nature, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(kind, 'd', 'e', kind, 'generated', kind === 'ocr' ? 'visual_aligned' : 'audio_aligned', kind, 'zh-CN', 'active', 4, kind === 'asr' ? '{"resultFormat":3,"sentenceMaxLength":40}' : '{}', now, now)
    const ranges = [[0, 5], [7, 12], [60, 65], [67, 72], ...(kind === 'asr' ? [[20, 50]] : [])]
    ranges.forEach(([start, end], index) => db.prepare('INSERT INTO subtitle_cues (id, track_id, cue_index, start_seconds, end_seconds, text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`${kind}-${index}`, kind, index + 1, start, end, `sentence ${index}`, now, now))
  }
  return db
}

describe('local subtitle qualification across preflight and immutable evidence', () => {
  it('does not preflight a scene-only candidate across unsupported gaps', () => {
    expect(anchorCandidateRanges([{ startSeconds: 0, endSeconds: 1, sceneAnchorId: 'a' }, { startSeconds: 60, endSeconds: 61, sceneAnchorId: 'b' }], 90, 90)).toEqual([])
    expect(anchorCandidateRanges([{ startSeconds: 0, endSeconds: 5, sceneAnchorId: 'a' }, { startSeconds: 60, endSeconds: 65, sceneAnchorId: 'b' }], 90, 90)).toHaveLength(2)
  })
  it('uses reliable islands automatically while preserving the coarse ASR cue as limited evidence', () => {
    const db = fixture()
    try {
      const before = db.prepare('SELECT * FROM subtitle_cues ORDER BY id').all()
      const readiness = readAnchorReadiness(db, new Map(), 'd', 'e', 180)
      expect(readSourceVideoFramePts).not.toHaveBeenCalled()
      expect(readiness.sourceKind).toBe('multi')
      expect(readiness.anchors.length).toBeGreaterThan(0)
      const service = new ClipEvidencePackageService(db)
      const evidence = service.build('d', 'e')
      expect(evidence).toMatchObject({ status: 'ready', ruleVersion: 'evidence-v6' })
      const units = db.prepare("SELECT source_ids_json AS ids, qualification FROM clip_evidence_units WHERE package_id = ? AND kind = 'subtitle-cue'").all(evidence.id) as Array<{ ids: string; qualification: string }>
      expect(units.find(unit => unit.ids === '["asr-4"]')?.qualification).toBe('B')
      expect(units.filter(unit => unit.qualification === 'A')).toHaveLength(8)
      const candidates = service.candidateRanges(evidence, 90)
      expect(candidates.length).toBeGreaterThan(0)
      expect(candidates.every(range => range.endSeconds <= 12 || range.startSeconds >= 60)).toBe(true)
      const windows = service.semanticWindows(evidence)
      expect(windows).toHaveLength(2)
      const all = windows.flatMap(window => window.evidenceIds)
      const crossing = { evidenceIds: all, startEvidenceId: all[0]!, endEvidenceId: all.at(-1)!, beat: 'reaction' as const, purpose: 'hook' as const, context: 'standalone' as const, narrative: { state: 'completion' as const, characters: [], relationship: 'fixture', conflict: 'fixture', continuity: 'continuous' as const } }
      expect(service.resolveSemanticSelection(evidence, crossing)).toBeNull()
      expect(service.qualifySemanticSelection(evidence, crossing).qualification).toBe('blocked')
      expect(db.prepare('SELECT * FROM subtitle_cues ORDER BY id').all()).toEqual(before)
    } finally { db.close() }
  })

  it('keeps missing ASR metadata and unknown imported provenance blocked', () => {
    const db = fixture()
    try {
      db.prepare("UPDATE subtitle_tracks SET cost_json = '{}' WHERE id = 'asr'").run()
      db.prepare("UPDATE subtitle_tracks SET source_kind='import', acquisition='imported', evidence_nature='reference_unknown' WHERE id='ocr'").run()
      expect(readAnchorReadiness(db, new Map(), 'd', 'e', 180).sourceKind).toBeNull()
      const service = new ClipEvidencePackageService(db)
      const evidence = service.build('d', 'e')
      expect(service.candidateRanges(evidence, 15)).toEqual([])
    } finally { db.close() }
  })
})
