import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'

export type TagSummary = { id: string; name: string; usageCount: number }
const idSchema = z.string().trim().min(1).max(120)
const nameSchema = z.string().trim().min(1).max(80)

export class TagService {
  constructor(private readonly database: Database.Database) {}
  list(): TagSummary[] {
    const rows = this.database.prepare(`SELECT t.id, t.name, COUNT(dt.drama_id) AS usage_count FROM tags t LEFT JOIN drama_tags dt ON dt.tag_id = t.id GROUP BY t.id ORDER BY t.name COLLATE NOCASE`).all() as Array<{ id: string; name: string; usage_count: number }>
    return rows.map((row) => ({ id: row.id, name: row.name, usageCount: row.usage_count }))
  }
  create(name: unknown): TagSummary {
    const value = nameSchema.parse(name); const now = new Date().toISOString(); const id = randomUUID()
    this.database.prepare('INSERT INTO tags (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, value, now, now)
    return { id, name: value, usageCount: 0 }
  }
  rename(tagId: unknown, name: unknown): TagSummary {
    const id = idSchema.parse(tagId); const value = nameSchema.parse(name); const now = new Date().toISOString()
    const result = this.database.prepare('UPDATE tags SET name = ?, updated_at = ? WHERE id = ?').run(value, now, id)
    if (result.changes === 0) throw new Error('Tag not found')
    return this.list().find((tag) => tag.id === id) ?? { id, name: value, usageCount: 0 }
  }
  delete(tagId: unknown): { affectedDramas: number } {
    const id = idSchema.parse(tagId)
    const row = this.database.prepare('SELECT COUNT(*) AS count FROM drama_tags WHERE tag_id = ?').get(id) as { count: number } | undefined
    const result = this.database.prepare('DELETE FROM tags WHERE id = ?').run(id)
    if (result.changes === 0) throw new Error('Tag not found')
    return { affectedDramas: row?.count ?? 0 }
  }
  attach(dramaId: unknown, tagId: unknown): void {
    const drama = idSchema.parse(dramaId); const tag = idSchema.parse(tagId); const now = new Date().toISOString()
    this.database.transaction(() => {
      this.database.prepare('INSERT OR IGNORE INTO drama_tags (drama_id, tag_id, created_at, updated_at) VALUES (?, ?, ?, ?)').run(drama, tag, now, now)
      this.database.prepare('UPDATE dramas SET updated_at = ? WHERE id = ?').run(now, drama)
    })()
  }
}
