import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { TaskQueue } from '../tasks/task-queue.js'
import { MultiEpisodeService } from './multi-episode-service.js'

const databases: Database.Database[] = []
afterEach(() => { for (const database of databases.splice(0)) database.close() })

describe('MultiEpisodeService', () => {
  it('requires explicit preflight confirmation and persists a real task snapshot', async () => {
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database); const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '测试剧目', now, now)
    for (const episodeNo of [1, 2, 3, 4]) database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`e${episodeNo}`, 'drama', episodeNo, episodeNo - 1, `${episodeNo}.mp4`, 60, 25, 'ready', now, now)
    const service = new MultiEpisodeService(database, new TaskQueue(database))
    const preflight = await service.preflight('drama', { startEpisode: 1, endEpisode: 4, groupSize: 3, tailStrategy: 'reduce', maxMinutes: 10, outputDirectory: '.', qualityMode: 'size', targetSizeMb: 100, fps: 'source', packagingEnabled: false })
    expect(preflight.windows).toHaveLength(2)
    expect(preflight.windows[0]).toMatchObject({ estimatedSizeMb: 100, estimatedBitrateKbps: 4391 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM production_tasks').get()).toEqual({ count: 0 })
    await expect(service.createTask('drama', { startEpisode: 1, endEpisode: 4, groupSize: 3, tailStrategy: 'reduce', maxMinutes: 10, outputDirectory: '.', preflightConfirmed: false, preflightId: preflight.preflightId })).rejects.toThrow()
    const confirmedConfig = { startEpisode: 1, endEpisode: 4, groupSize: 3, tailStrategy: 'reduce' as const, maxMinutes: 10, outputDirectory: '.', qualityMode: 'size' as const, targetSizeMb: 100, fps: 'source' as const, packagingEnabled: false, preflightConfirmed: true as const, preflightId: preflight.preflightId }
    const result = await service.createTask('drama', confirmedConfig)
    expect(result.windows.map(({ startEpisode, endEpisode }) => [startEpisode, endEpisode])).toEqual([[1, 3], [2, 4]])
    expect(database.prepare('SELECT type, progress_total AS total FROM production_tasks WHERE id = ?').get(result.taskId)).toEqual({ type: 'multi_episode', total: 2 })
    const snapshot = JSON.parse((database.prepare('SELECT config_snapshot AS snapshot FROM production_tasks WHERE id = ?').get(result.taskId) as { snapshot: string }).snapshot) as { outputRunAt?: string }
    expect(snapshot.outputRunAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('reduces a timed-out window from the tail but never below two episodes', async () => {
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database); const now = new Date().toISOString(); database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '测试剧目', now, now)
    for (const episodeNo of [1, 2, 3]) database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`e${episodeNo}`, 'drama', episodeNo, episodeNo - 1, `${episodeNo}.mp4`, 120, 25, 'ready', now, now)
    const service = new MultiEpisodeService(database, new TaskQueue(database)); const preflight = await service.preflight('drama', { startEpisode: 1, endEpisode: 3, groupSize: 3, tailStrategy: 'reduce', maxMinutes: 5, outputDirectory: '.', qualityMode: 'original', fps: 'source', packagingEnabled: false })
    const result = await service.createTask('drama', { startEpisode: 1, endEpisode: 3, groupSize: 3, tailStrategy: 'reduce', maxMinutes: 5, outputDirectory: '.', qualityMode: 'original', fps: 'source', packagingEnabled: false, preflightConfirmed: true, preflightId: preflight.preflightId })
    expect(result.windows[0]?.status).toBe('reduced'); expect(result.windows[0]?.endEpisode).toBe(2)
  })

  it('rejects a confirmation when the server-side preflight snapshot changed', async () => {
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database); const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '测试剧目', now, now)
    for (const episodeNo of [1, 2, 3]) database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(`e${episodeNo}`, 'drama', episodeNo, episodeNo - 1, `${episodeNo}.mp4`, 60, 25, 'ready', now, now)
    const service = new MultiEpisodeService(database, new TaskQueue(database)); const preflight = await service.preflight('drama', { startEpisode: 1, endEpisode: 3, groupSize: 3, tailStrategy: 'reduce', maxMinutes: 10, outputDirectory: '.', qualityMode: 'original', fps: 'source', packagingEnabled: false })
    database.prepare('UPDATE episodes SET duration_seconds = 120 WHERE drama_id = ? AND episode_no = 3').run('drama')
    await expect(service.createTask('drama', { startEpisode: 1, endEpisode: 3, groupSize: 3, tailStrategy: 'reduce', maxMinutes: 10, outputDirectory: '.', qualityMode: 'original', fps: 'source', packagingEnabled: false, preflightConfirmed: true, preflightId: preflight.preflightId })).rejects.toThrow('资产或输出环境已变化')
    expect(database.prepare('SELECT COUNT(*) AS count FROM production_tasks').get()).toEqual({ count: 0 })
  })
})
