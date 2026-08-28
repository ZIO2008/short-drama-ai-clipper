import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { OriginalClipService } from './original-clip-service.js'

describe('OriginalClipService intelligent-generation gate', () => {
  it('rejects imported reference-only subtitles before task or candidate persistence', () => {
    const database = new Database(':memory:')
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 80, 'ready', now, now)
    database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, source_kind, acquisition, evidence_nature, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES ('track', 'd', 'e', 'import', 'imported', 'reference_unknown', 'import', 'zh-CN', 'active', 2, '{}', ?, ?)").run(now, now)
    const insertCue = database.prepare('INSERT INTO subtitle_cues (id, track_id, cue_index, start_seconds, end_seconds, text, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)')
    insertCue.run('cue-1', 'track', 1, 1, 3, '第一句', now, now); insertCue.run('cue-2', 'track', 2, 6, 8, '第二句', now, now)
    const service = new OriginalClipService(database, undefined, { profiles: { list: () => [{ id: 'semantic', capability: 'text-analysis', region: 'local', provider: 'fixture', endpoint: 'http://127.0.0.1', model: 'fixture', secretRef: null, timeoutMs: 1_000, pricing: null }] }, hasValidSecret: () => true, adapter: { select: async () => ({ selections: [] }) } })
    const input = { episodeIds: ['e'], candidatesPerEpisode: 1, targetDurationSeconds: 3, maxOverlapRatio: 0.25, allowRepeat: false }
    expect(service.preflightGeneration('d', input)).toMatchObject({ eligibleEpisodeIds: [], estimatedCandidates: 0 })
    expect(() => service.startIntelligentGeneration('d', input)).toThrow('导入字幕尚未完成可追溯的画面对齐或声音对齐核验')
    expect(database.prepare("SELECT COUNT(*) AS count FROM production_tasks WHERE type = 'original_clip'").get()).toEqual({ count: 0 })
    expect(service.listCandidates('d')).toEqual([])
    database.close()
  })
})
