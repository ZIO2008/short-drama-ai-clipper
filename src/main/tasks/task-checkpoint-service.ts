import type Database from 'better-sqlite3'

export class TaskCheckpointService {
  constructor(private readonly database: Database.Database) {}
  save(taskId: string, checkpoint: unknown): void { this.database.prepare('UPDATE production_tasks SET checkpoint = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(checkpoint), new Date().toISOString(), taskId) }
  load(taskId: string): unknown | null { const row = this.database.prepare('SELECT checkpoint FROM production_tasks WHERE id = ?').get(taskId) as { checkpoint: string | null } | undefined; return row?.checkpoint ? JSON.parse(row.checkpoint) as unknown : null }
  pendingItems(taskId: string): Array<{ id: string; retryCount: number; status: string }> { return this.database.prepare('SELECT id, retry_count AS retryCount, status FROM task_items WHERE task_id = ? AND status NOT IN (?, ?) ORDER BY created_at').all(taskId, 'exported', 'succeeded') as Array<{ id: string; retryCount: number; status: string }> }
}
