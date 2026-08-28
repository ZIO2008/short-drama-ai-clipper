import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { ClipGenerationLifecycle } from './clip-generation-lifecycle.js'

const createLifecycle = (database: Database.Database) => new ClipGenerationLifecycle(database, new Map(), new Map(), new Map(), { runGeneration: () => undefined })

describe('ClipGenerationLifecycle', () => {
  afterEach(() => vi.useRealTimers())
  it('preserves zod UUID rejection instead of accepting UUID-shaped invalid versions', () => {
    const database = new Database(':memory:'); migrateDatabase(database)
    expect(() => createLifecycle(database).cancel('12345678-1234-1234-1234-123456789abc')).toThrow()
    database.close()
  })

  it('cancels an expired persisted extension during restart recovery', () => {
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString(); const taskId = randomUUID()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?)').run(taskId, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e'] } }), 'interrupted', JSON.stringify({ stage: 'interrupted', extensionGranted: true, extensionDeadlineAt: '2000-01-01T00:00:00.000Z' }), now, now)
    createLifecycle(database).resumePending()
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(taskId)).toEqual({ status: 'cancelled' })
    database.close()
  })

  it('cancels a queued task and leaves no runnable queue entry', () => {
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString(); const taskId = randomUUID()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)').run(taskId, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e'] }, taskRound: 1 }), 'pending', '{}', now, now)
    const lifecycle = createLifecycle(database); lifecycle.cancel(taskId)
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(taskId)).toEqual({ status: 'cancelled' })
    database.close()
  })

  it('claims the oldest pending task and starts only its frozen generation input', async () => {
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString(); const first = randomUUID(); const second = randomUUID(); const started: string[] = []
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    const insert = database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)')
    insert.run(first, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e1'], candidatesPerEpisode: 1, targetDurationSeconds: 3, maxOverlapRatio: 0.25, allowRepeat: false }, taskRound: 1 }), 'pending', '{}', '2026-01-01T00:00:00.000Z', now)
    insert.run(second, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e2'], candidatesPerEpisode: 1, targetDurationSeconds: 3, maxOverlapRatio: 0.25, allowRepeat: false }, taskRound: 2 }), 'pending', '{}', '2026-01-01T00:01:00.000Z', now)
    const lifecycle = new ClipGenerationLifecycle(database, new Map(), new Map(), new Map(), { runGeneration: (taskId) => started.push(taskId) })
    await lifecycle.drain()
    expect(started).toEqual([first]); expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(first)).toEqual({ status: 'running' }); expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(second)).toEqual({ status: 'pending' })
    database.close()
  })

  it('terminalizes an unrecoverable legacy queue head and continues with the next frozen task', async () => {
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString(); const legacy = randomUUID(); const valid = randomUUID(); const started: string[] = []
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    const insert = database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)')
    insert.run(legacy, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['legacy'] } }), 'pending', '{}', '2026-01-01T00:00:00.000Z', now)
    insert.run(valid, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e'], candidatesPerEpisode: 1, targetDurationSeconds: 3, maxOverlapRatio: 0.25, allowRepeat: false }, taskRound: 2 }), 'pending', '{}', '2026-01-01T00:01:00.000Z', now)
    const lifecycle = new ClipGenerationLifecycle(database, new Map(), new Map(), new Map(), { runGeneration: (taskId) => started.push(taskId) })

    await lifecycle.drain()

    expect(database.prepare('SELECT status, checkpoint FROM production_tasks WHERE id = ?').get(legacy)).toMatchObject({ status: 'failed', checkpoint: expect.stringContaining('缺少可恢复的冻结轮次') })
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(valid)).toEqual({ status: 'running' })
    expect(started).toEqual([valid])
    database.close()
  })

  it('keeps an unclaimed pending task recoverable across shutdown', () => {
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString(); const taskId = randomUUID(); const started: string[] = []
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)').run(taskId, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e'], candidatesPerEpisode: 1, targetDurationSeconds: 3, maxOverlapRatio: 0.25, allowRepeat: false }, taskRound: 1 }), 'pending', '{}', now, now)
    createLifecycle(database).stopForShutdown(taskId)
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(taskId)).toEqual({ status: 'pending' })

    new ClipGenerationLifecycle(database, new Map(), new Map(), new Map(), { runGeneration: (startedTaskId) => started.push(startedTaskId) }).resumePending()
    expect(started).toEqual([taskId])
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(taskId)).toEqual({ status: 'running' })
    database.close()
  })

  it('interrupts but never replays a provider request that was running during shutdown', () => {
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString(); const taskId = randomUUID(); const controllers = new Map<string, AbortController>(); const controller = new AbortController()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)').run(taskId, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e'] }, taskRound: 1 }), 'running', '{}', now, now)
    controllers.set(taskId, controller)
    new ClipGenerationLifecycle(database, controllers, new Map(), new Map(), { runGeneration: () => undefined }).stopForShutdown(taskId)

    expect(controller.signal.aborted).toBe(true)
    expect(database.prepare('SELECT status, checkpoint FROM production_tasks WHERE id = ?').get(taskId)).toMatchObject({ status: 'interrupted', checkpoint: expect.stringContaining('不会自动重放') })
    const replayed: string[] = []
    new ClipGenerationLifecycle(database, new Map(), new Map(), new Map(), { runGeneration: (id) => replayed.push(id) }).resumePending()
    expect(replayed).toEqual([])
    database.close()
  })

  it('does not claim the next pending task after a running request aborts during shutdown', async () => {
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString(); const runningId = randomUUID(); const pendingId = randomUUID(); const controllers = new Map<string, AbortController>(); const started: string[] = []
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    const insert = database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)')
    insert.run(runningId, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e1'] }, taskRound: 1 }), 'running', '{}', now, now)
    insert.run(pendingId, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e2'], candidatesPerEpisode: 1, targetDurationSeconds: 3, maxOverlapRatio: 0.25, allowRepeat: false }, taskRound: 2 }), 'pending', '{}', now, now)
    controllers.set(runningId, new AbortController())
    const lifecycle = new ClipGenerationLifecycle(database, controllers, new Map(), new Map(), { runGeneration: (taskId) => started.push(taskId) })

    lifecycle.stopForShutdown(runningId)
    await lifecycle.drain()

    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(runningId)).toEqual({ status: 'interrupted' })
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(pendingId)).toEqual({ status: 'pending' })
    expect(started).toEqual([])
    database.close()
  })

  it('permits only one continuation and cancels it when the real extension deadline expires', async () => {
    vi.useFakeTimers()
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString(); const taskId = randomUUID()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?)').run(taskId, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e'] }, taskRound: 1 }), 'paused', JSON.stringify({ stage: 'awaiting-decision', extensionMs: 1_000, extensionDeadlineAt: new Date(Date.now() + 60_000).toISOString() }), now, now)
    const lifecycle = createLifecycle(database); lifecycle.decideDeadline(taskId, 'continue')
    expect(database.prepare('SELECT status, checkpoint FROM production_tasks WHERE id = ?').get(taskId)).toMatchObject({ status: 'running', checkpoint: expect.stringContaining('extensionGranted') })
    expect(() => lifecycle.decideDeadline(taskId, 'continue')).toThrow('当前候选生成任务不在耗时决策状态')
    await vi.advanceTimersByTimeAsync(1_001)
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(taskId)).toEqual({ status: 'cancelled' })
    database.close()
  })

  it('clears the extension timer when an operator explicitly stops an awaiting decision', () => {
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString(); const taskId = randomUUID(); const extensionTimers = new Map<string, ReturnType<typeof setTimeout>>()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?)').run(taskId, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e'] }, taskRound: 1 }), 'paused', JSON.stringify({ stage: 'awaiting-decision', extensionDeadlineAt: new Date(Date.now() + 60_000).toISOString() }), now, now)
    extensionTimers.set(taskId, setTimeout(() => undefined, 60_000))
    new ClipGenerationLifecycle(database, new Map(), new Map(), extensionTimers, { runGeneration: () => undefined }).decideDeadline(taskId, 'stop')
    expect(extensionTimers.has(taskId)).toBe(false); expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(taskId)).toEqual({ status: 'cancelled' })
    database.close()
  })

  it('aborts a running request and clears both deadline timer registries on cancellation', () => {
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString(); const taskId = randomUUID(); const controllers = new Map<string, AbortController>(); const stageTimers = new Map<string, ReturnType<typeof setTimeout>>(); const extensionTimers = new Map<string, ReturnType<typeof setTimeout>>()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)').run(taskId, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e'] } }), 'running', '{}', now, now)
    const controller = new AbortController(); controllers.set(taskId, controller); stageTimers.set(taskId, setTimeout(() => undefined, 60_000)); extensionTimers.set(taskId, setTimeout(() => undefined, 60_000))
    new ClipGenerationLifecycle(database, controllers, stageTimers, extensionTimers, { runGeneration: () => undefined }).cancel(taskId)
    expect(controller.signal.aborted).toBe(true); expect(controllers.has(taskId)).toBe(false); expect(stageTimers.has(taskId)).toBe(false); expect(extensionTimers.has(taskId)).toBe(false)
    database.close()
  })
})
