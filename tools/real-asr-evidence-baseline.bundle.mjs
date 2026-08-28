// tools/real-asr-evidence-baseline.ts
import { createHash as createHash4 } from "node:crypto";
import { existsSync as existsSync3 } from "node:fs";
import { mkdtemp as mkdtemp3, readFile as readFile3, rm as rm3, writeFile as writeFile2 } from "node:fs/promises";
import { tmpdir as tmpdir3 } from "node:os";
import { join as join4, resolve } from "node:path";
import Database2 from "better-sqlite3";
import { app } from "electron";

// src/main/db/migrate.ts
import Database from "better-sqlite3";

// src/main/db/schema.ts
var INITIAL_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS dramas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_no INTEGER,
    sort_order INTEGER NOT NULL,
    source_path TEXT NOT NULL,
    source_fingerprint TEXT,
    duration_seconds REAL,
    fps REAL,
    video_width INTEGER,
    video_height INTEGER,
    duration_alert_dismissed_at TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (drama_id, episode_no)
  )`,
  `CREATE TABLE IF NOT EXISTS drama_import_preferences (
    drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE,
    last_import_directory TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS drama_covers (
    drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('uploaded', 'auto_frame')),
    path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS script_assets (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
    source_path TEXT NOT NULL,
    format TEXT NOT NULL,
    extracted_text TEXT,
    link_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS script_asset_segments (
    id TEXT PRIMARY KEY,
    script_asset_id TEXT NOT NULL REFERENCES script_assets(id) ON DELETE CASCADE,
    episode_no INTEGER NOT NULL,
    title TEXT NOT NULL,
    extracted_text TEXT NOT NULL,
    episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (script_asset_id, episode_no)
  )`,
  `CREATE TABLE IF NOT EXISTS subtitle_assets (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
    source_path TEXT NOT NULL,
    format TEXT NOT NULL,
    cue_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS subtitle_tracks (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
    asset_id TEXT REFERENCES subtitle_assets(id) ON DELETE SET NULL,
    base_track_id TEXT REFERENCES subtitle_tracks(id) ON DELETE SET NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('import', 'asr', 'ocr', 'resolved')),
    acquisition TEXT NOT NULL DEFAULT 'generated' CHECK (acquisition IN ('imported', 'generated', 'manual')),
    evidence_nature TEXT NOT NULL DEFAULT 'audio_aligned' CHECK (evidence_nature IN ('reference_unknown', 'visual_aligned', 'audio_aligned', 'manual_resolved')),
    label TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'zh-CN',
    status TEXT NOT NULL CHECK (status IN ('active', 'archived')) DEFAULT 'active',
    cue_count INTEGER NOT NULL DEFAULT 0,
    cost_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS subtitle_cues (
    id TEXT PRIMARY KEY,
    track_id TEXT NOT NULL REFERENCES subtitle_tracks(id) ON DELETE CASCADE,
    cue_index INTEGER NOT NULL,
    start_seconds REAL NOT NULL CHECK (start_seconds >= 0),
    end_seconds REAL NOT NULL CHECK (end_seconds > start_seconds),
    text TEXT NOT NULL,
    confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (track_id, cue_index)
  )`,
  `CREATE TABLE IF NOT EXISTS subtitle_ocr_regions (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT REFERENCES episodes(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('drama_default', 'episode_override')),
    x REAL NOT NULL CHECK (x >= 0 AND x <= 1),
    y REAL NOT NULL CHECK (y >= 0 AND y <= 1),
    width REAL NOT NULL CHECK (width > 0 AND width <= 1),
    height REAL NOT NULL CHECK (height > 0 AND height <= 1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (x + width <= 1),
    CHECK (y + height <= 1),
    UNIQUE (drama_id, episode_id, scope)
  )`,
  `CREATE TABLE IF NOT EXISTS subtitle_conflicts (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
    asr_cue_id TEXT NOT NULL REFERENCES subtitle_cues(id) ON DELETE CASCADE,
    ocr_cue_id TEXT NOT NULL REFERENCES subtitle_cues(id) ON DELETE CASCADE,
    time_overlap_seconds REAL NOT NULL CHECK (time_overlap_seconds > 0),
    text_similarity REAL NOT NULL CHECK (text_similarity >= 0 AND text_similarity <= 1),
    asr_confidence REAL CHECK (asr_confidence IS NULL OR (asr_confidence >= 0 AND asr_confidence <= 1)),
    ocr_confidence REAL CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1)),
    status TEXT NOT NULL CHECK (status IN ('open', 'resolved_asr', 'resolved_ocr', 'resolved_manual')) DEFAULT 'open',
    resolved_text TEXT,
    resolved_start_seconds REAL,
    resolved_end_seconds REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS subtitle_quality_evaluations (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('import', 'asr', 'ocr', 'resolved')),
    sample_label TEXT NOT NULL,
    reference_characters INTEGER NOT NULL CHECK (reference_characters >= 0),
    differing_characters INTEGER NOT NULL CHECK (differing_characters >= 0),
    conflict_count INTEGER NOT NULL CHECK (conflict_count >= 0),
    evaluated_cue_count INTEGER NOT NULL DEFAULT 0 CHECK (evaluated_cue_count >= 0),
    elapsed_ms INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
    estimated_cost REAL NOT NULL DEFAULT 0 CHECK (estimated_cost >= 0),
    actual_cost REAL NOT NULL DEFAULT 0 CHECK (actual_cost >= 0),
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS subtitle_semantic_events (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    rule_version TEXT NOT NULL,
    conclusion TEXT NOT NULL CHECK (conclusion IN ('aligned', 'content-difference', 'visual-only', 'asr-only', 'time-conflict')),
    source_kinds_json TEXT NOT NULL,
    start_seconds REAL NOT NULL,
    end_seconds REAL NOT NULL,
    cut_start_seconds REAL NOT NULL,
    cut_end_seconds REAL NOT NULL,
    text_similarity REAL,
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (end_seconds > start_seconds),
    CHECK (cut_end_seconds > cut_start_seconds)
  )`,
  `CREATE TABLE IF NOT EXISTS subtitle_semantic_event_cues (
    event_id TEXT NOT NULL REFERENCES subtitle_semantic_events(id) ON DELETE CASCADE,
    cue_id TEXT NOT NULL REFERENCES subtitle_cues(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('visual', 'asr')),
    PRIMARY KEY (event_id, cue_id)
  )`,
  `CREATE TABLE IF NOT EXISTS clip_candidate_semantic_events (
    candidate_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    semantic_event_id TEXT NOT NULL REFERENCES subtitle_semantic_events(id) ON DELETE RESTRICT,
    PRIMARY KEY (candidate_id, semantic_event_id)
  )`,
  `CREATE TABLE IF NOT EXISTS clip_candidate_scene_anchors (
    candidate_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    evidence_id TEXT NOT NULL REFERENCES ai_evidence(id) ON DELETE RESTRICT,
    PRIMARY KEY (candidate_id, evidence_id)
  )`,
  `CREATE TABLE IF NOT EXISTS clip_evidence_packages (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK (version > 0),
    source_media_fingerprint TEXT NOT NULL,
    rule_version TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('building', 'ready', 'failed')),
    evidence_json TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (episode_id, version)
  )`,
  `CREATE TABLE IF NOT EXISTS clip_evidence_units (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL REFERENCES clip_evidence_packages(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    start_seconds REAL NOT NULL CHECK (start_seconds >= 0),
    end_seconds REAL NOT NULL CHECK (end_seconds > start_seconds),
    source_ids_json TEXT NOT NULL,
    qualification TEXT NOT NULL CHECK (qualification IN ('A', 'B', 'C', 'D')),
    coverage_json TEXT NOT NULL DEFAULT '{}',
    source_version TEXT,
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS clip_narrative_events (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL REFERENCES clip_evidence_packages(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL,
    window_key TEXT NOT NULL,
    source_evidence_ids_json TEXT NOT NULL,
    core_evidence_ids_json TEXT NOT NULL,
    context_before_ids_json TEXT NOT NULL,
    context_after_ids_json TEXT NOT NULL,
    start_seconds REAL NOT NULL CHECK (start_seconds >= 0),
    end_seconds REAL NOT NULL CHECK (end_seconds > start_seconds),
    state TEXT NOT NULL,
    characters_json TEXT NOT NULL,
    relationship TEXT NOT NULL,
    conflict TEXT NOT NULL,
    continuity TEXT NOT NULL CHECK (continuity IN ('continuous', 'limited', 'unclear')),
    seam_status TEXT NOT NULL CHECK (seam_status IN ('closed', 'expanded-closed', 'unclear')),
    provider TEXT,
    model TEXT,
    rule_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (package_id, event_key)
  )`,
  `CREATE TABLE IF NOT EXISTS clip_candidate_snapshots (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    package_id TEXT NOT NULL REFERENCES clip_evidence_packages(id) ON DELETE RESTRICT,
    qualification TEXT NOT NULL CHECK (qualification IN ('qualified', 'qualified_with_limit', 'blocked')),
    config_json TEXT NOT NULL,
    provider_json TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    task_id TEXT REFERENCES production_tasks(id) ON DELETE SET NULL,
    task_round INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS clip_candidate_publish_pointers (
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL REFERENCES clip_candidate_snapshots(id) ON DELETE RESTRICT,
    task_id TEXT REFERENCES production_tasks(id) ON DELETE SET NULL,
    task_round INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (drama_id, episode_id)
  )`,
  `CREATE TABLE IF NOT EXISTS clip_candidate_publish_members (
    candidate_id TEXT PRIMARY KEY REFERENCES task_items(id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL REFERENCES clip_candidate_snapshots(id) ON DELETE CASCADE,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES production_tasks(id) ON DELETE CASCADE,
    task_round INTEGER NOT NULL CHECK (task_round > 0),
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS clip_model_runs (
    id TEXT PRIMARY KEY,
    task_id TEXT REFERENCES production_tasks(id) ON DELETE SET NULL,
    package_id TEXT REFERENCES clip_evidence_packages(id) ON DELETE SET NULL,
    capability TEXT NOT NULL,
    status TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    input_ids_json TEXT NOT NULL,
    result_json TEXT,
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS clip_candidate_feedback (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    snapshot_id TEXT REFERENCES clip_candidate_snapshots(id) ON DELETE SET NULL,
    reason_code TEXT NOT NULL,
    evidence_ids_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS drama_tags (
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (drama_id, tag_id)
  )`,
  `CREATE TABLE IF NOT EXISTS production_tasks (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    config_snapshot TEXT NOT NULL,
    status TEXT NOT NULL,
    progress_current INTEGER NOT NULL DEFAULT 0,
    progress_total INTEGER NOT NULL DEFAULT 0,
    checkpoint TEXT,
    cost_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS task_items (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES production_tasks(id) ON DELETE CASCADE,
    planned_range TEXT,
    actual_range TEXT,
    status TEXT NOT NULL,
    export_batch_id TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS clip_export_batches (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    candidate_ids_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'cancelled', 'failed')),
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS clip_subtitle_variants (
    id TEXT PRIMARY KEY,
    candidate_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    start_seconds REAL NOT NULL CHECK (start_seconds >= 0),
    end_seconds REAL NOT NULL CHECK (end_seconds > start_seconds),
    source_track_ids_json TEXT NOT NULL DEFAULT '[]',
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS generated_materials (
    id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES production_tasks(id) ON DELETE CASCADE,
    task_item_id TEXT REFERENCES task_items(id) ON DELETE SET NULL,
    path TEXT NOT NULL,
    duration_seconds REAL,
    fps REAL,
    size_bytes INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    event_key TEXT,
    drama_id TEXT REFERENCES dramas(id) ON DELETE SET NULL,
    task_id TEXT REFERENCES production_tasks(id) ON DELETE SET NULL,
    task_item_id TEXT REFERENCES task_items(id) ON DELETE SET NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    action_target TEXT,
    occurred_at TEXT NOT NULL,
    read_at TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS provider_profiles (
    id TEXT PRIMARY KEY,
    capability TEXT NOT NULL,
    region TEXT NOT NULL,
    provider TEXT NOT NULL,
    endpoint TEXT,
    model TEXT,
    model_selection_source TEXT,
    secret_ref TEXT,
    pricing_json TEXT,
    timeout_ms INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_backups (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    reason TEXT NOT NULL,
    integrity_status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS app_logs (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL,
    event_type TEXT NOT NULL,
    details_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS secret_records (
    id TEXT PRIMARY KEY,
    encrypted_value BLOB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS model_studio_provisional_secrets (
    secret_ref TEXT PRIMARY KEY REFERENCES secret_records(id) ON DELETE CASCADE,
    capability TEXT NOT NULL CHECK (capability IN ('asr', 'text-analysis', 'multimodal-review')),
    owner_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS idx_episodes_drama_sort ON episodes (drama_id, sort_order)",
  "CREATE INDEX IF NOT EXISTS idx_tasks_drama_status ON production_tasks (drama_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_task_items_task_status ON task_items (task_id, status)",
  "CREATE INDEX IF NOT EXISTS idx_clip_subtitle_variants_candidate ON clip_subtitle_variants (candidate_id, start_seconds)",
  "CREATE INDEX IF NOT EXISTS idx_materials_drama_created ON generated_materials (drama_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_notifications_read_created ON notifications (read_at, created_at DESC)",
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_event_key ON notifications (event_key)",
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_profiles_capability ON provider_profiles (capability)",
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_assets_drama_global_source ON subtitle_assets (drama_id, source_path) WHERE episode_id IS NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_assets_drama_episode_source ON subtitle_assets (drama_id, episode_id, source_path) WHERE episode_id IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS idx_logs_created ON app_logs (created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_subtitle_tracks_drama_episode ON subtitle_tracks (drama_id, episode_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_subtitle_cues_track_range ON subtitle_cues (track_id, start_seconds, end_seconds)",
  "CREATE INDEX IF NOT EXISTS idx_subtitle_conflicts_drama_episode ON subtitle_conflicts (drama_id, episode_id, status, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_subtitle_semantic_events_episode_rule ON subtitle_semantic_events (drama_id, episode_id, rule_version, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_clip_candidate_semantic_events_event ON clip_candidate_semantic_events (semantic_event_id)",
  "CREATE INDEX IF NOT EXISTS idx_clip_candidate_scene_anchors_evidence ON clip_candidate_scene_anchors (evidence_id)",
  "CREATE INDEX IF NOT EXISTS idx_clip_evidence_packages_episode ON clip_evidence_packages (episode_id, version DESC)",
  "CREATE INDEX IF NOT EXISTS idx_clip_evidence_units_package ON clip_evidence_units (package_id, start_seconds)",
  "CREATE INDEX IF NOT EXISTS idx_clip_narrative_events_package ON clip_narrative_events (package_id, start_seconds)",
  "CREATE INDEX IF NOT EXISTS idx_clip_candidate_snapshots_candidate ON clip_candidate_snapshots (candidate_id, created_at DESC)",
  "CREATE INDEX IF NOT EXISTS idx_clip_candidate_publish_members_episode_round ON clip_candidate_publish_members (drama_id, episode_id, task_id, task_round)",
  "CREATE INDEX IF NOT EXISTS idx_clip_model_runs_package ON clip_model_runs (package_id, created_at DESC)",
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_ocr_regions_drama_default ON subtitle_ocr_regions (drama_id) WHERE scope = 'drama_default' AND episode_id IS NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_ocr_regions_episode_override ON subtitle_ocr_regions (drama_id, episode_id) WHERE scope = 'episode_override' AND episode_id IS NOT NULL"
];

// src/main/db/project-library-guards.ts
var createClipSubtitleVariantTable = (database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS clip_subtitle_variants (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES task_items(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      start_seconds REAL NOT NULL CHECK (start_seconds >= 0),
      end_seconds REAL NOT NULL CHECK (end_seconds > start_seconds),
      source_track_ids_json TEXT NOT NULL DEFAULT '[]',
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_clip_subtitle_variants_candidate ON clip_subtitle_variants (candidate_id, start_seconds);
  `);
};
var createProjectLibraryGuards = (database) => {
  const requiredTables = ["dramas", "episodes", "script_assets", "script_asset_segments", "subtitle_assets", "production_tasks", "generated_materials", "ai_evidence", "ai_drafts"];
  if (requiredTables.some((table) => !tableExists(database, table))) return;
  database.exec("DROP TRIGGER IF EXISTS trg_generated_materials_same_drama_insert; DROP TRIGGER IF EXISTS trg_generated_materials_same_drama_update;");
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_dramas_name_unique_insert
    BEFORE INSERT ON dramas
    WHEN EXISTS (SELECT 1 FROM dramas WHERE lower(trim(name)) = lower(trim(NEW.name)))
    BEGIN SELECT RAISE(ABORT, 'DUPLICATE_DRAMA_NAME'); END;

    CREATE TRIGGER IF NOT EXISTS trg_dramas_name_unique_update
    BEFORE UPDATE OF name ON dramas
    WHEN EXISTS (SELECT 1 FROM dramas WHERE id <> NEW.id AND lower(trim(name)) = lower(trim(NEW.name)))
    BEGIN SELECT RAISE(ABORT, 'DUPLICATE_DRAMA_NAME'); END;

    CREATE TRIGGER IF NOT EXISTS trg_episodes_drama_immutable
    BEFORE UPDATE OF drama_id ON episodes
    WHEN NEW.drama_id <> OLD.drama_id
    BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_PROJECT_OWNERSHIP'); END;

    CREATE TRIGGER IF NOT EXISTS trg_script_assets_drama_immutable
    BEFORE UPDATE OF drama_id ON script_assets
    WHEN NEW.drama_id <> OLD.drama_id
    BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_PROJECT_OWNERSHIP'); END;

    CREATE TRIGGER IF NOT EXISTS trg_production_tasks_drama_immutable
    BEFORE UPDATE OF drama_id ON production_tasks
    WHEN NEW.drama_id <> OLD.drama_id
    BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_PROJECT_OWNERSHIP'); END;

    CREATE TRIGGER IF NOT EXISTS trg_task_items_task_immutable
    BEFORE UPDATE OF task_id ON task_items
    WHEN NEW.task_id <> OLD.task_id
    BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_PROJECT_OWNERSHIP'); END;

    CREATE TRIGGER IF NOT EXISTS trg_ai_evidence_drama_immutable
    BEFORE UPDATE OF drama_id ON ai_evidence
    WHEN NEW.drama_id <> OLD.drama_id
    BEGIN SELECT RAISE(ABORT, 'IMMUTABLE_PROJECT_OWNERSHIP'); END;

    CREATE TRIGGER IF NOT EXISTS trg_generated_materials_same_drama_insert
    BEFORE INSERT ON generated_materials
    WHEN (SELECT drama_id FROM production_tasks WHERE id = NEW.task_id) <> NEW.drama_id
      OR (NEW.task_item_id IS NOT NULL AND (SELECT task_id FROM task_items WHERE id = NEW.task_item_id) <> NEW.task_id)
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_MATERIAL'); END;

    CREATE TRIGGER IF NOT EXISTS trg_generated_materials_same_drama_update
    BEFORE UPDATE ON generated_materials
    WHEN (SELECT drama_id FROM production_tasks WHERE id = NEW.task_id) <> NEW.drama_id
      OR (NEW.task_item_id IS NOT NULL AND (SELECT task_id FROM task_items WHERE id = NEW.task_item_id) <> NEW.task_id)
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_MATERIAL'); END;

    CREATE TRIGGER IF NOT EXISTS trg_script_assets_same_drama_insert
    BEFORE INSERT ON script_assets
    WHEN NEW.episode_id IS NOT NULL AND (SELECT drama_id FROM episodes WHERE id = NEW.episode_id) <> NEW.drama_id
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_SCRIPT'); END;

    CREATE TRIGGER IF NOT EXISTS trg_script_assets_same_drama_update
    BEFORE UPDATE OF drama_id, episode_id ON script_assets
    WHEN NEW.episode_id IS NOT NULL AND (SELECT drama_id FROM episodes WHERE id = NEW.episode_id) <> NEW.drama_id
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_SCRIPT'); END;

    CREATE TRIGGER IF NOT EXISTS trg_script_segments_same_drama_insert
    BEFORE INSERT ON script_asset_segments
    WHEN NEW.episode_id IS NOT NULL AND (SELECT drama_id FROM script_assets WHERE id = NEW.script_asset_id) <> (SELECT drama_id FROM episodes WHERE id = NEW.episode_id)
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_SCRIPT_SEGMENT'); END;

    CREATE TRIGGER IF NOT EXISTS trg_subtitle_assets_same_drama_insert
    BEFORE INSERT ON subtitle_assets
    WHEN NEW.episode_id IS NOT NULL AND (SELECT drama_id FROM episodes WHERE id = NEW.episode_id) <> NEW.drama_id
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_SUBTITLE'); END;

    CREATE TRIGGER IF NOT EXISTS trg_subtitle_assets_same_drama_update
    BEFORE UPDATE OF drama_id, episode_id ON subtitle_assets
    WHEN NEW.episode_id IS NOT NULL AND (SELECT drama_id FROM episodes WHERE id = NEW.episode_id) <> NEW.drama_id
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_SUBTITLE'); END;

    CREATE TRIGGER IF NOT EXISTS trg_script_segments_same_drama_update
    BEFORE UPDATE OF script_asset_id, episode_id ON script_asset_segments
    WHEN NEW.episode_id IS NOT NULL AND (SELECT drama_id FROM script_assets WHERE id = NEW.script_asset_id) <> (SELECT drama_id FROM episodes WHERE id = NEW.episode_id)
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_SCRIPT_SEGMENT'); END;

    CREATE TRIGGER IF NOT EXISTS trg_ai_evidence_same_drama_insert
    BEFORE INSERT ON ai_evidence
    WHEN NEW.episode_id IS NOT NULL AND (SELECT drama_id FROM episodes WHERE id = NEW.episode_id) <> NEW.drama_id
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_EVIDENCE'); END;

    CREATE TRIGGER IF NOT EXISTS trg_ai_evidence_same_drama_update
    BEFORE UPDATE OF drama_id, episode_id ON ai_evidence
    WHEN NEW.episode_id IS NOT NULL AND (SELECT drama_id FROM episodes WHERE id = NEW.episode_id) <> NEW.drama_id
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_EVIDENCE'); END;

    CREATE TRIGGER IF NOT EXISTS trg_ai_drafts_same_drama_insert
    BEFORE INSERT ON ai_drafts
    WHEN NEW.evidence_id IS NOT NULL AND (SELECT drama_id FROM production_tasks WHERE id = NEW.task_id) <> (SELECT drama_id FROM ai_evidence WHERE id = NEW.evidence_id)
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_AI_DRAFT'); END;

    CREATE TRIGGER IF NOT EXISTS trg_ai_drafts_same_drama_update
    BEFORE UPDATE OF task_id, evidence_id ON ai_drafts
    WHEN NEW.evidence_id IS NOT NULL AND (SELECT drama_id FROM production_tasks WHERE id = NEW.task_id) <> (SELECT drama_id FROM ai_evidence WHERE id = NEW.evidence_id)
    BEGIN SELECT RAISE(ABORT, 'CROSS_PROJECT_AI_DRAFT'); END;
  `);
};
var tableExists = (database, table) => database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== void 0;

// src/main/db/p1-schema.ts
var createP1Tables = (database) => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_evidence (
      id TEXT PRIMARY KEY,
      drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
      episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL,
      source_type TEXT NOT NULL CHECK (source_type IN ('subtitle', 'script', 'scene')),
      start_seconds REAL,
      end_seconds REAL,
      confidence REAL,
      summary TEXT NOT NULL,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_evidence_drama_episode ON ai_evidence (drama_id, episode_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS evaluation_runs (
      id TEXT PRIMARY KEY,
      capability TEXT NOT NULL,
      mode TEXT NOT NULL CHECK (mode IN ('controlled', 'configured')),
      metrics_json TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_drafts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES production_tasks(id) ON DELETE CASCADE,
      evidence_id TEXT REFERENCES ai_evidence(id) ON DELETE SET NULL,
      summary TEXT NOT NULL,
      start_seconds REAL,
      end_seconds REAL,
      confidence REAL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ai_drafts_task ON ai_drafts (task_id, created_at);
    CREATE TABLE IF NOT EXISTS timeline_projects (
      id TEXT PRIMARY KEY,
      draft_id TEXT NOT NULL UNIQUE REFERENCES ai_drafts(id) ON DELETE CASCADE,
      timeline_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
};

// src/main/db/subtitle-evidence-schema.ts
var addSubtitleEvidenceColumns = (database) => {
  addColumnIfPresent(database, "subtitle_assets", "acquisition", "TEXT NOT NULL DEFAULT 'imported'");
  addColumnIfPresent(database, "subtitle_assets", "evidence_nature", "TEXT NOT NULL DEFAULT 'reference_unknown'");
  addColumnIfPresent(database, "subtitle_tracks", "acquisition", "TEXT NOT NULL DEFAULT 'generated'");
  addColumnIfPresent(database, "subtitle_tracks", "evidence_nature", "TEXT NOT NULL DEFAULT 'audio_aligned'");
  addColumnIfPresent(database, "subtitle_tracks", "base_track_id", "TEXT REFERENCES subtitle_tracks(id) ON DELETE SET NULL");
  if (tableExists2(database, "subtitle_tracks")) {
    database.exec("UPDATE subtitle_tracks SET acquisition = 'imported', evidence_nature = 'reference_unknown' WHERE source_kind = 'import' AND (acquisition <> 'imported' OR evidence_nature <> 'reference_unknown')");
    database.exec("UPDATE subtitle_tracks SET acquisition = 'generated', evidence_nature = 'visual_aligned' WHERE source_kind = 'ocr' AND acquisition = 'generated' AND evidence_nature = 'audio_aligned'");
    database.exec("UPDATE subtitle_tracks SET acquisition = 'manual', evidence_nature = 'manual_resolved' WHERE source_kind = 'resolved' AND acquisition = 'generated' AND evidence_nature = 'audio_aligned'");
  }
  addColumnIfPresent(database, "subtitle_conflicts", "asr_confidence", "REAL");
  addColumnIfPresent(database, "subtitle_conflicts", "ocr_confidence", "REAL");
  addColumnIfPresent(database, "subtitle_quality_evaluations", "evaluated_cue_count", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfPresent(database, "subtitle_quality_evaluations", "elapsed_ms", "INTEGER NOT NULL DEFAULT 0");
};
var createSubtitleEvidenceTables = (database) => {
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
  `);
};
var normalizeProviderCapabilities = (database) => {
  if (!tableExists2(database, "provider_profiles")) return;
  database.exec("DROP INDEX IF EXISTS ux_provider_profiles_capability");
  database.exec(`UPDATE provider_profiles SET capability = CASE capability WHEN 'text_semantics' THEN 'text-analysis' WHEN 'video_understanding' THEN 'multimodal-review' ELSE capability END`);
  database.exec(`UPDATE provider_profiles
    SET secret_ref = COALESCE(secret_ref, (
      SELECT legacy.secret_ref FROM provider_profiles AS legacy
      WHERE legacy.capability = provider_profiles.capability AND legacy.id <> provider_profiles.id AND legacy.secret_ref IS NOT NULL
      ORDER BY legacy.updated_at DESC, legacy.id DESC LIMIT 1
    ))
    WHERE NOT EXISTS (
      SELECT 1 FROM provider_profiles AS newer
      WHERE newer.capability = provider_profiles.capability AND (newer.updated_at > provider_profiles.updated_at OR (newer.updated_at = provider_profiles.updated_at AND newer.id > provider_profiles.id))
    )`);
  database.exec(`DELETE FROM provider_profiles WHERE id IN (SELECT older.id FROM provider_profiles older JOIN provider_profiles newer ON newer.capability = older.capability AND (newer.updated_at > older.updated_at OR (newer.updated_at = older.updated_at AND newer.id > older.id)))`);
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_profiles_capability ON provider_profiles (capability)");
};
var tableExists2 = (database, table) => database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== void 0;
var addColumnIfPresent = (database, table, column, definition) => {
  if (!tableExists2(database, table)) return;
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(({ name }) => name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

// src/main/services/subtitle-episode-matcher.ts
import { basename, extname } from "node:path";
var extractEpisodeNoFromSubtitlePath = (sourcePath) => {
  const filename = basename(sourcePath, extname(sourcePath)).trim();
  const match = /^(?:第\s*)?0*(\d+)(?:\s*集)?(?:\s*[（(][^()（）]*[)）])?$/u.exec(filename);
  if (!match) return null;
  const episodeNo = Number(match[1]);
  return Number.isSafeInteger(episodeNo) && episodeNo > 0 ? episodeNo : null;
};

// src/main/db/migrate.ts
var migrateDatabase = (database) => {
  database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
  const apply = database.transaction(() => {
    if (!hasMigration(database, 1)) {
      applySchema(database);
      recordMigration(database, 1);
    }
    if (!hasMigration(database, 2)) {
      applySchema(database, true);
      recordMigration(database, 2);
    }
    if (!hasMigration(database, 3)) {
      addColumnIfMissing(database, "production_tasks", "cost_json", "TEXT NOT NULL DEFAULT '{}'");
      recordMigration(database, 3);
    }
    if (!hasMigration(database, 4)) {
      addColumnIfMissing(database, "notifications", "event_key", "TEXT");
      database.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_event_key ON notifications (event_key)");
      recordMigration(database, 4);
    }
    if (!hasMigration(database, 5)) {
      addColumnIfMissing(database, "notifications", "occurred_at", "TEXT");
      database.exec("UPDATE notifications SET occurred_at = COALESCE(occurred_at, updated_at, created_at)");
      recordMigration(database, 5);
    }
    if (!hasMigration(database, 6)) {
      database.exec("CREATE TABLE IF NOT EXISTS script_asset_segments (id TEXT PRIMARY KEY, script_asset_id TEXT NOT NULL REFERENCES script_assets(id) ON DELETE CASCADE, episode_no INTEGER NOT NULL, title TEXT NOT NULL, extracted_text TEXT NOT NULL, episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (script_asset_id, episode_no))");
      recordMigration(database, 6);
    }
    if (!hasMigration(database, 7)) {
      database.exec("CREATE TABLE IF NOT EXISTS subtitle_assets (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL, source_path TEXT NOT NULL, format TEXT NOT NULL, cue_count INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
      recordMigration(database, 7);
    }
    if (!hasMigration(database, 8)) {
      database.exec(`DELETE FROM provider_profiles WHERE id IN (
        SELECT older.id FROM provider_profiles older
        JOIN provider_profiles newer ON newer.capability = older.capability
          AND (newer.updated_at > older.updated_at OR (newer.updated_at = older.updated_at AND newer.id > older.id))
      )`);
      database.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_profiles_capability ON provider_profiles (capability)");
      recordMigration(database, 8);
    }
    if (!hasMigration(database, 9)) {
      database.exec("CREATE TABLE IF NOT EXISTS drama_import_preferences (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, last_import_directory TEXT NOT NULL, updated_at TEXT NOT NULL)");
      recordMigration(database, 9);
    }
    if (!hasMigration(database, 10)) {
      database.exec("CREATE TABLE IF NOT EXISTS drama_covers (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, source_kind TEXT NOT NULL CHECK (source_kind IN ('uploaded', 'auto_frame')), path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
      recordMigration(database, 10);
    }
    if (!hasMigration(database, 11)) {
      createP1Tables(database);
      recordMigration(database, 11);
    }
    if (!hasMigration(database, 12)) {
      if (tableExists3(database, "generated_materials")) addColumnIfMissing(database, "generated_materials", "draft_id", "TEXT REFERENCES ai_drafts(id) ON DELETE SET NULL");
      recordMigration(database, 12);
    }
    if (!hasMigration(database, 13)) {
      createProjectLibraryGuards(database);
      recordMigration(database, 13);
    }
    if (!hasMigration(database, 14)) {
      normalizeProviderCapabilities(database);
      recordMigration(database, 14);
    }
    if (!hasMigration(database, 15)) {
      createSubtitleEvidenceTables(database);
      createSubtitleEvidenceGuards(database);
      recordMigration(database, 15);
    }
    if (!hasMigration(database, 16)) {
      addSubtitleEvidenceColumns(database);
      recordMigration(database, 16);
    }
    if (!hasMigration(database, 17)) {
      createClipSubtitleVariantTable(database);
      recordMigration(database, 17);
    }
    if (!hasMigration(database, 18)) {
      createSubtitleRecognitionSettingsTable(database);
      recordMigration(database, 18);
    }
    if (!hasMigration(database, 19)) {
      if (tableExists3(database, "episodes")) {
        addColumnIfMissing(database, "episodes", "video_width", "INTEGER");
        addColumnIfMissing(database, "episodes", "video_height", "INTEGER");
      }
      recordMigration(database, 19);
    }
    if (!hasMigration(database, 20)) {
      createClipExportBatchesTable(database);
      recordMigration(database, 20);
    }
    if (!hasMigration(database, 21)) {
      upgradeClipExportBatchesTable(database);
      recordMigration(database, 21);
    }
    if (!hasMigration(database, 22)) {
      if (tableExists3(database, "task_items")) addColumnIfMissing(database, "task_items", "export_batch_id", "TEXT");
      recordMigration(database, 22);
    }
    if (!hasMigration(database, 23)) {
      upgradeSubtitleConflictReviewStatus(database);
      recordMigration(database, 23);
    }
    if (!hasMigration(database, 24)) {
      upgradeSubtitleRecognitionSettings(database);
      recordMigration(database, 24);
    }
    if (!hasMigration(database, 25)) {
      createSubtitleAssetIdempotencyIndexes(database);
      recordMigration(database, 25);
    }
    if (!hasMigration(database, 27)) {
      addSubtitleRecognitionMode(database);
      recordMigration(database, 27);
    }
    if (!hasMigration(database, 26)) {
      reconcileLegacySubtitleAssetEpisodes(database);
      recordMigration(database, 26);
    }
    if (!hasMigration(database, 28)) {
      createSubtitleRecognitionRunTables(database);
      recordMigration(database, 28);
    }
    if (!hasMigration(database, 29)) {
      addSubtitleRecognitionRuntimeIdentity(database);
      recordMigration(database, 29);
    }
    if (!hasMigration(database, 30)) {
      if (tableExists3(database, "episodes")) addColumnIfMissing(database, "episodes", "duration_alert_dismissed_at", "TEXT");
      recordMigration(database, 30);
    }
    if (!hasMigration(database, 31)) {
      createSubtitleEvidenceTables(database);
      recordMigration(database, 31);
    }
    if (!hasMigration(database, 32)) {
      createSubtitleEvidenceTables(database);
      recordMigration(database, 32);
    }
    if (!hasMigration(database, 33)) {
      createSubtitleEvidenceTables(database);
      recordMigration(database, 33);
    }
    if (!hasMigration(database, 34)) {
      if (tableExists3(database, "episodes")) addColumnIfMissing(database, "episodes", "source_fingerprint", "TEXT");
      recordMigration(database, 34);
    }
    if (!hasMigration(database, 35)) {
      createClipIntelligenceTables(database);
      recordMigration(database, 35);
    }
    if (!hasMigration(database, 36)) {
      addColumnIfMissing(database, "clip_candidate_snapshots", "task_id", "TEXT REFERENCES production_tasks(id) ON DELETE SET NULL");
      addColumnIfMissing(database, "clip_candidate_snapshots", "task_round", "INTEGER NOT NULL DEFAULT 0");
      addColumnIfMissing(database, "clip_candidate_publish_pointers", "task_id", "TEXT REFERENCES production_tasks(id) ON DELETE SET NULL");
      addColumnIfMissing(database, "clip_candidate_publish_pointers", "task_round", "INTEGER NOT NULL DEFAULT 0");
      recordMigration(database, 36);
    }
    if (!hasMigration(database, 37)) {
      database.exec("CREATE TABLE IF NOT EXISTS clip_generation_rounds (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, next_round INTEGER NOT NULL CHECK (next_round > 0), updated_at TEXT NOT NULL)");
      recordMigration(database, 37);
    }
    if (!hasMigration(database, 38)) {
      createClipCandidatePublishMembersTable(database);
      recordMigration(database, 38);
    }
    if (!hasMigration(database, 39)) {
      addColumnIfMissing(database, "clip_evidence_units", "coverage_json", "TEXT NOT NULL DEFAULT '{}'");
      addColumnIfMissing(database, "clip_evidence_units", "source_version", "TEXT");
      recordMigration(database, 39);
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
      ); CREATE INDEX IF NOT EXISTS idx_clip_narrative_events_package ON clip_narrative_events (package_id, start_seconds);`);
      recordMigration(database, 40);
    }
    if (!hasMigration(database, 41)) {
      createModelStudioProvisionalSecretsTable(database);
      recordMigration(database, 41);
    }
    if (!hasMigration(database, 42)) {
      addColumnIfPresent2(database, "model_studio_provisional_secrets", "capability", "TEXT");
      addColumnIfPresent2(database, "model_studio_provisional_secrets", "owner_id", "TEXT");
      recordMigration(database, 42);
    }
    if (!hasMigration(database, 43)) {
      addColumnIfPresent2(database, "provider_profiles", "model_selection_source", "TEXT");
      recordMigration(database, 43);
    }
    if (!hasMigration(database, 44)) {
      upgradeModelStudioProvisionalCapabilityConstraint(database);
      recordMigration(database, 44);
    }
  });
  apply();
  database.exec("CREATE TABLE IF NOT EXISTS drama_import_preferences (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, last_import_directory TEXT NOT NULL, updated_at TEXT NOT NULL)");
  createModelStudioProvisionalSecretsTable(database);
  addColumnIfPresent2(database, "model_studio_provisional_secrets", "capability", "TEXT");
  addColumnIfPresent2(database, "model_studio_provisional_secrets", "owner_id", "TEXT");
  addColumnIfPresent2(database, "provider_profiles", "model_selection_source", "TEXT");
  database.exec("CREATE TABLE IF NOT EXISTS drama_covers (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, source_kind TEXT NOT NULL CHECK (source_kind IN ('uploaded', 'auto_frame')), path TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  createP1Tables(database);
  upgradeModelStudioProvisionalCapabilityConstraint(database);
  if (tableExists3(database, "generated_materials")) addColumnIfMissing(database, "generated_materials", "draft_id", "TEXT REFERENCES ai_drafts(id) ON DELETE SET NULL");
  createProjectLibraryGuards(database);
  normalizeProviderCapabilities(database);
  createSubtitleEvidenceTables(database);
  addSubtitleEvidenceColumns(database);
  createSubtitleEvidenceGuards(database);
  createClipSubtitleVariantTable(database);
  createSubtitleRecognitionSettingsTable(database);
  upgradeSubtitleRecognitionSettings(database);
  addSubtitleRecognitionMode(database);
  createSubtitleRecognitionRunTables(database);
  addSubtitleRecognitionRuntimeIdentity(database);
  createSubtitleAssetIdempotencyIndexes(database);
  reconcileLegacySubtitleAssetEpisodes(database);
  createClipExportBatchesTable(database);
  createClipIntelligenceTables(database);
  createClipCandidatePublishMembersTable(database);
  database.exec("CREATE TABLE IF NOT EXISTS clip_generation_rounds (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, next_round INTEGER NOT NULL CHECK (next_round > 0), updated_at TEXT NOT NULL)");
  addColumnIfMissing(database, "clip_candidate_snapshots", "task_id", "TEXT REFERENCES production_tasks(id) ON DELETE SET NULL");
  addColumnIfMissing(database, "clip_candidate_snapshots", "task_round", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(database, "clip_candidate_publish_pointers", "task_id", "TEXT REFERENCES production_tasks(id) ON DELETE SET NULL");
  addColumnIfMissing(database, "clip_candidate_publish_pointers", "task_round", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(database, "clip_evidence_units", "coverage_json", "TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing(database, "clip_evidence_units", "source_version", "TEXT");
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
  ); CREATE INDEX IF NOT EXISTS idx_clip_narrative_events_package ON clip_narrative_events (package_id, start_seconds);`);
  if (tableExists3(database, "episodes")) {
    addColumnIfMissing(database, "episodes", "source_fingerprint", "TEXT");
    addColumnIfMissing(database, "episodes", "video_width", "INTEGER");
    addColumnIfMissing(database, "episodes", "video_height", "INTEGER");
    addColumnIfMissing(database, "episodes", "duration_alert_dismissed_at", "TEXT");
  }
};
var createClipIntelligenceTables = (database) => {
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
  CREATE INDEX IF NOT EXISTS idx_clip_model_runs_package ON clip_model_runs (package_id, created_at DESC);`);
};
var createModelStudioProvisionalSecretsTable = (database) => {
  database.exec("CREATE TABLE IF NOT EXISTS model_studio_provisional_secrets (secret_ref TEXT PRIMARY KEY REFERENCES secret_records(id) ON DELETE CASCADE, capability TEXT NOT NULL CHECK (capability IN ('asr', 'text-analysis', 'multimodal-review')), owner_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)");
};
var upgradeModelStudioProvisionalCapabilityConstraint = (database) => {
  if (!tableExists3(database, "model_studio_provisional_secrets") || !tableExists3(database, "secret_records")) return;
  const definition = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'model_studio_provisional_secrets'").get();
  if (definition?.sql.includes("'asr'")) return;
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
  ALTER TABLE model_studio_provisional_secrets_v44 RENAME TO model_studio_provisional_secrets;`);
};
var createClipCandidatePublishMembersTable = (database) => {
  database.exec(`CREATE TABLE IF NOT EXISTS clip_candidate_publish_members (
    candidate_id TEXT PRIMARY KEY REFERENCES task_items(id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL REFERENCES clip_candidate_snapshots(id) ON DELETE CASCADE,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES production_tasks(id) ON DELETE CASCADE,
    task_round INTEGER NOT NULL CHECK (task_round > 0), created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_clip_candidate_publish_members_episode_round ON clip_candidate_publish_members (drama_id, episode_id, task_id, task_round);`);
};
var createSubtitleRecognitionSettingsTable = (database) => {
  database.exec("CREATE TABLE IF NOT EXISTS subtitle_recognition_settings (drama_id TEXT PRIMARY KEY REFERENCES dramas(id) ON DELETE CASCADE, recognition_mode TEXT NOT NULL DEFAULT 'asr-ocr' CHECK (recognition_mode IN ('asr-only', 'ocr-only', 'asr-ocr')), scope TEXT NOT NULL CHECK (scope IN ('all', 'current', 'missing')), language TEXT NOT NULL CHECK (language IN ('zh-CN', 'zh-en', 'auto')), asr_mode TEXT NOT NULL CHECK (asr_mode IN ('audio-first', 'denoise', 'import-only')), ocr_mode TEXT NOT NULL CHECK (ocr_mode IN ('auto-region', 'fixed-bottom', 'episode-manual')), difference_threshold TEXT NOT NULL CHECK (difference_threshold IN ('standard', 'strict', 'loose')), import_strategy TEXT NOT NULL CHECK (import_strategy IN ('parallel', 'review-only')), updated_at TEXT NOT NULL)");
};
var createSubtitleRecognitionRunTables = (database) => {
  database.exec("CREATE TABLE IF NOT EXISTS subtitle_recognition_runs (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK (status IN ('running', 'interrupted', 'completed', 'partial', 'failed')), settings_json TEXT NOT NULL, episode_ids_json TEXT NOT NULL, total_count INTEGER NOT NULL CHECK (total_count > 0), completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0), failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0), current_episode_id TEXT REFERENCES episodes(id) ON DELETE SET NULL, ocr_runner_build_id TEXT, ocr_runner_sha256 TEXT, reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  database.exec("CREATE TABLE IF NOT EXISTS subtitle_recognition_run_items (run_id TEXT NOT NULL REFERENCES subtitle_recognition_runs(id) ON DELETE CASCADE, episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'interrupted')), reason TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (run_id, episode_id))");
  database.exec("CREATE INDEX IF NOT EXISTS ix_subtitle_recognition_runs_drama_updated ON subtitle_recognition_runs (drama_id, updated_at DESC)");
};
var addSubtitleRecognitionRuntimeIdentity = (database) => {
  if (!tableExists3(database, "subtitle_recognition_runs")) return;
  addColumnIfPresent2(database, "subtitle_recognition_runs", "ocr_runner_build_id", "TEXT");
  addColumnIfPresent2(database, "subtitle_recognition_runs", "ocr_runner_sha256", "TEXT");
};
var addSubtitleRecognitionMode = (database) => {
  if (!tableExists3(database, "subtitle_recognition_settings")) {
    createSubtitleRecognitionSettingsTable(database);
    return;
  }
  addColumnIfPresent2(database, "subtitle_recognition_settings", "recognition_mode", "TEXT NOT NULL DEFAULT 'asr-ocr' CHECK (recognition_mode IN ('asr-only', 'ocr-only', 'asr-ocr'))");
};
var createSubtitleAssetIdempotencyIndexes = (database) => {
  if (!tableExists3(database, "subtitle_assets")) return;
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_assets_drama_global_source ON subtitle_assets (drama_id, source_path) WHERE episode_id IS NULL");
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_subtitle_assets_drama_episode_source ON subtitle_assets (drama_id, episode_id, source_path) WHERE episode_id IS NOT NULL");
};
var reconcileLegacySubtitleAssetEpisodes = (database) => {
  if (!tableExists3(database, "subtitle_assets") || !tableExists3(database, "subtitle_tracks") || !tableExists3(database, "episodes")) return;
  const assets = database.prepare("SELECT id, drama_id AS dramaId, source_path AS sourcePath FROM subtitle_assets WHERE episode_id IS NULL").all();
  const candidates = assets.flatMap((asset) => {
    const episodeNo = extractEpisodeNoFromSubtitlePath(asset.sourcePath);
    if (episodeNo === null) return [];
    const episodes = database.prepare("SELECT id FROM episodes WHERE drama_id = ? AND episode_no = ?").all(asset.dramaId, episodeNo);
    return episodes.length === 1 ? [{ ...asset, episodeId: episodes[0].id }] : [];
  });
  const now = (/* @__PURE__ */ new Date()).toISOString();
  for (const candidate of candidates) {
    const duplicate = database.prepare("SELECT 1 FROM subtitle_assets WHERE drama_id = ? AND episode_id = ? AND source_path = ? AND id <> ?").get(candidate.dramaId, candidate.episodeId, candidate.sourcePath, candidate.id);
    if (duplicate) continue;
    database.prepare("UPDATE subtitle_assets SET episode_id = ?, updated_at = ? WHERE id = ?").run(candidate.episodeId, now, candidate.id);
    database.prepare("UPDATE subtitle_tracks SET episode_id = ?, updated_at = ? WHERE asset_id = ? AND episode_id IS NULL").run(candidate.episodeId, now, candidate.id);
  }
};
var upgradeSubtitleRecognitionSettings = (database) => {
  if (!tableExists3(database, "subtitle_recognition_settings")) {
    createSubtitleRecognitionSettingsTable(database);
    return;
  }
  const definition = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'subtitle_recognition_settings'").get();
  if (!definition?.sql?.includes("'display-only'")) return;
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
  `);
};
var createClipExportBatchesTable = (database) => {
  database.exec("CREATE TABLE IF NOT EXISTS clip_export_batches (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE, candidate_ids_json TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'cancelled', 'failed')), reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
  database.exec("CREATE INDEX IF NOT EXISTS ix_clip_export_batches_drama_updated ON clip_export_batches (drama_id, updated_at DESC)");
};
var upgradeSubtitleConflictReviewStatus = (database) => {
  if (!tableExists3(database, "subtitle_conflicts")) return;
  const definition = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'subtitle_conflicts'").get();
  if (definition?.sql?.includes("'reviewed'")) return;
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
  `);
};
var upgradeClipExportBatchesTable = (database) => {
  if (!tableExists3(database, "clip_export_batches")) {
    createClipExportBatchesTable(database);
    return;
  }
  const columns = database.prepare("PRAGMA table_info(clip_export_batches)").all();
  if (columns.some((column) => column.name === "reason")) {
    database.exec("CREATE INDEX IF NOT EXISTS ix_clip_export_batches_drama_updated ON clip_export_batches (drama_id, updated_at DESC)");
    return;
  }
  const reasonValue = columns.some((column) => column.name === "reason") ? "reason" : "NULL";
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
  `);
  database.exec("CREATE INDEX IF NOT EXISTS ix_clip_export_batches_drama_updated ON clip_export_batches (drama_id, updated_at DESC)");
};
var createSubtitleEvidenceGuards = (database) => {
  if (["subtitle_tracks", "subtitle_cues", "subtitle_conflicts", "subtitle_ocr_regions", "subtitle_quality_evaluations"].some((table) => !tableExists3(database, table))) return;
  database.exec("DROP TRIGGER IF EXISTS trg_subtitle_tracks_same_drama_insert; DROP TRIGGER IF EXISTS trg_subtitle_tracks_same_drama_update; DROP TRIGGER IF EXISTS trg_subtitle_regions_same_drama_insert; DROP TRIGGER IF EXISTS trg_subtitle_regions_same_drama_update; DROP TRIGGER IF EXISTS trg_subtitle_conflicts_same_drama_insert; DROP TRIGGER IF EXISTS trg_subtitle_conflicts_same_drama_update;");
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
  `);
};
var hasMigration = (database, version2) => {
  return database.prepare("SELECT 1 FROM schema_migrations WHERE version = ?").get(version2) !== void 0;
};
var tableExists3 = (database, table) => {
  return database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== void 0;
};
var applySchema = (database, skipNotificationEventIndex = false) => {
  for (const statement of INITIAL_SCHEMA) {
    if (skipNotificationEventIndex && statement.includes("ux_notifications_event_key")) {
      continue;
    }
    database.exec(statement);
  }
};
var recordMigration = (database, version2) => {
  database.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(version2, (/* @__PURE__ */ new Date()).toISOString());
};
var addColumnIfMissing = (database, table, column, definition) => {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(({ name }) => name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
};
var addColumnIfPresent2 = (database, table, column, definition) => {
  if (!tableExists3(database, table)) return;
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(({ name }) => name === column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

// src/main/media/ffmpeg-runner.ts
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { performance } from "node:perf_hooks";

// src/main/media/media-types.ts
var MediaError = class extends Error {
  constructor(code, message, actionable, exitCode = null) {
    super(message);
    this.code = code;
    this.actionable = actionable;
    this.exitCode = exitCode;
    this.name = "MediaError";
  }
};

// src/main/media/ffmpeg-runner.ts
var resolveMediaBinary = (binary, explicitPath) => {
  const envKey = binary === "ffmpeg" ? "SHORTDRAMA_FFMPEG_PATH" : "SHORTDRAMA_FFPROBE_PATH";
  const override = explicitPath ?? process.env[envKey];
  const candidates = [
    override,
    ...override ? [] : [
      process.env.SHORTDRAMA_RUNTIME_ROOT ? join(process.env.SHORTDRAMA_RUNTIME_ROOT, "models", `${binary}.exe`) : void 0,
      process.resourcesPath ? join(process.resourcesPath, "models", `${binary}.exe`) : void 0,
      join(process.cwd(), "models", `${binary}.exe`),
      join(process.cwd(), "node_modules", binary === "ffmpeg" ? "ffmpeg-static" : "ffprobe-static", binary === "ffmpeg" ? `${binary}.exe` : "bin/win32/x64/ffprobe.exe")
    ],
    ...pathCandidates(binary)
  ].filter((candidate) => Boolean(candidate));
  return candidates.find((candidate) => existsSync(candidate)) ?? findOnPath(binary);
};
var runMediaProcess = (command, args, options = {}) => {
  if (options.signal?.aborted) return Promise.reject(new MediaError("CANCELLED", "\u5A92\u4F53\u4EFB\u52A1\u5DF2\u53D6\u6D88\u3002", "\u65E0\u9700\u91CD\u8BD5\u3002"));
  return new Promise((resolve2, reject) => {
    let child;
    try {
      child = spawn(command, [...args], {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: "pipe",
        windowsHide: true
      });
    } catch (error) {
      reject(toProcessError(error, command));
      return;
    }
    const startedAt = performance.now();
    let stdout = "";
    let stderr = "";
    let settled = false;
    let cancelled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve2(result);
    };
    const abort = () => {
      if (settled) return;
      cancelled = true;
      child.kill();
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(toProcessError(error, command));
    });
    child.on("close", (exitCode, signal) => {
      options.signal?.removeEventListener("abort", abort);
      if (cancelled) {
        settled = true;
        reject(new MediaError("CANCELLED", "\u5A92\u4F53\u4EFB\u52A1\u5DF2\u53D6\u6D88\u3002", "\u53EF\u4ECE\u4EFB\u52A1\u4E2D\u5FC3\u91CD\u65B0\u8FD0\u884C\u3002"));
        return;
      }
      finish({ command, stdout, stderr, exitCode, signal, durationMs: Math.round(performance.now() - startedAt) });
    });
  });
};
var assertSuccessfulProcess = (result) => {
  if (result.exitCode === 0) return result;
  throw new MediaError("FFMPEG_FAILED", `\u5A92\u4F53\u547D\u4EE4\u5931\u8D25\uFF08\u9000\u51FA\u7801 ${result.exitCode ?? "\u672A\u77E5"}\uFF09\u3002`, "\u68C0\u67E5\u6587\u4EF6\u6743\u9650\u3001\u78C1\u76D8\u7A7A\u95F4\u548C\u5A92\u4F53\u683C\u5F0F\u540E\u91CD\u8BD5\u3002", result.exitCode);
};
var pathCandidates = (binary) => {
  const home = homedir();
  return [join(home, "AppData", "Local", "Microsoft", "WinGet", "Packages", `${binary}.exe`), join(home, "scoop", "shims", `${binary}.exe`)];
};
var findOnPath = (binary) => {
  const pathValue = process.env.PATH ?? "";
  for (const directory of pathValue.split(delimiter)) {
    const candidate = join(directory, process.platform === "win32" ? `${binary}.exe` : binary);
    if (existsSync(candidate)) return candidate;
  }
  return null;
};
var toProcessError = (error, command) => {
  const code = isNodeError(error) && (error.code === "ENOENT" || error.code === "EACCES") ? "FFMPEG_UNAVAILABLE" : "FFMPEG_FAILED";
  const message = code === "FFMPEG_UNAVAILABLE" ? `${command} \u672A\u627E\u5230\u3002` : `${command} \u65E0\u6CD5\u542F\u52A8\u3002`;
  return new MediaError(code, message, "\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E FFmpeg/ffprobe \u8DEF\u5F84\uFF0C\u6216\u5B89\u88C5\u53D7\u652F\u6301\u7684\u672C\u5730\u7248\u672C\u3002");
};
var isNodeError = (error) => error instanceof Error && "code" in error;

// src/main/media/media-source-fingerprint.ts
import { createHash } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
var fingerprintMediaSource = (sourcePath) => {
  try {
    const resolvedPath = realpathSync(sourcePath);
    const stat = statSync(resolvedPath);
    if (!stat.isFile()) return null;
    return createHash("sha256").update(`${resolvedPath}\0${stat.size}\0${stat.mtimeMs}`).digest("hex");
  } catch {
    return null;
  }
};

// src/main/security/secret-service.ts
import { randomUUID } from "node:crypto";
import { z as z2 } from "zod";

// src/shared/provider-auth-schema.ts
import { z } from "zod";
var authSchemas = {
  none: { id: "none", fields: [], requiresCredentialOnInitialSave: false },
  "api-key": {
    id: "api-key",
    fields: [{ key: "apiKey", label: "API \u5BC6\u94A5", placeholder: "\u8BF7\u8F93\u5165 API \u5BC6\u94A5", required: true }],
    requiresCredentialOnInitialSave: false
  },
  "tencent-cloud-secret-pair": {
    id: "tencent-cloud-secret-pair",
    fields: [
      { key: "secretId", label: "SecretId", placeholder: "\u8BF7\u8F93\u5165 SecretId", required: true },
      { key: "secretKey", label: "SecretKey", placeholder: "\u8BF7\u8F93\u5165 SecretKey", required: true }
    ],
    requiresCredentialOnInitialSave: true
  }
};
var credentialPackageSchema = z.object({
  version: z.literal(1),
  schema: z.enum(["api-key", "tencent-cloud-secret-pair"]),
  values: z.record(z.string(), z.string().trim().min(1).max(4096))
}).strict();
var providerAuthSchemaForId = (id) => authSchemas[id];
var createProviderCredentialPackage = (schema, values) => {
  if (schema.id === "none") throw new Error("\u672C\u5730\u65B9\u6848\u4E0D\u9700\u8981\u4FDD\u5B58\u51ED\u636E\u3002");
  const normalizedValues = {};
  for (const field of schema.fields) {
    const value = values[field.key]?.trim() ?? "";
    if (field.required && !value) throw new Error(`${field.label}\u4E0D\u80FD\u4E3A\u7A7A\u3002`);
    if (value) normalizedValues[field.key] = value;
  }
  return credentialPackageSchema.parse({ version: 1, schema: schema.id, values: normalizedValues });
};
var parseProviderCredentialPackage = (value, expectedSchema) => {
  const parsed = credentialPackageSchema.safeParse(value);
  return parsed.success && parsed.data.schema === expectedSchema ? parsed.data : null;
};
var credentialValuesFromStoredValue = (value, expectedSchema) => {
  try {
    const parsedValue = JSON.parse(value);
    const packaged = parseProviderCredentialPackage(parsedValue, expectedSchema);
    if (packaged) return packaged.values;
    if (expectedSchema === "tencent-cloud-secret-pair") {
      const legacy = z.object({ version: z.literal(1), provider: z.literal("tencent-cloud-asr"), secretId: z.string().trim().min(1).max(4096), secretKey: z.string().trim().min(1).max(4096) }).safeParse(parsedValue);
      if (legacy.success) return { secretId: legacy.data.secretId, secretKey: legacy.data.secretKey };
      const legacyUppercase = z.object({ version: z.literal(1), provider: z.literal("tencent-cloud-asr"), SecretId: z.string().trim().min(1).max(4096), SecretKey: z.string().trim().min(1).max(4096) }).safeParse(parsedValue);
      return legacyUppercase.success ? { secretId: legacyUppercase.data.SecretId, secretKey: legacyUppercase.data.SecretKey } : null;
    }
    return null;
  } catch {
    return expectedSchema === "api-key" && value.trim() ? { apiKey: value.trim() } : null;
  }
};

// src/shared/provider-catalog.ts
var MODEL_STUDIO_PROVIDER = "\u963F\u91CC\u4E91\u767E\u70BC / Model Studio";
var MODEL_STUDIO_WAITING_MODEL_LABEL = "\u7B49\u5F85\u81EA\u52A8\u9009\u62E9";
var MODEL_STUDIO_CONFIGURED_MODEL_LABEL = "\u5DF2\u914D\u7F6E\u76EE\u5F55\u6A21\u578B";
var MODEL_STUDIO_AUTOMATIC_MODEL_LABEL = "\u5DF2\u81EA\u52A8\u9009\u62E9\u517C\u5BB9\u6A21\u578B";
var normalizeProviderIdentity = (provider) => provider.normalize("NFKC").replace(/[\s\p{Cf}]+/gu, "").toLocaleLowerCase("en-US");
var isModelStudioProvider = (provider) => typeof provider === "string" && normalizeProviderIdentity(provider) === normalizeProviderIdentity(MODEL_STUDIO_PROVIDER);
var isModelStudioDisplayModelLabel = (model) => {
  const normalized = model?.trim() ?? "";
  return normalized === MODEL_STUDIO_AUTOMATIC_MODEL_LABEL || normalized === MODEL_STUDIO_WAITING_MODEL_LABEL || normalized === MODEL_STUDIO_CONFIGURED_MODEL_LABEL;
};
var PROVIDER_CATALOG = [
  {
    id: "whispercpp-local",
    name: "whisper.cpp\uFF08\u672C\u673A\uFF09",
    capabilities: ["asr"],
    region: "local",
    costType: "local",
    costLabel: "\u672C\u673A\u8FD0\u884C",
    costNotice: "\u4E0D\u4E0A\u4F20\u539F\u7247\uFF1B\u6A21\u578B\u4E0B\u8F7D\u3001\u786C\u4EF6\u548C\u90E8\u7F72\u6210\u672C\u7531\u4F60\u627F\u62C5\u3002",
    quality: "local-controllable",
    qualityLabel: "\u672C\u673A\u53EF\u63A7",
    bestFor: "\u9690\u79C1\u4F18\u5148\u3001\u53EF\u90E8\u7F72\u672C\u5730 ASR \u670D\u52A1\u7684\u5B57\u5E55\u8BC6\u522B\u3002",
    notFor: "\u5E0C\u671B\u514D\u90E8\u7F72\u76F4\u63A5\u4F7F\u7528\u6258\u7BA1 API \u7684\u573A\u666F\u3002",
    difficulty: "local-setup",
    difficultyLabel: "\u9700\u8981\u672C\u673A\u90E8\u7F72",
    endpoint: "http://127.0.0.1:8080",
    model: "base",
    timeoutMs: 6e4,
    requiresSecret: false,
    authSchemaId: "none",
    officialDocsUrl: "https://github.com/ggml-org/whisper.cpp",
    pricingUrl: "https://github.com/ggml-org/whisper.cpp",
    verifiedAt: "2026-07-26"
  },
  {
    id: "ollama-local",
    name: "Ollama\uFF08\u672C\u673A\uFF09",
    capabilities: ["text-analysis", "multimodal-review"],
    region: "local",
    costType: "local",
    costLabel: "\u672C\u673A\u8FD0\u884C",
    costNotice: "Ollama \u672C\u8EAB\u4E0D\u6536 API \u8D39\uFF1B\u6A21\u578B\u8BB8\u53EF\u3001\u663E\u5B58\u548C\u8BBE\u5907\u6210\u672C\u9700\u81EA\u884C\u6838\u5BF9\u3002",
    quality: "local-controllable",
    qualityLabel: "\u672C\u673A\u53EF\u63A7",
    bestFor: "\u5E0C\u671B\u672C\u5730\u8FD0\u884C\u6587\u672C/\u89C6\u89C9\u6A21\u578B\u5E76\u81EA\u884C\u9009\u62E9\u6A21\u578B\u7684\u56E2\u961F\u3002",
    notFor: "\u4F4E\u914D\u7F6E\u7535\u8111\u6216\u8981\u6C42\u56FA\u5B9A\u4E91\u7AEF SLA \u7684\u573A\u666F\u3002",
    difficulty: "local-setup",
    difficultyLabel: "\u9700\u8981\u672C\u673A\u90E8\u7F72",
    endpoint: "http://127.0.0.1:11434",
    model: "\u8BF7\u6309\u672C\u673A\u5DF2\u5B89\u88C5\u6A21\u578B\u586B\u5199",
    timeoutMs: 6e4,
    requiresSecret: false,
    authSchemaId: "none",
    officialDocsUrl: "https://docs.ollama.com/",
    pricingUrl: "https://docs.ollama.com/",
    verifiedAt: "2026-07-26"
  },
  {
    id: "gemini-api",
    name: "Google Gemini API",
    capabilities: ["text-analysis", "multimodal-review"],
    region: "global",
    costType: "free-tier",
    costLabel: "\u514D\u8D39\u989D\u5EA6 + \u6309\u91CF\u4ED8\u8D39",
    costNotice: "\u514D\u8D39\u5C42\u914D\u989D\u3001\u5730\u57DF\u548C\u53EF\u7528\u6A21\u578B\u4F1A\u53D8\u52A8\uFF1B\u5F00\u901A\u524D\u4EE5\u5B98\u65B9\u4EF7\u683C\u9875\u4E3A\u51C6\u3002",
    quality: "cloud-high-capability",
    qualityLabel: "\u4E91\u7AEF\u9AD8\u80FD\u529B\u5019\u9009",
    bestFor: "\u5148\u7528\u5B98\u65B9\u514D\u8D39\u5C42\u9A8C\u8BC1\u6587\u672C\u6216\u591A\u6A21\u6001\u9700\u6C42\uFF0C\u518D\u6309\u91CF\u6269\u5C55\u3002",
    notFor: "\u4E0D\u80FD\u63A5\u53D7\u8DE8\u5883\u6570\u636E\u5904\u7406\u6216\u4F9D\u8D56\u56FA\u5B9A\u514D\u8D39\u989D\u5EA6\u7684\u573A\u666F\u3002",
    difficulty: "guided-api",
    difficultyLabel: "\u586B\u5199 API \u5BC6\u94A5",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    model: "gemini-2.5-flash",
    timeoutMs: 6e4,
    requiresSecret: true,
    authSchemaId: "api-key",
    officialDocsUrl: "https://ai.google.dev/gemini-api/docs/models",
    pricingUrl: "https://ai.google.dev/gemini-api/docs/pricing",
    verifiedAt: "2026-07-26"
  },
  {
    id: "openai-api",
    name: "OpenAI API",
    capabilities: ["asr", "text-analysis", "multimodal-review"],
    region: "global",
    costType: "paid",
    costLabel: "\u6309\u91CF\u4ED8\u8D39",
    costNotice: "\u6309\u6A21\u578B\u548C\u7528\u91CF\u8BA1\u8D39\uFF1B\u672C\u76EE\u5F55\u4E0D\u627F\u8BFA\u514D\u8D39 API \u989D\u5EA6\u3002",
    quality: "cloud-high-capability",
    qualityLabel: "\u4E91\u7AEF\u9AD8\u80FD\u529B\u5019\u9009",
    bestFor: "\u5E0C\u671B\u4F7F\u7528\u7EDF\u4E00\u4E91\u7AEF API \u63A5\u5165\u8BED\u97F3\u3001\u6587\u672C\u548C\u89C6\u89C9\u80FD\u529B\u3002",
    notFor: "\u4E0D\u80FD\u63A5\u53D7\u8DE8\u5883\u6570\u636E\u5904\u7406\u6216\u6309\u91CF\u8BA1\u8D39\u7684\u573A\u666F\u3002",
    difficulty: "guided-api",
    difficultyLabel: "\u586B\u5199 API \u5BC6\u94A5",
    endpoint: "https://api.openai.com/v1",
    model: "\u8BF7\u6309\u6240\u9009\u80FD\u529B\u586B\u5199\u6A21\u578B",
    timeoutMs: 6e4,
    requiresSecret: true,
    authSchemaId: "api-key",
    officialDocsUrl: "https://developers.openai.com/api/docs/models",
    pricingUrl: "https://developers.openai.com/api/docs/pricing",
    verifiedAt: "2026-07-26"
  },
  {
    id: "model-studio-asr",
    name: MODEL_STUDIO_PROVIDER,
    capabilities: ["asr"],
    region: "cn",
    costType: "paid",
    costLabel: "\u6309\u91CF\u4ED8\u8D39",
    costNotice: "\u8BED\u97F3\u8BC6\u522B\u6309\u97F3\u9891\u65F6\u957F\u8BA1\u8D39\uFF1B\u5B9E\u9645\u4EF7\u683C\u4E0E\u53EF\u7528\u533A\u57DF\u4EE5\u767E\u70BC\u5B98\u65B9\u9875\u9762\u4E3A\u51C6\u3002",
    quality: "balanced",
    qualityLabel: "\u56FD\u5185\u4E91\u7AEF\u5019\u9009",
    bestFor: "\u9700\u8981\u4F7F\u7528\u767E\u70BC Paraformer \u8FDB\u884C\u4E2D\u6587\u6216\u591A\u8BED\u79CD\u8BED\u97F3\u8BC6\u522B\u7684\u573A\u666F\u3002",
    notFor: "\u5E0C\u671B\u672C\u8F6E\u7ACB\u5373\u542F\u7528\u4E91\u7AEF ASR \u6267\u884C\u6216\u56FA\u5B9A\u8D39\u7528\u7684\u573A\u666F\u3002",
    difficulty: "advanced-api",
    difficultyLabel: "\u586B\u5199 API \u5BC6\u94A5\u540E\u81EA\u52A8\u9009\u62E9",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: null,
    timeoutMs: 6e4,
    requiresSecret: true,
    authSchemaId: "api-key",
    officialDocsUrl: "https://help.aliyun.com/zh/model-studio/",
    pricingUrl: "https://help.aliyun.com/zh/model-studio/pricing/",
    verifiedAt: "2026-08-05"
  },
  {
    id: "tencent-cloud-asr",
    name: "\u817E\u8BAF\u4E91 ASR",
    capabilities: ["asr"],
    region: "cn",
    costType: "paid",
    costLabel: "\u6309\u91CF\u4ED8\u8D39",
    costNotice: "\u817E\u8BAF\u4E91 ASR \u6309\u91CF\u8BA1\u8D39\uFF1B\u5DF2\u652F\u6301 SecretId \u4E0E SecretKey \u5B89\u5168\u4FDD\u5B58\u53CA\u6700\u5C0F\u7B7E\u540D\u8FDE\u901A\u6027\u68C0\u6D4B\uFF0C\u4E0D\u4E0A\u4F20\u97F3\u89C6\u9891\u3002",
    quality: "balanced",
    qualityLabel: "\u56FD\u5185\u4E91\u7AEF\u5019\u9009",
    bestFor: "\u9700\u8981\u4FDD\u5B58\u817E\u8BAF\u4E91 ASR \u53CC\u51ED\u636E\u5E76\u8FDB\u884C\u6700\u5C0F\u7B7E\u540D\u8FDE\u901A\u6027\u68C0\u6D4B\u7684\u573A\u666F\u3002",
    notFor: "\u5E0C\u671B\u5F53\u524D\u76F4\u63A5\u4E0A\u4F20\u5A92\u4F53\u6216\u521B\u5EFA\u817E\u8BAF\u4E91 ASR \u5B57\u5E55\u8BC6\u522B\u4EFB\u52A1\u7684\u573A\u666F\u3002",
    difficulty: "advanced-api",
    difficultyLabel: "\u9700\u53CC\u51ED\u636E\u7B7E\u540D\u9002\u914D",
    endpoint: "https://asr.tencentcloudapi.com",
    model: "16k_zh",
    timeoutMs: 6e4,
    requiresSecret: true,
    authSchemaId: "tencent-cloud-secret-pair",
    officialDocsUrl: "https://cloud.tencent.com/document/product/1093/35614",
    pricingUrl: "https://cloud.tencent.com/document/product/1093",
    verifiedAt: "2026-08-05"
  },
  {
    id: "deepseek-api",
    name: "DeepSeek API",
    capabilities: ["text-analysis"],
    region: "cn",
    costType: "paid",
    costLabel: "\u6309\u91CF\u4ED8\u8D39",
    costNotice: "\u6309\u8F93\u5165\u3001\u8F93\u51FA\u548C\u7F13\u5B58 token \u8BA1\u8D39\uFF1B\u5CF0\u8C37\u4EF7\u683C\u548C\u6A21\u578B\u5B9A\u4EF7\u4EE5\u5B98\u65B9\u4EF7\u683C\u9875\u4E3A\u51C6\u3002",
    quality: "balanced",
    qualityLabel: "\u56FD\u5185\u4E91\u7AEF\u5019\u9009",
    bestFor: "\u9700\u8981\u56FD\u5185\u4E91\u7AEF\u6587\u672C\u8BED\u4E49\u5206\u6790\uFF0C\u5E76\u4F7F\u7528 OpenAI \u517C\u5BB9 API \u914D\u7F6E\u7684\u56E2\u961F\u3002",
    notFor: "\u9700\u8981\u672C\u673A\u79BB\u7EBF\u5904\u7406\u3001ASR \u6216\u89C6\u9891\u7406\u89E3\u590D\u6838\u7684\u573A\u666F\u3002",
    difficulty: "guided-api",
    difficultyLabel: "\u586B\u5199 API \u5BC6\u94A5",
    endpoint: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    timeoutMs: 6e4,
    requiresSecret: true,
    authSchemaId: "api-key",
    officialDocsUrl: "https://api-docs.deepseek.com/",
    pricingUrl: "https://api-docs.deepseek.com/quick_start/pricing/",
    verifiedAt: "2026-08-04"
  },
  {
    id: "model-studio",
    name: MODEL_STUDIO_PROVIDER,
    capabilities: ["text-analysis", "multimodal-review"],
    region: "cn",
    costType: "trial-unknown",
    costLabel: "\u8BD5\u7528/\u989D\u5EA6\u5F85\u786E\u8BA4",
    costNotice: "\u672C\u8F6E\u672A\u627F\u8BFA\u5177\u4F53\u514D\u8D39\u989D\u5EA6\uFF1B\u5F00\u901A\u524D\u5FC5\u987B\u5728\u5B98\u65B9\u4EF7\u683C\u9875\u6838\u9A8C\u3002",
    quality: "balanced",
    qualityLabel: "\u56FD\u5185\u4E91\u7AEF\u5019\u9009",
    bestFor: "\u9700\u8981\u8BC4\u4F30\u56FD\u5185\u4E91\u670D\u52A1\u8DEF\u5F84\u7684\u6587\u672C\u6216\u591A\u6A21\u6001\u9700\u6C42\u3002",
    notFor: "\u628A\u8BD5\u7528\u989D\u5EA6\u5F53\u6210\u957F\u671F\u56FA\u5B9A\u6210\u672C\u7684\u573A\u666F\u3002",
    difficulty: "guided-api",
    difficultyLabel: "\u586B\u5199 API \u5BC6\u94A5",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: null,
    timeoutMs: 6e4,
    requiresSecret: true,
    authSchemaId: "api-key",
    officialDocsUrl: "https://www.alibabacloud.com/help/en/model-studio/vision",
    pricingUrl: "https://www.alibabacloud.com/help/en/model-studio/pricing",
    verifiedAt: "2026-08-14"
  }
];
var MODEL_STUDIO_DISCOVERY_HOSTS = Object.freeze([...new Set(
  PROVIDER_CATALOG.filter((entry) => entry.id === "model-studio" && entry.endpoint).map((entry) => new URL(entry.endpoint).hostname.toLowerCase())
)]);
var modelGuidanceValues = /* @__PURE__ */ new Set([
  ...PROVIDER_CATALOG.map((entry) => entry.model).filter((model) => Boolean(model?.startsWith("\u8BF7\u6309"))),
  // A persisted value from the previous Model Studio catalogue. Keep it
  // controlled until the automatic discovery path replaces it.
  "\u8BF7\u6309\u5F00\u901A\u6A21\u578B\u586B\u5199"
]);
var isProviderModelGuidanceValue = (model) => modelGuidanceValues.has(model?.trim() ?? "") || isModelStudioDisplayModelLabel(model);

// src/main/security/secret-store.ts
import { safeStorage } from "electron";
var canStoreSecrets = () => safeStorage.isEncryptionAvailable();
var encryptSecret = (secret) => {
  if (!canStoreSecrets()) {
    throw new Error("\u5F53\u524D Windows \u8D26\u6237\u7684\u5BC6\u94A5\u52A0\u5BC6\u4E0D\u53EF\u7528\uFF0C\u65E0\u6CD5\u4FDD\u5B58\u4F9B\u5E94\u5546\u5BC6\u94A5\u3002");
  }
  return safeStorage.encryptString(secret);
};
var decryptSecret = (encryptedSecret) => {
  if (!canStoreSecrets()) {
    throw new Error("\u5F53\u524D Windows \u8D26\u6237\u7684\u5BC6\u94A5\u52A0\u5BC6\u4E0D\u53EF\u7528\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u4F9B\u5E94\u5546\u5BC6\u94A5\u3002");
  }
  return safeStorage.decryptString(encryptedSecret);
};

// src/main/security/secret-service.ts
var secretInputSchema = z2.object({
  secretRef: z2.string().uuid().optional(),
  value: z2.string().trim().min(1).max(4096)
});
var providerCredentialInputSchema = z2.object({
  secretRef: z2.string().uuid().optional(),
  credential: z2.object({
    version: z2.literal(1),
    schema: z2.enum(["api-key", "tencent-cloud-secret-pair"]),
    values: z2.record(z2.string(), z2.string().trim().min(1).max(4096))
  }).strict()
});
var secretReferenceSchema = z2.string().uuid();
var modelStudioCapabilitySchema = z2.enum(["asr", "text-analysis", "multimodal-review"]);
var modelStudioProvisionalInputSchema = secretInputSchema.extend({
  capability: modelStudioCapabilitySchema,
  ownerId: z2.string().trim().min(1).max(100)
});
var modelStudioProvisionalCredentialInputSchema = providerCredentialInputSchema.extend({
  capability: modelStudioCapabilitySchema,
  ownerId: z2.string().trim().min(1).max(100)
});
var SecretService = class {
  constructor(database) {
    this.database = database;
    const now = Date.now();
    const pending = database.prepare("SELECT secret_ref AS secretRef, expires_at AS expiresAt FROM model_studio_provisional_secrets").all();
    for (const provisional of pending) this.scheduleProvisionalCleanup(provisional.secretRef, Math.max(0, Date.parse(provisional.expiresAt) - now));
  }
  provisionalTimers = /* @__PURE__ */ new Map();
  save(input) {
    const { secretRef, value } = secretInputSchema.parse(input);
    const id = secretRef ?? randomUUID();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const encryptedValue = encryptSecret(value);
    this.database.transaction(() => {
      this.assertSecretRefIsUnused(id);
      this.database.prepare("INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (@id, @encryptedValue, @createdAt, @updatedAt)").run({ id, encryptedValue, createdAt: now, updatedAt: now });
    })();
    return { exists: true, maskedValue: maskSecret(value), secretRef: id };
  }
  saveProviderCredential(input) {
    const { secretRef, credential } = providerCredentialInputSchema.parse(input);
    const id = secretRef ?? randomUUID();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const serialized = JSON.stringify(createProviderCredentialPackage(providerAuthSchemaForId(credential.schema), credential.values));
    this.database.transaction(() => {
      this.assertSecretRefIsUnused(id);
      this.database.prepare("INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (@id, @encryptedValue, @createdAt, @updatedAt)").run({ id, encryptedValue: encryptSecret(serialized), createdAt: now, updatedAt: now });
    })();
    return { exists: true, maskedValue: "\u5DF2\u914D\u7F6E", secretRef: id };
  }
  saveModelStudioProvisional(input) {
    const { secretRef, value, capability, ownerId } = modelStudioProvisionalInputSchema.parse(input);
    const id = secretRef ?? randomUUID();
    const now = /* @__PURE__ */ new Date();
    const expiresAt = new Date(now.getTime() + 6e4).toISOString();
    const encryptedValue = encryptSecret(value);
    this.database.transaction(() => {
      this.assertSecretRefIsUnused(id);
      this.database.prepare("INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, encryptedValue, now.toISOString(), now.toISOString());
      this.database.prepare("INSERT INTO model_studio_provisional_secrets (secret_ref, capability, owner_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(id, capability, ownerId, expiresAt, now.toISOString());
    })();
    this.scheduleProvisionalCleanup(id, 6e4);
    return { exists: true, maskedValue: maskSecret(value), secretRef: id };
  }
  saveModelStudioProvisionalCredential(input) {
    const { secretRef, credential, capability, ownerId } = modelStudioProvisionalCredentialInputSchema.parse(input);
    const id = secretRef ?? randomUUID();
    const now = /* @__PURE__ */ new Date();
    const expiresAt = new Date(now.getTime() + 6e4).toISOString();
    const encryptedValue = encryptSecret(JSON.stringify(createProviderCredentialPackage(providerAuthSchemaForId(credential.schema), credential.values)));
    this.database.transaction(() => {
      this.assertSecretRefIsUnused(id);
      this.database.prepare("INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)").run(id, encryptedValue, now.toISOString(), now.toISOString());
      this.database.prepare("INSERT INTO model_studio_provisional_secrets (secret_ref, capability, owner_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)").run(id, capability, ownerId, expiresAt, now.toISOString());
    })();
    this.scheduleProvisionalCleanup(id, 6e4);
    return { exists: true, maskedValue: "\u5DF2\u914D\u7F6E", secretRef: id };
  }
  cleanupExpiredModelStudioProvisionals(now = /* @__PURE__ */ new Date()) {
    const refs = this.database.prepare("SELECT secret_ref AS secretRef FROM model_studio_provisional_secrets WHERE expires_at <= ?").all(now.toISOString());
    if (!refs.length) return 0;
    this.database.transaction(() => {
      for (const { secretRef } of refs) {
        this.database.prepare("DELETE FROM model_studio_provisional_secrets WHERE secret_ref = ?").run(secretRef);
        this.database.prepare("DELETE FROM secret_records WHERE id = ? AND NOT EXISTS (SELECT 1 FROM provider_profiles WHERE secret_ref = ?)").run(secretRef, secretRef);
      }
    })();
    for (const { secretRef } of refs) this.clearProvisionalTimer(secretRef);
    return refs.length;
  }
  getStatus(secretRef) {
    const id = secretReferenceSchema.parse(secretRef);
    const record = this.database.prepare("SELECT id FROM secret_records WHERE id = ?").get(id);
    return { exists: record !== void 0, maskedValue: record ? "\u5DF2\u914D\u7F6E" : null, secretRef: id };
  }
  delete(secretRef) {
    const id = secretReferenceSchema.parse(secretRef);
    this.database.transaction(() => {
      this.assertSecretRefIsNotProfileReferenced(id);
      this.database.prepare("DELETE FROM model_studio_provisional_secrets WHERE secret_ref = ?").run(id);
      this.database.prepare("DELETE FROM secret_records WHERE id = ?").run(id);
    })();
    this.clearProvisionalTimer(id);
  }
  canUseForModelStudioConfiguration(secretRef, capability, ownerId) {
    const parsedRef = secretReferenceSchema.safeParse(secretRef);
    const parsedCapability = modelStudioCapabilitySchema.safeParse(capability);
    if (!parsedRef.success || !parsedCapability.success) return false;
    const provisional = this.database.prepare("SELECT capability, owner_id AS ownerId, expires_at AS expiresAt FROM model_studio_provisional_secrets WHERE secret_ref = ?").get(parsedRef.data);
    if (provisional) {
      if (Date.parse(provisional.expiresAt) <= Date.now()) {
        this.cleanupExpiredModelStudioProvisionals();
        return false;
      }
      return provisional.capability === parsedCapability.data && provisional.ownerId === ownerId;
    }
    const profiles = this.database.prepare("SELECT provider FROM provider_profiles WHERE secret_ref = ? AND capability = ?").all(parsedRef.data, parsedCapability.data);
    return profiles.some((profile) => isModelStudioProvider(profile.provider));
  }
  // No IPC handler exposes this method. It is for narrowly scoped main-process
  // work that must use a saved secret without returning it to the renderer.
  readPlaintextForMainProcess(secretRef) {
    const id = secretReferenceSchema.parse(secretRef);
    const record = this.database.prepare("SELECT encrypted_value AS encryptedValue FROM secret_records WHERE id = ?").get(id);
    if (!record) throw new Error("\u672A\u627E\u5230\u5DF2\u4FDD\u5B58\u7684\u5BC6\u94A5\u3002");
    return decryptSecret(record.encryptedValue);
  }
  isAvailable() {
    return canStoreSecrets();
  }
  scheduleProvisionalCleanup(secretRef, delayMs) {
    this.clearProvisionalTimer(secretRef);
    this.provisionalTimers.set(secretRef, setTimeout(() => {
      this.provisionalTimers.delete(secretRef);
      this.cleanupExpiredModelStudioProvisionals();
    }, delayMs + 10));
  }
  clearProvisionalTimer(secretRef) {
    const timer = this.provisionalTimers.get(secretRef);
    if (timer) clearTimeout(timer);
    this.provisionalTimers.delete(secretRef);
  }
  assertSecretRefIsUnused(secretRef) {
    if (this.database.prepare("SELECT 1 FROM secret_records WHERE id = ?").get(secretRef)) throw new Error("\u8BE5\u5BC6\u94A5\u5F15\u7528\u5DF2\u5B58\u5728\uFF0C\u4E0D\u80FD\u8986\u76D6\u5DF2\u4FDD\u5B58\u5BC6\u94A5\u3002");
  }
  assertSecretRefIsNotProfileReferenced(secretRef) {
    if (this.database.prepare("SELECT 1 FROM provider_profiles WHERE secret_ref = ?").get(secretRef)) throw new Error("\u8BE5\u5BC6\u94A5\u6B63\u5728\u88AB\u5DF2\u4FDD\u5B58\u65B9\u6848\u5F15\u7528\uFF0C\u4E0D\u80FD\u5220\u9664\u3002");
  }
};
var maskSecret = (secret) => {
  const visibleSuffix = secret.slice(-4);
  return `${"\u2022".repeat(Math.max(4, secret.length - visibleSuffix.length))}${visibleSuffix}`;
};

// src/main/services/clip-evidence-package-service.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// src/main/media/scene-anchor-pts-verifier.ts
import { spawnSync } from "node:child_process";
var SCENE_ANCHOR_PTS_VERIFIER_VERSION = "ffprobe-frame-pts-v1";
var FRAME_PTS_TOLERANCE_SECONDS = 2e-3;
var readFramePts = (sourcePath, readIntervals) => {
  const binary = resolveMediaBinary("ffprobe");
  if (!binary) return null;
  try {
    const result = spawnSync(binary, ["-v", "error", "-select_streams", "v:0", ...readIntervals ? ["-read_intervals", readIntervals] : [], "-show_entries", "frame=best_effort_timestamp_time", "-show_frames", "-of", "json", sourcePath], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 9e4,
      maxBuffer: 64 * 1024 * 1024
    });
    if (result.error || result.status !== 0) return null;
    const payload = JSON.parse(result.stdout);
    const timestamps = [...new Set((payload.frames ?? []).map((frame) => Number(frame.best_effort_timestamp_time)).filter((value) => Number.isFinite(value)))].sort((left, right) => left - right);
    return timestamps.length > 0 ? { timestamps, toleranceSeconds: FRAME_PTS_TOLERANCE_SECONDS } : null;
  } catch {
    return null;
  }
};
var readSourceVideoPtsProbe = (sourcePath) => readFramePts(sourcePath, "%+#1");

// src/main/services/clip-anchor-readiness.ts
import { z as z3 } from "zod";

// src/main/services/subtitle-time-quality.ts
var finiteNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
var round = (value) => Math.round(value * 1e3) / 1e3;
var analyzeSubtitleTimeQuality = (input) => {
  const valid = input.cues.filter((cue) => Number.isFinite(cue.startSeconds) && Number.isFinite(cue.endSeconds) && cue.startSeconds >= 0 && cue.endSeconds > cue.startSeconds).map((cue) => ({ startSeconds: cue.startSeconds, endSeconds: cue.endSeconds })).sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds);
  const invalidCueCount = input.cues.length - valid.length;
  const durations = valid.map((cue) => cue.endSeconds - cue.startSeconds);
  const averageCueDurationSeconds = durations.length ? round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null;
  const maxCueDurationSeconds = durations.length ? round(Math.max(...durations)) : null;
  let coveredSeconds = 0;
  let maxGapSeconds = null;
  let coveredEnd = 0;
  for (const cue of valid) {
    maxGapSeconds = Math.max(maxGapSeconds ?? 0, Math.max(0, cue.startSeconds - coveredEnd));
    if (cue.endSeconds > coveredEnd) {
      coveredSeconds += Math.max(0, cue.endSeconds - Math.max(coveredEnd, cue.startSeconds));
      coveredEnd = cue.endSeconds;
    }
  }
  const durationSeconds = finiteNumber(input.durationSeconds);
  const coverageRatio = durationSeconds !== null && durationSeconds > 0 ? round(Math.min(1, coveredSeconds / durationSeconds)) : null;
  const cueDensityPerMinute = durationSeconds !== null && durationSeconds > 0 ? round(valid.length / (durationSeconds / 60)) : null;
  const minimumCueCount = input.sourceKind === "asr" && durationSeconds !== null && durationSeconds > 0 ? Math.max(1, Math.ceil(durationSeconds / 20)) : durationSeconds !== null && durationSeconds <= 20 ? 1 : 2;
  const resultFormat2 = finiteNumber(input.cost?.resultFormat);
  const sentenceMaxLength2 = finiteNumber(input.cost?.sentenceMaxLength);
  let status = "qualified";
  let reasonCode = "qualified";
  if (valid.length === 0) {
    status = "insufficient";
    reasonCode = "missing-cues";
  } else if (invalidCueCount > 0) {
    status = "insufficient";
    reasonCode = "invalid-timing";
  } else if (input.sourceKind === "asr" && resultFormat2 !== 3) {
    status = "insufficient";
    reasonCode = resultFormat2 === null ? "missing-asr-metadata" : "legacy-asr-format";
  } else if (input.sourceKind === "asr" && sentenceMaxLength2 !== null && (sentenceMaxLength2 < 6 || sentenceMaxLength2 > 40)) {
    status = "insufficient";
    reasonCode = "missing-asr-metadata";
  } else {
    const insufficientCoverage = coverageRatio !== null && coverageRatio < 0.05;
    const sparseDistribution = maxGapSeconds !== null && maxGapSeconds > 20;
    if (valid.length < minimumCueCount || insufficientCoverage || sparseDistribution) {
      status = "limited";
      reasonCode = input.sourceKind === "asr" ? "sparse-asr-time-axis" : "limited-cues";
    } else if (input.sourceKind === "asr" && (maxCueDurationSeconds ?? 0) > 20) {
      status = "limited";
      reasonCode = "coarse-asr-time-axis";
    }
  }
  return { sourceKind: input.sourceKind, status, reasonCode, cueCount: input.cues.length, validCueCount: valid.length, invalidCueCount, averageCueDurationSeconds, maxCueDurationSeconds, coveredSeconds: round(coveredSeconds), coverageRatio, maxGapSeconds: maxGapSeconds === null ? null : round(maxGapSeconds), cueDensityPerMinute, minimumCueCount, resultFormat: resultFormat2, sentenceMaxLength: sentenceMaxLength2 };
};
var isSafeSubtitleAnchor = (quality) => quality.status === "qualified";

// src/main/services/clip-anchor-readiness.ts
var verifiedSceneAnchorSchema = z3.object({ anchorKind: z3.enum(["shot-transition", "scene-transition"]), ptsVerified: z3.literal(true), sourceMediaFingerprint: z3.string().trim().min(1).max(256), verifierVersion: z3.literal(SCENE_ANCHOR_PTS_VERIFIER_VERSION) });
var rangesForAnchorSource = (anchors, episodeDurationSeconds, targetDurationSeconds) => {
  const target = Math.min(targetDurationSeconds, episodeDurationSeconds);
  const maximumEndOffset = target + Math.max(0.5, target * 0.15);
  const ranges = /* @__PURE__ */ new Map();
  for (const startAnchor of anchors) {
    const desiredEnd = Math.min(episodeDurationSeconds, startAnchor.startSeconds + target);
    const endings = anchors.filter((endAnchor) => endAnchor.endSeconds >= startAnchor.startSeconds + 3 && endAnchor.endSeconds <= Math.min(episodeDurationSeconds, startAnchor.startSeconds + maximumEndOffset));
    if (!endings.length) continue;
    const bestEnd = endings.reduce((best, candidate) => Math.abs(candidate.endSeconds - desiredEnd) < Math.abs(best.endSeconds - desiredEnd) ? candidate : best);
    const startSeconds = Number(startAnchor.startSeconds.toFixed(3));
    const endSeconds = Number(bestEnd.endSeconds.toFixed(3));
    ranges.set(`${startSeconds}:${endSeconds}`, { startSeconds, endSeconds, semanticEventIds: [...new Set(anchors.filter((anchor) => anchor.endSeconds >= startSeconds && anchor.startSeconds <= endSeconds).map((anchor) => anchor.semanticEventId).filter((id) => Boolean(id)))], sceneAnchorIds: [...new Set(anchors.filter((anchor) => anchor.endSeconds >= startSeconds && anchor.startSeconds <= endSeconds).map((anchor) => anchor.sceneAnchorId).filter((id) => Boolean(id)))] });
  }
  return [...ranges.values()];
};
var anchorCandidateRanges = (anchors, episodeDurationSeconds, targetDurationSeconds) => {
  const semantic = anchors.filter((anchor) => anchor.semanticEventId);
  const scene = anchors.filter((anchor) => anchor.sceneAnchorId);
  const conflicts = anchors.filter((anchor) => anchor.blocksAutomaticCandidate);
  const touchesConflict = (range) => conflicts.some((anchor) => anchor.endSeconds >= range.startSeconds && anchor.startSeconds <= range.endSeconds);
  const semanticRanges = rangesForAnchorSource(semantic, episodeDurationSeconds, targetDurationSeconds).filter((range) => !touchesConflict(range));
  const sceneRanges = rangesForAnchorSource(scene, episodeDurationSeconds, targetDurationSeconds).filter((range) => !touchesConflict(range) && !semantic.some((anchor) => anchor.endSeconds >= range.startSeconds && anchor.startSeconds <= range.endSeconds));
  return [...semanticRanges, ...sceneRanges].sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds);
};

// src/main/services/clip-evidence-package-service.ts
var RULE_VERSION = "evidence-v5";
var ClipEvidencePackageService = class {
  constructor(database) {
    this.database = database;
  }
  build(dramaId, episodeId) {
    const episode = this.database.prepare("SELECT source_path AS sourcePath, source_fingerprint AS sourceFingerprint, duration_seconds AS durationSeconds FROM episodes WHERE id = ? AND drama_id = ?").get(episodeId, dramaId);
    if (!episode) throw new Error("\u6E90\u5206\u96C6\u4E0D\u5B58\u5728\u6216\u4E0D\u5C5E\u4E8E\u5F53\u524D\u5267\u76EE\u3002");
    const fingerprint = fingerprintMediaSource(episode.sourcePath);
    const sourceFingerprint = fingerprint && episode.sourceFingerprint && episode.sourceFingerprint === fingerprint ? fingerprint : null;
    const pts = sourceFingerprint ? readSourceVideoPtsProbe(episode.sourcePath) : null;
    const tracks = this.database.prepare("SELECT id, source_kind AS sourceKind, acquisition, evidence_nature AS evidenceNature, cost_json AS costJson, updated_at AS updatedAt FROM subtitle_tracks WHERE drama_id = ? AND episode_id = ? AND status = 'active' AND source_kind IN ('import', 'ocr', 'asr') ORDER BY updated_at, id").all(dramaId, episodeId);
    const trackFacts = tracks.map((track) => this.trackFact(track, episode.durationSeconds));
    const eventTrackQualifications = this.readEventTrackQualifications(episodeId, new Map(trackFacts.map((fact) => [fact.track.id, fact.qualification])));
    const versionRow = this.database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM clip_evidence_packages WHERE episode_id = ?").get(episodeId);
    const version2 = versionRow.version + 1;
    const id = randomUUID2();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const events = this.database.prepare(`SELECT event.id, event.start_seconds AS startSeconds, event.end_seconds AS endSeconds, event.conclusion, event.reason, event.source_kinds_json AS sourceKindsJson,
      COUNT(link.cue_id) AS cueCount,
      SUM(CASE WHEN link.role = 'visual' THEN 1 ELSE 0 END) AS visualCueCount,
      SUM(CASE WHEN link.role = 'asr' THEN 1 ELSE 0 END) AS asrCueCount,
      SUM(CASE WHEN track.acquisition = 'generated' AND ((track.source_kind = 'ocr' AND track.evidence_nature = 'visual_aligned') OR (track.source_kind = 'asr' AND track.evidence_nature = 'audio_aligned')) THEN 1 ELSE 0 END) AS verifiedCueCount,
      SUM(CASE WHEN conflict.id IS NOT NULL AND conflict.status = 'open' THEN 1 ELSE 0 END) AS unresolvedConflictCount
      FROM subtitle_semantic_events event
      LEFT JOIN subtitle_semantic_event_cues link ON link.event_id = event.id
      LEFT JOIN subtitle_cues cue ON cue.id = link.cue_id
      LEFT JOIN subtitle_tracks track ON track.id = cue.track_id
      LEFT JOIN subtitle_conflicts conflict ON (conflict.asr_cue_id = cue.id OR conflict.ocr_cue_id = cue.id)
      WHERE event.drama_id = ? AND event.episode_id = ? GROUP BY event.id ORDER BY event.start_seconds, event.id`).all(dramaId, episodeId);
    const scenes = this.database.prepare("SELECT id, start_seconds AS startSeconds, end_seconds AS endSeconds, details_json AS detailsJson FROM ai_evidence WHERE drama_id = ? AND episode_id = ? AND source_type = 'scene' ORDER BY start_seconds, id").all(dramaId, episodeId);
    const inputFingerprint = JSON.stringify({
      sourceFingerprint,
      ptsReadable: Boolean(pts),
      tracks: trackFacts.map(({ track, cues, quality, qualification }) => ({ id: track.id, sourceKind: track.sourceKind, acquisition: track.acquisition, evidenceNature: track.evidenceNature, updatedAt: track.updatedAt, cueIds: cues.map((cue) => cue.id), quality: quality.reasonCode, qualification })),
      events: events.map((event) => ({ id: event.id, startSeconds: event.startSeconds, endSeconds: event.endSeconds, conclusion: event.conclusion, sourceKindsJson: event.sourceKindsJson, cueCount: event.cueCount, verifiedCueCount: event.verifiedCueCount, unresolvedConflictCount: event.unresolvedConflictCount })),
      scenes: scenes.map((scene) => ({ id: scene.id, startSeconds: scene.startSeconds, endSeconds: scene.endSeconds, detailsJson: scene.detailsJson })),
      ruleVersion: RULE_VERSION
    });
    const reusable = this.findReusablePackage(dramaId, episodeId, inputFingerprint);
    if (reusable) return reusable;
    const status = sourceFingerprint && pts ? "ready" : "failed";
    const reason = !sourceFingerprint ? "\u5F53\u524D\u6E90\u5A92\u4F53\u6307\u7EB9\u4E0D\u5B58\u5728\u6216\u5DF2\u53D8\u5316\uFF0C\u4E0D\u80FD\u53D1\u5E03\u8BC1\u636E\u5305\u3002" : !pts ? "\u5F53\u524D\u6E90\u5A92\u4F53\u65E0\u6CD5\u8BFB\u53D6\u53EF\u9A8C\u8BC1\u7684\u5E27 PTS\uFF0C\u4E0D\u80FD\u53D1\u5E03\u81EA\u52A8\u5019\u9009\u8BC1\u636E\u5305\u3002" : null;
    this.database.transaction(() => {
      const qualifications = events.map((event) => ({ id: event.id, qualification: this.eventQualification(event, eventTrackQualifications), reason: this.eventReason(event, eventTrackQualifications), coverage: this.eventCoverage(event, eventTrackQualifications) }));
      const coveredSeconds = events.filter((event) => this.eventQualification(event, eventTrackQualifications) === "A").reduce((total, event) => total + Math.max(0, event.endSeconds - event.startSeconds), 0);
      this.database.prepare("INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, dramaId, episodeId, version2, sourceFingerprint ?? fingerprint ?? "unverified", RULE_VERSION, status, JSON.stringify({ inputFingerprint, durationSeconds: episode.durationSeconds, media: { fingerprint: sourceFingerprint, ptsReadable: Boolean(pts), ptsVerifier: "ffprobe-frame-pts-v1", decodeStatus: pts ? "available" : "missing" }, tracks: trackFacts.map(({ track, cues, quality, qualification }) => ({ id: track.id, sourceKind: track.sourceKind, acquisition: track.acquisition, evidenceNature: track.evidenceNature, updatedAt: track.updatedAt, cueCount: cues.length, quality: { safe: isSafeSubtitleAnchor(quality), reasonCode: quality.reasonCode, coverageRatio: quality.coverageRatio, averageCueDurationSeconds: quality.averageCueDurationSeconds, maxCueDurationSeconds: quality.maxCueDurationSeconds }, qualification })), semanticEventIds: events.map((event) => event.id), sceneAnchorIds: scenes.map((scene) => scene.id), coverage: { qualifiedEventSeconds: Number(coveredSeconds.toFixed(3)), episodeDurationSeconds: episode.durationSeconds, qualifications, validationOrder: ["media", "tracks", "time-axis", "cross-track", "coverage", "candidate-dependencies"], calibration: { subtitleTimeQuality: "subtitle-time-quality-v1", pts: "ffprobe-frame-pts-v1", semanticRelationship: "semantic-event-v1" } } }), reason, now, now);
      const insert = this.database.prepare("INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, coverage_json, source_version, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const fact of trackFacts) for (const cue of fact.cues) insert.run(randomUUID2(), id, "subtitle-cue", cue.startSeconds, cue.endSeconds, JSON.stringify([cue.id]), status === "ready" ? fact.qualification : "D", JSON.stringify({ scope: "subtitle-cue", text: fact.qualification === "A" ? "available" : fact.qualification === "B" ? "limited" : "missing", visualSubtitle: fact.track.evidenceNature === "visual_aligned" ? "available" : "not-applicable", audioText: fact.track.evidenceNature === "audio_aligned" ? "available" : "not-applicable", relationship: "unresolved", trackId: fact.track.id, sourceKind: fact.track.sourceKind, acquisition: fact.track.acquisition, evidenceNature: fact.track.evidenceNature }), fact.track.updatedAt, fact.reason, now, now);
      for (const event of events) insert.run(randomUUID2(), id, "semantic-event", event.startSeconds, event.endSeconds, JSON.stringify([event.id]), this.eventQualification(event, eventTrackQualifications), JSON.stringify(this.eventCoverage(event, eventTrackQualifications)), "semantic-event-v1", this.eventReason(event, eventTrackQualifications), now, now);
      for (const scene of scenes) if (scene.startSeconds !== null && scene.endSeconds !== null && scene.endSeconds > scene.startSeconds) {
        const qualification = this.sceneQualification(scene, sourceFingerprint);
        insert.run(randomUUID2(), id, "scene-anchor", scene.startSeconds, scene.endSeconds, JSON.stringify([scene.id]), status === "ready" ? qualification : "D", JSON.stringify(this.sceneCoverage(scene, sourceFingerprint, qualification)), "scene-anchor-pts-v1", status === "ready" ? this.sceneReason(scene, qualification) : reason, now, now);
      }
    })();
    return { id, dramaId, episodeId, version: version2, sourceMediaFingerprint: sourceFingerprint ?? fingerprint ?? "unverified", ruleVersion: RULE_VERSION, status, reason };
  }
  trackFact(track, durationSeconds) {
    const cues = this.database.prepare("SELECT id, start_seconds AS startSeconds, end_seconds AS endSeconds, text, cue_index AS `index` FROM subtitle_cues WHERE track_id = ? ORDER BY cue_index").all(track.id);
    let cost = {};
    try {
      const value = JSON.parse(track.costJson);
      if (value && typeof value === "object" && !Array.isArray(value)) cost = value;
    } catch {
    }
    const quality = analyzeSubtitleTimeQuality({ sourceKind: track.sourceKind, cues, durationSeconds: durationSeconds ?? 0, cost });
    const provenance = track.sourceKind === "ocr" ? track.acquisition === "generated" && track.evidenceNature === "visual_aligned" : track.sourceKind === "asr" ? track.acquisition === "generated" && track.evidenceNature === "audio_aligned" : track.acquisition === "imported" && (track.evidenceNature === "visual_aligned" || track.evidenceNature === "audio_aligned");
    const qualification = provenance && isSafeSubtitleAnchor(quality) ? "A" : track.evidenceNature === "reference_unknown" ? "D" : "B";
    return { track, cues, quality, qualification, reason: qualification === "A" ? "\u6765\u6E90\u3001\u65F6\u95F4\u8D28\u91CF\u4E0E\u58F0\u660E\u8303\u56F4\u5DF2\u6838\u9A8C\u3002" : qualification === "B" ? `\u8F68\u9053\u5B58\u5728\u4F46\u65F6\u95F4\u8D28\u91CF\u6216\u6765\u6E90\u6838\u9A8C\u4E0D\u8DB3\uFF1A${quality.reasonCode}\u3002` : "\u5BFC\u5165\u6765\u6E90\u6027\u8D28\u6216\u65F6\u95F4\u8D28\u91CF\u4E0D\u53EF\u6838\u9A8C\uFF0C\u4E0D\u80FD\u4F5C\u4E3A\u81EA\u52A8\u5019\u9009\u4E3B\u8BC1\u636E\u3002" };
  }
  findReusablePackage(dramaId, episodeId, inputFingerprint) {
    const rows = this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, version, source_media_fingerprint AS sourceMediaFingerprint, rule_version AS ruleVersion, status, reason, evidence_json AS evidenceJson FROM clip_evidence_packages WHERE drama_id = ? AND episode_id = ? AND rule_version = ? ORDER BY version DESC").all(dramaId, episodeId, RULE_VERSION);
    for (const row of rows) {
      try {
        const evidence = JSON.parse(row.evidenceJson);
        if (evidence.inputFingerprint === inputFingerprint) {
          const { evidenceJson: _evidenceJson, ...record } = row;
          return record;
        }
      } catch {
      }
    }
    return null;
  }
  readEventTrackQualifications(episodeId, qualificationsByTrackId) {
    const rows = this.database.prepare("SELECT link.event_id AS eventId, cue.track_id AS trackId FROM subtitle_semantic_event_cues link JOIN subtitle_cues cue ON cue.id = link.cue_id JOIN subtitle_semantic_events event ON event.id = link.event_id WHERE event.episode_id = ?").all(episodeId);
    const result = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const qualification = qualificationsByTrackId.get(row.trackId);
      if (!qualification) continue;
      const values = result.get(row.eventId) ?? [];
      values.push(qualification);
      result.set(row.eventId, values);
    }
    return result;
  }
  eventQualification(event, trackQualifications) {
    if (event.conclusion === "time-conflict" || event.unresolvedConflictCount > 0) return "C";
    const qualifications = trackQualifications.get(event.id) ?? [];
    if (event.cueCount <= 0 || !qualifications.length) return "D";
    if (qualifications.some((qualification) => qualification === "C" || qualification === "D")) return "D";
    if (qualifications.some((qualification) => qualification === "B")) return "B";
    return "A";
  }
  eventReason(event, trackQualifications) {
    if (event.conclusion === "time-conflict" || event.unresolvedConflictCount > 0) return event.reason ?? "\u591A\u6E90\u65F6\u95F4\u51B2\u7A81\u5C1A\u672A\u95ED\u5408\uFF0C\u4E0D\u80FD\u7528\u4E8E\u81EA\u52A8\u5019\u9009\u3002";
    const qualifications = trackQualifications.get(event.id) ?? [];
    if (event.cueCount <= 0 || !qualifications.length) return "\u8BED\u4E49\u4E8B\u4EF6\u7F3A\u5C11\u7ECF\u6765\u6E90\u4E0E\u65F6\u95F4\u8D28\u91CF\u6838\u9A8C\u7684 OCR/ASR \u539F\u59CB cue\uFF0C\u4E0D\u80FD\u5347\u7EA7\u4E3A\u81EA\u52A8\u5019\u9009\u4E3B\u8BC1\u636E\u3002";
    if (qualifications.some((qualification) => qualification !== "A")) return "\u8BED\u4E49\u4E8B\u4EF6\u5173\u8054\u8F68\u9053\u672A\u5168\u90E8\u8FBE\u5230\u6765\u6E90\u3001\u65F6\u95F4\u8D28\u91CF\u548C\u5173\u7CFB\u53EF\u590D\u6838\u7684\u4E3B\u8BC1\u636E\u95E8\u69DB\u3002";
    return event.reason;
  }
  eventCoverage(event, trackQualifications) {
    const qualifications = trackQualifications.get(event.id) ?? [];
    const allPrimary = qualifications.length > 0 && qualifications.every((qualification) => qualification === "A");
    return { scope: "semantic-event", text: allPrimary ? "available" : "limited", visualSubtitle: event.visualCueCount > 0 && allPrimary ? "available" : "unverified", audioText: event.asrCueCount > 0 && allPrimary ? "available" : "unverified", sceneStructure: "not-applicable", visualFact: "unverified", audioStructure: "unverified", ambience: "unverified", relationship: event.unresolvedConflictCount > 0 || event.conclusion === "time-conflict" ? "conflict" : allPrimary ? "available" : "unverified", sourceKinds: JSON.parse(event.sourceKindsJson), trackQualifications: qualifications, calibrationVersion: "subtitle-time-quality-v1" };
  }
  sceneCoverage(scene, sourceFingerprint, qualification) {
    return { scope: "scene-anchor", text: "missing", visualSubtitle: "missing", audioText: "missing", sceneStructure: qualification === "B" ? "available" : "missing", visualFact: "unverified", audioStructure: "unverified", ambience: "unverified", sourceMediaFingerprint: sourceFingerprint, sourceDetails: scene.detailsJson };
  }
  sceneQualification(scene, sourceFingerprint) {
    if (!sourceFingerprint) return "D";
    try {
      const value = JSON.parse(scene.detailsJson);
      const verification = value && typeof value === "object" && !Array.isArray(value) ? value.sourceMediaVerification : void 0;
      return verification && typeof verification === "object" && verification.ptsVerified === true && verification.sourceMediaFingerprint === sourceFingerprint ? "B" : "D";
    } catch {
      return "D";
    }
  }
  sceneReason(scene, qualification) {
    return qualification === "B" ? "\u540C\u6E90\u5A92\u4F53 PTS \u5DF2\u9A8C\u8BC1\u7684\u7ED3\u6784\u951A\u70B9\uFF1B\u672A\u8BC1\u660E\u5177\u4F53\u89C6\u89C9\u5267\u60C5\u4E8B\u5B9E\uFF0C\u9700\u89C6\u9891\u590D\u6838\u540E\u624D\u80FD\u4F5C\u4E3A\u5173\u952E\u89C6\u89C9\u7ED3\u8BBA\u3002" : "\u955C\u5934/\u573A\u666F\u951A\u70B9\u7F3A\u5C11\u5F53\u524D\u6E90\u5A92\u4F53 PTS \u9A8C\u8BC1\uFF0C\u4E0D\u80FD\u7528\u4E8E\u81EA\u52A8\u5019\u9009\u3002";
  }
  createCandidateSnapshot(input) {
    const id = randomUUID2();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const qualification = input.qualification ?? "qualified";
    const round2 = input.taskRound ?? 0;
    this.database.prepare("INSERT INTO clip_candidate_snapshots (id, candidate_id, package_id, qualification, config_json, provider_json, summary_json, task_id, task_round, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.candidateId, input.package.id, qualification, JSON.stringify(input.config ?? {}), JSON.stringify(input.provider ?? { capability: "text-analysis", status: "not-configured" }), JSON.stringify(input.summary ?? {}), input.taskId ?? null, round2, now, now);
    return id;
  }
  /** A generation round becomes visible only after every candidate snapshot is durable. */
  publishGenerationRound(input) {
    if (!input.candidates.length) throw new Error("\u6CA1\u6709\u53EF\u53D1\u5E03\u7684\u5019\u9009\u5FEB\u7167\u3002");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.database.transaction(() => {
      const task = this.database.prepare("SELECT status, checkpoint FROM production_tasks WHERE id = ? AND drama_id = ? AND type = ?").get(input.taskId, input.dramaId, "original_clip");
      if (!task || task.status !== "running" || !input.candidates.every((candidate) => this.hasPublicationAuthority(candidate.package, input.taskId, input.taskRound))) throw new Error("\u5019\u9009\u751F\u6210\u4EFB\u52A1\u5DF2\u5931\u6548\uFF0C\u62D2\u7EDD\u53D1\u5E03\u8FDF\u5230\u7ED3\u679C\u3002");
      const snapshots = input.candidates.map((candidate) => ({ candidate, snapshotId: this.createCandidateSnapshot({ candidateId: candidate.candidateId, package: candidate.package, taskId: input.taskId, taskRound: input.taskRound, qualification: candidate.qualification, config: input.config, provider: input.provider, summary: candidate.summary }) }));
      const publish = this.database.prepare("INSERT INTO clip_candidate_publish_pointers (drama_id, episode_id, snapshot_id, task_id, task_round, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(drama_id, episode_id) DO UPDATE SET snapshot_id = excluded.snapshot_id, task_id = excluded.task_id, task_round = excluded.task_round, updated_at = excluded.updated_at WHERE excluded.task_round > clip_candidate_publish_pointers.task_round");
      const publishMember = this.database.prepare("INSERT INTO clip_candidate_publish_members (candidate_id, snapshot_id, drama_id, episode_id, task_id, task_round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
      const firstSnapshotByEpisode = /* @__PURE__ */ new Set();
      for (const { candidate, snapshotId } of snapshots) {
        if (candidate.qualification === "blocked") continue;
        if (!firstSnapshotByEpisode.has(candidate.package.episodeId)) {
          publish.run(candidate.package.dramaId, candidate.package.episodeId, snapshotId, input.taskId, input.taskRound, now);
          firstSnapshotByEpisode.add(candidate.package.episodeId);
        }
        publishMember.run(candidate.candidateId, snapshotId, candidate.package.dramaId, candidate.package.episodeId, input.taskId, input.taskRound, now);
      }
      const previousCheckpoint = this.readCheckpoint(task.checkpoint);
      const blockedTotal = input.blockedTotal ?? input.blocked?.reduce((total, item) => total + item.count, 0) ?? 0;
      const blockedReason = blockedTotal ? `\u5DF2\u53D1\u5E03 ${snapshots.length} \u6761\u5019\u9009\uFF1B\u53E6\u6709 ${blockedTotal} \u6761\u672A\u7EB3\u5165\uFF1A${(input.blocked ?? []).map((item) => `${item.count} \u6761${item.reason}`).join("\uFF1B")}` : `\u5DF2\u751F\u6210 ${snapshots.length} \u6761\u5019\u9009\uFF0C\u7B49\u5F85\u4EBA\u5DE5\u5BA1\u9605\u3002`;
      this.database.prepare("UPDATE production_tasks SET status = ?, checkpoint = ?, updated_at = ? WHERE id = ? AND status = ?").run("reviewing", JSON.stringify({ version: 1, stage: "reviewing", reason: blockedReason, taskRound: input.taskRound, startedAt: this.readStartedAt(task.checkpoint), completedAt: now, elapsedMs: Math.max(0, Date.now() - new Date(this.readStartedAt(task.checkpoint)).getTime()), activeSince: null, candidateCount: snapshots.length, blocked: input.blocked ?? [], blockedTotal, recovery: input.recovery ?? null, ...previousCheckpoint.resourceBudget ? { resourceBudget: previousCheckpoint.resourceBudget } : {}, ...previousCheckpoint.resourceUsage ? { resourceUsage: previousCheckpoint.resourceUsage } : {} }), now, input.taskId, "running");
    })();
  }
  readStartedAt(checkpoint) {
    try {
      const value = JSON.parse(checkpoint ?? "{}");
      return value && typeof value === "object" && "startedAt" in value && typeof value.startedAt === "string" ? value.startedAt : (/* @__PURE__ */ new Date()).toISOString();
    } catch {
      return (/* @__PURE__ */ new Date()).toISOString();
    }
  }
  readCheckpoint(checkpoint) {
    try {
      const value = JSON.parse(checkpoint ?? "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  }
  hasPublicationAuthority(packageRecord, taskId, taskRound) {
    if (!taskId) return taskRound === 0;
    const task = this.database.prepare("SELECT status, checkpoint, config_snapshot AS configSnapshot FROM production_tasks WHERE id = ? AND drama_id = ? AND type = ?").get(taskId, packageRecord.dramaId, "original_clip");
    if (!task || task.status !== "running") return false;
    try {
      const checkpoint = JSON.parse(task.checkpoint ?? "{}");
      const config = JSON.parse(task.configSnapshot);
      const episodes = config && typeof config === "object" && "episodes" in config && Array.isArray(config.episodes) ? config.episodes : [];
      const packageMatchesTask = episodes.some((entry) => entry && typeof entry === "object" && entry.episodeId === packageRecord.episodeId && entry.packageId === packageRecord.id && entry.sourceMediaFingerprint === packageRecord.sourceMediaFingerprint);
      const current = this.database.prepare("SELECT source_fingerprint AS sourceFingerprint FROM episodes WHERE id = ? AND drama_id = ?").get(packageRecord.episodeId, packageRecord.dramaId);
      return typeof checkpoint === "object" && checkpoint !== null && "round" in checkpoint && checkpoint.round === taskId && taskRound > 0 && packageMatchesTask && current?.sourceFingerprint === packageRecord.sourceMediaFingerprint;
    } catch {
      return false;
    }
  }
  recordLocalSemanticRun(packageRecord, inputIds, result) {
    const id = randomUUID2();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.database.prepare("INSERT INTO clip_model_runs (id, package_id, capability, status, provider, model, input_ids_json, result_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, packageRecord.id, "text-analysis", "completed", "local-evidence-adapter", RULE_VERSION, JSON.stringify(inputIds), JSON.stringify(result), null, now, now);
    return id;
  }
  recordSemanticRun(input) {
    const id = randomUUID2();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.database.prepare("INSERT INTO clip_model_runs (id, task_id, package_id, capability, status, provider, model, input_ids_json, result_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.taskId ?? null, input.package.id, "text-analysis", input.status ?? "completed", input.provider.provider, input.provider.model, JSON.stringify(input.inputIds), JSON.stringify(input.result), input.reason ?? null, now, now);
    return id;
  }
  recordMultimodalRun(input) {
    const id = randomUUID2();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.database.prepare("INSERT INTO clip_model_runs (id, task_id, package_id, capability, status, provider, model, input_ids_json, result_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, input.taskId, input.package.id, "multimodal-review", input.status, input.provider.provider, input.provider.model, JSON.stringify(input.inputIds), JSON.stringify(input.result), input.reason ?? null, now, now);
    return id;
  }
  latest(dramaId, episodeId) {
    const row = this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, version, source_media_fingerprint AS sourceMediaFingerprint, rule_version AS ruleVersion, status, reason FROM clip_evidence_packages WHERE drama_id = ? AND episode_id = ? ORDER BY version DESC LIMIT 1").get(dramaId, episodeId);
    if (!row) throw new Error("\u5F53\u524D\u5206\u96C6\u6CA1\u6709\u5DF2\u6784\u5EFA\u8BC1\u636E\u5305\u3002");
    return row;
  }
  getById(dramaId, episodeId, packageId) {
    const row = this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, version, source_media_fingerprint AS sourceMediaFingerprint, rule_version AS ruleVersion, status, reason FROM clip_evidence_packages WHERE id = ? AND drama_id = ? AND episode_id = ?").get(packageId, dramaId, episodeId);
    if (!row) throw new Error("\u5019\u9009\u751F\u6210\u51BB\u7ED3\u8BC1\u636E\u5305\u4E0D\u5B58\u5728\u3001\u5DF2\u635F\u574F\u6216\u4E0D\u5C5E\u4E8E\u5F53\u524D\u5206\u96C6\u3002");
    return row;
  }
  assertCurrentPackageSource(packageRecord) {
    const row = this.database.prepare("SELECT source_path AS sourcePath, source_fingerprint AS sourceFingerprint FROM episodes WHERE id = ? AND drama_id = ?").get(packageRecord.episodeId, packageRecord.dramaId);
    const currentFingerprint = row ? fingerprintMediaSource(row.sourcePath) : null;
    if (!row?.sourceFingerprint || !currentFingerprint || row.sourceFingerprint !== currentFingerprint || currentFingerprint !== packageRecord.sourceMediaFingerprint) throw new Error("\u5F53\u524D\u6E90\u5A92\u4F53\u6307\u7EB9\u5DF2\u53D8\u5316\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u4F7F\u7528\u51BB\u7ED3\u8BC1\u636E\u5305\u3002");
  }
  /**
   * Authorization for any post-generation mutation or export. Read-model
   * filtering is deliberately not enough: the service boundary must prove a
   * candidate still belongs to the current published round, has an eligible
   * snapshot, and references the same source media that was frozen in it.
   */
  assertPublishedCandidate(candidateId, options = {}) {
    const row = this.database.prepare(`SELECT snapshot.qualification, snapshot.package_id AS packageId,
      package.source_media_fingerprint AS sourceMediaFingerprint,
      episode.source_path AS sourcePath, episode.source_fingerprint AS currentSourceFingerprint,
      item.planned_range AS plannedRange, snapshot.summary_json AS summaryJson,
      member.drama_id AS dramaId, member.episode_id AS episodeId, member.task_id AS taskId, member.task_round AS taskRound,
      pointer.task_id AS pointerTaskId, pointer.task_round AS pointerTaskRound
      FROM clip_candidate_publish_members member
      JOIN clip_candidate_snapshots snapshot ON snapshot.id = member.snapshot_id
      JOIN clip_evidence_packages package ON package.id = snapshot.package_id
      JOIN task_items item ON item.id = member.candidate_id
      JOIN episodes episode ON episode.id = member.episode_id
      LEFT JOIN clip_candidate_publish_pointers pointer ON pointer.drama_id = member.drama_id AND pointer.episode_id = member.episode_id
      WHERE member.candidate_id = ?`).get(candidateId);
    if (!row) {
      const task = this.database.prepare("SELECT task.config_snapshot AS configSnapshot FROM task_items item JOIN production_tasks task ON task.id = item.task_id WHERE item.id = ? AND task.type = 'original_clip'").get(candidateId);
      let automatic = false;
      try {
        const config = JSON.parse(task?.configSnapshot ?? "{}");
        automatic = Boolean(config && typeof config === "object" && "generation" in config);
      } catch {
        automatic = true;
      }
      if (automatic) throw new Error("\u81EA\u52A8\u5019\u9009\u7F3A\u5C11\u5F53\u524D\u5DF2\u53D1\u5E03\u4E14\u5408\u683C\u7684\u8BC1\u636E\u5FEB\u7167\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u64CD\u4F5C\u3002");
      return { qualification: "qualified", packageId: "manual-candidate" };
    }
    if (row.qualification === "blocked" || row.pointerTaskId !== row.taskId || row.pointerTaskRound !== row.taskRound) throw new Error("\u5019\u9009\u4E0D\u5C5E\u4E8E\u5F53\u524D\u5DF2\u53D1\u5E03\u4E14\u5408\u683C\u7684\u8BC1\u636E\u5FEB\u7167\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u64CD\u4F5C\u3002");
    const currentFingerprint = fingerprintMediaSource(row.sourcePath);
    if (!row.currentSourceFingerprint || !currentFingerprint || row.currentSourceFingerprint !== currentFingerprint || currentFingerprint !== row.sourceMediaFingerprint) throw new Error("\u5019\u9009\u51BB\u7ED3\u8BC1\u636E\u4E0E\u5F53\u524D\u6E90\u5A92\u4F53\u6307\u7EB9\u4E0D\u4E00\u81F4\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u64CD\u4F5C\u3002");
    let planned = {};
    let frozen = {};
    try {
      planned = JSON.parse(row.plannedRange);
      frozen = JSON.parse(row.summaryJson);
    } catch {
      throw new Error("\u5019\u9009\u8303\u56F4\u5FEB\u7167\u65E0\u6548\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u64CD\u4F5C\u3002");
    }
    if (planned.episodeId !== row.episodeId || typeof planned.startSeconds !== "number" || typeof planned.endSeconds !== "number" || typeof frozen.startSeconds !== "number" || typeof frozen.endSeconds !== "number") throw new Error("\u5019\u9009\u8303\u56F4\u4E0E\u53D1\u5E03\u5FEB\u7167\u4E0D\u4E00\u81F4\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u64CD\u4F5C\u3002");
    const range = options.range ?? { startSeconds: planned.startSeconds, endSeconds: planned.endSeconds };
    {
      const tolerance = 0.1001;
      if (range.startSeconds < frozen.startSeconds - tolerance || range.endSeconds > frozen.endSeconds + tolerance) throw new Error("\u5F53\u524D\u5019\u9009\u8303\u56F4\u5DF2\u8131\u79BB\u51BB\u7ED3\u8BC1\u636E\u5019\u9009\u8303\u56F4\uFF0C\u4E0D\u80FD\u7EE7\u7EED\u64CD\u4F5C\u3002");
    }
    return { qualification: row.qualification, packageId: row.packageId };
  }
  buildForCandidates(dramaId, episodeIds) {
    const packages = /* @__PURE__ */ new Map();
    for (const episodeId of episodeIds) if (!packages.has(episodeId)) packages.set(episodeId, this.build(dramaId, episodeId));
    return packages;
  }
  /** Candidate boundaries are reconstructed from the frozen package, never raw tracks. */
  candidateRanges(packageRecord, targetDurationSeconds) {
    if (packageRecord.status !== "ready") return [];
    const rows = this.database.prepare("SELECT kind, start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson, qualification FROM clip_evidence_units WHERE package_id = ? ORDER BY start_seconds, end_seconds, id").all(packageRecord.id);
    const anchors = [];
    for (const row of rows) {
      let ids = [];
      try {
        ids = JSON.parse(row.sourceIdsJson);
      } catch {
        continue;
      }
      if (!Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== "string") continue;
      if (row.kind === "semantic-event" && row.qualification === "A") anchors.push({ startSeconds: row.startSeconds, endSeconds: row.endSeconds, semanticEventId: ids[0] });
      if (row.kind === "scene-anchor" && row.qualification === "B") anchors.push({ startSeconds: row.startSeconds, endSeconds: row.endSeconds, sceneAnchorId: ids[0] });
      if (row.kind === "semantic-event" && row.qualification === "C") anchors.push({ startSeconds: row.startSeconds, endSeconds: row.endSeconds, blocksAutomaticCandidate: true });
    }
    const duration = this.readDuration(packageRecord.id);
    return duration === null ? [] : anchorCandidateRanges(anchors, duration, targetDurationSeconds);
  }
  /**
   * Build semantic-analysis windows from the complete frozen atomic sequence,
   * before any candidate count, overlap or duration selection takes place.
   * Each core is a consecutive group of complete units; its neighboring whole
   * units are supplied separately as protected context by the caller.
   */
  semanticWindows(packageRecord) {
    if (packageRecord.status !== "ready") return [];
    const rows = this.database.prepare("SELECT kind, start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE package_id = ? AND kind IN ('semantic-event', 'scene-anchor') AND (qualification = 'A' OR qualification = 'B') ORDER BY start_seconds, end_seconds, id").all(packageRecord.id);
    const units = rows.flatMap((row) => {
      try {
        const ids = JSON.parse(row.sourceIdsJson);
        return Array.isArray(ids) && ids.length === 1 && typeof ids[0] === "string" ? [{ id: ids[0], kind: row.kind, startSeconds: row.startSeconds, endSeconds: row.endSeconds }] : [];
      } catch {
        return [];
      }
    });
    const semanticIndexes = units.map((unit, index) => ({ unit, index })).filter(({ unit }) => unit.kind === "semantic-event");
    if (!semanticIndexes.length) return units.map((unit, index) => ({ evidenceIds: [unit.id], contextBeforeIds: index > 0 ? [units[index - 1].id] : [], contextAfterIds: index + 1 < units.length ? [units[index + 1].id] : [] }));
    const hasSceneSeparator = (left, right) => units.some((unit) => unit.kind === "scene-anchor" && unit.startSeconds >= units[left].endSeconds && unit.endSeconds <= units[right].startSeconds);
    const groups = [];
    for (const { index } of semanticIndexes) {
      const current = groups.at(-1);
      if (!current || hasSceneSeparator(current.last, index)) groups.push({ first: index, last: index });
      else current.last = index;
    }
    return groups.map(({ first, last }) => ({
      evidenceIds: units.slice(first, last + 1).filter((unit) => semanticIndexes.some(({ index }) => units[index].id === unit.id)).map((unit) => unit.id),
      contextBeforeIds: first > 0 ? [units[first - 1].id] : [],
      contextAfterIds: last + 1 < units.length ? [units[last + 1].id] : []
    }));
  }
  /** Resolves model-selected immutable IDs back to package-owned boundaries. */
  resolveSemanticSelection(packageRecord, selection) {
    if (packageRecord.status !== "ready") return null;
    const rows = this.database.prepare("SELECT kind, start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson, qualification FROM clip_evidence_units WHERE package_id = ? AND (qualification = 'A' OR (kind = 'scene-anchor' AND qualification = 'B')) ORDER BY start_seconds, end_seconds, id").all(packageRecord.id);
    const byEvidenceId = /* @__PURE__ */ new Map();
    for (const row of rows) {
      try {
        const ids = JSON.parse(row.sourceIdsJson);
        if (Array.isArray(ids)) {
          for (const id of ids) if (typeof id === "string") byEvidenceId.set(id, row);
        }
      } catch {
      }
    }
    const selectedRows = selection.evidenceIds.map((id) => ({ id, row: byEvidenceId.get(id) })).filter((value) => Boolean(value.row));
    if (selectedRows.length !== selection.evidenceIds.length) return null;
    const start = byEvidenceId.get(selection.startEvidenceId);
    const end = byEvidenceId.get(selection.endEvidenceId);
    if (!start || !end) return null;
    if (end.endSeconds <= start.startSeconds) return null;
    return {
      startSeconds: Number(start.startSeconds.toFixed(3)),
      endSeconds: Number(end.endSeconds.toFixed(3)),
      semanticEventIds: selectedRows.filter(({ row }) => row.kind === "semantic-event").map(({ id }) => id),
      sceneAnchorIds: selectedRows.filter(({ row }) => row.kind === "scene-anchor").map(({ id }) => id)
    };
  }
  qualifySemanticSelection(packageRecord, selection) {
    if (packageRecord.status !== "ready") return { qualification: "blocked", reason: packageRecord.reason ?? "\u8BC1\u636E\u5305\u4E0D\u53EF\u7528\u3002", needsMultimodalReview: false, claims: [] };
    const rows = this.database.prepare("SELECT kind, start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson, qualification, reason FROM clip_evidence_units WHERE package_id = ? ORDER BY start_seconds, end_seconds, id").all(packageRecord.id);
    const evidence = /* @__PURE__ */ new Map();
    for (const row of rows) {
      try {
        const ids = JSON.parse(row.sourceIdsJson);
        if (Array.isArray(ids)) {
          for (const id of ids) if (typeof id === "string") evidence.set(id, row);
        }
      } catch {
      }
    }
    const selected = selection.evidenceIds.map((id) => evidence.get(id));
    const start = evidence.get(selection.startEvidenceId);
    const end = evidence.get(selection.endEvidenceId);
    if (!start || !end || selected.some((item) => !item)) return { qualification: "blocked", reason: "\u5019\u9009\u8D77\u6B62\u6216\u6838\u5FC3\u4E8B\u4EF6\u7F3A\u5C11\u5F53\u524D\u8BC1\u636E\u5305\u4E2D\u7684\u53EF\u6838\u9A8C\u8BC1\u636E\u3002", needsMultimodalReview: false, claims: [] };
    const selectedRows = selected.filter((item) => Boolean(item));
    const claim = (kind, evidenceIds, units, reason) => ({ kind, evidenceIds, qualification: units.every((item) => item.qualification === "A") ? "A" : units.some((item) => item.qualification === "C") ? "C" : units.some((item) => item.qualification === "B") ? "B" : "D", reason });
    const claims = [
      claim("start-boundary", [selection.startEvidenceId], [start], "\u5019\u9009\u5165\u70B9\u7531\u51BB\u7ED3\u8BC1\u636E\u5305\u4E2D\u7684\u8D77\u59CB\u951A\u70B9\u89E3\u6790\u3002"),
      claim("end-boundary", [selection.endEvidenceId], [end], "\u5019\u9009\u51FA\u70B9\u7531\u51BB\u7ED3\u8BC1\u636E\u5305\u4E2D\u7684\u7ED3\u675F\u951A\u70B9\u89E3\u6790\u3002"),
      claim("core-event", [...selection.evidenceIds], selectedRows, "\u5019\u9009\u6838\u5FC3\u4E8B\u4EF6\u4EC5\u5F15\u7528\u5F53\u524D\u8BC1\u636E\u5305\u4E2D\u7684\u5DF2\u9009\u8BC1\u636E\u5355\u5143\u3002"),
      claim("narrative-closure", [selection.endEvidenceId], [end], selection.beat === "setup" || selection.beat === "entry" || selection.beat === "escalation" ? "\u6A21\u578B\u5C06\u7ED3\u675F\u8282\u62CD\u5224\u4E3A\u672A\u6536\u675F\u72B6\u6001\uFF0C\u4E0D\u80FD\u4F5C\u4E3A\u5B8C\u6574\u5019\u9009\u3002" : "\u7ED3\u675F\u951A\u70B9\u627F\u8F7D\u5DF2\u58F0\u660E\u7684\u53CD\u8F6C\u3001\u9AD8\u70B9\u3001\u53CD\u5E94\u6216\u4F59\u97F5\u8282\u62CD\u3002")
    ];
    const closure = claims[3];
    if (selection.beat === "setup" || selection.beat === "entry" || selection.beat === "escalation") return { qualification: "blocked", reason: "\u5019\u9009\u7ED3\u675F\u4ECD\u5904\u4E8E\u94FA\u57AB\u3001\u8FDB\u5165\u6216\u60C5\u7EEA\u5347\u7EA7\u4E2D\u6BB5\uFF0C\u672A\u5F62\u6210\u53EF\u5BA1\u9605\u7684\u53D9\u4E8B\u6536\u675F\u3002", needsMultimodalReview: false, claims };
    const hasSceneOnlyEvidence = selected.some((item) => item?.kind === "scene-anchor");
    if (hasSceneOnlyEvidence) return { qualification: "blocked", reason: "\u5019\u9009\u4F9D\u8D56\u5177\u4F53\u89C6\u89C9\u4E8B\u5B9E\uFF0C\u4F46\u5F53\u524D\u4EC5\u6709\u7ED3\u6784\u951A\u70B9\uFF1B\u9700\u5B8C\u6210\u5C40\u90E8\u89C6\u9891\u590D\u6838\u540E\u624D\u53EF\u81EA\u52A8\u7EB3\u5165\u5019\u9009\u3002", needsMultimodalReview: true, claims };
    if (claims.some((item) => item.qualification !== "A") || closure.qualification !== "A") return { qualification: "blocked", reason: "\u5019\u9009\u5173\u952E\u8D77\u6B62\u3001\u6838\u5FC3\u4E8B\u4EF6\u6216\u5B8C\u6574\u6027\u7ED3\u8BBA\u5B58\u5728\u51B2\u7A81\u3001\u7F3A\u5931\u6216\u975E\u4E3B\u8BC1\u636E\uFF0C\u7CFB\u7EDF\u672A\u731C\u6D4B\u5207\u70B9\u3002", needsMultimodalReview: false, claims };
    if (selection.context === "limited") return { qualification: "qualified_with_limit", reason: "\u6838\u5FC3\u4E8B\u4EF6\u4E0E\u5207\u70B9\u8BC1\u636E\u5B8C\u6574\uFF0C\u4F46\u524D\u60C5\u6216\u540E\u7EED\u4E0A\u4E0B\u6587\u53D7\u9650\u3002", needsMultimodalReview: false, claims };
    return { qualification: "qualified", reason: null, needsMultimodalReview: false, claims };
  }
  /**
   * A supported review may prove only the concrete visual fact in its frozen
   * scope. The original scene anchor remains B: this extra immutable unit is
   * the sole A-level evidence that can satisfy a visual candidate claim.
   */
  recordSupportedVisualFact(input) {
    if (!input.evidenceIds.length || !input.claimKinds.length || !input.ranges.length || !input.frames.length) throw new Error("\u5C40\u90E8\u89C6\u9891\u590D\u6838\u7F3A\u5C11\u53EF\u56DE\u94FE\u7684\u8303\u56F4\u3001\u5173\u952E\u7ED3\u8BBA\u6216\u5E27\u4E8B\u5B9E\uFF0C\u4E0D\u80FD\u521B\u5EFA\u89C6\u89C9\u4E3B\u8BC1\u636E\u3002");
    const id = randomUUID2();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const startSeconds = Math.min(...input.ranges.map((item) => item.startSeconds));
    const endSeconds = Math.max(...input.ranges.map((item) => item.endSeconds));
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) throw new Error("\u5C40\u90E8\u89C6\u9891\u590D\u6838\u8303\u56F4\u65E0\u6548\uFF0C\u4E0D\u80FD\u521B\u5EFA\u89C6\u89C9\u4E3B\u8BC1\u636E\u3002");
    this.database.prepare("INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, coverage_json, source_version, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      id,
      input.package.id,
      "multimodal-visual-fact",
      startSeconds,
      endSeconds,
      JSON.stringify([id]),
      "A",
      JSON.stringify({ scope: "multimodal-visual-fact", visualFact: "available", claimKinds: [...new Set(input.claimKinds)], reviewTaskId: input.taskId, modelRunId: input.modelRunId, sourceEvidenceIds: [...new Set(input.evidenceIds)], reviewScope: input.ranges, frames: input.frames, limitedTo: "\u672C\u6B21\u5C40\u90E8\u5BA1\u9605\u5DF2\u652F\u6301\u7684\u5177\u4F53\u89C6\u89C9\u4E8B\u5B9E" }),
      "multimodal-review-v1",
      `\u5C40\u90E8\u89C6\u9891\u590D\u6838\u5DF2\u652F\u6301\u7684\u5177\u4F53\u89C6\u89C9\u4E8B\u5B9E\uFF1A${input.reason}`,
      now,
      now
    );
    return id;
  }
  qualifyReviewedVisualSelection(packageRecord, selection, visualFactEvidenceId, visualFactReason) {
    const base = this.qualifySemanticSelection(packageRecord, selection);
    if (!base.needsMultimodalReview) return { qualification: "blocked", reason: "\u5019\u9009\u5E76\u672A\u5904\u4E8E\u5FC5\u987B\u89C6\u9891\u590D\u6838\u72B6\u6001\uFF0C\u62D2\u7EDD\u628A\u89C6\u89C9\u4E8B\u5B9E\u7528\u4E8E\u4E0D\u5339\u914D\u7684\u8D44\u683C\u63D0\u5347\u3002", needsMultimodalReview: false, claims: base.claims };
    const unit = this.database.prepare("SELECT qualification, coverage_json AS coverageJson FROM clip_evidence_units WHERE id = ? AND package_id = ? AND kind = 'multimodal-visual-fact'").get(visualFactEvidenceId, packageRecord.id);
    if (!unit || unit.qualification !== "A") return { qualification: "blocked", reason: "\u5173\u952E\u89C6\u89C9\u4E8B\u5B9E\u6CA1\u6709\u53EF\u56DE\u94FE\u7684 A \u7EA7\u5C40\u90E8\u89C6\u9891\u590D\u6838\u8BC1\u636E\u3002", needsMultimodalReview: false, claims: base.claims };
    let coverage = null;
    try {
      coverage = JSON.parse(unit.coverageJson);
    } catch {
    }
    const scopeIds = coverage && typeof coverage === "object" && "reviewScope" in coverage && Array.isArray(coverage.reviewScope) ? coverage.reviewScope.map((item) => item.evidenceId).filter((id) => typeof id === "string") : [];
    const claimKinds = coverage && typeof coverage === "object" && "claimKinds" in coverage && Array.isArray(coverage.claimKinds) ? coverage.claimKinds.filter((kind) => kind === "start-boundary" || kind === "end-boundary" || kind === "core-event" || kind === "narrative-closure") : [];
    const sceneIds = selection.evidenceIds.filter((id) => this.isSceneAnchor(packageRecord.id, id));
    if (!sceneIds.length || !sceneIds.every((id) => scopeIds.includes(id))) return { qualification: "blocked", reason: "\u5C40\u90E8\u89C6\u9891\u590D\u6838\u6CA1\u6709\u8986\u76D6\u5019\u9009\u4F9D\u8D56\u7684\u6BCF\u4E2A\u5173\u952E\u89C6\u89C9\u951A\u70B9\uFF0C\u7CFB\u7EDF\u672A\u63D0\u5347\u8D44\u683C\u3002", needsMultimodalReview: false, claims: base.claims };
    const claims = base.claims.map((claim) => {
      const claimSceneIds = claim.evidenceIds.filter((id) => this.isSceneAnchor(packageRecord.id, id));
      const claimNonSceneIds = claim.evidenceIds.filter((id) => !claimSceneIds.includes(id));
      const nonScenePrimary = claimNonSceneIds.every((id) => this.evidenceQualification(packageRecord.id, id) === "A");
      return claimKinds.includes(claim.kind) && claimSceneIds.length && claimSceneIds.every((id) => scopeIds.includes(id)) && nonScenePrimary ? { ...claim, evidenceIds: [...claim.evidenceIds, visualFactEvidenceId], qualification: "A", reason: "\u8BE5\u5173\u952E\u7ED3\u8BBA\u4E2D\u7684\u5177\u4F53\u89C6\u89C9\u4E8B\u5B9E\u7531\u672C\u6B21\u5C40\u90E8\u89C6\u9891\u590D\u6838\u7684 A \u7EA7\u4E8B\u5B9E\u8BC1\u636E\u8986\u76D6\u3002" } : claim;
    });
    claims.push({ kind: "visual-fact", evidenceIds: [visualFactEvidenceId], qualification: "A", reason: `\u5C40\u90E8\u89C6\u9891\u590D\u6838\u5DF2\u652F\u6301\u7684\u5177\u4F53\u89C6\u89C9\u4E8B\u5B9E\uFF1A${visualFactReason}` });
    if (claims.some((claim) => claim.qualification !== "A")) return { qualification: "blocked", reason: "\u5019\u9009\u4ECD\u6709\u672A\u7531\u4E3B\u8BC1\u636E\u8986\u76D6\u7684\u5173\u952E\u7ED3\u8BBA\uFF0C\u7CFB\u7EDF\u672A\u7EB3\u5165\u5019\u9009\u3002", needsMultimodalReview: false, claims };
    return selection.context === "limited" ? { qualification: "qualified_with_limit", reason: "\u5173\u952E\u89C6\u89C9\u4E8B\u5B9E\u5DF2\u5B8C\u6210\u5C40\u90E8\u89C6\u9891\u590D\u6838\uFF1B\u524D\u60C5\u6216\u540E\u7EED\u4E0A\u4E0B\u6587\u53D7\u9650\u3002", needsMultimodalReview: false, claims } : { qualification: "qualified", reason: null, needsMultimodalReview: false, claims };
  }
  isSceneAnchor(packageId, evidenceId) {
    const rows = this.database.prepare("SELECT source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE package_id = ? AND kind = 'scene-anchor'").all(packageId);
    return rows.some((row) => {
      try {
        const ids = JSON.parse(row.sourceIdsJson);
        return Array.isArray(ids) && ids.includes(evidenceId);
      } catch {
        return false;
      }
    });
  }
  evidenceQualification(packageId, evidenceId) {
    const rows = this.database.prepare("SELECT qualification, source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE package_id = ?").all(packageId);
    for (const row of rows) {
      try {
        const ids = JSON.parse(row.sourceIdsJson);
        if (Array.isArray(ids) && ids.includes(evidenceId)) return row.qualification;
      } catch {
      }
    }
    return null;
  }
  orderedEvidenceIds(packageRecord, evidenceIds) {
    const ranges = /* @__PURE__ */ new Map();
    const rows = this.database.prepare("SELECT start_seconds AS startSeconds, source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE package_id = ?").all(packageRecord.id);
    for (const row of rows) {
      try {
        const ids = JSON.parse(row.sourceIdsJson);
        if (Array.isArray(ids)) {
          for (const id of ids) if (typeof id === "string") ranges.set(id, row.startSeconds);
        }
      } catch {
      }
    }
    return [...new Set(evidenceIds)].sort((left, right) => (ranges.get(left) ?? Number.POSITIVE_INFINITY) - (ranges.get(right) ?? Number.POSITIVE_INFINITY) || left.localeCompare(right));
  }
  /** A semantic window is core evidence plus one whole frozen unit on either side. */
  surroundingEvidenceIds(packageRecord, coreEvidenceIds) {
    const rows = this.database.prepare("SELECT start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE package_id = ? AND kind IN ('semantic-event', 'scene-anchor') AND qualification IN ('A', 'B') ORDER BY start_seconds, end_seconds, id").all(packageRecord.id);
    const units = rows.flatMap((row) => {
      try {
        const ids = JSON.parse(row.sourceIdsJson);
        return Array.isArray(ids) && ids.length === 1 && typeof ids[0] === "string" ? [{ id: ids[0], ...row }] : [];
      } catch {
        return [];
      }
    });
    const core = new Set(coreEvidenceIds);
    const indexes = units.map((unit, index) => core.has(unit.id) ? index : -1).filter((index) => index >= 0);
    if (!indexes.length) return { before: [], after: [] };
    const first = Math.min(...indexes);
    const last = Math.max(...indexes);
    return { before: first > 0 ? [units[first - 1].id] : [], after: last + 1 < units.length ? [units[last + 1].id] : [] };
  }
  multimodalReviewScope(packageRecord, selection) {
    if (!selection.narrativeEventId) return null;
    const row = this.database.prepare("SELECT source_evidence_ids_json AS sourceIdsJson, core_evidence_ids_json AS coreIdsJson, context_before_ids_json AS beforeIdsJson, context_after_ids_json AS afterIdsJson, continuity, seam_status AS seamStatus FROM clip_narrative_events WHERE package_id = ? AND event_key = ?").get(packageRecord.id, selection.narrativeEventId);
    if (!row || row.continuity === "unclear" || row.seamStatus === "unclear") return null;
    try {
      const sourceIds = JSON.parse(row.sourceIdsJson);
      const coreIds = JSON.parse(row.coreIdsJson);
      const beforeIds = JSON.parse(row.beforeIdsJson);
      const afterIds = JSON.parse(row.afterIdsJson);
      if (![sourceIds, coreIds, beforeIds, afterIds].every(Array.isArray)) return null;
      const ordered = this.orderedEvidenceIds(packageRecord, [.../* @__PURE__ */ new Set([...beforeIds, ...coreIds, ...afterIds])]);
      if (!ordered.length || !coreIds.every((id) => sourceIds.includes(id))) return null;
      const units = /* @__PURE__ */ new Map();
      const unitRows = this.database.prepare("SELECT start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE package_id = ?").all(packageRecord.id);
      for (const unit of unitRows) {
        try {
          const ids = JSON.parse(unit.sourceIdsJson);
          if (Array.isArray(ids)) {
            for (const id of ids) if (typeof id === "string") units.set(id, unit);
          }
        } catch {
        }
      }
      const core = new Set(coreIds);
      const before = new Set(beforeIds);
      const ranges = ordered.map((evidenceId) => {
        const unit = units.get(evidenceId);
        return unit ? { evidenceId, ...unit, role: core.has(evidenceId) ? "core" : before.has(evidenceId) ? "context-before" : "context-after" } : null;
      }).filter((item) => Boolean(item));
      return ranges.length === ordered.length ? { evidenceIds: ordered, ranges } : null;
    } catch {
      return null;
    }
  }
  /** Minimal outbound text context: only cue text already linked to selected events. */
  semanticContext(packageRecord, evidenceIds) {
    const eventIds = [...new Set(evidenceIds)].filter((id) => this.database.prepare("SELECT 1 FROM clip_evidence_units WHERE package_id = ? AND (qualification = 'A' OR (kind = 'scene-anchor' AND qualification = 'B')) AND source_ids_json LIKE ?").get(packageRecord.id, `%${id}%`));
    if (!eventIds.length) return "";
    const placeholders = eventIds.map(() => "?").join(",");
    const rows = this.database.prepare(`
      SELECT DISTINCT cue.text FROM subtitle_semantic_event_cues link
      JOIN subtitle_cues cue ON cue.id = link.cue_id
      WHERE link.event_id IN (${placeholders})
      ORDER BY cue.start_seconds, cue.id
    `).all(...eventIds);
    const text = rows.map((row) => row.text.trim()).filter(Boolean).join("\n");
    if (text) return text.slice(0, 12e3);
    const sceneRows = this.database.prepare(`SELECT evidence.summary FROM clip_evidence_units unit JOIN ai_evidence evidence ON unit.source_ids_json LIKE '%' || evidence.id || '%' WHERE unit.package_id = ? AND unit.kind = 'scene-anchor'`).all(packageRecord.id);
    return sceneRows.map((row) => row.summary.trim()).filter(Boolean).join("\n").slice(0, 12e3);
  }
  readDuration(packageId) {
    const row = this.database.prepare("SELECT evidence_json AS evidenceJson FROM clip_evidence_packages WHERE id = ?").get(packageId);
    try {
      const value = JSON.parse(row?.evidenceJson ?? "{}");
      return value && typeof value === "object" && "durationSeconds" in value && typeof value.durationSeconds === "number" && value.durationSeconds > 0 ? value.durationSeconds : null;
    } catch {
      return null;
    }
  }
};

// src/main/services/default-asr-subtitle-service.ts
import { createHash as createHash2, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join2 } from "node:path";
import { z as z4 } from "zod";
var host = "asr.tencentcloudapi.com";
var version = "2019-06-14";
var maxLocalAudioBytes = 5 * 1024 * 1024;
var chunkDurationSeconds = 120;
var chunkOverlapSeconds = 3;
var resultFormat = 3;
var sentenceMaxLength = 40;
var pollIntervalMilliseconds = 1500;
var inputSchema = z4.object({ dramaId: z4.string().trim().min(1), episodeId: z4.string().trim().min(1), language: z4.enum(["zh-CN", "zh-en", "auto"]), mode: z4.enum(["audio-first", "denoise", "import-only"]) });
var defaultRuntime = { resolveFfmpeg: () => resolveMediaBinary("ffmpeg"), resolveFfprobe: () => resolveMediaBinary("ffprobe"), run: runMediaProcess, createTempDirectory: () => mkdtemp(join2(tmpdir(), "shortdrama-asr-")), removeTempDirectory: (path) => rm(path, { recursive: true, force: true }), readFile, wait: (milliseconds) => new Promise((resolve2) => setTimeout(resolve2, milliseconds)) };
var DefaultAsrSubtitleService = class {
  constructor(database, evidence, profiles, secrets, runtime = defaultRuntime, fetchImpl = fetch, now = Date.now) {
    this.database = database;
    this.evidence = evidence;
    this.profiles = profiles;
    this.secrets = secrets;
    this.runtime = runtime;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }
  async extract(input) {
    const value = inputSchema.parse(input);
    if (value.mode === "import-only") throw new Error("\u201C\u4EC5\u5BFC\u5165\u5B57\u5E55\u201D\u4E0D\u662F\u53EF\u6267\u884C\u7684\u97F3\u9891\u8BC6\u522B\u65B9\u5F0F\uFF1B\u8BF7\u9009\u62E9\u201CASR \u5B9E\u5F55\u4F18\u5148\u201D\u6216\u201C\u589E\u5F3A\u964D\u566A\u540E\u8BC6\u522B\u201D\u3002");
    const profile = this.requireTencentProfile();
    const credentials = this.readCredentials(profile);
    const ffmpeg = this.runtime.resolveFfmpeg();
    const ffprobe = this.runtime.resolveFfprobe();
    if (!ffmpeg || !ffprobe) throw new Error("\u672A\u627E\u5230 FFmpeg \u6216 ffprobe\uFF0C\u65E0\u6CD5\u4ECE\u89C6\u9891\u63D0\u53D6\u97F3\u9891\u3002");
    const episode = this.database.prepare("SELECT source_path AS sourcePath FROM episodes WHERE id = ? AND drama_id = ?").get(value.episodeId, value.dramaId);
    if (!episode) throw new Error("\u5F53\u524D\u5206\u96C6\u4E0D\u5B58\u5728\uFF0C\u65E0\u6CD5\u8FDB\u884C\u97F3\u9891\u8BC6\u522B\u3002");
    const duration = await readDuration(this.runtime, ffprobe, episode.sourcePath);
    const timeoutMs = Math.max(1e3, Math.min(profile.timeoutMs ?? 6e4, 6e5));
    const directory = await this.runtime.createTempDirectory();
    try {
      const chunkCues = [];
      let chunkStart = 0;
      let chunkCount = 0;
      while (chunkStart < duration) {
        const chunkDuration = Math.min(chunkDurationSeconds, duration - chunkStart);
        const chunkPath = join2(directory, `audio-${String(Math.floor(chunkStart)).padStart(6, "0")}.wav`);
        assertSuccessfulProcess(await this.runtime.run(ffmpeg, ["-hide_banner", "-loglevel", "error", "-ss", String(chunkStart), "-t", String(chunkDuration), "-i", episode.sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-f", "wav", "-y", chunkPath]));
        const audio = await this.runtime.readFile(chunkPath);
        if (audio.byteLength > maxLocalAudioBytes) throw new Error("\u63D0\u53D6\u7684\u672C\u5730\u97F3\u9891\u7247\u6BB5\u8D85\u8FC7\u817E\u8BAF\u4E91 5 MB \u9650\u5236\uFF0C\u672A\u4E0A\u4F20\u8BE5\u7247\u6BB5\u3002");
        const taskId = await this.createTask(credentials, this.engineFor(profile, value.language), audio, timeoutMs);
        const details = await this.waitForTask(credentials, taskId, timeoutMs);
        chunkCount += 1;
        for (const detail of details) {
          const text = detail.FinalSentence?.trim() ?? "";
          const startMs = detail.StartMs;
          const endMs = detail.EndMs;
          if (!text || typeof startMs !== "number" || typeof endMs !== "number" || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue;
          const startSeconds = chunkStart + startMs / 1e3;
          const endSeconds = chunkStart + endMs / 1e3;
          if (startSeconds < 0 || endSeconds <= startSeconds || startSeconds >= duration + 0.25) continue;
          chunkCues.push({ startSeconds, endSeconds: Math.min(duration, endSeconds), text, confidence: null, chunkStartSeconds: chunkStart, chunkEndSeconds: chunkStart + chunkDuration });
        }
        if (chunkStart + chunkDuration >= duration) break;
        chunkStart += chunkDuration - chunkOverlapSeconds;
      }
      const cues = reconcileChunkCues(chunkCues).map((cue, index) => ({ ...cue, index: index + 1 }));
      if (cues.length === 0) throw new Error("\u817E\u8BAF\u4E91 ASR \u672A\u8FD4\u56DE\u53EF\u7528\u4E8E\u5B57\u5E55\u7684\u5E26\u65F6\u95F4\u8F74\u7ED3\u679C\u3002");
      return this.evidence.createTrack({ dramaId: value.dramaId, episodeId: value.episodeId, sourceKind: "asr", label: `\u817E\u8BAF\u4E91 ASR\uFF08${this.engineFor(profile, value.language)}\uFF09`, language: value.language, cost: { engine: "tencent-cloud-asr", mode: value.mode, chunkDurationSeconds, chunkOverlapSeconds, chunkCount, resultFormat, sentenceMaxLength, estimatedCost: null, actualCost: null }, cues });
    } finally {
      await this.runtime.removeTempDirectory(directory);
    }
  }
  requireTencentProfile() {
    const profile = this.profiles.list().find((item) => item.capability === "asr");
    if (!profile) throw new Error("\u8BF7\u5148\u5728\u201CASR \u5B57\u5E55\u8BC6\u522B\u201D\u4E2D\u4FDD\u5B58\u5E76\u8BBE\u5B9A\u9ED8\u8BA4\u4F9B\u5E94\u5546\u3002");
    if (profile.provider !== "\u817E\u8BAF\u4E91 ASR") throw new Error(`\u5F53\u524D\u9ED8\u8BA4 ASR \u4E3A\u201C${profile.provider}\u201D\uFF0C\u8BE5\u4F9B\u5E94\u5546\u7684\u5B57\u5E55\u6267\u884C\u5668\u5C1A\u672A\u63A5\u5165\u3002\u8BF7\u5207\u6362\u5230\u5DF2\u914D\u7F6E\u7684\u817E\u8BAF\u4E91 ASR \u540E\u91CD\u8BD5\u3002`);
    try {
      const endpoint = new URL(profile.endpoint ?? "");
      if (endpoint.protocol !== "https:" || endpoint.hostname.toLowerCase() !== host || endpoint.port || endpoint.pathname !== "/" || endpoint.search || endpoint.hash) throw new Error("invalid");
    } catch {
      throw new Error("\u817E\u8BAF\u4E91 ASR \u5730\u5740\u65E0\u6548\uFF1B\u8BF7\u6062\u590D\u4E3A https://asr.tencentcloudapi.com\u3002");
    }
    return profile;
  }
  readCredentials(profile) {
    if (!profile.secretRef) throw new Error("\u817E\u8BAF\u4E91 ASR \u5C1A\u672A\u4FDD\u5B58 SecretId \u548C SecretKey\u3002");
    try {
      const values = credentialValuesFromStoredValue(this.secrets.readPlaintextForMainProcess(profile.secretRef), "tencent-cloud-secret-pair");
      if (values?.secretId && values.secretKey) return { secretId: values.secretId, secretKey: values.secretKey };
    } catch {
    }
    throw new Error("\u817E\u8BAF\u4E91 ASR \u51ED\u636E\u4E0D\u53EF\u7528\uFF1B\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u91CD\u65B0\u586B\u5199 SecretId \u548C SecretKey\u3002");
  }
  engineFor(profile, language) {
    if (language === "zh-en") return "16k_zh_en";
    if (language === "auto") return "16k_zh_en_2.0";
    return profile.model?.trim() || "16k_zh";
  }
  async createTask(credentials, engine, audio, timeoutMs) {
    const response = await this.request(credentials, "CreateRecTask", { EngineModelType: engine, ChannelNum: 1, ResTextFormat: resultFormat, SentenceMaxLength: sentenceMaxLength, SourceType: 1, Data: audio.toString("base64"), DataLen: audio.byteLength }, timeoutMs);
    const taskId = response.Response?.Data?.TaskId;
    if (typeof taskId !== "number" || !Number.isSafeInteger(taskId) || taskId <= 0) throw asrError(response, "\u817E\u8BAF\u4E91 ASR \u672A\u8FD4\u56DE\u53EF\u67E5\u8BE2\u7684\u4EFB\u52A1\u6807\u8BC6\u3002");
    return taskId;
  }
  async waitForTask(credentials, taskId, timeoutMs) {
    const deadline = this.now() + timeoutMs;
    while (this.now() < deadline) {
      const response = await this.request(credentials, "DescribeTaskStatus", { TaskId: taskId }, Math.max(1e3, deadline - this.now()));
      const data = response.Response?.Data;
      if (data?.Status === 2) return data.ResultDetail ?? [];
      if (data?.Status === 3) throw new Error("\u817E\u8BAF\u4E91 ASR \u8BC6\u522B\u5931\u8D25\u3002");
      if (response.Response?.Error) throw asrError(response, "\u817E\u8BAF\u4E91 ASR \u67E5\u8BE2\u5931\u8D25\u3002");
      await this.runtime.wait(pollIntervalMilliseconds);
    }
    throw new Error("\u817E\u8BAF\u4E91 ASR \u7B49\u5F85\u7ED3\u679C\u8D85\u65F6\u3002");
  }
  async request(credentials, action, body, timeoutMs) {
    const timestamp = Math.floor(this.now() / 1e3);
    const serialized = JSON.stringify(body);
    try {
      const response = await this.fetchImpl(`https://${host}`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(timeoutMs), headers: { Authorization: authorizationFor(credentials, timestamp, action, serialized), "Content-Type": "application/json", Accept: "application/json", "X-TC-Action": action, "X-TC-Version": version, "X-TC-Timestamp": String(timestamp) }, body: serialized });
      let payload = {};
      try {
        payload = await response.json();
      } catch {
      }
      if (!response.ok && !payload.Response?.Error) throw new Error("\u817E\u8BAF\u4E91 ASR \u670D\u52A1\u8BF7\u6C42\u5931\u8D25\u3002");
      return payload;
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw new Error("\u817E\u8BAF\u4E91 ASR \u8BF7\u6C42\u8D85\u65F6\u3002");
      if (error instanceof Error && error.message.startsWith("\u817E\u8BAF\u4E91 ASR")) throw error;
      throw new Error("\u65E0\u6CD5\u8FDE\u63A5\u817E\u8BAF\u4E91 ASR\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u6216\u7A0D\u540E\u91CD\u8BD5\u3002");
    }
  }
};
var normalizedCueText = (text) => text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
var isBoundaryDuplicate = (left, right) => {
  if (left.chunkStartSeconds === right.chunkStartSeconds || normalizedCueText(left.text) !== normalizedCueText(right.text)) return false;
  const overlapsOrTouches = left.startSeconds <= right.endSeconds + 0.5 && right.startSeconds <= left.endSeconds + 0.5;
  if (!overlapsOrTouches) return false;
  const rightNearChunkStart = right.startSeconds - right.chunkStartSeconds <= chunkOverlapSeconds + 0.5;
  const leftNearChunkEnd = left.chunkEndSeconds - left.endSeconds <= chunkOverlapSeconds + 0.5;
  return rightNearChunkStart || leftNearChunkEnd;
};
var reconcileChunkCues = (input) => {
  const ordered = [...input].sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds);
  const reconciled = [];
  for (const cue of ordered) {
    let duplicateIndex = -1;
    for (let index = reconciled.length - 1; index >= 0; index -= 1) {
      const previous2 = reconciled[index];
      if (cue.startSeconds - previous2.endSeconds > 0.5) break;
      if (isBoundaryDuplicate(previous2, cue)) {
        duplicateIndex = index;
        break;
      }
    }
    if (duplicateIndex < 0) {
      reconciled.push(cue);
      continue;
    }
    const previous = reconciled[duplicateIndex];
    reconciled[duplicateIndex] = {
      ...previous,
      startSeconds: Math.min(previous.startSeconds, cue.startSeconds),
      endSeconds: Math.max(previous.endSeconds, cue.endSeconds),
      text: cue.text.length > previous.text.length ? cue.text : previous.text
    };
  }
  return reconciled.map(({ chunkStartSeconds: _chunkStartSeconds, chunkEndSeconds: _chunkEndSeconds, ...cue }) => cue);
};
var readDuration = async (runtime, ffprobe, sourcePath) => {
  const result = assertSuccessfulProcess(await runtime.run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1", sourcePath]));
  const duration = Number.parseFloat(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("\u65E0\u6CD5\u8BFB\u53D6\u89C6\u9891\u65F6\u957F\uFF0C\u4E0D\u80FD\u8FDB\u884C\u97F3\u9891\u8BC6\u522B\u3002");
  return duration;
};
var asrError = (response, fallback) => {
  const code = response.Response?.Error?.Code ?? "";
  if (/^(AuthFailure|SignatureFailure|UnauthorizedOperation)/.test(code)) return new Error("\u817E\u8BAF\u4E91 ASR \u9274\u6743\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5 SecretId\u3001SecretKey \u4E0E\u670D\u52A1\u5F00\u901A\u72B6\u6001\u3002");
  if (/^(RequestLimitExceeded|LimitExceeded|Throttling)/.test(code)) return new Error("\u817E\u8BAF\u4E91 ASR \u5F53\u524D\u9650\u6D41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
  if (/UserHasNo|ServiceIsolate|UserNotRegistered/.test(code)) return new Error("\u817E\u8BAF\u4E91 ASR \u670D\u52A1\u4E0D\u53EF\u7528\uFF0C\u8BF7\u68C0\u67E5\u5F00\u901A\u72B6\u6001\u3001\u4F59\u989D\u6216\u8D44\u6E90\u5305\u3002");
  return new Error(fallback);
};
var sha256 = (value) => createHash2("sha256").update(value).digest("hex");
var hmac = (key, value) => createHmac("sha256", key).update(value).digest();
var authorizationFor = (credentials, timestamp, action, body) => {
  const date = new Date(timestamp * 1e3).toISOString().slice(0, 10);
  const canonicalHeaders = `content-type:application/json
host:${host}
`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = `POST
/

${canonicalHeaders}
${signedHeaders}
${sha256(body)}`;
  const credentialScope = `${date}/asr/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256
${timestamp}
${credentialScope}
${sha256(canonicalRequest)}`;
  const secretDate = hmac(`TC3${credentials.secretKey}`, date);
  const secretService = hmac(secretDate, "asr");
  const signing = hmac(hmac(secretService, "tc3_request"), stringToSign).toString("hex");
  return `TC3-HMAC-SHA256 Credential=${credentials.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signing}`;
};

// src/main/services/local-ocr-subtitle-service.ts
import { existsSync as existsSync2 } from "node:fs";
import { createHash as createHash3 } from "node:crypto";
import { mkdtemp as mkdtemp2, readFile as readFile2, rm as rm2, writeFile } from "node:fs/promises";
import { tmpdir as tmpdir2 } from "node:os";
import { join as join3 } from "node:path";
import { z as z5 } from "zod";
var defaultRuntime2 = {
  resolveFfmpeg: () => resolveMediaBinary("ffmpeg"),
  resolvePythonRunner: resolveTemporalOcrRunner,
  run: runMediaProcess,
  createTempDirectory: () => mkdtemp2(join3(tmpdir2(), "shortdrama-ocr-")),
  removeTempDirectory: (path) => rm2(path, { recursive: true, force: true }),
  writeJson: (path, value) => writeFile(path, `${JSON.stringify(value)}
`, "utf8"),
  readJson: async (path) => JSON.parse(await readFile2(path, "utf8"))
};
var extractionSchema = z5.object({ asrTrackId: z5.string().trim().min(1), language: z5.string().trim().min(1).max(40).default("chi_sim") });
var independentExtractionSchema = z5.object({ dramaId: z5.string().trim().min(1), episodeId: z5.string().trim().min(1), language: z5.string().trim().min(1).max(40).default("chi_sim"), regionMode: z5.enum(["auto-region", "fixed-region"]).default("fixed-region") });
var temporalResultSchema = z5.discriminatedUnion("ok", [
  z5.object({ ok: z5.literal(true), cues: z5.array(z5.object({ startSeconds: z5.number().finite().min(0), endSeconds: z5.number().finite().positive(), text: z5.string().trim().min(1), confidence: z5.number().finite().min(0).max(1).nullable() })), stats: z5.record(z5.string(), z5.number().finite()) }),
  z5.object({ ok: z5.literal(false), error: z5.object({ message: z5.string().trim().min(1) }) })
]);
var LocalOcrSubtitleService = class {
  constructor(database, evidence, findPython = resolveLocalOcrPython, runtime = defaultRuntime2) {
    this.database = database;
    this.evidence = evidence;
    this.findPython = findPython;
    this.runtime = runtime;
  }
  getAvailability() {
    const packagedRunner = resolvePackagedOcrRunner();
    if (packagedRunner) return { available: true, executablePath: packagedRunner, reason: null };
    const executablePath = this.findPython();
    if (!executablePath) return { available: false, executablePath: null, reason: "\u672A\u627E\u5230\u672C\u5730 Paddle OCR \u8FD0\u884C\u65F6\uFF1B\u5F00\u53D1\u73AF\u5883\u8BF7\u8FD0\u884C tools/local-ocr \u7684\u5B89\u88C5\u6B65\u9AA4\uFF0C\u6216\u8BBE\u7F6E SHORTDRAMA_LOCAL_OCR_PYTHON\u3002\u4E0D\u4F1A\u56DE\u9000\u5230\u4ED8\u8D39\u4E91\u7AEF API \u6216 Tesseract\u3002" };
    if (!this.runtime.resolvePythonRunner()) return { available: false, executablePath: null, reason: "\u672A\u627E\u5230\u672C\u5730 Paddle OCR \u65F6\u5E8F\u6267\u884C\u811A\u672C\uFF1B\u8BF7\u68C0\u67E5 tools/local-ocr/temporal_ocr_runner.py\u3002\u4E0D\u4F1A\u56DE\u9000\u5230\u4ED8\u8D39\u4E91\u7AEF API \u6216 Tesseract\u3002" };
    return { available: true, executablePath, reason: null };
  }
  async getRuntimeInfo() {
    const packagedRunner = resolvePackagedOcrRunner();
    const scriptRunner = packagedRunner ? null : this.runtime.resolvePythonRunner();
    const python = packagedRunner ? null : this.findPython();
    const runnerPath = packagedRunner ?? scriptRunner;
    if (!runnerPath || !packagedRunner && !python) return { available: false, runnerPath, buildId: "", sha256: "", selfTest: false, reason: this.getAvailability().reason };
    const process2 = await this.runtime.run(packagedRunner ?? python, packagedRunner ? ["--self-test"] : [scriptRunner, "--self-test"]);
    const selfTest = parseSelfTestResult(process2.stdout);
    const buildId = typeof selfTest?.runnerBuildId === "string" ? selfTest.runnerBuildId : "";
    const sha2563 = await hashFile(runnerPath);
    const reason = selfTest?.error?.message || (process2.stderr.trim() || `OCR runner \u81EA\u68C0\u9000\u51FA\u7801 ${process2.exitCode ?? "\u672A\u77E5"}`);
    return { available: process2.exitCode === 0 && selfTest?.ok === true && selfTest.detector === true && selfTest.recognizer === true, runnerPath, buildId, sha256: sha2563, selfTest: selfTest?.ok === true, reason: process2.exitCode === 0 && selfTest?.ok === true ? null : reason };
  }
  async extractFixedRegionFromAsr(input) {
    const value = extractionSchema.parse(input);
    const asrTrack = this.evidence.getTrack(value.asrTrackId);
    if (asrTrack.sourceKind !== "asr" || !asrTrack.episodeId) throw new Error("\u5F53\u524D ASR \u8F68\u9053\u672A\u5173\u8054\u6709\u6548\u5206\u96C6\uFF0C\u65E0\u6CD5\u8BFB\u53D6\u8BE5\u96C6\u56FA\u5B9A OCR \u533A\u57DF");
    return this.extractTemporalFixedRegion({ dramaId: asrTrack.dramaId, episodeId: asrTrack.episodeId, language: value.language, regionMode: "fixed-region" });
  }
  async extractFixedRegionIndependently(input) {
    return this.extractTemporalFixedRegion(independentExtractionSchema.parse(input));
  }
  async extractTemporalFixedRegion(value) {
    const availability = this.getAvailability();
    if (!availability.available || !availability.executablePath) throw new Error(availability.reason ?? "\u672C\u5730 Paddle OCR \u5F15\u64CE\u4E0D\u53EF\u7528");
    const ffmpeg = this.runtime.resolveFfmpeg();
    const runner = this.runtime.resolvePythonRunner();
    const packagedRunner = resolvePackagedOcrRunner();
    if (!ffmpeg) throw new Error("\u672A\u627E\u5230 FFmpeg\uFF0C\u65E0\u6CD5\u4ECE\u89C6\u9891\u5EFA\u7ACB OCR \u65F6\u95F4\u8F74");
    if (!packagedRunner && !runner) throw new Error("\u672A\u627E\u5230\u672C\u5730 Paddle OCR \u65F6\u5E8F\u6267\u884C\u5668");
    const episode = this.database.prepare("SELECT source_path AS sourcePath FROM episodes WHERE id = ? AND drama_id = ?").get(value.episodeId, value.dramaId);
    if (!episode) throw new Error("\u5F53\u524D\u5206\u96C6\u4E0D\u5B58\u5728");
    const savedRegion = this.evidence.getEffectiveOcrRegion(value.dramaId, value.episodeId);
    if (value.regionMode === "fixed-region" && !savedRegion) throw new Error("\u8BF7\u5148\u4E3A\u8BE5\u5267\u6216\u8BE5\u96C6\u8BBE\u7F6E\u56FA\u5B9A\u5B57\u5E55 OCR \u533A\u57DF");
    const workDirectory = await this.runtime.createTempDirectory();
    try {
      const inputPath = join3(workDirectory, "request.json");
      const resultPath = join3(workDirectory, "result.json");
      const cropRegion = value.regionMode === "fixed-region" && savedRegion ? { x: savedRegion.x, y: savedRegion.y, width: savedRegion.width, height: savedRegion.height } : null;
      await this.runtime.writeJson(inputPath, { ffmpegPath: ffmpeg, videoPath: episode.sourcePath, language: value.language, region: cropRegion });
      const command = packagedRunner ?? availability.executablePath;
      const args = packagedRunner ? [] : [runner];
      const process2 = await this.runtime.run(command, [...args, "--input", inputPath, "--output", resultPath]);
      if (process2.exitCode !== 0) throw new Error(`\u672C\u5730 Paddle OCR \u6267\u884C\u5931\u8D25\uFF1A${process2.stderr.trim() || `\u9000\u51FA\u7801 ${process2.exitCode ?? "\u672A\u77E5"}`}`);
      const result = temporalResultSchema.parse(await this.runtime.readJson(resultPath));
      if (!result.ok) throw new Error(result.error.message);
      const cues = result.cues.filter((cue) => cue.endSeconds > cue.startSeconds).map((cue, index) => ({ index: index + 1, ...cue }));
      if (cues.length === 0) throw new Error(value.regionMode === "auto-region" ? "\u673A\u5668\u9009\u533A OCR \u6CA1\u6709\u8BC6\u522B\u5230\u5B57\u5E55\uFF1B\u8BF7\u68C0\u67E5\u89C6\u9891\u6E05\u6670\u5EA6\u6216\u6539\u7528\u5F53\u524D\u96C6\u4EBA\u5DE5\u6821\u51C6\u3002" : "\u56FA\u5B9A\u533A\u57DF OCR \u6CA1\u6709\u8BC6\u522B\u5230\u5B57\u5E55\uFF1B\u8BF7\u68C0\u67E5\u5DF2\u6821\u51C6\u533A\u57DF\u548C\u89C6\u9891\u6E05\u6670\u5EA6");
      return this.evidence.replaceOcrTrack({
        dramaId: value.dramaId,
        episodeId: value.episodeId,
        sourceKind: "ocr",
        label: value.regionMode === "auto-region" ? `\u672C\u5730\u673A\u5668\u9009\u533A OCR\uFF08${value.language}\uFF09` : `\u672C\u5730\u56FA\u5B9A\u533A\u57DF OCR\uFF08${value.language}\uFF09`,
        language: value.language,
        cost: { engine: "paddleocr", mode: "local-temporal", estimatedCost: 0, actualCost: 0, ...result.stats },
        cues
      });
    } finally {
      await this.runtime.removeTempDirectory(workDirectory);
    }
  }
};
function resolveLocalOcrPython() {
  const candidates = [
    process.env.SHORTDRAMA_LOCAL_OCR_PYTHON,
    join3(process.cwd(), "tools", "local-ocr", ".venv", "Scripts", "python.exe"),
    join3(process.resourcesPath ?? "", "tools", "local-ocr", ".venv", "Scripts", "python.exe")
  ].filter((candidate) => Boolean(candidate));
  return candidates.find((candidate) => existsSync2(candidate)) ?? null;
}
function resolveTemporalOcrRunner() {
  const candidates = [
    process.env.SHORTDRAMA_LOCAL_OCR_RUNNER,
    join3(process.cwd(), "tools", "local-ocr", "temporal_ocr_runner.py"),
    join3(process.resourcesPath ?? "", "tools", "local-ocr", "temporal_ocr_runner.py")
  ].filter((candidate) => Boolean(candidate));
  return candidates.find((candidate) => existsSync2(candidate)) ?? null;
}
function resolvePackagedOcrRunner() {
  const candidates = [
    process.env.SHORTDRAMA_LOCAL_OCR_RUNNER_BINARY,
    process.resourcesPath ? join3(process.resourcesPath, "tools", "local-ocr", "runtime", process.platform === "win32" ? "temporal_ocr_runner.exe" : "temporal_ocr_runner") : void 0
  ].filter((candidate) => Boolean(candidate));
  return candidates.find((candidate) => existsSync2(candidate)) ?? null;
}
var parseSelfTestResult = (stdout) => {
  const lines = stdout.trim().split(/\r?\n/).reverse();
  for (const line of lines) {
    try {
      const value = JSON.parse(line);
      if (typeof value === "object" && value !== null && "ok" in value) return value;
    } catch {
    }
  }
  return null;
};
var hashFile = async (path) => {
  try {
    return createHash3("sha256").update(await readFile2(path)).digest("hex");
  } catch {
    return "";
  }
};

// src/main/services/provider-profile-service.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { z as z6 } from "zod";

// src/main/services/model-studio-selection-proof.ts
var proofMarker = Symbol("model-studio-selection-proof");
var isModelStudioSelectionProof = (value) => typeof value === "object" && value !== null && value[proofMarker] === true;

// src/main/services/model-studio-model-policy.ts
var MULTIMODAL_MODEL_PRIORITY = [
  { id: "qwen3.7-flash" },
  { id: "qwen3.6-flash" },
  { id: "qwen3.7-plus" },
  { id: "qwen3.6-plus" }
];
var ASR_MODEL_PRIORITY = [
  { id: "paraformer-v2" }
];
var automaticModelIds = new Set([
  ...ASR_MODEL_PRIORITY,
  ...MULTIMODAL_MODEL_PRIORITY
].map(({ id }) => id));
var isModelStudioAutomaticModel = (model) => typeof model === "string" && automaticModelIds.has(model.trim());

// src/main/services/provider-profile-service.ts
var nonEmptyText = (max) => z6.string().trim().min(1).max(max);
var providerCapabilities = ["asr", "text-analysis", "multimodal-review"];
var legacyProviderCapabilities = ["text_semantics", "video_understanding"];
var providerCapabilitySchema = z6.enum([...providerCapabilities, ...legacyProviderCapabilities]);
var endpointSchema = z6.string().trim().max(2048).url().refine((value) => {
  const parsed = new URL(value);
  return (parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password;
}, "endpoint must be an http(s) URL without embedded credentials");
var profileSchema = z6.object({
  capability: providerCapabilitySchema,
  region: nonEmptyText(100),
  provider: nonEmptyText(100),
  endpoint: endpointSchema.nullable().optional(),
  model: z6.string().trim().max(200).nullable().optional(),
  secretRef: z6.string().uuid().nullable().optional(),
  timeoutMs: z6.number().int().positive().max(6e5).nullable().optional(),
  pricing: z6.string().trim().max(500).nullable().optional()
});
var normalizeCapability = (capability) => ({ text_semantics: "text-analysis", video_understanding: "multimodal-review" })[capability] ?? capability;
var ProviderProfileService = class {
  constructor(database) {
    this.database = database;
  }
  save(input) {
    return this.saveInternal(input, false);
  }
  saveModelStudioSelection(input, proof) {
    if (!isModelStudioSelectionProof(proof)) throw new Error("\u767E\u70BC\u6A21\u578B\u5FC5\u987B\u4F7F\u7528\u672C\u6B21\u4E3B\u8FDB\u7A0B\u81EA\u52A8\u9009\u578B\u7ED3\u679C\u4FDD\u5B58\u3002");
    const parsed = profileSchema.parse(input);
    return this.saveInternal({ ...parsed, model: proof.selectedModel }, true);
  }
  saveInternal(input, modelStudioVerified) {
    const parsed = profileSchema.parse(input);
    const profile = { ...parsed, capability: normalizeCapability(parsed.capability), provider: isModelStudioProvider(parsed.provider) ? MODEL_STUDIO_PROVIDER : parsed.provider };
    if (isProviderModelGuidanceValue(profile.model)) throw new Error("\u6A21\u578B\u4ECD\u662F\u76EE\u5F55\u5F15\u5BFC\u6587\u6848\uFF0C\u8BF7\u586B\u5199\u5DF2\u5F00\u901A\u7684\u5B9E\u9645\u6A21\u578B ID \u540E\u4FDD\u5B58\u3002");
    const modelStudio = isModelStudioProvider(profile.provider);
    if (modelStudio && (!modelStudioVerified || !isModelStudioAutomaticModel(profile.model))) throw new Error("\u767E\u70BC\u76EE\u5F55\u65B9\u6848\u7684\u6A21\u578B\u5FC5\u987B\u7531\u5E94\u7528\u4ECE\u5DF2\u5F00\u901A\u6A21\u578B\u4E2D\u81EA\u52A8\u9009\u62E9\u3002");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const save = this.database.transaction(() => {
      const existing = this.database.prepare("SELECT id, secret_ref AS secretRef FROM provider_profiles WHERE capability = ? ORDER BY updated_at DESC LIMIT 1").get(profile.capability);
      const id = existing?.id ?? randomUUID3();
      const secretRef = profile.secretRef ?? existing?.secretRef ?? null;
      const modelSelectionSource = modelStudioVerified ? "model-studio-automatic" : null;
      if (existing) {
        this.database.prepare("UPDATE provider_profiles SET region = ?, provider = ?, endpoint = ?, model = ?, model_selection_source = ?, secret_ref = ?, pricing_json = ?, timeout_ms = ?, updated_at = ? WHERE id = ?").run(
          profile.region,
          profile.provider,
          profile.endpoint ?? null,
          profile.model ?? null,
          modelSelectionSource,
          secretRef,
          profile.pricing ?? null,
          profile.timeoutMs ?? null,
          now,
          id
        );
        this.database.prepare("DELETE FROM provider_profiles WHERE capability = ? AND id <> ?").run(profile.capability, id);
      } else {
        this.database.prepare("INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, model_selection_source, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
          id,
          profile.capability,
          profile.region,
          profile.provider,
          profile.endpoint ?? null,
          profile.model ?? null,
          modelSelectionSource,
          secretRef,
          profile.pricing ?? null,
          profile.timeoutMs ?? null,
          now,
          now
        );
      }
      if (modelStudioVerified && secretRef) this.database.prepare("DELETE FROM model_studio_provisional_secrets WHERE secret_ref = ?").run(secretRef);
      return id;
    });
    return save();
  }
  list() {
    return this.database.prepare("SELECT id, capability, region, provider, endpoint, model, model_selection_source AS modelSelectionSource, secret_ref AS secretRef, timeout_ms AS timeoutMs, pricing_json AS pricing FROM provider_profiles WHERE capability IN (?, ?, ?) ORDER BY updated_at DESC").all(...providerCapabilities);
  }
};

// src/main/services/subtitle-evidence-service.ts
import { randomUUID as randomUUID4 } from "node:crypto";
import { z as z7 } from "zod";

// src/main/services/subtitle-service.ts
var formatSrt = (cues) => cues.map((cue, index) => `${index + 1}
${formatTimestamp(cue.startSeconds)} --> ${formatTimestamp(cue.endSeconds)}
${cue.text.trim()}`).join("\n\n") + (cues.length > 0 ? "\n" : "");
var formatVtt = (cues) => `WEBVTT

${cues.map((cue) => `${formatTimestamp(cue.startSeconds, ".")} --> ${formatTimestamp(cue.endSeconds, ".")}
${cue.text.trim()}`).join("\n\n")}${cues.length > 0 ? "\n" : ""}`;
var compareSubtitleCues = (asrCues, ocrCues, minimumSimilarity = 0.85, minimumConfidence = 0.75) => {
  if (!Number.isFinite(minimumSimilarity) || minimumSimilarity < 0 || minimumSimilarity > 1) throw new Error("minimumSimilarity must be between 0 and 1");
  if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1) throw new Error("minimumConfidence must be between 0 and 1");
  const pairs = asrCues.flatMap((asrCue) => ocrCues.map((ocrCue) => ({ asrCue, ocrCue, timeOverlapSeconds: Math.max(0, Math.min(asrCue.endSeconds, ocrCue.endSeconds) - Math.max(asrCue.startSeconds, ocrCue.startSeconds)) }))).filter(({ timeOverlapSeconds }) => timeOverlapSeconds > 0).sort((left, right) => right.timeOverlapSeconds - left.timeOverlapSeconds);
  const matchedAsr = /* @__PURE__ */ new Set();
  const matchedOcr = /* @__PURE__ */ new Set();
  const comparisons = [];
  for (const { asrCue, ocrCue, timeOverlapSeconds } of pairs) {
    if (matchedAsr.has(asrCue.index) || matchedOcr.has(ocrCue.index)) continue;
    matchedAsr.add(asrCue.index);
    matchedOcr.add(ocrCue.index);
    const textSimilarity = calculateTextSimilarity(asrCue.text, ocrCue.text);
    const asrConfidence = asrCue.confidence ?? null;
    const ocrConfidence = ocrCue.confidence ?? null;
    const lowConfidence = asrConfidence !== null && asrConfidence < minimumConfidence || ocrConfidence !== null && ocrConfidence < minimumConfidence;
    const conclusion = lowConfidence ? "needs_review" : textSimilarity >= minimumSimilarity ? "consistent" : "different";
    comparisons.push({ asrIndex: asrCue.index, ocrIndex: ocrCue.index, timeOverlapSeconds, textSimilarity, asrConfidence, ocrConfidence, conclusion, needsReview: conclusion !== "consistent" });
  }
  for (const cue of asrCues) if (!matchedAsr.has(cue.index)) comparisons.push({ asrIndex: cue.index, ocrIndex: null, timeOverlapSeconds: 0, textSimilarity: 0, asrConfidence: cue.confidence ?? null, ocrConfidence: null, conclusion: "asr_only", needsReview: true });
  for (const cue of ocrCues) if (!matchedOcr.has(cue.index)) comparisons.push({ asrIndex: null, ocrIndex: cue.index, timeOverlapSeconds: 0, textSimilarity: 0, asrConfidence: null, ocrConfidence: cue.confidence ?? null, conclusion: "ocr_only", needsReview: true });
  return comparisons.sort((left, right) => (left.asrIndex ?? left.ocrIndex ?? 0) - (right.asrIndex ?? right.ocrIndex ?? 0));
};
var calculateTextSimilarity = (left, right) => {
  const normalizedLeft = normalizeSubtitleText(left);
  const normalizedRight = normalizeSubtitleText(right);
  if (normalizedLeft === normalizedRight) return 1;
  if (!normalizedLeft || !normalizedRight) return 0;
  const previous = Array.from({ length: normalizedRight.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= normalizedLeft.length; leftIndex += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= normalizedRight.length; rightIndex += 1) {
      const above = previous[rightIndex] ?? rightIndex;
      const leftValue = previous[rightIndex - 1] ?? leftIndex;
      const substitution = diagonal + (normalizedLeft[leftIndex - 1] === normalizedRight[rightIndex - 1] ? 0 : 1);
      diagonal = above;
      previous[rightIndex] = Math.min(above + 1, leftValue + 1, substitution);
    }
  }
  return 1 - (previous[normalizedRight.length] ?? 0) / Math.max(normalizedLeft.length, normalizedRight.length);
};
var normalizeSubtitleText = (value) => value.replace(/\s+/g, "").replace(/[，。！？、；：“”‘’,.!?;:'"`~()（）【】\[\]{}]/g, "").toLocaleLowerCase();
var formatTimestamp = (seconds, separator = ",") => {
  const milliseconds = Math.max(0, Math.round(seconds * 1e3));
  const hours = Math.floor(milliseconds / 36e5);
  const minutes = Math.floor(milliseconds % 36e5 / 6e4);
  const remainingSeconds = Math.floor(milliseconds % 6e4 / 1e3);
  const remainder = milliseconds % 1e3;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}${separator}${String(remainder).padStart(3, "0")}`;
};

// src/main/services/subtitle-evidence-service.ts
var cueSchema = z7.object({ index: z7.number().int().positive(), startSeconds: z7.number().finite().nonnegative(), endSeconds: z7.number().finite().positive(), text: z7.string().trim().min(1), confidence: z7.number().finite().min(0).max(1).nullable().optional() }).refine((cue) => cue.endSeconds > cue.startSeconds, "Cue end must be after cue start");
var cueUpdateSchema = z7.object({ startSeconds: z7.number().finite().nonnegative().optional(), endSeconds: z7.number().finite().positive().optional(), text: z7.string().trim().min(1).optional(), confidence: z7.number().finite().min(0).max(1).nullable().optional() }).refine((value) => Object.keys(value).length > 0, "Cue update is empty");
var regionSchema = z7.object({ x: z7.number().finite().min(0).max(1), y: z7.number().finite().min(0).max(1), width: z7.number().finite().positive().max(1), height: z7.number().finite().positive().max(1) }).refine((region) => region.x + region.width <= 1 && region.y + region.height <= 1, "OCR region must remain inside the source frame");
var trackInputSchema = z7.object({ dramaId: z7.string().trim().min(1), episodeId: z7.string().trim().min(1).nullable(), sourceKind: z7.enum(["asr", "ocr", "resolved"]), label: z7.string().trim().min(1).max(120), language: z7.string().trim().min(1).max(40).default("zh-CN"), cost: z7.record(z7.string(), z7.unknown()).default({}), cues: z7.array(cueSchema).min(1) });
var SubtitleEvidenceService = class {
  constructor(database) {
    this.database = database;
  }
  createTrack(input) {
    const value = trackInputSchema.parse(input);
    if (value.sourceKind === "ocr") return this.replaceOcrTrack(value);
    if (value.sourceKind === "asr") return this.replaceAsrTrack(value);
    this.assertDramaAndEpisode(value.dramaId, value.episodeId);
    const cost = this.costWithTimeQuality(value.sourceKind, value.dramaId, value.episodeId, value.cues, value.cost);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const trackId = randomUUID4();
    this.database.transaction(() => {
      this.database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, asset_id, base_track_id, source_kind, acquisition, evidence_nature, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(trackId, value.dramaId, value.episodeId, value.sourceKind, "generated", evidenceNatureForSource(value.sourceKind), value.label, value.language, "active", value.cues.length, JSON.stringify(cost), now, now);
      this.insertCues(trackId, value.cues, now);
    })();
    return this.getTrack(trackId);
  }
  replaceOcrTrack(input) {
    const value = trackInputSchema.parse(input);
    return this.replaceGeneratedTrack(value, "ocr");
  }
  replaceAsrTrack(input) {
    const value = trackInputSchema.parse(input);
    return this.replaceGeneratedTrack(value, "asr");
  }
  replaceGeneratedTrack(value, sourceKind) {
    if (value.sourceKind !== sourceKind) throw new Error(`Only ${sourceKind} tracks can replace a previous ${sourceKind} result`);
    this.assertDramaAndEpisode(value.dramaId, value.episodeId);
    const cost = this.costWithTimeQuality(value.sourceKind, value.dramaId, value.episodeId, value.cues, value.cost);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const trackId = randomUUID4();
    this.database.transaction(() => {
      this.database.prepare("UPDATE subtitle_tracks SET status = 'archived', updated_at = ? WHERE drama_id = ? AND episode_id IS ? AND source_kind = ? AND status = 'active'").run(now, value.dramaId, value.episodeId, sourceKind);
      this.database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, asset_id, base_track_id, source_kind, acquisition, evidence_nature, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(trackId, value.dramaId, value.episodeId, value.sourceKind, "generated", evidenceNatureForSource(value.sourceKind), value.label, value.language, "active", value.cues.length, JSON.stringify(cost), now, now);
      this.insertCues(trackId, value.cues, now);
    })();
    return this.getTrack(trackId);
  }
  listTracks(dramaIdInput, episodeIdInput = void 0) {
    const dramaId = z7.string().trim().min(1).parse(dramaIdInput);
    const episodeId = episodeIdInput === void 0 ? void 0 : z7.string().trim().min(1).nullable().parse(episodeIdInput);
    const rows = episodeId === void 0 ? this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, asset_id AS assetId, base_track_id AS baseTrackId, source_kind AS sourceKind, acquisition, evidence_nature AS evidenceNature, label, language, status, cue_count AS cueCount, cost_json AS costJson FROM subtitle_tracks WHERE drama_id = ? AND status = ? ORDER BY created_at DESC").all(dramaId, "active") : this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, asset_id AS assetId, base_track_id AS baseTrackId, source_kind AS sourceKind, acquisition, evidence_nature AS evidenceNature, label, language, status, cue_count AS cueCount, cost_json AS costJson FROM subtitle_tracks WHERE drama_id = ? AND episode_id IS ? AND status = ? ORDER BY created_at DESC").all(dramaId, episodeId, "active");
    return rows.map((row) => this.mapTrack(row));
  }
  listCues(trackIdInput) {
    const trackId = z7.string().trim().min(1).parse(trackIdInput);
    return this.database.prepare('SELECT id, cue_index AS "index", start_seconds AS startSeconds, end_seconds AS endSeconds, text, confidence FROM subtitle_cues WHERE track_id = ? ORDER BY cue_index').all(trackId);
  }
  setOcrRegion(dramaIdInput, episodeIdInput, regionInput) {
    const dramaId = z7.string().trim().min(1).parse(dramaIdInput);
    const episodeId = z7.string().trim().min(1).nullable().parse(episodeIdInput);
    const region = regionSchema.parse(regionInput);
    this.assertDramaAndEpisode(dramaId, episodeId);
    const scope = episodeId ? "episode_override" : "drama_default";
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const existing = this.database.prepare("SELECT id FROM subtitle_ocr_regions WHERE drama_id = ? AND episode_id IS ? AND scope = ?").get(dramaId, episodeId, scope);
    const id = existing?.id ?? randomUUID4();
    if (existing) this.database.prepare("UPDATE subtitle_ocr_regions SET x = ?, y = ?, width = ?, height = ?, updated_at = ? WHERE id = ?").run(region.x, region.y, region.width, region.height, now, id);
    else this.database.prepare("INSERT INTO subtitle_ocr_regions (id, drama_id, episode_id, scope, x, y, width, height, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, dramaId, episodeId, scope, region.x, region.y, region.width, region.height, now, now);
    return this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, scope, x, y, width, height FROM subtitle_ocr_regions WHERE id = ?").get(id);
  }
  getEffectiveOcrRegion(dramaIdInput, episodeIdInput) {
    const dramaId = z7.string().trim().min(1).parse(dramaIdInput);
    const episodeId = z7.string().trim().min(1).nullable().parse(episodeIdInput);
    this.assertDramaAndEpisode(dramaId, episodeId);
    const row = episodeId ? this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, scope, x, y, width, height FROM subtitle_ocr_regions WHERE drama_id = ? AND ((scope = 'episode_override' AND episode_id = ?) OR (scope = 'drama_default' AND episode_id IS NULL)) ORDER BY CASE scope WHEN 'episode_override' THEN 0 ELSE 1 END LIMIT 1").get(dramaId, episodeId) : this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, scope, x, y, width, height FROM subtitle_ocr_regions WHERE drama_id = ? AND scope = 'drama_default' AND episode_id IS NULL LIMIT 1").get(dramaId);
    return row ?? null;
  }
  clearOcrRegion(dramaIdInput, episodeIdInput) {
    const dramaId = z7.string().trim().min(1).parse(dramaIdInput);
    const episodeId = z7.string().trim().min(1).nullable().parse(episodeIdInput);
    this.assertDramaAndEpisode(dramaId, episodeId);
    this.database.prepare("DELETE FROM subtitle_ocr_regions WHERE drama_id = ? AND episode_id IS ? AND scope = ?").run(dramaId, episodeId, episodeId ? "episode_override" : "drama_default");
  }
  startManualRevision(trackIdInput, labelInput = void 0) {
    const baseTrack = this.getTrack(z7.string().trim().min(1).parse(trackIdInput));
    const label = labelInput === void 0 ? `\u4EBA\u5DE5\u6821\u5BF9 ${baseTrack.label}` : z7.string().trim().min(1).max(120).parse(labelInput);
    if (baseTrack.sourceKind === "resolved") return baseTrack;
    return this.getOrCreateResolvedTrack(baseTrack, label);
  }
  updateResolvedCue(trackIdInput, cueIdInput, updateInput) {
    const track = this.getTrack(z7.string().trim().min(1).parse(trackIdInput));
    if (track.sourceKind !== "resolved") throw new Error("Only a resolved track can be manually edited");
    const cueId = z7.string().trim().min(1).parse(cueIdInput);
    const update = cueUpdateSchema.parse(updateInput);
    const current = this.database.prepare('SELECT id, cue_index AS "index", start_seconds AS startSeconds, end_seconds AS endSeconds, text, confidence FROM subtitle_cues WHERE id = ? AND track_id = ?').get(cueId, track.id);
    if (!current) throw new Error("Subtitle cue not found in resolved track");
    const next = { ...current, ...update };
    if (next.endSeconds <= next.startSeconds) throw new Error("Cue end must be after cue start");
    this.database.prepare("UPDATE subtitle_cues SET start_seconds = ?, end_seconds = ?, text = ?, confidence = ?, updated_at = ? WHERE id = ?").run(next.startSeconds, next.endSeconds, next.text, next.confidence ?? null, (/* @__PURE__ */ new Date()).toISOString(), cueId);
    return this.database.prepare('SELECT id, cue_index AS "index", start_seconds AS startSeconds, end_seconds AS endSeconds, text, confidence FROM subtitle_cues WHERE id = ?').get(cueId);
  }
  archiveTrack(trackIdInput) {
    const track = this.getTrack(z7.string().trim().min(1).parse(trackIdInput));
    this.database.prepare("UPDATE subtitle_tracks SET status = ?, updated_at = ? WHERE id = ?").run("archived", (/* @__PURE__ */ new Date()).toISOString(), track.id);
  }
  compareAsrAndOcr(asrTrackIdInput, ocrTrackIdInput, minimumSimilarityInput = 0.85, minimumConfidenceInput = 0.75) {
    const asrTrack = this.getTrack(z7.string().trim().min(1).parse(asrTrackIdInput));
    const ocrTrack = this.getTrack(z7.string().trim().min(1).parse(ocrTrackIdInput));
    const minimumSimilarity = z7.number().finite().min(0).max(1).parse(minimumSimilarityInput);
    const minimumConfidence = z7.number().finite().min(0).max(1).parse(minimumConfidenceInput);
    const comparisons = this.getComparisons(asrTrack, ocrTrack, minimumSimilarity, minimumConfidence).filter((comparison) => comparison.conclusion === "different" || comparison.conclusion === "needs_review");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.database.transaction(() => {
      this.database.prepare("DELETE FROM subtitle_conflicts WHERE status = 'open' AND asr_cue_id IN (SELECT id FROM subtitle_cues WHERE track_id = ?) AND ocr_cue_id IN (SELECT id FROM subtitle_cues WHERE track_id = ?)").run(asrTrack.id, ocrTrack.id);
      const insert = this.database.prepare("INSERT INTO subtitle_conflicts (id, drama_id, episode_id, asr_cue_id, ocr_cue_id, time_overlap_seconds, text_similarity, asr_confidence, ocr_confidence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const comparison of comparisons) {
        if (!comparison.asrCueId || !comparison.ocrCueId) continue;
        insert.run(randomUUID4(), asrTrack.dramaId, asrTrack.episodeId, comparison.asrCueId, comparison.ocrCueId, comparison.timeOverlapSeconds, comparison.textSimilarity, comparison.asrConfidence, comparison.ocrConfidence, "open", now, now);
      }
    })();
    return this.database.prepare(`
      SELECT c.id, c.drama_id AS dramaId, c.episode_id AS episodeId, c.asr_cue_id AS asrCueId, c.ocr_cue_id AS ocrCueId,
             c.time_overlap_seconds AS timeOverlapSeconds, c.text_similarity AS textSimilarity, c.asr_confidence AS asrConfidence, c.ocr_confidence AS ocrConfidence, c.status,
             c.resolved_text AS resolvedText, c.resolved_start_seconds AS resolvedStartSeconds, c.resolved_end_seconds AS resolvedEndSeconds
      FROM subtitle_conflicts c
      JOIN subtitle_cues asrCue ON asrCue.id = c.asr_cue_id
      JOIN subtitle_cues ocrCue ON ocrCue.id = c.ocr_cue_id
      WHERE asrCue.track_id = ? AND ocrCue.track_id = ? AND c.status = 'open'
      ORDER BY c.created_at DESC
    `).all(asrTrack.id, ocrTrack.id);
  }
  getComparisonResults(asrTrackIdInput, visualTrackIdInput, minimumSimilarityInput = 0.85, minimumConfidenceInput = 0.75) {
    const asrTrack = this.getTrack(z7.string().trim().min(1).parse(asrTrackIdInput));
    const visualTrack = this.getTrack(z7.string().trim().min(1).parse(visualTrackIdInput));
    const minimumSimilarity = z7.number().finite().min(0).max(1).parse(minimumSimilarityInput);
    const minimumConfidence = z7.number().finite().min(0).max(1).parse(minimumConfidenceInput);
    return this.getComparisons(asrTrack, visualTrack, minimumSimilarity, minimumConfidence);
  }
  listConflicts(dramaIdInput, episodeIdInput = void 0) {
    const dramaId = z7.string().trim().min(1).parse(dramaIdInput);
    const episodeId = episodeIdInput === void 0 ? void 0 : z7.string().trim().min(1).nullable().parse(episodeIdInput);
    const rows = episodeId === void 0 ? this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, asr_cue_id AS asrCueId, ocr_cue_id AS ocrCueId, time_overlap_seconds AS timeOverlapSeconds, text_similarity AS textSimilarity, asr_confidence AS asrConfidence, ocr_confidence AS ocrConfidence, status, resolved_text AS resolvedText, resolved_start_seconds AS resolvedStartSeconds, resolved_end_seconds AS resolvedEndSeconds FROM subtitle_conflicts WHERE drama_id = ? ORDER BY created_at DESC").all(dramaId) : this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, asr_cue_id AS asrCueId, ocr_cue_id AS ocrCueId, time_overlap_seconds AS timeOverlapSeconds, text_similarity AS textSimilarity, asr_confidence AS asrConfidence, ocr_confidence AS ocrConfidence, status, resolved_text AS resolvedText, resolved_start_seconds AS resolvedStartSeconds, resolved_end_seconds AS resolvedEndSeconds FROM subtitle_conflicts WHERE drama_id = ? AND episode_id IS ? ORDER BY created_at DESC").all(dramaId, episodeId);
    return rows;
  }
  resolveConflict(conflictIdInput, decisionInput) {
    const id = z7.string().trim().min(1).parse(conflictIdInput);
    z7.object({ source: z7.literal("reviewed") }).parse(decisionInput);
    const conflict = this.database.prepare("SELECT id FROM subtitle_conflicts WHERE id = ?").get(id);
    if (!conflict) throw new Error("Subtitle conflict not found");
    const changed = this.database.prepare("UPDATE subtitle_conflicts SET status = ?, resolved_text = NULL, resolved_start_seconds = NULL, resolved_end_seconds = NULL, updated_at = ? WHERE id = ? AND status = ?").run("reviewed", (/* @__PURE__ */ new Date()).toISOString(), id, "open");
    if (changed.changes === 0) throw new Error("Subtitle conflict is not open");
    const resolved = this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, asr_cue_id AS asrCueId, ocr_cue_id AS ocrCueId, time_overlap_seconds AS timeOverlapSeconds, text_similarity AS textSimilarity, asr_confidence AS asrConfidence, ocr_confidence AS ocrConfidence, status, resolved_text AS resolvedText, resolved_start_seconds AS resolvedStartSeconds, resolved_end_seconds AS resolvedEndSeconds FROM subtitle_conflicts WHERE id = ?").get(id);
    if (resolved.status === "open") throw new Error("Subtitle conflict is not open");
    return resolved;
  }
  exportTrackAsSrt(trackIdInput) {
    return formatSrt(this.listCues(trackIdInput));
  }
  exportTrackAsVtt(trackIdInput) {
    return formatVtt(this.listCues(trackIdInput));
  }
  exportTrackAudit(trackIdInput) {
    const track = this.getTrack(z7.string().trim().min(1).parse(trackIdInput));
    const baseTrackId = track.sourceKind === "resolved" ? track.baseTrackId : track.id;
    const conflicts = baseTrackId ? this.database.prepare("SELECT c.id, c.status, c.resolved_text AS resolvedText, c.resolved_start_seconds AS resolvedStartSeconds, c.resolved_end_seconds AS resolvedEndSeconds, c.text_similarity AS textSimilarity, c.asr_confidence AS asrConfidence, c.ocr_confidence AS ocrConfidence FROM subtitle_conflicts c JOIN subtitle_cues asrCue ON asrCue.id = c.asr_cue_id WHERE asrCue.track_id = ? ORDER BY c.created_at").all(baseTrackId) : [];
    return JSON.stringify({ exportedAt: (/* @__PURE__ */ new Date()).toISOString(), track, cues: this.listCues(track.id), decisions: conflicts }, null, 2);
  }
  recordQualityEvaluation(input) {
    const value = z7.object({ dramaId: z7.string().trim().min(1), episodeId: z7.string().trim().min(1).nullable(), sourceKind: z7.enum(["import", "asr", "ocr", "resolved"]), sampleLabel: z7.string().trim().min(1).max(120), referenceCharacters: z7.number().int().nonnegative(), differingCharacters: z7.number().int().nonnegative(), conflictCount: z7.number().int().nonnegative(), evaluatedCueCount: z7.number().int().nonnegative(), elapsedMs: z7.number().int().nonnegative(), estimatedCost: z7.number().finite().nonnegative().default(0), actualCost: z7.number().finite().nonnegative().default(0), notes: z7.string().trim().max(2e3).nullable().default(null) }).refine((value2) => value2.differingCharacters <= value2.referenceCharacters, "Differing characters cannot exceed reference characters").parse(input);
    this.assertDramaAndEpisode(value.dramaId, value.episodeId);
    const id = randomUUID4();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    this.database.prepare("INSERT INTO subtitle_quality_evaluations (id, drama_id, episode_id, source_kind, sample_label, reference_characters, differing_characters, conflict_count, evaluated_cue_count, elapsed_ms, estimated_cost, actual_cost, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(id, value.dramaId, value.episodeId, value.sourceKind, value.sampleLabel, value.referenceCharacters, value.differingCharacters, value.conflictCount, value.evaluatedCueCount, value.elapsedMs, value.estimatedCost, value.actualCost, value.notes, now, now);
    return id;
  }
  getQualityReport(dramaIdInput, episodeIdInput = void 0) {
    const dramaId = z7.string().trim().min(1).parse(dramaIdInput);
    const episodeId = episodeIdInput === void 0 ? void 0 : z7.string().trim().min(1).nullable().parse(episodeIdInput);
    const row = episodeId === void 0 ? this.database.prepare("SELECT COUNT(*) AS evaluationCount, COALESCE(SUM(reference_characters), 0) AS referenceCharacters, COALESCE(SUM(differing_characters), 0) AS differingCharacters, COALESCE(SUM(conflict_count), 0) AS conflictCount, COALESCE(SUM(evaluated_cue_count), 0) AS evaluatedCueCount, COALESCE(SUM(elapsed_ms), 0) AS elapsedMs, COALESCE(SUM(estimated_cost), 0) AS estimatedCost, COALESCE(SUM(actual_cost), 0) AS actualCost FROM subtitle_quality_evaluations WHERE drama_id = ?").get(dramaId) : this.database.prepare("SELECT COUNT(*) AS evaluationCount, COALESCE(SUM(reference_characters), 0) AS referenceCharacters, COALESCE(SUM(differing_characters), 0) AS differingCharacters, COALESCE(SUM(conflict_count), 0) AS conflictCount, COALESCE(SUM(evaluated_cue_count), 0) AS evaluatedCueCount, COALESCE(SUM(elapsed_ms), 0) AS elapsedMs, COALESCE(SUM(estimated_cost), 0) AS estimatedCost, COALESCE(SUM(actual_cost), 0) AS actualCost FROM subtitle_quality_evaluations WHERE drama_id = ? AND episode_id IS ?").get(dramaId, episodeId);
    return { ...row, characterErrorRate: row.referenceCharacters > 0 ? row.differingCharacters / row.referenceCharacters : null, conflictRate: row.evaluatedCueCount > 0 ? row.conflictCount / row.evaluatedCueCount : null };
  }
  getTrack(idInput) {
    const id = z7.string().trim().min(1).parse(idInput);
    const row = this.database.prepare("SELECT id, drama_id AS dramaId, episode_id AS episodeId, asset_id AS assetId, base_track_id AS baseTrackId, source_kind AS sourceKind, acquisition, evidence_nature AS evidenceNature, label, language, status, cue_count AS cueCount, cost_json AS costJson FROM subtitle_tracks WHERE id = ?").get(id);
    if (!row) throw new Error("Subtitle track not found");
    return this.mapTrack(row);
  }
  mapTrack(row) {
    let cost = {};
    try {
      const parsed = JSON.parse(row.costJson);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) cost = parsed;
    } catch {
    }
    const { costJson: _costJson, ...track } = row;
    return { ...track, cost };
  }
  costWithTimeQuality(sourceKind, dramaId, episodeId, cues, cost) {
    const duration = episodeId ? this.database.prepare("SELECT duration_seconds AS durationSeconds FROM episodes WHERE id = ? AND drama_id = ?").get(episodeId, dramaId)?.durationSeconds ?? null : null;
    const quality = analyzeSubtitleTimeQuality({ sourceKind, cues, durationSeconds: duration, cost });
    return { ...cost, timeQuality: quality };
  }
  insertCues(trackId, cues, now) {
    const insert = this.database.prepare("INSERT INTO subtitle_cues (id, track_id, cue_index, start_seconds, end_seconds, text, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const cue of cues) insert.run(randomUUID4(), trackId, cue.index, cue.startSeconds, cue.endSeconds, cue.text, cue.confidence ?? null, now, now);
  }
  getOrCreateResolvedTrack(baseTrack, label) {
    const row = this.database.prepare("SELECT id FROM subtitle_tracks WHERE base_track_id = ? AND source_kind = 'resolved' AND status = 'active' ORDER BY created_at LIMIT 1").get(baseTrack.id);
    if (row) return this.getTrack(row.id);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const trackId = randomUUID4();
    const sourceCues = this.listCues(baseTrack.id);
    this.database.transaction(() => {
      this.database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, asset_id, base_track_id, source_kind, acquisition, evidence_nature, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, 'resolved', 'manual', 'manual_resolved', ?, ?, 'active', ?, '{}', ?, ?)").run(trackId, baseTrack.dramaId, baseTrack.episodeId, baseTrack.id, label, baseTrack.language, sourceCues.length, now, now);
      this.insertCues(trackId, sourceCues, now);
    })();
    return this.getTrack(trackId);
  }
  getComparisons(asrTrack, visualTrack, minimumSimilarity, minimumConfidence) {
    if (asrTrack.sourceKind !== "asr" || !["ocr", "import"].includes(visualTrack.sourceKind)) throw new Error("\u4E92\u8BC1\u9700\u8981 ASR \u97F3\u9891\u5B9E\u5F55\u548C OCR / \u5BFC\u5165\u753B\u9762\u5B57\u5E55\u8BC1\u636E\u3002");
    if (asrTrack.dramaId !== visualTrack.dramaId || asrTrack.episodeId !== visualTrack.episodeId) throw new Error("ASR \u4E0E\u753B\u9762\u5B57\u5E55\u8BC1\u636E\u5FC5\u987B\u5C5E\u4E8E\u540C\u4E00\u5206\u96C6\u3002");
    const asrCues = this.listCues(asrTrack.id);
    const visualCues = this.listCues(visualTrack.id);
    const asrByIndex = new Map(asrCues.map((cue) => [cue.index, cue]));
    const visualByIndex = new Map(visualCues.map((cue) => [cue.index, cue]));
    return compareSubtitleCues(asrCues, visualCues, minimumSimilarity, minimumConfidence).map((comparison) => ({ asrCueId: comparison.asrIndex === null ? null : asrByIndex.get(comparison.asrIndex)?.id ?? null, ocrCueId: comparison.ocrIndex === null ? null : visualByIndex.get(comparison.ocrIndex)?.id ?? null, timeOverlapSeconds: comparison.timeOverlapSeconds, textSimilarity: comparison.textSimilarity, asrConfidence: comparison.asrConfidence, ocrConfidence: comparison.ocrConfidence, conclusion: comparison.conclusion }));
  }
  assertDramaAndEpisode(dramaId, episodeId) {
    if (!this.database.prepare("SELECT 1 FROM dramas WHERE id = ?").get(dramaId)) throw new Error("Drama not found");
    if (episodeId && !this.database.prepare("SELECT 1 FROM episodes WHERE id = ? AND drama_id = ?").get(episodeId, dramaId)) throw new Error("Episode does not belong to drama");
  }
};
var evidenceNatureForSource = (sourceKind) => sourceKind === "ocr" ? "visual_aligned" : sourceKind === "asr" ? "audio_aligned" : "manual_resolved";

// tools/real-asr-evidence-baseline.ts
var projectRoot = resolve(import.meta.dirname, "..");
var manifestPath = join4(projectRoot, "docs", "clip-evidence-baseline", "manifest.v1.json");
var defaultSourceDatabasePath = join4(app.getPath("appData"), "ShortDramaMaterialStudio", "data", "material-studio.sqlite");
var allowedSampleIds = /* @__PURE__ */ new Set(["dev-01", "dev-02"]);
var pinnedRunnerPath = join4(projectRoot, "tools", "local-ocr", "temporal_ocr_runner.py");
var pinnedPythonPath = join4(projectRoot, "tools", "local-ocr", ".venv", "Scripts", "python.exe");
var forbiddenOcrOverrides = ["SHORTDRAMA_LOCAL_OCR_PYTHON", "SHORTDRAMA_LOCAL_OCR_RUNNER", "SHORTDRAMA_LOCAL_OCR_RUNNER_BINARY"];
var argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
};
var sourceDatabasePath = () => {
  const explicit = argument("--source-database")?.trim();
  if (!explicit) return defaultSourceDatabasePath;
  const resolved = resolve(explicit);
  if (!existsSync3(resolved)) throw new Error("\u6307\u5B9A\u7684\u51ED\u636E\u6765\u6E90\u6570\u636E\u5E93\u4E0D\u5B58\u5728\u3002");
  return resolved;
};
var sha2562 = async (path) => createHash4("sha256").update(await readFile3(path)).digest("hex");
var assertTencentCredentialShape = (database, secretRef, location) => {
  try {
    const value = JSON.parse(new SecretService(database).readPlaintextForMainProcess(secretRef));
    const credentials = value;
    if (credentials.version === 1 && credentials.provider === "tencent-cloud-asr" && typeof credentials.secretId === "string" && credentials.secretId.trim() && typeof credentials.secretKey === "string" && credentials.secretKey.trim()) return;
  } catch {
  }
  throw new Error(`${location}\u4E2D\u7684\u817E\u8BAF\u4E91 ASR \u51ED\u636E\u65E0\u6CD5\u89E3\u5BC6\u6216\u4E0D\u7B26\u5408 SecretId + SecretKey \u683C\u5F0F\u3002`);
};
var readStoredTencentConfiguration = (path) => {
  const source = new Database2(path, { readonly: true, fileMustExist: true });
  try {
    const profile = source.prepare("SELECT id, capability, region, provider, endpoint, model, secret_ref AS secretRef, timeout_ms AS timeoutMs, pricing_json AS pricing FROM provider_profiles WHERE capability = 'asr' AND provider = '\u817E\u8BAF\u4E91 ASR' ORDER BY updated_at DESC LIMIT 1").get();
    if (!profile?.secretRef) throw new Error("\u5F53\u524D\u5E94\u7528\u672A\u4FDD\u5B58\u53EF\u7528\u7684\u817E\u8BAF\u4E91 ASR \u914D\u7F6E\u3002");
    const secret = source.prepare("SELECT id, encrypted_value AS encryptedValue, created_at AS createdAt, updated_at AS updatedAt FROM secret_records WHERE id = ?").get(profile.secretRef);
    if (!secret) throw new Error("\u5F53\u524D\u5E94\u7528\u7684\u817E\u8BAF\u4E91 ASR \u51ED\u636E\u8BB0\u5F55\u4E0D\u5B58\u5728\u3002");
    assertTencentCredentialShape(source, profile.secretRef, "\u6765\u6E90\u5E93");
    return { profile, secret };
  } finally {
    source.close();
  }
};
var insertIsolatedTencentConfiguration = (database, configuration) => {
  const { profile, secret } = configuration;
  database.prepare("INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)").run(secret.id, secret.encryptedValue, secret.createdAt, secret.updatedAt);
  database.prepare("INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(profile.id, profile.capability, profile.region, profile.provider, profile.endpoint, profile.model, profile.secretRef, profile.pricing, profile.timeoutMs, (/* @__PURE__ */ new Date()).toISOString(), (/* @__PURE__ */ new Date()).toISOString());
};
var main = async () => {
  const sampleId = argument("--sample")?.trim();
  if (!sampleId || !allowedSampleIds.has(sampleId)) throw new Error("Usage: --sample dev-01|dev-02");
  await app.whenReady();
  for (const variable of forbiddenOcrOverrides) if (process.env[variable]) throw new Error(`${variable} must be unset for the pinned real ASR evidence run`);
  if (!existsSync3(pinnedPythonPath) || !existsSync3(pinnedRunnerPath)) throw new Error("\u56FA\u5B9A\u672C\u5730 OCR \u8FD0\u884C\u65F6\u4E0D\u5B58\u5728\u3002");
  const manifest = JSON.parse(await readFile3(manifestPath, "utf8"));
  const sample = manifest.publicDevelopmentSet.find((entry) => entry.id === sampleId);
  if (!sample) throw new Error("\u8BF7\u6C42\u7684\u6837\u672C\u672A\u767B\u8BB0\u5728 Baseline v1\u3002");
  const sourcePath = join4(manifest.mediaRoot, sample.relativePath);
  if (await sha2562(sourcePath) !== sample.sha256.toLowerCase()) throw new Error("\u9694\u79BB\u5A92\u4F53 SHA-256 \u4E0D\u5339\u914D\uFF0C\u62D2\u7EDD\u8C03\u7528\u4E91\u7AEF ASR\u3002");
  const configuration = readStoredTencentConfiguration(sourceDatabasePath());
  const folder = await mkdtemp3(join4(tmpdir3(), "shortdrama-real-asr-evidence-"));
  const previousPaddleCache = process.env.PADDLE_PDX_CACHE_HOME;
  process.env.PADDLE_PDX_CACHE_HOME = join4(folder, "paddle-cache");
  let database = null;
  let closeFailure = null;
  try {
    database = new Database2(join4(folder, "baseline.sqlite"));
    database.pragma("foreign_keys = ON");
    migrateDatabase(database);
    insertIsolatedTencentConfiguration(database, configuration);
    assertTencentCredentialShape(database, configuration.profile.secretRef, "\u9694\u79BB\u5E93");
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const fingerprint = fingerprintMediaSource(sourcePath);
    if (!fingerprint) throw new Error("\u9694\u79BB\u5A92\u4F53\u65E0\u6CD5\u5EFA\u7ACB\u6307\u7EB9\u3002");
    database.prepare("INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").run("baseline-drama", "\u5185\u90E8\u771F\u5B9E ASR \u9A8C\u6536", now, now);
    database.prepare("INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)").run(sample.id, "baseline-drama", 1, 0, sourcePath, fingerprint, "ready", now, now);
    const evidence = new SubtitleEvidenceService(database);
    const ocr = new LocalOcrSubtitleService(database, evidence, () => pinnedPythonPath, {
      resolveFfmpeg: () => resolveMediaBinary("ffmpeg"),
      resolvePythonRunner: () => pinnedRunnerPath,
      run: runMediaProcess,
      createTempDirectory: () => mkdtemp3(join4(tmpdir3(), "shortdrama-ocr-")),
      removeTempDirectory: (path) => rm3(path, { recursive: true, force: true }),
      writeJson: (path, value) => writeFile2(path, `${JSON.stringify(value)}
`, "utf8"),
      readJson: async (path) => JSON.parse(await readFile3(path, "utf8"))
    });
    const ocrTrack = await ocr.extractFixedRegionIndependently({ dramaId: "baseline-drama", episodeId: sample.id, language: "chi_sim", regionMode: "auto-region" });
    const asrTrack = await new DefaultAsrSubtitleService(database, evidence, new ProviderProfileService(database), new SecretService(database)).extract({ dramaId: "baseline-drama", episodeId: sample.id, language: "zh-CN", mode: "audio-first" });
    const comparisons = evidence.getComparisonResults(asrTrack.id, ocrTrack.id);
    const packageRecord = new ClipEvidencePackageService(database).build("baseline-drama", sample.id);
    const quality = asrTrack.cost.timeQuality ?? {};
    const result = {
      sampleId,
      mediaSha256: sample.sha256.toLowerCase(),
      asr: { cueCount: asrTrack.cueCount, resultFormat: asrTrack.cost.resultFormat, sentenceMaxLength: asrTrack.cost.sentenceMaxLength, timeQuality: quality },
      ocr: { cueCount: ocrTrack.cueCount },
      comparison: { total: comparisons.length, same: comparisons.filter((item) => item.conclusion === "same").length, different: comparisons.filter((item) => item.conclusion === "different").length, needsReview: comparisons.filter((item) => item.conclusion === "needs_review").length },
      evidencePackage: { status: packageRecord.status, reason: packageRecord.reason },
      isolation: {
        sourceDatabaseWrites: 0,
        subtitleTracks: database.prepare("SELECT COUNT(*) AS count FROM subtitle_tracks").get().count,
        productionTasks: database.prepare("SELECT COUNT(*) AS count FROM production_tasks").get().count,
        exports: database.prepare("SELECT COUNT(*) AS count FROM clip_export_batches").get().count
      }
    };
    if (asrTrack.cost.resultFormat !== 3 || asrTrack.cost.sentenceMaxLength !== 40) throw new Error("\u771F\u5B9E ASR \u672A\u8FD4\u56DE\u89C4\u5B9A\u7684 ResultFormat=3 / SentenceMaxLength=40 \u5143\u6570\u636E\u3002");
    if (ocrTrack.cueCount < 1 || asrTrack.cueCount < 1 || packageRecord.status !== "ready") throw new Error("\u771F\u5B9E\u8BC1\u636E\u94FE\u672A\u8FBE\u5230\u53EF\u7528\u72B6\u6001\u3002");
    if (result.isolation.productionTasks !== 0 || result.isolation.exports !== 0) throw new Error("\u9A8C\u6536\u8FC7\u7A0B\u8D8A\u8FC7\u4E86\u4EFB\u52A1\u6216\u5BFC\u51FA\u8FB9\u754C\u3002");
    console.log(`REAL_ASR_EVIDENCE_OK ${JSON.stringify(result)}`);
  } finally {
    try {
      database?.close();
    } catch (cause) {
      closeFailure = cause;
    }
    if (previousPaddleCache === void 0) delete process.env.PADDLE_PDX_CACHE_HOME;
    else process.env.PADDLE_PDX_CACHE_HOME = previousPaddleCache;
    await rm3(folder, { recursive: true, force: true });
    if (existsSync3(folder)) throw new Error("\u9694\u79BB ASR \u9A8C\u6536\u76EE\u5F55\u672A\u88AB\u6E05\u7406\u3002");
    if (closeFailure) throw closeFailure;
    app.quit();
  }
};
void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "\u771F\u5B9E ASR \u9A8C\u6536\u5931\u8D25\u3002");
  app.exit(1);
});
