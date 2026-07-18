import { accessSync, constants, existsSync } from 'node:fs'
import { extname } from 'node:path'
import type Database from 'better-sqlite3'

export type AssetHealth = { missing: string[]; unreadable: string[]; unsupported: string[]; duplicateEpisodeNumbers: number[]; missingEpisodeNumbers: number[]; issueCount: number }
export class AssetHealthService {
  constructor(private readonly database: Database.Database) {}
  inspect(dramaId: string): AssetHealth {
    const rows = this.database.prepare('SELECT episode_no, source_path FROM episodes WHERE drama_id = ? ORDER BY episode_no').all(dramaId) as Array<{ episode_no: number | null; source_path: string }>
    const missing: string[] = []; const unreadable: string[] = []; const unsupported: string[] = []; const counts = new Map<number, number>(); const numbers: number[] = []
    for (const row of rows) { if (row.episode_no !== null) { numbers.push(row.episode_no); counts.set(row.episode_no, (counts.get(row.episode_no) ?? 0) + 1) } let status = 'ready'; if (!SUPPORTED.has(extname(row.source_path).toLowerCase())) { status = 'unsupported_format'; unsupported.push(row.source_path) } else { try { accessSync(row.source_path, constants.R_OK) } catch { if (existsSync(row.source_path)) { unreadable.push(row.source_path); status = 'unreadable' } else { missing.push(row.source_path); status = 'missing' } } } this.database.prepare('UPDATE episodes SET status = ?, updated_at = ? WHERE drama_id = ? AND source_path = ?').run(status, new Date().toISOString(), dramaId, row.source_path) }
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([number]) => number)
    const max = numbers.length ? Math.max(...numbers) : 0; const present = new Set(numbers); const gaps = Array.from({ length: max }, (_, index) => index + 1).filter((number) => !present.has(number))
    return { missing, unreadable, unsupported, duplicateEpisodeNumbers: duplicates, missingEpisodeNumbers: gaps, issueCount: missing.length + unreadable.length + unsupported.length + duplicates.length + gaps.length }
  }
}
const SUPPORTED = new Set(['.mp4', '.mov', '.mkv', '.avi', '.webm'])
