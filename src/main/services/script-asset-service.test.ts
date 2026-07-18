import Database from 'better-sqlite3'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { ScriptAssetService } from './script-asset-service.js'

const dbs: Database.Database[] = []
afterEach(() => { for (const db of dbs.splice(0)) db.close() })
describe('ScriptAssetService', () => {
  it('imports a script into the drama without copying its source', async () => {
    const db = new Database(':memory:'); dbs.push(db); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('d1', 'Demo', now, now)
    const folder = await mkdtemp(join(tmpdir(), 'short-drama-script-')); const path = join(folder, 'script.txt')
    try { await writeFile(path, '第1集\n内容', 'utf8'); const service = new ScriptAssetService(db); const result = await service.import('d1', path); expect(result.asset.sourcePath).toBe(path); expect(result.episodes[0]?.segmentId).toBeTruthy(); expect(db.prepare('SELECT COUNT(*) AS count FROM script_asset_segments').get()).toEqual({ count: 1 }); expect(new ScriptAssetService(db).list('d1')).toHaveLength(1) } finally { await rm(folder, { recursive: true, force: true }) }
  })
})
