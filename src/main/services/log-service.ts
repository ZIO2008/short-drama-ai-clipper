import type Database from 'better-sqlite3'

export class LogService {
  constructor(private readonly database: Database.Database) {}
  write(level: 'info' | 'warning' | 'error', eventType: string, details: Record<string, unknown> = {}): void { const safe = Object.fromEntries(Object.entries(details).filter(([key]) => !/key|secret|token|prompt|path/i.test(key))); const now = new Date().toISOString(); this.database.prepare('INSERT INTO app_logs (id, level, event_type, details_json, created_at, updated_at) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)').run(level, eventType, JSON.stringify(safe), now, now) }
  purgeOlderThan(cutoffIso: string): number { return this.database.prepare('DELETE FROM app_logs WHERE created_at < ?').run(cutoffIso).changes }
}
