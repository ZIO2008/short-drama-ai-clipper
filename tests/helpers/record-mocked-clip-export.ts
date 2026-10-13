import type Database from 'better-sqlite3'

// Only for narrow unit doubles. Real FFmpeg persistence is covered by integration tests.
export function recordMockedClipExport(database: Database.Database, batch: string, candidateId: string, materialId: string): void {
  const row = database.prepare('SELECT candidate_ids_json AS manifest FROM clip_export_batches WHERE id = ?').get(batch) as { manifest: string }
  const manifest = JSON.parse(row.manifest) as { items: unknown[] }
  manifest.items.push({ candidateId, status: 'exported', materialId, reason: null })
  database.prepare('UPDATE clip_export_batches SET candidate_ids_json = ? WHERE id = ?').run(JSON.stringify(manifest), batch)
}
