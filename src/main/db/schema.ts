export const INITIAL_SCHEMA = [
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
    duration_seconds REAL,
    fps REAL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (drama_id, episode_no)
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
    retry_count INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
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
  'CREATE INDEX IF NOT EXISTS idx_episodes_drama_sort ON episodes (drama_id, sort_order)',
  'CREATE INDEX IF NOT EXISTS idx_tasks_drama_status ON production_tasks (drama_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_task_items_task_status ON task_items (task_id, status)',
  'CREATE INDEX IF NOT EXISTS idx_materials_drama_created ON generated_materials (drama_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_notifications_read_created ON notifications (read_at, created_at DESC)',
  'CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_event_key ON notifications (event_key)',
  'CREATE INDEX IF NOT EXISTS idx_logs_created ON app_logs (created_at DESC)'
] as const
