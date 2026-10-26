import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { TaskQueue } from '../tasks/task-queue.js'
import { OriginalClipService } from './original-clip-service.js'

const databases: Database.Database[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

describe('Phase 28 original-clip reliability baseline', () => {
  it('reads an 85-episode, 5,000-candidate fixture without changing source media facts', () => {
    const database = new Database(':memory:')
    databases.push(database)
    database.pragma('foreign_keys = ON')
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('pressure-drama', '压力隔离剧目', now, now)
    const insertEpisode = database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    for (let episodeNo = 1; episodeNo <= 85; episodeNo += 1) {
      insertEpisode.run(`episode-${episodeNo}`, 'pressure-drama', episodeNo, episodeNo - 1, `fixture-${episodeNo}.mp4`, 120, 'ready', now, now)
    }
    const taskId = 'pressure-task'
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(taskId, 'pressure-drama', 'original_clip', '{}', 'reviewing', 5_000, 5_000, now, now)
    const insertItem = database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    database.transaction(() => {
      for (let index = 0; index < 5_000; index += 1) {
        const episodeNo = Math.floor(index / 59) + 1
        const startSeconds = (index % 59) * 2
        insertItem.run(`candidate-${index}`, taskId, JSON.stringify({ episodeId: `episode-${episodeNo}`, startSeconds, endSeconds: startSeconds + 1.5 }), 'confirmed', now, now)
      }
    })()

    const startedAt = Date.now()
    const candidates = new OriginalClipService(database).listCandidates('pressure-drama')
    const elapsedMs = Date.now() - startedAt

    expect(candidates).toHaveLength(5_000)
    expect([...new Set(candidates.map(({ episodeId }) => episodeId))]).toHaveLength(85)
    expect(candidates[0]).toMatchObject({ episodeId: 'episode-1', startSeconds: 0, endSeconds: 1.5, status: 'confirmed' })
    expect(candidates.find(({ id }) => id === 'candidate-4999')).toMatchObject({ episodeId: 'episode-85', startSeconds: 86, endSeconds: 87.5, status: 'confirmed' })
    expect(database.prepare('SELECT COUNT(*) AS count FROM episodes WHERE source_path LIKE ?').get('fixture-%') as { count: number }).toEqual({ count: 85 })
    expect(elapsedMs).toBeLessThan(5_000)
  })

  it('keeps a 500-item export queue within its configured concurrency budget', async () => {
    const database = new Database(':memory:')
    databases.push(database)
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('export-pressure-drama', '导出压力隔离剧目', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('export-pressure-task', 'export-pressure-drama', 'original_clip', '{}', 'pending', 500, now, now)
    const insert = database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
    database.transaction(() => {
      for (let index = 0; index < 500; index += 1) insert.run(`export-item-${index}`, 'export-pressure-task', JSON.stringify({ episodeId: `episode-${(index % 85) + 1}`, startSeconds: 1, endSeconds: 2 }), 'pending', now, now)
    })()
    let inFlight = 0
    let peak = 0
    const result = await new TaskQueue(database, 2).run('export-pressure-task', async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight -= 1
    }, { mode: 'speed' })
    expect(result.status).toBe('completed')
    expect(peak).toBeLessThanOrEqual(2)
    expect(database.prepare("SELECT COUNT(*) AS count FROM task_items WHERE status = 'succeeded'").get()).toEqual({ count: 500 })
  })
})
