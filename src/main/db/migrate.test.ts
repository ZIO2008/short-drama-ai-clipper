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
    expect(tables.map(({ name }) => name)).toEqual(expect.arrayContaining(['ai_drafts', 'ai_evidence', 'app_logs', 'clip_candidate_scene_anchors', 'clip_export_batches', 'clip_subtitle_variants', 'drama_covers', 'drama_import_preferences', 'dramas', 'episodes', 'evaluation_runs', 'model_studio_provisional_secrets', 'notifications', 'production_tasks', 'schema_migrations', 'secret_records', 'subtitle_conflicts', 'subtitle_cues', 'subtitle_ocr_regions', 'subtitle_quality_evaluations', 'subtitle_recognition_settings', 'subtitle_recognition_runs', 'subtitle_recognition_run_items', 'subtitle_tracks', 'timeline_projects']))
    expect(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 44 })
    expect(database.prepare('PRAGMA table_info(model_studio_provisional_secrets)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'capability' }), expect.objectContaining({ name: 'owner_id' })]))
    expect(database.prepare('PRAGMA table_info(provider_profiles)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'model_selection_source' })]))
    expect(database.prepare('PRAGMA table_info(clip_export_batches)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'reason' })]))
    expect(database.prepare('PRAGMA table_info(task_items)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'export_batch_id' })]))
    expect(database.prepare('PRAGMA table_info(generated_materials)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'draft_id' })]))
    expect(database.prepare('PRAGMA table_info(episodes)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'source_fingerprint' }), expect.objectContaining({ name: 'video_width' }), expect.objectContaining({ name: 'video_height' }), expect.objectContaining({ name: 'duration_alert_dismissed_at' })]))
    expect(database.prepare('PRAGMA table_info(clip_candidate_snapshots)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'task_id' }), expect.objectContaining({ name: 'task_round' })]))
    expect(database.prepare('PRAGMA table_info(clip_candidate_publish_pointers)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'task_id' }), expect.objectContaining({ name: 'task_round' })]))
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'clip_generation_rounds'").get()).toEqual({ name: 'clip_generation_rounds' })
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'clip_candidate_publish_members'").get()).toEqual({ name: 'clip_candidate_publish_members' })
    expect(database.prepare('PRAGMA table_info(clip_evidence_units)').all()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'coverage_json' }), expect.objectContaining({ name: 'source_version' })]))
    expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'clip_narrative_events'").get()).toEqual({ name: 'clip_narrative_events' })
  })

  it('adds the nullable source fingerprint to an existing episode table without changing episode rows', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('legacy-fingerprint-drama', '旧媒体指纹剧目', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('legacy-fingerprint-episode', 'legacy-fingerprint-drama', 1, 0, 'D:\\media\\01.mp4', 'ready', now, now)
    database.exec('ALTER TABLE episodes DROP COLUMN source_fingerprint')
    database.prepare('DELETE FROM schema_migrations WHERE version = 35').run()

    migrateDatabase(database)

    expect(database.prepare('SELECT id, source_path AS sourcePath, source_fingerprint AS sourceFingerprint FROM episodes WHERE id = ?').get('legacy-fingerprint-episode')).toEqual({ id: 'legacy-fingerprint-episode', sourcePath: 'D:\\media\\01.mp4', sourceFingerprint: null })
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

  it('maps legacy semantic capability names without dropping the only legacy secret reference', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    database.exec('DROP INDEX ux_provider_profiles_capability')
    database.prepare("INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, model_selection_source, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, NULL, 60000, ?, ?)").run('legacy', 'text_semantics', 'global', '旧语义方案', 'legacy-secret-ref', '2026-07-20', '2026-07-20')
    database.prepare("INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, model_selection_source, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, 60000, ?, ?)").run('canonical', 'text-analysis', 'global', '新语义方案', '2026-07-21', '2026-07-21')
    database.prepare('DELETE FROM schema_migrations WHERE version = 14').run()
    migrateDatabase(database)
    expect(database.prepare('SELECT id, capability, provider, secret_ref AS secretRef FROM provider_profiles').all()).toEqual([{ id: 'canonical', capability: 'text-analysis', provider: '新语义方案', secretRef: 'legacy-secret-ref' }])
  })

  it('keeps legacy unscoped Model Studio provisional records ineligible after adding their scope columns', () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    const secretRef = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    database.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(secretRef, Buffer.from('fixture'), '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z')
    database.prepare('INSERT INTO model_studio_provisional_secrets (secret_ref, capability, owner_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(secretRef, 'text-analysis', 'window-1', '2099-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z')
    database.exec('ALTER TABLE model_studio_provisional_secrets DROP COLUMN capability; ALTER TABLE model_studio_provisional_secrets DROP COLUMN owner_id')
    database.prepare('DELETE FROM schema_migrations WHERE version = 42').run()

    migrateDatabase(database)

    expect(database.prepare('SELECT capability, owner_id AS ownerId FROM model_studio_provisional_secrets WHERE secret_ref = ?').get(secretRef)).toEqual({ capability: null, ownerId: null })
  })
})
