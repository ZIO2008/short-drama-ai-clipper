import type Database from 'better-sqlite3'

export const createClipSubtitleVariantTable = (database: Database.Database): void => {
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
  `)
}

export const createProjectLibraryGuards = (database: Database.Database): void => {
  const requiredTables = ['dramas', 'episodes', 'script_assets', 'script_asset_segments', 'subtitle_assets', 'production_tasks', 'generated_materials', 'ai_evidence', 'ai_drafts']
  if (requiredTables.some((table) => !tableExists(database, table))) return
  // Early pre-release builds created these two triggers before candidate-item
  // ownership was enforced on updates. Recreate them so repaired databases and
  // fresh installs share the same cross-project guard.
  database.exec('DROP TRIGGER IF EXISTS trg_generated_materials_same_drama_insert; DROP TRIGGER IF EXISTS trg_generated_materials_same_drama_update;')
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
  `)
}

const tableExists = (database: Database.Database, table: string): boolean => database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined
