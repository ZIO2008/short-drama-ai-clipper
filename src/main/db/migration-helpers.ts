import type Database from 'better-sqlite3'
import { INITIAL_SCHEMA } from './schema.js'
import { extractEpisodeNoFromSubtitlePath } from '../services/subtitle-episode-matcher.js'

export const createClipIntelligenceTables = (database: Database.Database): void => {
  database.exec(`CREATE TABLE IF NOT EXISTS clip_evidence_packages (
    id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE, version INTEGER NOT NULL CHECK (version > 0),
    source_media_fingerprint TEXT NOT NULL, rule_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('building', 'ready', 'failed')), evidence_json TEXT NOT NULL,
    reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (episode_id, version)
  );
  CREATE TABLE IF NOT EXISTS clip_evidence_units (
    id TEXT PRIMARY KEY, package_id TEXT NOT NULL REFERENCES clip_evidence_packages(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, start_seconds REAL NOT NULL CHECK (start_seconds >= 0), end_seconds REAL NOT NULL CHECK (end_seconds > start_seconds),
    source_ids_json TEXT NOT NULL, qualification TEXT NOT NULL CHECK (qualification IN ('A', 'B', 'C', 'D')),
    coverage_json TEXT NOT NULL DEFAULT '{}', source_version TEXT,
    reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clip_candidate_snapshots (
    id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    package_id TEXT NOT NULL REFERENCES clip_evidence_packages(id) ON DELETE RESTRICT,
    qualification TEXT NOT NULL CHECK (qualification IN ('qualified', 'qualified_with_limit', 'blocked')),
    config_json TEXT NOT NULL, provider_json TEXT NOT NULL, summary_json TEXT NOT NULL,
    task_id TEXT REFERENCES production_tasks(id) ON DELETE SET NULL, task_round INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clip_candidate_publish_pointers (
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL REFERENCES clip_candidate_snapshots(id) ON DELETE RESTRICT,
    task_id TEXT REFERENCES production_tasks(id) ON DELETE SET NULL, task_round INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL, PRIMARY KEY (drama_id, episode_id)
  );
  CREATE TABLE IF NOT EXISTS clip_candidate_publish_members (
    candidate_id TEXT PRIMARY KEY REFERENCES task_items(id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL REFERENCES clip_candidate_snapshots(id) ON DELETE CASCADE,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES production_tasks(id) ON DELETE CASCADE,
    task_round INTEGER NOT NULL CHECK (task_round > 0), created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clip_model_runs (
    id TEXT PRIMARY KEY, task_id TEXT REFERENCES production_tasks(id) ON DELETE SET NULL, package_id TEXT REFERENCES clip_evidence_packages(id) ON DELETE SET NULL,
    capability TEXT NOT NULL, status TEXT NOT NULL, provider TEXT, model TEXT, input_ids_json TEXT NOT NULL, result_json TEXT, reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS clip_candidate_feedback (
    id TEXT PRIMARY KEY, candidate_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE, snapshot_id TEXT REFERENCES clip_candidate_snapshots(id) ON DELETE SET NULL,
    reason_code TEXT NOT NULL, evidence_ids_json TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_clip_evidence_packages_episode ON clip_evidence_packages (episode_id, version DESC);
  CREATE INDEX IF NOT EXISTS idx_clip_evidence_units_package ON clip_evidence_units (package_id, start_seconds);
  CREATE INDEX IF NOT EXISTS idx_clip_candidate_snapshots_candidate ON clip_candidate_snapshots (candidate_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_clip_candidate_publish_members_episode_round ON clip_candidate_publish_members (drama_id, episode_id, task_id, task_round);
  CREATE INDEX IF NOT EXISTS idx_clip_model_runs_package ON clip_model_runs (package_id, created_at DESC);`)
}
export const createModelStudioProvisionalSecretsTable = (database: Database.Database): void => {
  database.exec("CREATE TABLE IF NOT EXISTS model_studio_provisional_secrets (secret_ref TEXT PRIMARY KEY REFERENCES secret_records(id) ON DELETE CASCADE, capability TEXT NOT NULL CHECK (capability IN ('asr', 'text-analysis', 'multimodal-review')), owner_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)")
}

export const upgradeModelStudioProvisionalCapabilityConstraint = (database: Database.Database): void => {
  if (!tableExists(database, 'model_studio_provisional_secrets') || !tableExists(database, 'secret_records')) return
  const definition = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'model_studio_provisional_secrets'").get() as { sql: string } | undefined
  if (definition?.sql.includes("'asr'")) return
  database.exec(`CREATE TABLE model_studio_provisional_secrets_v44 (
    secret_ref TEXT PRIMARY KEY REFERENCES secret_records(id) ON DELETE CASCADE,
    capability TEXT CHECK (capability IN ('asr', 'text-analysis', 'multimodal-review')),
    owner_id TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  INSERT INTO model_studio_provisional_secrets_v44 (secret_ref, capability, owner_id, expires_at, created_at)
    SELECT secret_ref, capability, owner_id, expires_at, created_at FROM model_studio_provisional_secrets;
  DROP TABLE model_studio_provisional_secrets;
  ALTER TABLE model_studio_provisional_secrets_v44 RENAME TO model_studio_provisional_secrets;`)
}

export const createClipCandidatePublishMembersTable = (database: Database.Database): void => {
  database.exec(`CREATE TABLE IF NOT EXISTS clip_candidate_publish_members (
    candidate_id TEXT PRIMARY KEY REFERENCES task_items(id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL REFERENCES clip_candidate_snapshots(id) ON DELETE CASCADE,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES production_tasks(id) ON DELETE CASCADE,
    task_round INTEGER NOT NULL CHECK (task_round > 0), created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_clip_candidate_publish_members_episode_round ON clip_candidate_publish_members (drama_id, episode_id, task_id, task_round);`)
}

export const createSubtitleRecognitionSettingsTable = (database: Database.Database): void => {
  database.exec("CREATE TABLE IF NOT EXISTS subtitle_recognition_settings (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, recognition_mode TEXT NOT NULL DEFAULT 'asr-ocr' CHECK (recognition_mode IN ('asr-only', 'ocr-only', 'asr-ocr')), scope TEXT NOT NULL CHECK (scope IN ('all', 'current', 'missing')), language TEXT NOT NULL CHECK (language IN ('zh-CN', 'zh-en', 'auto')), asr_mode TEXT NOT NULL CHECK (asr_mode IN ('audio-first', 'denoise', 'import-only')), ocr_mode TEXT NOT NULL CHECK (ocr_mode IN ('auto-region', 'fixed-bottom', 'episode-manual')), difference_threshold TEXT NOT NULL CHECK (difference_threshold IN ('standard', 'strict', 'loose')), import_strategy TEXT NOT NULL CHECK (import_strategy IN ('parallel', 'review-only')), updated_at TEXT NOT NULL)")
}

