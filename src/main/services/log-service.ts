import type Database from 'better-sqlite3'
import { sanitizePrivacyRecord } from './privacy-sanitizer.js'

const RETENTION_DAYS = 30

export class LogService {
  constructor(private readonly database: Database.Database) {}

  write(level: 'info' | 'warning' | 'error', eventType: string, details: Record<string, unknown> = {}): void {
    const safeDetails = sanitizePrivacyRecord(details)
    const now = new Date().toISOString()
    this.database.prepare(
      'INSERT INTO app_logs (id, level, event_type, details_json, created_at, updated_at) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)',
    ).run(level, eventType, JSON.stringify(safeDetails), now, now)
  }

  purgeOlderThan(cutoffIso: string): number {
    return this.database.prepare('DELETE FROM app_logs WHERE created_at < ?').run(cutoffIso).changes
  }

  rotate(now = new Date()): number {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()
    return this.purgeOlderThan(cutoff)
  }

  clear(): number {
    return this.database.prepare('DELETE FROM app_logs').run().changes
  }
}
