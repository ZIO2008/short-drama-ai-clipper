import type Database from 'better-sqlite3'

export const addSubtitleEvidenceColumns = (database: Database.Database): void => {
  addColumnIfPresent(database, 'subtitle_tracks', 'base_track_id', 'TEXT REFERENCES subtitle_tracks(id) ON DELETE SET NULL')
  addColumnIfPresent(database, 'subtitle_conflicts', 'asr_confidence', 'REAL')
  addColumnIfPresent(database, 'subtitle_conflicts', 'ocr_confidence', 'REAL')
  addColumnIfPresent(database, 'subtitle_quality_evaluations', 'evaluated_cue_count', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfPresent(database, 'subtitle_quality_evaluations', 'elapsed_ms', 'INTEGER NOT NULL DEFAULT 0')
}

export const createSubtitleEvidenceTables = (database: Database.Database): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS subtitle_tracks (
      id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL, asset_id TEXT REFERENCES subtitle_assets(id) ON DELETE SET NULL, base_track_id TEXT REFERENCES subtitle_tracks(id) ON DELETE SET NULL,
      source_kind TEXT NOT NULL CHECK (source_kind IN ('import', 'asr', 'ocr', 'resolved')), label TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'zh-CN', status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active', cue_count INTEGER NOT NULL DEFAULT 0, cost_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
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
    CREATE INDEX IF NOT EXISTS idx_subtitle_tracks_drama_episode ON subtitle_tracks (drama_id, episode_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_subtitle_cues_track_range ON subtitle_cues (track_id, start_seconds, end_seconds);
    CREATE INDEX IF NOT EXISTS idx_subtitle_conflicts_drama_episode ON subtitle_conflicts (drama_id, episode_id, status, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_ocr_regions_drama_default ON subtitle_ocr_regions (drama_id) WHERE scope = 'drama_default' AND episode_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_ocr_regions_episode_override ON subtitle_ocr_regions (drama_id, episode_id) WHERE scope = 'episode_override' AND episode_id IS NOT NULL;
  `)
}

export const normalizeProviderCapabilities = (database: Database.Database): void => {
  if (!tableExists(database, 'provider_profiles')) return
  database.exec('DROP INDEX IF EXISTS ux_provider_profiles_capability')
  database.exec(`UPDATE provider_profiles SET capability = CASE capability WHEN 'text_semantics' THEN 'text-analysis' WHEN 'video_understanding' THEN 'multimodal-review' ELSE capability END`)
  database.exec(`DELETE FROM provider_profiles WHERE id IN (SELECT older.id FROM provider_profiles older JOIN provider_profiles newer ON newer.capability = older.capability AND (newer.updated_at > older.updated_at OR (newer.updated_at = older.updated_at AND newer.id > older.id)))`)
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_profiles_capability ON provider_profiles (capability)')
}

const tableExists = (database: Database.Database, table: string): boolean => database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined
const addColumnIfPresent = (database: Database.Database, table: string, column: string, definition: string): void => {
  if (!tableExists(database, table)) return
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some(({ name }) => name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}
