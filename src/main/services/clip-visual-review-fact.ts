import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'

/** Reads only local scene-evidence summaries already frozen into the package. */
export const readClipVisualFactStatement = (database: Database.Database, packageId: string, evidenceIds: readonly string[]): string | null => {
  const ids = [...new Set(evidenceIds)]
  if (!ids.length) return null
  const placeholders = ids.map(() => '?').join(', ')
  const rows = database.prepare(`
    SELECT DISTINCT evidence.summary
    FROM clip_evidence_units unit
    JOIN json_each(unit.source_ids_json) source
    JOIN ai_evidence evidence ON evidence.id = source.value
    WHERE unit.package_id = ? AND unit.kind = 'scene-anchor' AND source.value IN (${placeholders})
    ORDER BY evidence.id
  `).all(packageId, ...ids) as Array<{ summary: string }>
  const statement = rows.map(({ summary }) => summary.trim()).filter(Boolean).join('；').slice(0, 500)
  return statement || null
}

/** Stable identity for the exact local visual fact and its frozen evidence scope. */
export const buildClipVisualFactCode = (packageId: string, evidenceIds: readonly string[], statement: string): string => {
  const scope = [...new Set(evidenceIds)].sort().join('|')
  return `visual-fact-${createHash('sha256').update(`${packageId}|${scope}|${statement}`).digest('hex').slice(0, 24)}`
}
