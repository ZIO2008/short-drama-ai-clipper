import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from './migrate.js'

const databases: Database.Database[] = []

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close()
  }
})
describe('migrateDatabase subtitle and project guards', () => {
  it('upgrades a migration-15 subtitle evidence database with the new audit columns intact', () => {
    const database = new Database(':memory:')
    databases.push(database)
    database.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      WITH RECURSIVE versions(version) AS (SELECT 1 UNION ALL SELECT version + 1 FROM versions WHERE version < 15)
      INSERT INTO schema_migrations (version, applied_at) SELECT version, '2026-07-29T00:00:00.000Z' FROM versions;
      CREATE TABLE dramas (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE episodes (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL, episode_no INTEGER, sort_order INTEGER NOT NULL, source_path TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE subtitle_assets (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL, episode_id TEXT, source_path TEXT NOT NULL, format TEXT NOT NULL, cue_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE subtitle_tracks (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL, episode_id TEXT, asset_id TEXT, source_kind TEXT NOT NULL, label TEXT NOT NULL, language TEXT NOT NULL, status TEXT NOT NULL, cue_count INTEGER NOT NULL, cost_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE subtitle_cues (id TEXT PRIMARY KEY, track_id TEXT NOT NULL, cue_index INTEGER NOT NULL, start_seconds REAL NOT NULL, end_seconds REAL NOT NULL, text TEXT NOT NULL, confidence REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE subtitle_ocr_regions (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL, episode_id TEXT, scope TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, width REAL NOT NULL, height REAL NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE subtitle_conflicts (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL, episode_id TEXT, asr_cue_id TEXT NOT NULL, ocr_cue_id TEXT NOT NULL, time_overlap_seconds REAL NOT NULL, text_similarity REAL NOT NULL, status TEXT NOT NULL, resolved_text TEXT, resolved_start_seconds REAL, resolved_end_seconds REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE subtitle_quality_evaluations (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL, episode_id TEXT, source_kind TEXT NOT NULL, sample_label TEXT NOT NULL, reference_characters INTEGER NOT NULL, differing_characters INTEGER NOT NULL, conflict_count INTEGER NOT NULL, estimated_cost REAL NOT NULL, actual_cost REAL NOT NULL, notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    `)
    migrateDatabase(database)
    expect(database.prepare('SELECT version FROM schema_migrations WHERE version = 16').get()).toEqual({ version: 16 })
    expect(database.prepare('PRAGMA table_info(subtitle_tracks)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'base_track_id' })]))
    expect(database.prepare('PRAGMA table_info(subtitle_conflicts)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'asr_confidence' }), expect.objectContaining({ name: 'ocr_confidence' })]))
    expect(database.prepare('PRAGMA table_info(subtitle_quality_evaluations)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'evaluated_cue_count' }), expect.objectContaining({ name: 'elapsed_ms' })]))
  })

  it('safely assigns a uniquely identifiable legacy subtitle asset to its episode', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('d1', '剧目', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('episode-1', 'd1', 1, 1, '01.mp4', 'ready', now, now)
    database.prepare('INSERT INTO subtitle_assets (id, drama_id, episode_id, source_path, format, cue_count, status, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)').run('asset-1', 'd1', 'D:\\captions\\01（戏后）.srt', 'srt', 1, 'ready', now, now)
    database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, asset_id, source_kind, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, NULL, ?, 'import', ?, 'zh-CN', 'active', 1, '{}', ?, ?)").run('track-1', 'd1', 'asset-1', '导入 SRT', now, now)
    database.prepare('DELETE FROM schema_migrations WHERE version = 26').run()

    migrateDatabase(database)

    expect(database.prepare('SELECT episode_id AS episodeId FROM subtitle_assets WHERE id = ?').get('asset-1')).toEqual({ episodeId: 'episode-1' })
    expect(database.prepare('SELECT episode_id AS episodeId FROM subtitle_tracks WHERE id = ?').get('track-1')).toEqual({ episodeId: 'episode-1' })
  })

  it('leaves a legacy subtitle asset unassigned when its episode number is duplicated', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.pragma('foreign_keys = OFF')
    database.exec('DROP TABLE episodes; CREATE TABLE episodes (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL, episode_no INTEGER, sort_order INTEGER NOT NULL, source_path TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('d1', '剧目', now, now)
    const insertEpisode = database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    insertEpisode.run('episode-1a', 'd1', 1, 1, '01a.mp4', 'ready', now, now)
    insertEpisode.run('episode-1b', 'd1', 1, 2, '01b.mp4', 'ready', now, now)
    database.prepare('INSERT INTO subtitle_assets (id, drama_id, episode_id, source_path, format, cue_count, status, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)').run('asset-1', 'd1', 'D:\\captions\\01.srt', 'srt', 1, 'ready', now, now)
    database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, asset_id, source_kind, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, NULL, ?, 'import', ?, 'zh-CN', 'active', 1, '{}', ?, ?)").run('track-1', 'd1', 'asset-1', '导入 SRT', now, now)
    database.prepare('DELETE FROM schema_migrations WHERE version = 26').run()

    migrateDatabase(database)

    expect(database.prepare('SELECT episode_id AS episodeId FROM subtitle_assets WHERE id = ?').get('asset-1')).toEqual({ episodeId: null })
    expect(database.prepare('SELECT episode_id AS episodeId FROM subtitle_tracks WHERE id = ?').get('track-1')).toEqual({ episodeId: null })
  })

  it('backfills each distinct legacy subtitle asset when they uniquely identify the same episode', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('d1', '剧目', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('episode-1', 'd1', 1, 1, '01.mp4', 'ready', now, now)
    const insertAsset = database.prepare('INSERT INTO subtitle_assets (id, drama_id, episode_id, source_path, format, cue_count, status, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)')
    insertAsset.run('asset-original', 'd1', 'D:\\captions\\01.srt', 'srt', 1, 'ready', now, now)
    insertAsset.run('asset-revised', 'd1', 'D:\\captions\\01（修订）.srt', 'srt', 1, 'ready', now, now)
    const insertTrack = database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, asset_id, source_kind, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, NULL, ?, 'import', ?, 'zh-CN', 'active', 1, '{}', ?, ?)")
    insertTrack.run('track-original', 'd1', 'asset-original', '导入 SRT', now, now)
    insertTrack.run('track-revised', 'd1', 'asset-revised', '导入 SRT', now, now)

    migrateDatabase(database)

    expect(database.prepare('SELECT id, episode_id AS episodeId FROM subtitle_assets ORDER BY id').all()).toEqual([
      { id: 'asset-original', episodeId: 'episode-1' },
      { id: 'asset-revised', episodeId: 'episode-1' }
    ])
    expect(database.prepare('SELECT id, episode_id AS episodeId FROM subtitle_tracks ORDER BY id').all()).toEqual([
      { id: 'track-original', episodeId: 'episode-1' },
      { id: 'track-revised', episodeId: 'episode-1' }
    ])
  })

  it('leaves a legacy subtitle asset unassigned when the episode already has the same source path', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('d1', '剧目', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('episode-1', 'd1', 1, 1, '01.mp4', 'ready', now, now)
    const insertAsset = database.prepare('INSERT INTO subtitle_assets (id, drama_id, episode_id, source_path, format, cue_count, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    insertAsset.run('asset-bound', 'd1', 'episode-1', 'D:\\captions\\01.srt', 'srt', 1, 'ready', now, now)
    insertAsset.run('asset-legacy', 'd1', null, 'D:\\captions\\01.srt', 'srt', 1, 'ready', now, now)
    database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, asset_id, source_kind, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, NULL, ?, 'import', ?, 'zh-CN', 'active', 1, '{}', ?, ?)").run('track-legacy', 'd1', 'asset-legacy', '导入 SRT', now, now)
    database.prepare('DELETE FROM schema_migrations WHERE version = 26').run()

    expect(() => migrateDatabase(database)).not.toThrow()
    expect(database.prepare('SELECT episode_id AS episodeId FROM subtitle_assets WHERE id = ?').get('asset-legacy')).toEqual({ episodeId: null })
    expect(database.prepare('SELECT episode_id AS episodeId FROM subtitle_tracks WHERE id = ?').get('track-legacy')).toEqual({ episodeId: null })
  })

  it('guards new project records against duplicate names and cross-project material links', () => {
    const database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    databases.push(database)
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('d1', '同名剧目', now, now)
    expect(() => database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('d2', ' 同名剧目 ', now, now)).toThrow('DUPLICATE_DRAMA_NAME')
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('d3', '另一部', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('episode-1', 'd1', 1, 0, 'episode.mp4', 'ready', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('episode-2', 'd3', 1, 0, 'other.mp4', 'ready', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('task-1', 'd1', 'original_clip', '{}', 'completed', 0, 0, now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('task-2', 'd3', 'original_clip', '{}', 'completed', 0, 0, now, now)
    database.prepare('INSERT INTO task_items (id, task_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('item-1', 'task-1', 'completed', now, now)
    database.prepare('INSERT INTO task_items (id, task_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('item-2', 'task-2', 'completed', now, now)
    expect(() => database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('material-1', 'd3', 'task-1', 'wrong.mp4', now, now)).toThrow('CROSS_PROJECT_MATERIAL')
    database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('material-2', 'd1', 'task-1', 'item-1', 'right.mp4', now, now)
    expect(() => database.prepare('UPDATE generated_materials SET task_item_id = ? WHERE id = ?').run('item-2', 'material-2')).toThrow('CROSS_PROJECT_MATERIAL')
    expect(() => database.prepare('INSERT INTO subtitle_assets (id, drama_id, episode_id, source_path, format, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('subtitle-1', 'd1', 'episode-2', 'wrong.srt', 'srt', 'ready', now, now)).toThrow('CROSS_PROJECT_SUBTITLE')
    expect(() => database.prepare('UPDATE episodes SET drama_id = ? WHERE id = ?').run('d3', 'episode-1')).toThrow('IMMUTABLE_PROJECT_OWNERSHIP')
    expect(() => database.prepare('UPDATE production_tasks SET drama_id = ? WHERE id = ?').run('d3', 'task-1')).toThrow('IMMUTABLE_PROJECT_OWNERSHIP')
    database.prepare('INSERT INTO ai_evidence (id, drama_id, episode_id, source_type, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('evidence-1', 'd1', 'episode-1', 'scene', '证据', now, now)
    expect(() => database.prepare('UPDATE ai_evidence SET drama_id = ? WHERE id = ?').run('d3', 'evidence-1')).toThrow('CROSS_PROJECT_EVIDENCE')
  })

  it('adds nullable OCR runner identity columns without rebuilding recognition history', () => {
    const database = new Database(':memory:')
    database.pragma('foreign_keys = ON')
    databases.push(database)
    migrateDatabase(database)
    database.exec('DROP TABLE subtitle_recognition_run_items; DROP TABLE subtitle_recognition_runs; CREATE TABLE subtitle_recognition_runs (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL, status TEXT NOT NULL, settings_json TEXT NOT NULL, episode_ids_json TEXT NOT NULL, total_count INTEGER NOT NULL, completed_count INTEGER NOT NULL, failed_count INTEGER NOT NULL, current_episode_id TEXT, reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
    database.prepare('INSERT INTO subtitle_recognition_runs (id, drama_id, status, settings_json, episode_ids_json, total_count, completed_count, failed_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)').run('legacy-run', 'd1', 'interrupted', '{}', '[]', 1, '2026-08-08', '2026-08-08')
    database.prepare('DELETE FROM schema_migrations WHERE version = 29').run()

    migrateDatabase(database)

    expect(database.prepare('PRAGMA table_info(subtitle_recognition_runs)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'ocr_runner_build_id' }), expect.objectContaining({ name: 'ocr_runner_sha256' })]))
    expect(database.prepare('SELECT id, ocr_runner_build_id AS buildId, ocr_runner_sha256 AS sha256 FROM subtitle_recognition_runs WHERE id = ?').get('legacy-run')).toEqual({ id: 'legacy-run', buildId: null, sha256: null })
  })
})
