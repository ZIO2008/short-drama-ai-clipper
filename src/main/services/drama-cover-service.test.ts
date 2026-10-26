import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { migrateDatabase } from '../db/migrate.js'
import { DramaService } from './drama-service.js'
import { DramaCoverService } from './drama-cover-service.js'

const databases: Database.Database[] = []
const folders: string[] = []
afterEach(async () => { for (const database of databases.splice(0)) database.close(); await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))) })

describe('DramaCoverService', () => {
  it('copies an uploaded cover into application cache and restores automatic fallback when removed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'short-drama-cover-')); folders.push(root)
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database)
    const drama = new DramaService(database, root).create('封面测试')
    const original = join(root, 'original.png'); await writeFile(original, 'source-image', 'utf8')
    const service = new DramaCoverService(database, root)
    const uploaded = await service.upload(drama.id, original)
    expect(uploaded.sourceKind).toBe('uploaded')
    expect(uploaded.path).not.toBe(original)
    expect(existsSync(uploaded.path)).toBe(true)
    expect(await service.removeUpload(drama.id)).toBeNull()
    expect(existsSync(original)).toBe(true)
    expect(database.prepare('SELECT COUNT(*) AS count FROM drama_covers').get()).toEqual({ count: 0 })
  })

  it('always clears the drama cover cache when a drama is deleted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'short-drama-cover-delete-')); folders.push(root)
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database)
    const dramas = new DramaService(database, root); const drama = dramas.create('清理封面')
    const original = join(root, 'original.jpg'); await writeFile(original, 'source-image', 'utf8')
    const cover = await new DramaCoverService(database, root).upload(drama.id, original)
    dramas.delete(drama.id, false)
    expect(existsSync(cover.path)).toBe(false)
    expect(existsSync(original)).toBe(true)
  })
})
