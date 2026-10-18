import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from './migrate.js'
import { ensureClipCandidateNumbers, readClipCandidateNumber } from './clip-candidate-numbering.js'
import { OriginalClipService } from '../services/original-clip-service.js'

const fixture = () => {
  const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
  const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Numbering', now, now)
  for (const [id, no] of [['e1', 1], ['e2', 2]] as const) database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, 'd', no, no - 1, 'fixture.mp4', 60, 'ready', now, now)
  return { database, service: new OriginalClipService(database) }
}

describe('durable clip numbering', () => {
  it('backfills an old schema deterministically without changing candidate ranges', () => {
    const { database, service } = fixture()
    try {
      const [a, b] = service.createCandidates('d', [{ episodeId: 'e1', startSeconds: 1, endSeconds: 3 }, { episodeId: 'e1', startSeconds: 5, endSeconds: 8 }])
      database.prepare('UPDATE task_items SET created_at = ? WHERE id = ?').run('2026-01-01', a!.id)
      database.prepare('UPDATE task_items SET created_at = ? WHERE id = ?').run('2026-01-02', b!.id)
      const before = database.prepare('SELECT id, planned_range FROM task_items ORDER BY id').all()
      database.exec('DROP TABLE clip_candidate_numbers; DELETE FROM schema_migrations WHERE version = 45')
      migrateDatabase(database); migrateDatabase(database)
      expect(readClipCandidateNumber(database, a!.id)).toBe(1)
      expect(readClipCandidateNumber(database, b!.id)).toBe(2)
      expect(database.prepare('SELECT id, planned_range FROM task_items ORDER BY id').all()).toEqual(before)
      expect(database.pragma('foreign_key_check')).toEqual([])
      expect(service.listCandidates('d').map(item => item.sequenceNumber)).toEqual([1, 2])
    } finally { database.close() }
  })
  it('keeps numbers after deletion and starts each episode independently', () => {
    const { database, service } = fixture()
    try {
      service.createCandidates('d', [{ episodeId: 'e1', startSeconds: 1, endSeconds: 3 }, { episodeId: 'e1', startSeconds: 5, endSeconds: 8 }])
      const [first, second] = service.listCandidates('d')
      service.deleteCandidate(first!.id)
      expect(service.getCandidate(second!.id).sequenceNumber).toBe(2)
      expect(readClipCandidateNumber(database, first!.id)).toBe(1)
      expect(service.createCandidate('d', 'e1', { startSeconds: 10, endSeconds: 15 }).sequenceNumber).toBe(3)
      expect(service.createCandidate('d', 'e2', { startSeconds: 10, endSeconds: 15 }).sequenceNumber).toBe(1)
      expect(service.getCandidate(second!.id).sequenceNumber).toBe(2)
    } finally { database.close() }
  })
  it('does not reserve a number for unpublished automatic intermediates', () => {
    const { database, service } = fixture()
    try {
      const staged = service.createCandidate('d', 'e1', { startSeconds: 1, endSeconds: 3 })
      database.prepare('UPDATE production_tasks SET config_snapshot = ? WHERE id = (SELECT task_id FROM task_items WHERE id = ?)').run(JSON.stringify({ generation: {} }), staged.id)
      database.prepare('DELETE FROM clip_candidate_numbers WHERE candidate_id = ?').run(staged.id)
      ensureClipCandidateNumbers(database)
      expect(readClipCandidateNumber(database, staged.id)).toBeUndefined()
      const actual = service.createCandidate('d', 'e1', { startSeconds: 5, endSeconds: 8 })
      expect(actual.sequenceNumber).toBe(1)
    } finally { database.close() }
  })
  it('repairs missing numbering metadata after an older app added a candidate', () => {
    const { database, service } = fixture()
    try {
      service.createCandidate('d', 'e1', { startSeconds: 1, endSeconds: 3 })
      const item = service.createCandidate('d', 'e1', { startSeconds: 5, endSeconds: 8 })
      database.prepare('DELETE FROM clip_candidate_numbers WHERE candidate_id = ?').run(item.id)
      service.listCandidates('d')
      expect(service.getCandidate(item.id).sequenceNumber).toBe(2)
      database.exec('DROP TABLE clip_candidate_numbers')
      expect(() => migrateDatabase(database)).toThrow('不能重新编号')
    } finally { database.close() }
  })
})
