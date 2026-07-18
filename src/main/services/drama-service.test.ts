import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { openDatabase } from '../db/migrate.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DramaService } from './drama-service.js'

const databases: Database.Database[] = []
afterEach(() => { for (const database of databases.splice(0)) database.close() })
const setup = (): DramaService => { const database = new Database(':memory:'); databases.push(database); migrateDatabase(database); return new DramaService(database) }

describe('DramaService', () => {
  it('creates and imports source references in natural order', async () => {
    const service = setup()
    const created = service.create('  Demo drama  ')
    const detail = await service.importEpisodes(created.id, ['10.mp4', '02.mp4', '01（戏后）.mp4'])
    expect(detail.name).toBe('Demo drama')
    expect(detail.episodes.map(({ episodeNo }) => episodeNo)).toEqual([1, 2, 10])
    expect(detail.episodes[0]?.sourcePath).toContain('01')
    expect(service.list()[0]?.episodeCount).toBe(3)
  })

  it('rejects duplicate numbers and deletes only application records', async () => {
    const service = setup()
    const drama = service.create('Demo')
    await expect(service.importEpisodes(drama.id, ['02.mp4', '02-copy.mp4'])).rejects.toThrow('Duplicate')
    service.delete(drama.id, false)
    expect(service.list()).toEqual([])
  })

  it('persists drama data after closing and reopening a disk database', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'short-drama-persistence-')); const path = join(folder, 'data.sqlite')
    try { const first = openDatabase(path); new DramaService(first).create('Persistent drama'); first.close(); const second = openDatabase(path); expect(new DramaService(second).list()[0]?.name).toBe('Persistent drama'); second.close() } finally { await rm(folder, { recursive: true, force: true }) }
  })

  it('clears stale media metadata when an episode is relocated to an unavailable path', async () => {
    const service = setup(); const drama = service.create('Relink'); const detail = await service.importEpisodes(drama.id, ['01.mp4']); const episode = detail.episodes[0]
    if (!episode) throw new Error('episode missing')
    const updated = await service.updateEpisode(drama.id, episode.id, { episodeNo: 1, sortOrder: 0, sourcePath: 'new-location.mp4' })
    expect(updated.episodes[0]?.status).toBe('missing'); expect(updated.episodes[0]?.durationSeconds).toBeNull(); expect(updated.episodes[0]?.fps).toBeNull()
  })
})
