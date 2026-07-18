import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { SubtitleAssetService } from './subtitle-asset-service.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dbs: Database.Database[] = []
afterEach(() => { for (const db of dbs.splice(0)) db.close() })
describe('SubtitleAssetService', () => {
  it('persists parsed subtitle status and cue count', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'subtitle-asset-')); const path = join(folder, 'episode.srt')
    try { await writeFile(path, '1\n00:00:01,000 --> 00:00:02,000\nhello\n', 'utf8'); const db = new Database(':memory:'); dbs.push(db); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Demo', now, now); const asset = await new SubtitleAssetService(db).importFile('drama', null, path); expect(asset.cueCount).toBe(1); expect(new SubtitleAssetService(db).list('drama')[0]?.status).toBe('ready') } finally { await rm(folder, { recursive: true, force: true }) }
  })
})
