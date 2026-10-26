import type Database from 'better-sqlite3'

export const createP1Tables = (database: Database.Database): void => {
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
  `)
}