export const createSubtitleRecognitionRunTables = (database: Database.Database): void => {
  database.exec("CREATE TABLE IF NOT EXISTS subtitle_recognition_runs (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK (status IN ('running', 'interrupted', 'completed', 'partial', 'failed')), settings_json TEXT NOT NULL, episode_ids_json TEXT NOT NULL, total_count INTEGER NOT NULL CHECK (total_count > 0), completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0), failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0), current_episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL, ocr_runner_build_id TEXT, ocr_runner_sha256 TEXT, reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
  database.exec("CREATE TABLE IF NOT EXISTS subtitle_recognition_run_items (run_id TEXT NOT NULL REFERENCES subtitle_recognition_runs(id) ON DELETE CASCADE, episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'interrupted')), reason TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (run_id, episode_id))")
  database.exec('CREATE INDEX IF NOT EXISTS ix_subtitle_recognition_runs_drama_updated ON subtitle_recognition_runs (drama_id, updated_at DESC)')
}

export const addSubtitleRecognitionRuntimeIdentity = (database: Database.Database): void => {
  if (!tableExists(database, 'subtitle_recognition_runs')) return
  addColumnIfPresent(database, 'subtitle_recognition_runs', 'ocr_runner_build_id', 'TEXT')
  addColumnIfPresent(database, 'subtitle_recognition_runs', 'ocr_runner_sha256', 'TEXT')
}

export const addSubtitleRecognitionMode = (database: Database.Database): void => {
  if (!tableExists(database, 'subtitle_recognition_settings')) { createSubtitleRecognitionSettingsTable(database); return }
  addColumnIfPresent(database, 'subtitle_recognition_settings', 'recognition_mode', "TEXT NOT NULL DEFAULT 'asr-ocr' CHECK (recognition_mode IN ('asr-only', 'ocr-only', 'asr-ocr'))")
}

export const createSubtitleAssetIdempotencyIndexes = (database: Database.Database): void => {
  if (!tableExists(database, 'subtitle_assets')) return
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_assets_drama_global_source ON subtitle_assets (drama_id, source_path) WHERE episode_id IS NULL')
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_assets_drama_episode_source ON subtitle_assets (drama_id, episode_id, source_path) WHERE episode_id IS NOT NULL')
}

export const reconcileLegacySubtitleAssetEpisodes = (database: Database.Database): void => {
  if (!tableExists(database, 'subtitle_assets') || !tableExists(database, 'subtitle_tracks') || !tableExists(database, 'episodes')) return
  const assets = database.prepare('SELECT id, drama_id AS dramaId, source_path AS sourcePath FROM subtitle_assets WHERE episode_id IS NULL').all() as Array<{ id: string; dramaId: string; sourcePath: string }>
  const candidates = assets.flatMap((asset) => {
    const episodeNo = extractEpisodeNoFromSubtitlePath(asset.sourcePath)
    if (episodeNo === null) return []
    const episodes = database.prepare('SELECT id FROM episodes WHERE drama_id = ? AND episode_no = ?').all(asset.dramaId, episodeNo) as Array<{ id: string }>
    return episodes.length === 1 ? [{ ...asset, episodeId: episodes[0].id }] : []
  })
  const now = new Date().toISOString()
  for (const candidate of candidates) {
    const duplicate = database.prepare('SELECT 1 FROM subtitle_assets WHERE drama_id = ? AND episode_id = ? AND source_path = ? AND id <> ?').get(candidate.dramaId, candidate.episodeId, candidate.sourcePath, candidate.id)
    if (duplicate) continue
    database.prepare('UPDATE subtitle_assets SET episode_id = ?, updated_at = ? WHERE id = ?').run(candidate.episodeId, now, candidate.id)
    database.prepare('UPDATE subtitle_tracks SET episode_id = ?, updated_at = ? WHERE asset_id = ? AND episode_id IS NULL').run(candidate.episodeId, now, candidate.id)
  }
}

export const upgradeSubtitleRecognitionSettings = (database: Database.Database): void => {
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

export const createClipExportBatchesTable = (database: Database.Database): void => {
  database.exec("CREATE TABLE IF NOT EXISTS clip_export_batches (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, candidate_ids_json TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'cancelled', 'failed')), reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
  database.exec('CREATE INDEX IF NOT EXISTS ix_clip_export_batches_drama_updated ON clip_export_batches (drama_id, updated_at DESC)')
}

export const upgradeSubtitleConflictReviewStatus = (database: Database.Database): void => {
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

export const upgradeClipExportBatchesTable = (database: Database.Database): void => {
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

export const createSubtitleEvidenceGuards = (database: Database.Database): void => {
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


export const hasMigration = (database: Database.Database, version: number): boolean => {
  return database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version) !== undefined
}

export const tableExists = (database: Database.Database, table: string): boolean => {
  return database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined
}

export const applySchema = (database: Database.Database, skipNotificationEventIndex = false): void => {
  for (const statement of INITIAL_SCHEMA) {
    if (skipNotificationEventIndex && statement.includes('ux_notifications_event_key')) {
      continue
    }
    database.exec(statement)
  }
}

export const recordMigration = (database: Database.Database, version: number): void => {
  database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString())
}

export const addColumnIfMissing = (
  database: Database.Database,
  table: 'production_tasks' | 'notifications' | 'generated_materials' | 'episodes' | 'task_items' | 'clip_candidate_snapshots' | 'clip_candidate_publish_pointers' | 'clip_evidence_units',
  column: 'cost_json' | 'event_key' | 'occurred_at' | 'draft_id' | 'video_width' | 'video_height' | 'duration_alert_dismissed_at' | 'export_batch_id' | 'source_fingerprint' | 'task_id' | 'task_round' | 'coverage_json' | 'source_version',
  definition: string
): void => {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some(({ name }) => name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

export const addColumnIfPresent = (database: Database.Database, table: string, column: string, definition: string): void => {
  if (!tableExists(database, table)) return
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some(({ name }) => name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}
