import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { INITIAL_SCHEMA } from './schema.js'
import { createClipSubtitleVariantTable as createSharedClipSubtitleVariantTable, createProjectLibraryGuards as createSharedProjectLibraryGuards } from './project-library-guards.js'
import { createP1Tables as createSharedP1Tables } from './p1-schema.js'
import { addSubtitleEvidenceColumns, createSubtitleEvidenceTables, normalizeProviderCapabilities } from './subtitle-evidence-schema.js'

export const openDatabase = (databasePath: string): Database.Database => {
  mkdirSync(dirname(databasePath), { recursive: true })

  const database = new Database(databasePath)
  database.pragma('foreign_keys = ON')
  database.pragma('journal_mode = WAL')
  migrateDatabase(database)
  return database
}

export const migrateDatabase = (database: Database.Database): void => {
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)')
  const apply = database.transaction(() => {
    if (!hasMigration(database, 1)) {
      applySchema(database)
      recordMigration(database, 1)
    }
    if (!hasMigration(database, 2)) {
      applySchema(database, true)
      recordMigration(database, 2)
    }
    if (!hasMigration(database, 3)) {
      addColumnIfMissing(database, 'production_tasks', 'cost_json', "TEXT NOT NULL DEFAULT '{}'")
      recordMigration(database, 3)
    }
    if (!hasMigration(database, 4)) {
      addColumnIfMissing(database, 'notifications', 'event_key', 'TEXT')
      database.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_event_key ON notifications (event_key)')
      recordMigration(database, 4)
    }
    if (!hasMigration(database, 5)) {
      addColumnIfMissing(database, 'notifications', 'occurred_at', 'TEXT')
      database.exec('UPDATE notifications SET occurred_at = COALESCE(occurred_at, updated_at, created_at)')
      recordMigration(database, 5)
    }
    if (!hasMigration(database, 6)) {
      database.exec('CREATE TABLE IF NOT EXISTS script_asset_segments (id TEXT PRIMARY KEY, script_asset_id TEXT NOT NULL REFERENCES script_assets(id) ON DELETE CASCADE, episode_no INTEGER NOT NULL, title TEXT NOT NULL, extracted_text TEXT NOT NULL, episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (script_asset_id, episode_no))')
      recordMigration(database, 6)
    }
    if (!hasMigration(database, 7)) {
      database.exec('CREATE TABLE IF NOT EXISTS subtitle_assets (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL, source_path TEXT NOT NULL, format TEXT NOT NULL, cue_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
      recordMigration(database, 7)
    }
    if (!hasMigration(database, 8)) {
      database.exec(`DELETE FROM provider_profiles WHERE id IN (
        SELECT older.id FROM provider_profiles older
        JOIN provider_profiles newer ON newer.capability = older.capability
          AND (newer.updated_at > older.updated_at OR (newer.updated_at = older.updated_at AND newer.id > older.id))
      )`)
      database.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_profiles_capability ON provider_profiles (capability)')
      recordMigration(database, 8)
    }
    if (!hasMigration(database, 9)) {
      database.exec('CREATE TABLE IF NOT EXISTS drama_import_preferences (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, last_import_directory TEXT NOT NULL, updated_at TEXT NOT NULL)')
      recordMigration(database, 9)
    }
    if (!hasMigration(database, 10)) {
      database.exec("CREATE TABLE IF NOT EXISTS drama_covers (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, source_kind TEXT NOT NULL CHECK (source_kind IN ('uploaded', 'auto_frame')), path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
      recordMigration(database, 10)
    }
    if (!hasMigration(database, 11)) {
      createSharedP1Tables(database)
      recordMigration(database, 11)
    }
    if (!hasMigration(database, 12)) {
      if (tableExists(database, 'generated_materials')) addColumnIfMissing(database, 'generated_materials', 'draft_id', 'TEXT REFERENCES ai_drafts(id) ON DELETE SET NULL')
      recordMigration(database, 12)
    }
    if (!hasMigration(database, 13)) {
      createSharedProjectLibraryGuards(database)
      recordMigration(database, 13)
    }
    if (!hasMigration(database, 14)) {
      normalizeProviderCapabilities(database)
      recordMigration(database, 14)
    }
    if (!hasMigration(database, 15)) {
      createSubtitleEvidenceTables(database)
      createSubtitleEvidenceGuards(database)
      recordMigration(database, 15)
    }
    if (!hasMigration(database, 16)) {
      addSubtitleEvidenceColumns(database)
      recordMigration(database, 16)
    }
    if (!hasMigration(database, 17)) {
      createSharedClipSubtitleVariantTable(database)
      recordMigration(database, 17)
    }
    if (!hasMigration(database, 18)) {
      createSubtitleRecognitionSettingsTable(database)
      recordMigration(database, 18)
    }
    if (!hasMigration(database, 19)) {
      if (tableExists(database, 'episodes')) {
        addColumnIfMissing(database, 'episodes', 'video_width', 'INTEGER')
        addColumnIfMissing(database, 'episodes', 'video_height', 'INTEGER')
      }
      recordMigration(database, 19)
    }
    if (!hasMigration(database, 20)) {
      createClipExportBatchesTable(database)
      recordMigration(database, 20)
    }
    if (!hasMigration(database, 21)) {
      upgradeClipExportBatchesTable(database)
      recordMigration(database, 21)
    }
    if (!hasMigration(database, 22)) {
      if (tableExists(database, 'task_items')) addColumnIfMissing(database, 'task_items', 'export_batch_id', 'TEXT')
      recordMigration(database, 22)
    }
    if (!hasMigration(database, 23)) {
      upgradeSubtitleConflictReviewStatus(database)
      recordMigration(database, 23)
    }
    if (!hasMigration(database, 24)) {
      upgradeSubtitleRecognitionSettings(database)
      recordMigration(database, 24)
    }
    if (!hasMigration(database, 25)) {
      createSubtitleAssetIdempotencyIndexes(database)
      recordMigration(database, 25)
    }
  })

  apply()
  // Repair databases from interrupted or pre-release migrations where version 9 was
  // recorded but its table was not persisted. This is idempotent on healthy databases.
  database.exec('CREATE TABLE IF NOT EXISTS drama_import_preferences (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, last_import_directory TEXT NOT NULL, updated_at TEXT NOT NULL)')
  // Repair pre-release databases that recorded the migration but lost the table.
  database.exec("CREATE TABLE IF NOT EXISTS drama_covers (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, source_kind TEXT NOT NULL CHECK (source_kind IN ('uploaded', 'auto_frame')), path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
  // P1 may have been partially installed by pre-release builds. Repair each table
  // independently so an interrupted migration cannot strand an existing P0 database.
  createSharedP1Tables(database)
  if (tableExists(database, 'generated_materials')) addColumnIfMissing(database, 'generated_materials', 'draft_id', 'TEXT REFERENCES ai_drafts(id) ON DELETE SET NULL')
  createSharedProjectLibraryGuards(database)
  normalizeProviderCapabilities(database)
  createSubtitleEvidenceTables(database)
  addSubtitleEvidenceColumns(database)
  createSubtitleEvidenceGuards(database)
  createSharedClipSubtitleVariantTable(database)
  createSubtitleRecognitionSettingsTable(database)
  upgradeSubtitleRecognitionSettings(database)
  createSubtitleAssetIdempotencyIndexes(database)
  createClipExportBatchesTable(database)
  if (tableExists(database, 'episodes')) {
    addColumnIfMissing(database, 'episodes', 'video_width', 'INTEGER')
    addColumnIfMissing(database, 'episodes', 'video_height', 'INTEGER')
  }
}

const createSubtitleRecognitionSettingsTable = (database: Database.Database): void => {
  database.exec("CREATE TABLE IF NOT EXISTS subtitle_recognition_settings (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, scope TEXT NOT NULL CHECK (scope IN ('all', 'current', 'missing')), language TEXT NOT NULL CHECK (language IN ('zh-CN', 'zh-en', 'auto')), asr_mode TEXT NOT NULL CHECK (asr_mode IN ('audio-first', 'denoise', 'import-only')), ocr_mode TEXT NOT NULL CHECK (ocr_mode IN ('auto-region', 'fixed-bottom', 'episode-manual')), difference_threshold TEXT NOT NULL CHECK (difference_threshold IN ('standard', 'strict', 'loose')), import_strategy TEXT NOT NULL CHECK (import_strategy IN ('parallel', 'review-only')), updated_at TEXT NOT NULL)")
}

const createSubtitleAssetIdempotencyIndexes = (database: Database.Database): void => {
  if (!tableExists(database, 'subtitle_assets')) return
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_assets_drama_global_source ON subtitle_assets (drama_id, source_path) WHERE episode_id IS NULL')
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_assets_drama_episode_source ON subtitle_assets (drama_id, episode_id, source_path) WHERE episode_id IS NOT NULL')
}

const upgradeSubtitleRecognitionSettings = (database: Database.Database): void => {
  if (!tableExists(database, 'subtitle_recognition_settings')) { createSubtitleRecognitionSettingsTable(database); return }
  const definition = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'subtitle_recognition_settings'").get() as { sql?: string } | undefined
  if (!definition?.sql?.includes("'display-only'")) return
  database.exec(`
    CREATE TABLE subtitle_recognition_settings_v24 (
      drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE,
      scope TEXT NOT NULL CHECK (scope IN ('all', 'current', 'missing')),
      language TEXT NOT NULL CHECK (language IN ('zh-CN', 'zh-en', 'auto')),
      asr_mode TEXT NOT NULL CHECK (asr_mode IN ('audio-first', 'denoise', 'import-only')),
      ocr_mode TEXT NOT NULL CHECK (ocr_mode IN ('auto-region', 'fixed-bottom', 'episode-manual')),
      difference_threshold TEXT NOT NULL CHECK (difference_threshold IN ('standard', 'strict', 'loose')),
      import_strategy TEXT NOT NULL CHECK (import_strategy IN ('parallel', 'review-only')),
      updated_at TEXT NOT NULL
    );
    INSERT INTO subtitle_recognition_settings_v24 (drama_id, scope, language, asr_mode, ocr_mode, difference_threshold, import_strategy, updated_at)
    SELECT drama_id, scope, language, asr_mode, ocr_mode, difference_threshold, CASE WHEN import_strategy = 'display-only' THEN 'review-only' ELSE import_strategy END, updated_at
    FROM subtitle_recognition_settings;
    DROP TABLE subtitle_recognition_settings;
    ALTER TABLE subtitle_recognition_settings_v24 RENAME TO subtitle_recognition_settings;
  `)
}

const createClipExportBatchesTable = (database: Database.Database): void => {
  database.exec("CREATE TABLE IF NOT EXISTS clip_export_batches (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, candidate_ids_json TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'cancelled', 'failed')), reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
  database.exec('CREATE INDEX IF NOT EXISTS ix_clip_export_batches_drama_updated ON clip_export_batches (drama_id, updated_at DESC)')
}

const upgradeSubtitleConflictReviewStatus = (database: Database.Database): void => {
  if (!tableExists(database, 'subtitle_conflicts')) return
  const definition = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'subtitle_conflicts'").get() as { sql?: string } | undefined
  if (definition?.sql?.includes("'reviewed'")) return
  database.exec(`
    DROP INDEX IF EXISTS idx_subtitle_conflicts_drama_episode;
    CREATE TABLE subtitle_conflicts_v23 (
      id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
      asr_cue_id TEXT NOT NULL REFERENCES subtitle_cues(id) ON DELETE CASCADE, ocr_cue_id TEXT NOT NULL REFERENCES subtitle_cues(id) ON DELETE CASCADE,
      time_overlap_seconds REAL NOT NULL CHECK (time_overlap_seconds > 0), text_similarity REAL NOT NULL CHECK (text_similarity >= 0 AND text_similarity <= 1),
      asr_confidence REAL, ocr_confidence REAL, status TEXT NOT NULL CHECK (status IN ('open', 'resolved_asr', 'resolved_ocr', 'resolved_manual', 'reviewed')) DEFAULT 'open',
      resolved_text TEXT, resolved_start_seconds REAL, resolved_end_seconds REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    INSERT INTO subtitle_conflicts_v23 (id, drama_id, episode_id, asr_cue_id, ocr_cue_id, time_overlap_seconds, text_similarity, asr_confidence, ocr_confidence, status, resolved_text, resolved_start_seconds, resolved_end_seconds, created_at, updated_at)
    SELECT id, drama_id, episode_id, asr_cue_id, ocr_cue_id, time_overlap_seconds, text_similarity, asr_confidence, ocr_confidence, status, resolved_text, resolved_start_seconds, resolved_end_seconds, created_at, updated_at FROM subtitle_conflicts;
    DROP TABLE subtitle_conflicts;
    ALTER TABLE subtitle_conflicts_v23 RENAME TO subtitle_conflicts;
    CREATE INDEX IF NOT EXISTS idx_subtitle_conflicts_drama_episode ON subtitle_conflicts (drama_id, episode_id, status, created_at DESC);
  `)
}

const upgradeClipExportBatchesTable = (database: Database.Database): void => {
  if (!tableExists(database, 'clip_export_batches')) { createClipExportBatchesTable(database); return }
  const columns = database.prepare('PRAGMA table_info(clip_export_batches)').all() as Array<{ name: string }>
  if (columns.some((column) => column.name === 'reason')) { database.exec('CREATE INDEX IF NOT EXISTS ix_clip_export_batches_drama_updated ON clip_export_batches (drama_id, updated_at DESC)'); return }
  const reasonValue = columns.some((column) => column.name === 'reason') ? 'reason' : 'NULL'
  database.exec(`
    DROP INDEX IF EXISTS ix_clip_export_batches_drama_updated;
    CREATE TABLE clip_export_batches_v21 (
      id TEXT PRIMARY KEY,
      drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
      candidate_ids_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'cancelled', 'failed')),
      reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO clip_export_batches_v21 (id, drama_id, candidate_ids_json, status, reason, created_at, updated_at)
    SELECT id, drama_id, candidate_ids_json, status, ${reasonValue}, created_at, updated_at FROM clip_export_batches;
    DROP TABLE clip_export_batches;
    ALTER TABLE clip_export_batches_v21 RENAME TO clip_export_batches;
  `)
  database.exec('CREATE INDEX IF NOT EXISTS ix_clip_export_batches_drama_updated ON clip_export_batches (drama_id, updated_at DESC)')
}

const createSubtitleEvidenceGuards = (database: Database.Database): void => {
  if (['subtitle_tracks', 'subtitle_cues', 'subtitle_conflicts', 'subtitle_ocr_regions', 'subtitle_quality_evaluations'].some((table) => !tableExists(database, table))) return
  database.exec('DROP TRIGGER IF EXISTS trg_subtitle_tracks_same_drama_insert; DROP TRIGGER IF EXISTS trg_subtitle_tracks_same_drama_update; DROP TRIGGER IF EXISTS trg_subtitle_regions_same_drama_insert; DROP TRIGGER IF EXISTS trg_subtitle_regions_same_drama_update; DROP TRIGGER IF EXISTS trg_subtitle_conflicts_same_drama_insert; DROP TRIGGER IF EXISTS trg_subtitle_conflicts_same_drama_update;')
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_subtitle_tracks_same_drama_insert BEFORE INSERT ON subtitle_tracks
    WHEN (NEW.episode_id IS NOT NULL AND (SELECT drama_id FROM episodes WHERE id = NEW.episode_id) <> NEW.drama_id) OR (NEW.asset_id IS NOT NULL AND (SELECT drama_id FROM subtitle_assets WHERE id = NEW.asset_id) <> NEW.drama_id) OR (NEW.base_track_id IS NOT NULL AND (SELECT drama_id FROM subtitle_tracks WHERE id = NEW.base_track_id) <> NEW.drama_id)
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_SUBTITLE_TRACK'); END;
    CREATE TRIGGER IF NOT EXISTS trg_subtitle_tracks_same_drama_update BEFORE UPDATE OF drama_id, episode_id, asset_id, base_track_id ON subtitle_tracks
    WHEN (NEW.episode_id IS NOT NULL AND (SELECT drama_id FROM episodes WHERE id = NEW.episode_id) <> NEW.drama_id) OR (NEW.asset_id IS NOT NULL AND (SELECT drama_id FROM subtitle_assets WHERE id = NEW.asset_id) <> NEW.drama_id) OR (NEW.base_track_id IS NOT NULL AND (SELECT drama_id FROM subtitle_tracks WHERE id = NEW.base_track_id) <> NEW.drama_id)
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_SUBTITLE_TRACK'); END;
    CREATE TRIGGER IF NOT EXISTS trg_subtitle_regions_same_drama_insert BEFORE INSERT ON subtitle_ocr_regions
    WHEN (NEW.scope = 'drama_default' AND NEW.episode_id IS NOT NULL) OR (NEW.scope = 'episode_override' AND (NEW.episode_id IS NULL OR (SELECT drama_id FROM episodes WHERE id = NEW.episode_id) <> NEW.drama_id))
    BEGIN SELECT RAISE(ABORT, 'INVALID_SUBTITLE_OCR_REGION'); END;
    CREATE TRIGGER IF NOT EXISTS trg_subtitle_regions_same_drama_update BEFORE UPDATE OF drama_id, episode_id, scope ON subtitle_ocr_regions
    WHEN (NEW.scope = 'drama_default' AND NEW.episode_id IS NOT NULL) OR (NEW.scope = 'episode_override' AND (NEW.episode_id IS NULL OR (SELECT drama_id FROM episodes WHERE id = NEW.episode_id) <> NEW.drama_id))
    BEGIN SELECT RAISE(ABORT, 'INVALID_SUBTITLE_OCR_REGION'); END;
    CREATE TRIGGER IF NOT EXISTS trg_subtitle_conflicts_same_drama_insert BEFORE INSERT ON subtitle_conflicts
    WHEN (SELECT drama_id FROM subtitle_tracks t JOIN subtitle_cues c ON c.track_id = t.id WHERE c.id = NEW.asr_cue_id) <> NEW.drama_id
      OR (SELECT source_kind FROM subtitle_tracks t JOIN subtitle_cues c ON c.track_id = t.id WHERE c.id = NEW.asr_cue_id) <> 'asr'
      OR (SELECT drama_id FROM subtitle_tracks t JOIN subtitle_cues c ON c.track_id = t.id WHERE c.id = NEW.ocr_cue_id) <> NEW.drama_id
      OR (SELECT source_kind FROM subtitle_tracks t JOIN subtitle_cues c ON c.track_id = t.id WHERE c.id = NEW.ocr_cue_id) <> 'ocr'
    BEGIN SELECT RAISE(ABORT, 'INVALID_SUBTITLE_CONFLICT'); END;
    CREATE TRIGGER IF NOT EXISTS trg_subtitle_conflicts_same_drama_update BEFORE UPDATE OF drama_id, episode_id, asr_cue_id, ocr_cue_id ON subtitle_conflicts
    WHEN (SELECT drama_id FROM subtitle_tracks t JOIN subtitle_cues c ON c.track_id = t.id WHERE c.id = NEW.asr_cue_id) <> NEW.drama_id
      OR (SELECT source_kind FROM subtitle_tracks t JOIN subtitle_cues c ON c.track_id = t.id WHERE c.id = NEW.asr_cue_id) <> 'asr'
      OR (SELECT drama_id FROM subtitle_tracks t JOIN subtitle_cues c ON c.track_id = t.id WHERE c.id = NEW.ocr_cue_id) <> NEW.drama_id
      OR (SELECT source_kind FROM subtitle_tracks t JOIN subtitle_cues c ON c.track_id = t.id WHERE c.id = NEW.ocr_cue_id) <> 'ocr'
    BEGIN SELECT RAISE(ABORT, 'INVALID_SUBTITLE_CONFLICT'); END;
  `)
}


const hasMigration = (database: Database.Database, version: number): boolean => {
  return database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version) !== undefined
}

const tableExists = (database: Database.Database, table: string): boolean => {
  return database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined
}

const applySchema = (database: Database.Database, skipNotificationEventIndex = false): void => {
  for (const statement of INITIAL_SCHEMA) {
    if (skipNotificationEventIndex && statement.includes('ux_notifications_event_key')) {
      continue
    }
    database.exec(statement)
  }
}

const recordMigration = (database: Database.Database, version: number): void => {
  database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString())
}

const addColumnIfMissing = (
  database: Database.Database,
  table: 'production_tasks' | 'notifications' | 'generated_materials' | 'episodes' | 'task_items',
  column: 'cost_json' | 'event_key' | 'occurred_at' | 'draft_id' | 'video_width' | 'video_height' | 'export_batch_id',
  definition: string
): void => {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some(({ name }) => name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

const addColumnIfPresent = (database: Database.Database, table: string, column: string, definition: string): void => {
  if (!tableExists(database, table)) return
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some(({ name }) => name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}
