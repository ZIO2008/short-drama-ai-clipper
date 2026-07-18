import type Database from 'better-sqlite3'
import { aggregateTaskStatus, decideAfterFailure } from './task-retry-policy.js'

export type QueueMode = 'background' | 'speed'
export type QueueItem = { id: string; run: () => Promise<void> }

export class TaskQueue {
  private running = false
  private paused = false
  private cancelled = false
  constructor(private readonly database: Database.Database) {}
  pause(): void { this.paused = true }
  resume(): void { this.paused = false }
  cancel(): void { this.cancelled = true }
  async run(taskId: string, items: readonly QueueItem[], _mode: QueueMode = 'background'): Promise<void> {
    if (this.running) throw new Error('A task is already running')
    this.running = true; this.cancelled = false; const statuses: Array<'succeeded' | 'failed' | 'skipped'> = []
    try {
      for (const item of items) {
        while (this.paused && !this.cancelled) await new Promise((resolve) => setTimeout(resolve, 20))
        if (this.cancelled) { statuses.push('skipped'); continue }
        let retryCount = 0; let done = false
        while (!done) { try { await item.run(); statuses.push('succeeded'); done = true } catch (error) { const decision = decideAfterFailure(retryCount); retryCount = decision.retryCount; if (decision.status === 'failed') { statuses.push('failed'); done = true } } }
        this.database.prepare('UPDATE production_tasks SET progress_current = progress_current + 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), taskId)
      }
      this.database.prepare('UPDATE production_tasks SET status = ?, updated_at = ? WHERE id = ?').run(aggregateTaskStatus(statuses), new Date().toISOString(), taskId)
    } finally { this.running = false }
  }
}
