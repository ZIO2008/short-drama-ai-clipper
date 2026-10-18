import type Database from 'better-sqlite3'

export const createClipCandidateNumberTable = (database: Database.Database): void => {
  database.exec(`CREATE TABLE IF NOT EXISTS clip_candidate_numbers (
    candidate_id TEXT PRIMARY KEY,
    drama_id TEXT NOT NULL REFERENCES dramas(id) ON DELETE CASCADE,
    episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
    created_at TEXT NOT NULL,
    UNIQUE (episode_id, sequence_number)
  )`)
}

// No candidate FK: deleting a candidate reserves its number for historical reports.
export const ensureClipCandidateNumbers = (database: Database.Database): void => {
  // Some historical capability-only databases have no production records.
  const core = database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name IN ('task_items','production_tasks','episodes')").get() as { count: number }
  if (core.count !== 3) return
  const missing = database.prepare(`SELECT i.id, t.drama_id AS dramaId, e.id AS episodeId, i.created_at AS createdAt
    FROM task_items i JOIN production_tasks t ON t.id = i.task_id
    JOIN episodes e ON e.id = CASE WHEN json_valid(i.planned_range) THEN json_extract(i.planned_range, '$.episodeId') END AND e.drama_id = t.drama_id
    LEFT JOIN clip_candidate_numbers number ON number.candidate_id = i.id
    WHERE t.type = 'original_clip' AND number.candidate_id IS NULL
    AND CASE WHEN json_valid(i.planned_range) THEN json_type(i.planned_range, '$.startSeconds') END IN ('integer','real')
    AND CASE WHEN json_valid(i.planned_range) THEN json_extract(i.planned_range, '$.endSeconds') > json_extract(i.planned_range, '$.startSeconds') END
    AND (CASE WHEN json_valid(t.config_snapshot) THEN json_extract(t.config_snapshot, '$.generation') ELSE 'invalid' END IS NULL
      OR i.status IN ('confirmed','exporting','exported')
      OR EXISTS (SELECT 1 FROM clip_candidate_publish_members member JOIN clip_candidate_publish_pointers pointer
        ON pointer.drama_id = member.drama_id AND pointer.episode_id = member.episode_id AND pointer.task_id = member.task_id AND pointer.task_round = member.task_round
        WHERE member.candidate_id = i.id))
    ORDER BY i.created_at, i.id`)
  if (!missing.get()) return
  database.transaction(() => {
    const rows = missing.all() as Array<{ id: string; dramaId: string; episodeId: string; createdAt: string }>
    const next = database.prepare('SELECT COALESCE(MAX(sequence_number), 0) + 1 AS number FROM clip_candidate_numbers WHERE episode_id = ?')
    const insert = database.prepare('INSERT INTO clip_candidate_numbers (candidate_id, drama_id, episode_id, sequence_number, created_at) VALUES (?, ?, ?, ?, ?)')
    for (const row of rows) {
      const sequence = (next.get(row.episodeId) as { number: number }).number
      insert.run(row.id, row.dramaId, row.episodeId, sequence, row.createdAt)
    }
  })()
}

export const readClipCandidateNumber = (database: Database.Database, candidateId: string): number | undefined =>
  (database.prepare('SELECT sequence_number AS number FROM clip_candidate_numbers WHERE candidate_id = ?').get(candidateId) as { number: number } | undefined)?.number

export const freezeClipCandidateNumbers = (database: Database.Database, candidateIds: readonly string[]): Record<string, number> => {
  ensureClipCandidateNumbers(database)
  const numbers: Record<string, number> = Object.create(null)
  for (const id of candidateIds) {
    const number = readClipCandidateNumber(database, id)
    if (number !== undefined) numbers[id] = number
  }
  return numbers
}
