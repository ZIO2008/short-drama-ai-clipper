import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from './migrate.js'

const databases: Database.Database[] = []

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close()
  }
})

describe('migrateDatabase', () => {
  it('creates the P0 schema once and supports repeat startup', () => {
    const database = new Database(':memory:')
    databases.push(database)

    migrateDatabase(database)
    migrateDatabase(database)

    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>
    expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining(['ai_drafts', 'ai_evidence', 'app_logs', 'clip_export_batches', 'clip_subtitle_variants', 'drama_covers', 'drama_import_preferences', 'dramas', 'episodes', 'evaluation_runs', 'notifications', 'production_tasks', 'schema_migrations', 'secret_records', 'subtitle_conflicts', 'subtitle_cues', 'subtitle_ocr_regions', 'subtitle_quality_evaluations', 'subtitle_recognition_settings', 'subtitle_tracks', 'timeline_projects']))
    expect(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 25 })
    expect(database.prepare('PRAGMA table_info(clip_export_batches)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'reason' })]))
    expect(database.prepare('PRAGMA table_info(task_items)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'export_batch_id' })]))
    expect(database.prepare('PRAGMA table_info(generated_materials)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'draft_id' })]))
    expect(database.prepare('PRAGMA table_info(episodes)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'video_width' }), expect.objectContaining({ name: 'video_height' })]))
  })

  it('upgrades an export-batch table from migration 20 without losing its batch rows', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('legacy-drama', '旧批次剧目', '2026-07-31T00:00:00.000Z', '2026-07-31T00:00:00.000Z')
    database.exec("DROP TABLE clip_export_batches; CREATE TABLE clip_export_batches (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL, candidate_ids_json TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'cancelled')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
    database.prepare('INSERT INTO clip_export_batches VALUES (?, ?, ?, ?, ?, ?)').run('legacy-batch', 'legacy-drama', '["candidate-1"]', 'cancelled', '2026-07-31T00:00:00.000Z', '2026-07-31T00:01:00.000Z')
    database.prepare('DELETE FROM schema_migrations WHERE version = 21').run()

    migrateDatabase(database)

    expect(database.prepare('SELECT id, status, reason FROM clip_export_batches').get()).toEqual({ id: 'legacy-batch', status: 'cancelled', reason: null })
    expect(() => database.prepare("INSERT INTO clip_export_batches (id, drama_id, candidate_ids_json, status, reason, created_at, updated_at) VALUES ('failed-batch', 'legacy-drama', '[]', 'failed', '真实失败', '2026-07-31', '2026-07-31')").run()).not.toThrow()
  })

  it('adds export-batch ownership to a database that recorded migration 21 without the new task-item column', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    database.exec('DROP TABLE task_items; CREATE TABLE task_items (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, planned_range TEXT, actual_range TEXT, status TEXT NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0, reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
    database.prepare('DELETE FROM schema_migrations WHERE version = 22').run()

    migrateDatabase(database)

    expect(database.prepare('PRAGMA table_info(task_items)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'export_batch_id' })]))
  })

  it('persists one constrained subtitle-recognition setting row per drama', () => {
    const database = new Database(':memory:')
    databases.push(database)
    database.pragma('foreign_keys = ON')
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('subtitle-drama', '字幕设置剧目', now, now)
    database.prepare("INSERT INTO subtitle_recognition_settings (drama_id, scope, language, asr_mode, ocr_mode, difference_threshold, import_strategy, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('subtitle-drama', 'missing', 'zh-en', 'denoise', 'fixed-bottom', 'strict', 'review-only', now)
    expect(database.prepare('SELECT scope, language, asr_mode, ocr_mode, difference_threshold, import_strategy FROM subtitle_recognition_settings WHERE drama_id = ?').get('subtitle-drama')).toEqual({ scope: 'missing', language: 'zh-en', asr_mode: 'denoise', ocr_mode: 'fixed-bottom', difference_threshold: 'strict', import_strategy: 'review-only' })
    expect(() => database.prepare("INSERT INTO subtitle_recognition_settings (drama_id, scope, language, asr_mode, ocr_mode, difference_threshold, import_strategy, updated_at) VALUES (?, 'invalid', 'zh-CN', 'audio-first', 'auto-region', 'standard', 'parallel', ?)").run('subtitle-drama', now)).toThrow()
    database.prepare('DELETE FROM dramas WHERE id = ?').run('subtitle-drama')
    expect(database.prepare('SELECT COUNT(*) AS count FROM subtitle_recognition_settings').get()).toEqual({ count: 0 })
  })

  it('migrates legacy display-only subtitle settings into manual-review evidence settings', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('legacy-subtitle-drama', '旧字幕设置剧目', now, now)
    database.exec("DROP TABLE subtitle_recognition_settings; CREATE TABLE subtitle_recognition_settings (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, scope TEXT NOT NULL CHECK (scope IN ('all', 'current', 'missing')), language TEXT NOT NULL CHECK (language IN ('zh-CN', 'zh-en', 'auto')), asr_mode TEXT NOT NULL CHECK (asr_mode IN ('audio-first', 'denoise', 'import-only')), ocr_mode TEXT NOT NULL CHECK (ocr_mode IN ('auto-region', 'fixed-bottom', 'episode-manual')), difference_threshold TEXT NOT NULL CHECK (difference_threshold IN ('standard', 'strict', 'loose')), import_strategy TEXT NOT NULL CHECK (import_strategy IN ('parallel', 'display-only', 'review-only')), updated_at TEXT NOT NULL)")
    database.prepare("INSERT INTO subtitle_recognition_settings VALUES (?, 'all', 'zh-CN', 'audio-first', 'auto-region', 'standard', 'display-only', ?)").run('legacy-subtitle-drama', now)
    database.prepare('DELETE FROM schema_migrations WHERE version = 24').run()

    migrateDatabase(database)

    expect(database.prepare('SELECT import_strategy AS importStrategy FROM subtitle_recognition_settings WHERE drama_id = ?').get('legacy-subtitle-drama')).toEqual({ importStrategy: 'review-only' })
    expect(() => database.prepare("UPDATE subtitle_recognition_settings SET import_strategy = 'display-only' WHERE drama_id = 'legacy-subtitle-drama'").run()).toThrow()
  })

  it('repairs a missing import-preferences table even when migration 9 was recorded', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    database.exec('DROP TABLE drama_import_preferences')
    migrateDatabase(database)
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drama_import_preferences'").get()).toEqual({ name: 'drama_import_preferences' })
  })

  it('repairs a missing cover table even when migration 10 was recorded', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    database.exec('DROP TABLE drama_covers')
    migrateDatabase(database)
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'drama_covers'").get()).toEqual({ name: 'drama_covers' })
  })

  it('adds Phase 1 tables and indexes to an existing v1 database', () => {
    const database = new Database(':memory:')
    databases.push(database)
    database.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE dramas (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE production_tasks (
        id TEXT PRIMARY KEY,
        drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        config_snapshot TEXT NOT NULL,
        status TEXT NOT NULL,
        progress_current INTEGER NOT NULL DEFAULT 0,
        progress_total INTEGER NOT NULL DEFAULT 0,
        checkpoint TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE notifications (
        id TEXT PRIMARY KEY,
        drama_id TEXT REFERENCES dramas(id) ON DELETE SET NULL,
        task_id TEXT REFERENCES production_tasks(id) ON DELETE SET NULL,
        task_item_id TEXT,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        action_target TEXT,
        read_at TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, applied_at) VALUES (1, '2026-07-18T00:00:00.000Z');
      INSERT INTO dramas (id, name, created_at, updated_at) VALUES ('drama-1', '旧剧目', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z');
      INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, created_at, updated_at)
      VALUES ('task-1', 'drama-1', 'stitch', '{}', 'queued', '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z');
      INSERT INTO notifications (
        id, drama_id, task_id, severity, title, summary, created_at, updated_at
      ) VALUES (
        'notice-1', 'drama-1', 'task-1', 'warning', '旧通知', '保留这条记录',
        '2026-07-18T00:00:00.000Z', '2026-07-18T00:00:00.000Z'
      );
    `)

    migrateDatabase(database)

    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as Array<{ name: string }>
    const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name").all() as Array<{ name: string }>
    expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining(['app_logs', 'secret_records']))
    expect(indexes.map(({ name }) => name)).toEqual(expect.arrayContaining(['idx_logs_created', 'idx_notifications_read_created']))
    expect(database.prepare('SELECT version FROM schema_migrations WHERE version = 5').get()).toEqual({ version: 5 })
    expect(database.prepare('SELECT cost_json, status FROM production_tasks WHERE id = ?').get('task-1')).toEqual({ cost_json: '{}', status: 'queued' })
    expect(database.prepare('PRAGMA table_info(notifications)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'event_key' })]))
    expect(database.prepare('SELECT summary, event_key, occurred_at FROM notifications WHERE id = ?').get('notice-1')).toEqual({
      summary: '保留这条记录', event_key: null, occurred_at: '2026-07-18T00:00:00.000Z'
    })
  })

  it('deduplicates legacy provider defaults before enforcing one profile per capability', () => {
    const database = new Database(':memory:')
    databases.push(database)
    database.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations (version, applied_at) VALUES
        (1, '2026-07-18T00:00:00.000Z'), (2, '2026-07-18T00:00:00.000Z'),
        (3, '2026-07-18T00:00:00.000Z'), (4, '2026-07-18T00:00:00.000Z'),
        (5, '2026-07-18T00:00:00.000Z'), (6, '2026-07-18T00:00:00.000Z'),
        (7, '2026-07-18T00:00:00.000Z');
      CREATE TABLE provider_profiles (
        id TEXT PRIMARY KEY, capability TEXT NOT NULL, region TEXT NOT NULL, provider TEXT NOT NULL,
        endpoint TEXT, model TEXT, secret_ref TEXT, pricing_json TEXT, timeout_ms INTEGER,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO provider_profiles VALUES
        ('older', 'asr', 'local', '旧方案', NULL, NULL, NULL, NULL, 60000, '2026-07-17', '2026-07-17'),
        ('newer', 'asr', 'local', '新方案', NULL, NULL, NULL, NULL, 60000, '2026-07-18', '2026-07-18');
    `)

    migrateDatabase(database)

    expect(database.prepare('SELECT id, provider FROM provider_profiles').all()).toEqual([{ id: 'newer', provider: '新方案' }])
    expect(() => database.prepare("INSERT INTO provider_profiles VALUES ('duplicate', 'asr', 'local', '重复', NULL, NULL, NULL, NULL, 60000, '2026-07-19', '2026-07-19')").run()).toThrow()
  })

  it('maps legacy semantic capability names without losing the newest secret reference', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    database.exec('DROP INDEX ux_provider_profiles_capability')
    database.prepare("INSERT INTO provider_profiles VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, 60000, ?, ?)").run('legacy', 'text_semantics', 'global', '旧语义方案', 'legacy-secret-ref', '2026-07-20', '2026-07-20')
    database.prepare("INSERT INTO provider_profiles VALUES (?, ?, ?, ?, NULL, NULL, ?, NULL, 60000, ?, ?)").run('canonical', 'text-analysis', 'global', '新语义方案', 'canonical-secret-ref', '2026-07-21', '2026-07-21')
    database.prepare('DELETE FROM schema_migrations WHERE version = 14').run()
    migrateDatabase(database)
    expect(database.prepare('SELECT capability, provider, secret_ref FROM provider_profiles').all()).toEqual([{ capability: 'text-analysis', provider: '新语义方案', secret_ref: 'canonical-secret-ref' }])
  })

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

})
