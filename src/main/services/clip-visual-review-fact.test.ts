import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { buildClipVisualFactCode, readClipVisualFactStatement } from './clip-visual-review-fact.js'

describe('readClipVisualFactStatement', () => {
  it('returns only summaries linked to the requested frozen scene evidence', () => {
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, 0, ?, ?, ?, ?)').run('e', 'd', 'fixture.mp4', 'ready', now, now)
    database.prepare('INSERT INTO ai_evidence (id, drama_id, episode_id, source_type, summary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('scene-1', 'd', 'e', 'scene', '人物把信件放在桌面上', now, now)
    database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?)').run('p', 'd', 'e', 'media', 'test', 'ready', '{}', now, now)
    database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, created_at, updated_at) VALUES (?, ?, ?, 1, 2, ?, ?, ?, ?)').run('u', 'p', 'scene-anchor', JSON.stringify(['scene-1']), 'B', now, now)
    expect(readClipVisualFactStatement(database, 'p', ['scene-1'])).toBe('人物把信件放在桌面上')
    expect(readClipVisualFactStatement(database, 'p', ['missing'])).toBeNull()
    database.close()
  })

  it('builds a stable fact code from package, evidence scope and statement', () => {
    expect(buildClipVisualFactCode('p', ['b', 'a'], '事实')).toBe(buildClipVisualFactCode('p', ['a', 'b'], '事实'))
    expect(buildClipVisualFactCode('p', ['a'], '事实')).not.toBe(buildClipVisualFactCode('p', ['a'], '另一个事实'))
  })
})
