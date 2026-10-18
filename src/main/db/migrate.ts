import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { createClipCandidateNumberTable, ensureClipCandidateNumbers } from './clip-candidate-numbering.js'
import { createClipSubtitleVariantTable as createSharedClipSubtitleVariantTable, createProjectLibraryGuards as createSharedProjectLibraryGuards } from './project-library-guards.js'
import { createP1Tables as createSharedP1Tables } from './p1-schema.js'
import { addSubtitleEvidenceColumns, createSubtitleEvidenceTables, normalizeProviderCapabilities } from './subtitle-evidence-schema.js'
import { addColumnIfPresent } from './migration-helpers.js'
import { addColumnIfMissing, addSubtitleRecognitionMode, addSubtitleRecognitionRuntimeIdentity, applySchema, createClipCandidatePublishMembersTable, createClipExportBatchesTable, createClipIntelligenceTables, createModelStudioProvisionalSecretsTable, createSubtitleAssetIdempotencyIndexes, createSubtitleEvidenceGuards, createSubtitleRecognitionRunTables, createSubtitleRecognitionSettingsTable, hasMigration, reconcileLegacySubtitleAssetEpisodes, recordMigration, tableExists, upgradeClipExportBatchesTable, upgradeModelStudioProvisionalCapabilityConstraint, upgradeSubtitleConflictReviewStatus, upgradeSubtitleRecognitionSettings } from './migration-helpers.js'

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
  if (hasMigration(database, 45) && !tableExists(database, 'clip_candidate_numbers')) throw new Error('切片编号元数据缺失，不能重新编号；请从完整备份恢复。')
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
    if (!hasMigration(database, 27)) {
      addSubtitleRecognitionMode(database)
      recordMigration(database, 27)
    }
    if (!hasMigration(database, 26)) {
      reconcileLegacySubtitleAssetEpisodes(database)
      recordMigration(database, 26)
    }
    if (!hasMigration(database, 28)) {
      createSubtitleRecognitionRunTables(database)
      recordMigration(database, 28)
    }
    if (!hasMigration(database, 29)) {
      addSubtitleRecognitionRuntimeIdentity(database)
      recordMigration(database, 29)
    }
    if (!hasMigration(database, 30)) {
      if (tableExists(database, 'episodes')) addColumnIfMissing(database, 'episodes', 'duration_alert_dismissed_at', 'TEXT')
      recordMigration(database, 30)
    }
    if (!hasMigration(database, 31)) {
      createSubtitleEvidenceTables(database)
      recordMigration(database, 31)
    }
    if (!hasMigration(database, 32)) {
      createSubtitleEvidenceTables(database)
      recordMigration(database, 32)
    }
    if (!hasMigration(database, 33)) {
      createSubtitleEvidenceTables(database)
      recordMigration(database, 33)
    }
    if (!hasMigration(database, 34)) {
      if (tableExists(database, 'episodes')) addColumnIfMissing(database, 'episodes', 'source_fingerprint', 'TEXT')
      recordMigration(database, 34)
    }
    if (!hasMigration(database, 35)) {
      createClipIntelligenceTables(database)
      recordMigration(database, 35)
    }
    if (!hasMigration(database, 36)) {
      addColumnIfMissing(database, 'clip_candidate_snapshots', 'task_id', 'TEXT REFERENCES production_tasks(id) ON DELETE SET NULL')
      addColumnIfMissing(database, 'clip_candidate_snapshots', 'task_round', 'INTEGER NOT NULL DEFAULT 0')
      addColumnIfMissing(database, 'clip_candidate_publish_pointers', 'task_id', 'TEXT REFERENCES production_tasks(id) ON DELETE SET NULL')
      addColumnIfMissing(database, 'clip_candidate_publish_pointers', 'task_round', 'INTEGER NOT NULL DEFAULT 0')
      recordMigration(database, 36)
    }
    if (!hasMigration(database, 37)) {
      database.exec('CREATE TABLE IF NOT EXISTS clip_generation_rounds (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, next_round INTEGER NOT NULL CHECK (next_round > 0), updated_at TEXT NOT NULL)')
      recordMigration(database, 37)
    }
    if (!hasMigration(database, 38)) {
      createClipCandidatePublishMembersTable(database)
      recordMigration(database, 38)
    }
    if (!hasMigration(database, 39)) {
      addColumnIfMissing(database, 'clip_evidence_units', 'coverage_json', "TEXT NOT NULL DEFAULT '{}'")
      addColumnIfMissing(database, 'clip_evidence_units', 'source_version', 'TEXT')
      recordMigration(database, 39)
    }
    if (!hasMigration(database, 40)) {
      database.exec(`CREATE TABLE IF NOT EXISTS clip_narrative_events (
        id TEXT PRIMARY KEY, package_id TEXT NOT NULL REFERENCES clip_evidence_packages(id) ON DELETE CASCADE,
        event_key TEXT NOT NULL, window_key TEXT NOT NULL, source_evidence_ids_json TEXT NOT NULL,
        core_evidence_ids_json TEXT NOT NULL, context_before_ids_json TEXT NOT NULL, context_after_ids_json TEXT NOT NULL,
        start_seconds REAL NOT NULL CHECK (start_seconds >= 0), end_seconds REAL NOT NULL CHECK (end_seconds > start_seconds),
        state TEXT NOT NULL, characters_json TEXT NOT NULL, relationship TEXT NOT NULL, conflict TEXT NOT NULL,
        continuity TEXT NOT NULL CHECK (continuity IN ('continuous', 'limited', 'unclear')),
        seam_status TEXT NOT NULL CHECK (seam_status IN ('closed', 'expanded-closed', 'unclear')),
        provider TEXT, model TEXT, rule_version TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE (package_id, event_key)
      ); CREATE INDEX IF NOT EXISTS idx_clip_narrative_events_package ON clip_narrative_events (package_id, start_seconds);`)
      recordMigration(database, 40)
    }
    if (!hasMigration(database, 41)) {
      createModelStudioProvisionalSecretsTable(database)
      recordMigration(database, 41)
    }
    if (!hasMigration(database, 42)) {
      addColumnIfPresent(database, 'model_studio_provisional_secrets', 'capability', 'TEXT')
      addColumnIfPresent(database, 'model_studio_provisional_secrets', 'owner_id', 'TEXT')
      recordMigration(database, 42)
    }
    if (!hasMigration(database, 43)) {
      addColumnIfPresent(database, 'provider_profiles', 'model_selection_source', 'TEXT')
      recordMigration(database, 43)
    }
    if (!hasMigration(database, 44)) {
      upgradeModelStudioProvisionalCapabilityConstraint(database)
      recordMigration(database, 44)
    }
    if (!hasMigration(database, 45)) {
      createClipCandidateNumberTable(database)
      recordMigration(database, 45)
    }
  })

  apply()
  createClipCandidateNumberTable(database)
  // Repair databases from interrupted or pre-release migrations where version 9 was
  // recorded but its table was not persisted. This is idempotent on healthy databases.
  database.exec('CREATE TABLE IF NOT EXISTS drama_import_preferences (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, last_import_directory TEXT NOT NULL, updated_at TEXT NOT NULL)')
  createModelStudioProvisionalSecretsTable(database)
  addColumnIfPresent(database, 'model_studio_provisional_secrets', 'capability', 'TEXT')
  addColumnIfPresent(database, 'model_studio_provisional_secrets', 'owner_id', 'TEXT')
  addColumnIfPresent(database, 'provider_profiles', 'model_selection_source', 'TEXT')
  // Repair pre-release databases that recorded the migration but lost the table.
  database.exec("CREATE TABLE IF NOT EXISTS drama_covers (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, source_kind TEXT NOT NULL CHECK (source_kind IN ('uploaded', 'auto_frame')), path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
  // P1 may have been partially installed by pre-release builds. Repair each table
  // independently so an interrupted migration cannot strand an existing P0 database.
  createSharedP1Tables(database)
  upgradeModelStudioProvisionalCapabilityConstraint(database)
  if (tableExists(database, 'generated_materials')) addColumnIfMissing(database, 'generated_materials', 'draft_id', 'TEXT REFERENCES ai_drafts(id) ON DELETE SET NULL')
  createSharedProjectLibraryGuards(database)
  normalizeProviderCapabilities(database)
  createSubtitleEvidenceTables(database)
  addSubtitleEvidenceColumns(database)
  createSubtitleEvidenceGuards(database)
  createSharedClipSubtitleVariantTable(database)
  createSubtitleRecognitionSettingsTable(database)
  upgradeSubtitleRecognitionSettings(database)
  addSubtitleRecognitionMode(database)
  createSubtitleRecognitionRunTables(database)
  addSubtitleRecognitionRuntimeIdentity(database)
  createSubtitleAssetIdempotencyIndexes(database)
  reconcileLegacySubtitleAssetEpisodes(database)
  createClipExportBatchesTable(database)
  createClipIntelligenceTables(database)
  createClipCandidatePublishMembersTable(database)
  database.exec('CREATE TABLE IF NOT EXISTS clip_generation_rounds (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, next_round INTEGER NOT NULL CHECK (next_round > 0), updated_at TEXT NOT NULL)')
  addColumnIfMissing(database, 'clip_candidate_snapshots', 'task_id', 'TEXT REFERENCES production_tasks(id) ON DELETE SET NULL')
  addColumnIfMissing(database, 'clip_candidate_snapshots', 'task_round', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing(database, 'clip_candidate_publish_pointers', 'task_id', 'TEXT REFERENCES production_tasks(id) ON DELETE SET NULL')
  addColumnIfMissing(database, 'clip_candidate_publish_pointers', 'task_round', 'INTEGER NOT NULL DEFAULT 0')
  addColumnIfMissing(database, 'clip_evidence_units', 'coverage_json', "TEXT NOT NULL DEFAULT '{}'")
  addColumnIfMissing(database, 'clip_evidence_units', 'source_version', 'TEXT')
  database.exec(`CREATE TABLE IF NOT EXISTS clip_narrative_events (
    id TEXT PRIMARY KEY, package_id TEXT NOT NULL REFERENCES clip_evidence_packages(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL, window_key TEXT NOT NULL, source_evidence_ids_json TEXT NOT NULL,
    core_evidence_ids_json TEXT NOT NULL, context_before_ids_json TEXT NOT NULL, context_after_ids_json TEXT NOT NULL,
    start_seconds REAL NOT NULL CHECK (start_seconds >= 0), end_seconds REAL NOT NULL CHECK (end_seconds > start_seconds),
    state TEXT NOT NULL, characters_json TEXT NOT NULL, relationship TEXT NOT NULL, conflict TEXT NOT NULL,
    continuity TEXT NOT NULL CHECK (continuity IN ('continuous', 'limited', 'unclear')),
    seam_status TEXT NOT NULL CHECK (seam_status IN ('closed', 'expanded-closed', 'unclear')),
    provider TEXT, model TEXT, rule_version TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    UNIQUE (package_id, event_key)
  ); CREATE INDEX IF NOT EXISTS idx_clip_narrative_events_package ON clip_narrative_events (package_id, start_seconds);`)
  if (tableExists(database, 'episodes')) {
    addColumnIfMissing(database, 'episodes', 'source_fingerprint', 'TEXT')
    addColumnIfMissing(database, 'episodes', 'video_width', 'INTEGER')
    addColumnIfMissing(database, 'episodes', 'video_height', 'INTEGER')
    addColumnIfMissing(database, 'episodes', 'duration_alert_dismissed_at', 'TEXT')
  }
  ensureClipCandidateNumbers(database)
}
