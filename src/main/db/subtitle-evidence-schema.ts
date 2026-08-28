import type Database from 'better-sqlite3'

export const addSubtitleEvidenceColumns = (database: Database.Database): void => {
  addColumnIfPresent(database, 'subtitle_assets', "acquisition", "TEXT NOT NULL DEFAULT 'imported'")
  addColumnIfPresent(database, 'subtitle_assets', "evidence_nature", "TEXT NOT NULL DEFAULT 'reference_unknown'")
  addColumnIfPresent(database, 'subtitle_tracks', "acquisition", "TEXT NOT NULL DEFAULT 'generated'")
  addColumnIfPresent(database, 'subtitle_tracks', "evidence_nature", "TEXT NOT NULL DEFAULT 'audio_aligned'")
  addColumnIfPresent(database, 'subtitle_tracks', 'base_track_id', 'TEXT REFERENCES subtitle_tracks(id) ON DELETE SET NULL')
  // Old rows predate explicit evidence provenance.  Keep imported material as
  // reference-only; generated OCR/ASR and manually resolved tracks have a
  // deterministic provenance instead of inheriting an unsafe SQL default.
  if (tableExists(database, 'subtitle_tracks')) {
    database.exec("UPDATE subtitle_tracks SET acquisition = 'imported', evidence_nature = 'reference_unknown' WHERE source_kind = 'import' AND (acquisition <> 'imported' OR evidence_nature <> 'reference_unknown')")
    database.exec("UPDATE subtitle_tracks SET acquisition = 'generated', evidence_nature = 'visual_aligned' WHERE source_kind = 'ocr' AND acquisition = 'generated' AND evidence_nature = 'audio_aligned'")
    database.exec("UPDATE subtitle_tracks SET acquisition = 'manual', evidence_nature = 'manual_resolved' WHERE source_kind = 'resolved' AND acquisition = 'generated' AND evidence_nature = 'audio_aligned'")
  }
  addColumnIfPresent(database, 'subtitle_conflicts', 'asr_confidence', 'REAL')
  addColumnIfPresent(database, 'subtitle_conflicts', 'ocr_confidence', 'REAL')
  addColumnIfPresent(database, 'subtitle_quality_evaluations', 'evaluated_cue_count', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfPresent(database, 'subtitle_quality_evaluations', 'elapsed_ms', 'INTEGER NOT NULL DEFAULT 0')
}

export const createSubtitleEvidenceTables = (database: Database.Database): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS subtitle_tracks (
      id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL, asset_id TEXT REFERENCES subtitle_assets(id) ON DELETE SET NULL, base_track_id TEXT REFERENCES subtitle_tracks(id) ON DELETE SET NULL,
      source_kind TEXT NOT NULL CHECK (source_kind IN ('import', 'asr', 'ocr', 'resolved')), acquisition TEXT NOT NULL DEFAULT 'generated' CHECK (acquisition IN ('imported', 'generated', 'manual')), evidence_nature TEXT NOT NULL DEFAULT 'audio_aligned' CHECK (evidence_nature IN ('reference_unknown', 'visual_aligned', 'audio_aligned', 'manual_resolved')), label TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'zh-CN', status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active', cue_count INTEGER NOT NULL DEFAULT 0, cost_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subtitle_cues (
      id TEXT PRIMARY KEY, track_id TEXT NOT NULL REFERENCES subtitle_tracks(id) ON DELETE CASCADE, cue_index INTEGER NOT NULL, start_seconds REAL NOT NULL CHECK (start_seconds >= 0), end_seconds REAL NOT NULL CHECK (end_seconds > start_seconds), text TEXT NOT NULL, confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (track_id, cue_index)
    );
    CREATE TABLE IF NOT EXISTS subtitle_ocr_regions (
      id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE, scope TEXT NOT NULL CHECK (scope IN ('drama_default', 'episode_override')), x REAL NOT NULL CHECK (x >= 0 AND x <= 1), y REAL NOT NULL CHECK (y >= 0 AND y <= 1), width REAL NOT NULL CHECK (width > 0 AND width <= 1), height REAL NOT NULL CHECK (height > 0 AND height <= 1), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK (x + width <= 1), CHECK (y + height <= 1), UNIQUE (drama_id, episode_id, scope)
    );
    CREATE TABLE IF NOT EXISTS subtitle_conflicts (
      id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL, asr_cue_id TEXT NOT NULL REFERENCES subtitle_cues(id) ON DELETE CASCADE, ocr_cue_id TEXT NOT NULL REFERENCES subtitle_cues(id) ON DELETE CASCADE, time_overlap_seconds REAL NOT NULL CHECK (time_overlap_seconds > 0), text_similarity REAL NOT NULL CHECK (text_similarity >= 0 AND text_similarity <= 1), asr_confidence REAL, ocr_confidence REAL, status TEXT NOT NULL CHECK (status IN ('open', 'resolved_asr', 'resolved_ocr', 'resolved_manual', 'reviewed')) DEFAULT 'open', resolved_text TEXT, resolved_start_seconds REAL, resolved_end_seconds REAL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subtitle_quality_evaluations (
      id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL, source_kind TEXT NOT NULL CHECK (source_kind IN ('import', 'asr', 'ocr', 'resolved')), sample_label TEXT NOT NULL, reference_characters INTEGER NOT NULL CHECK (reference_characters >= 0), differing_characters INTEGER NOT NULL CHECK (differing_characters >= 0), conflict_count INTEGER NOT NULL CHECK (conflict_count >= 0), evaluated_cue_count INTEGER NOT NULL DEFAULT 0 CHECK (evaluated_cue_count >= 0), elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0), estimated_cost REAL NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0), actual_cost REAL NOT NULL DEFAULT 0 CHECK (actual_cost >= 0), notes TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subtitle_semantic_events (
      id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
      rule_version TEXT NOT NULL, conclusion TEXT NOT NULL CHECK (conclusion IN ('aligned', 'content-difference', 'visual-only', 'asr-only', 'time-conflict')),
      source_kinds_json TEXT NOT NULL, start_seconds REAL NOT NULL, end_seconds REAL NOT NULL, cut_start_seconds REAL NOT NULL, cut_end_seconds REAL NOT NULL,
      text_similarity REAL, reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, CHECK (end_seconds > start_seconds), CHECK (cut_end_seconds > cut_start_seconds)
    );
    CREATE TABLE IF NOT EXISTS subtitle_semantic_event_cues (
      event_id TEXT NOT NULL REFERENCES subtitle_semantic_events(id) ON DELETE CASCADE, cue_id TEXT NOT NULL REFERENCES subtitle_cues(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK (role IN ('visual', 'asr')), PRIMARY KEY (event_id, cue_id)
    );
    CREATE TABLE IF NOT EXISTS clip_candidate_semantic_events (
      candidate_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE, semantic_event_id TEXT NOT NULL REFERENCES subtitle_semantic_events(id) ON DELETE RESTRICT, PRIMARY KEY (candidate_id, semantic_event_id)
    );
    CREATE TABLE IF NOT EXISTS clip_candidate_scene_anchors (
      candidate_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE, evidence_id TEXT NOT NULL REFERENCES ai_evidence(id) ON DELETE RESTRICT, PRIMARY KEY (candidate_id, evidence_id)
    );
    CREATE INDEX IF NOT EXISTS idx_subtitle_tracks_drama_episode ON subtitle_tracks (drama_id, episode_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_subtitle_cues_track_range ON subtitle_cues (track_id, start_seconds, end_seconds);
    CREATE INDEX IF NOT EXISTS idx_subtitle_conflicts_drama_episode ON subtitle_conflicts (drama_id, episode_id, status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_subtitle_semantic_events_episode_rule ON subtitle_semantic_events (drama_id, episode_id, rule_version, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_clip_candidate_semantic_events_event ON clip_candidate_semantic_events (semantic_event_id);
    CREATE INDEX IF NOT EXISTS idx_clip_candidate_scene_anchors_evidence ON clip_candidate_scene_anchors (evidence_id);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_ocr_regions_drama_default ON subtitle_ocr_regions (drama_id) WHERE scope = 'drama_default' AND episode_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_ocr_regions_episode_override ON subtitle_ocr_regions (drama_id, episode_id) WHERE scope = 'episode_override' AND episode_id IS NOT NULL;
  `)
}

export const normalizeProviderCapabilities = (database: Database.Database): void => {
  if (!tableExists(database, 'provider_profiles')) return
  database.exec('DROP INDEX IF EXISTS ux_provider_profiles_capability')
  database.exec(`UPDATE provider_profiles SET capability = CASE capability WHEN 'text_semantics' THEN 'text-analysis' WHEN 'video_understanding' THEN 'multimodal-review' ELSE capability END`)
  database.exec(`UPDATE provider_profiles
    SET secret_ref = COALESCE(secret_ref, (
      SELECT legacy.secret_ref FROM provider_profiles AS legacy
      WHERE legacy.capability = provider_profiles.capability AND legacy.id <> provider_profiles.id AND legacy.secret_ref IS NOT NULL
      ORDER BY legacy.updated_at DESC, legacy.id DESC LIMIT 1
    ))
    WHERE NOT EXISTS (
      SELECT 1 FROM provider_profiles AS newer
      WHERE newer.capability = provider_profiles.capability AND (newer.updated_at > provider_profiles.updated_at OR (newer.updated_at = provider_profiles.updated_at AND newer.id > provider_profiles.id))
    )`)
  database.exec(`DELETE FROM provider_profiles WHERE id IN (SELECT older.id FROM provider_profiles older JOIN provider_profiles newer ON newer.capability = older.capability AND (newer.updated_at > older.updated_at OR (newer.updated_at = older.updated_at AND newer.id > older.id)))`)
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_profiles_capability ON provider_profiles (capability)')
}

const tableExists = (database: Database.Database, table: string): boolean => database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined
const addColumnIfPresent = (database: Database.Database, table: string, column: string, definition: string): void => {
  if (!tableExists(database, table)) return
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some(({ name }) => name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}
