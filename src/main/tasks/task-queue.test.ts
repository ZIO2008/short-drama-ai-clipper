import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { TaskQueue, type TaskExecutor } from './task-queue.js'

const databases: Database.Database[] = []

afterEach(() => {
  for (const database of databases.splice(0)) database.close()
})

describe('TaskQueue persistence and recovery', () => {
  it('persists two failures, continues later items, and finishes partial', async () => {
    const database = setupTask(['i1', 'i2', 'i3', 'i4'])
    const attempts = new Map<string, number>()
    const executor: TaskExecutor = async (item) => {
      attempts.set(item.id, (attempts.get(item.id) ?? 0) + 1)
      if (item.id === 'i2') throw new Error('编码失败')
    }

    const result = await new TaskQueue(database).run('task', executor)

    expect([...attempts.entries()]).toEqual([['i1', 1], ['i2', 2], ['i3', 1], ['i4', 1]])
    expect(result.status).toBe('partial')
    expect(result.report).toMatchObject({ succeeded: 3, failed: 1, status: 'partial' })
    expect(itemRows(database)).toEqual([
      { id: 'i1', status: 'succeeded', retryCount: 0, reason: null },
      { id: 'i2', status: 'failed', retryCount: 1, reason: '编码失败' },
      { id: 'i3', status: 'succeeded', retryCount: 0, reason: null },
      { id: 'i4', status: 'succeeded', retryCount: 0, reason: null }
    ])
    expect(taskRow(database)).toMatchObject({ status: 'partial', progressCurrent: 4, progressTotal: 4 })
  })

  it('recovers only unfinished items and never repeats successful or exported items', async () => {
    const database = setupTask(['done', 'exported', 'interrupted', 'pending'])
    setItemStatus(database, 'done', 'succeeded')
    setItemStatus(database, 'exported', 'exported')
    setItemStatus(database, 'interrupted', 'running')
    database.prepare("UPDATE production_tasks SET status = 'running', progress_current = 2").run()
    const executed: string[] = []
    const queue = new TaskQueue(database)

    expect(queue.listRecoverableTasks().map(({ id }) => id)).toEqual(['task'])
    const result = await queue.recover('task', async (item) => { executed.push(item.id) })

    expect(executed).toEqual(['interrupted', 'pending'])
    expect(result.status).toBe('completed')
    expect(itemRows(database).map(({ status }) => status)).toEqual([
      'succeeded', 'exported', 'succeeded', 'succeeded'
    ])
    const checkpoint = JSON.parse(taskRow(database).checkpoint ?? '{}') as { completedItemIds?: string[] }
    expect(checkpoint.completedItemIds).toEqual(['done', 'exported', 'interrupted', 'pending'])
  })

  it('retries only failed items and invokes the provided executor', async () => {
    const database = setupTask(['done', 'failed-1', 'failed-2'])
    setItemStatus(database, 'done', 'succeeded')
    setItemStatus(database, 'failed-1', 'failed', 1, '磁盘空间不足')
    setItemStatus(database, 'failed-2', 'failed', 1, '编码失败')
    database.prepare("UPDATE production_tasks SET status = 'partial', progress_current = 3").run()
    const executor = vi.fn<TaskExecutor>(async (item) => item.id === 'failed-2'
      ? { status: 'reduced', reason: '尾部缩减' }
      : undefined)

    const result = await new TaskQueue(database).retryFailed('task', executor)

    expect(executor.mock.calls.map(([item]) => item.id)).toEqual(['failed-1', 'failed-2'])
    expect(result.status).toBe('completed')
    expect(result.report).toMatchObject({ succeeded: 2, reduced: 1, failed: 0 })
    expect(itemRows(database).map(({ status }) => status)).toEqual(['succeeded', 'succeeded', 'reduced'])
  })

  it('limits speed mode to the configured safe concurrency', async () => {
    const database = setupTask(['one', 'two', 'three'])
    const gate = deferred<void>()
    const twoStarted = deferred<void>()
    let inFlight = 0
    let peak = 0
    const running = new TaskQueue(database, 2).run('task', async (_item) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      if (inFlight === 2) twoStarted.resolve()
      await gate.promise
      inFlight -= 1
    }, { mode: 'speed' })
    await twoStarted.promise
    expect(peak).toBe(2)
    gate.resolve()
    await expect(running).resolves.toMatchObject({ status: 'completed' })
  })

  it('persists pause and does not start the next item until resumed', async () => {
    const database = setupTask(['first', 'second'])
    const firstGate = deferred<void>()
    const firstStarted = deferred<void>()
    const executed: string[] = []
    const queue = new TaskQueue(database)
    const running = queue.run('task', async (item) => {
      executed.push(item.id)
      if (item.id === 'first') {
        firstStarted.resolve()
        await firstGate.promise
      }
    })
    await firstStarted.promise

    queue.pause('task')
    expect(taskRow(database).status).toBe('paused')
    firstGate.resolve()
    await waitFor(() => itemRows(database)[0]?.status === 'succeeded')
    expect(executed).toEqual(['first'])
    queue.resume('task')

    await expect(running).resolves.toMatchObject({ status: 'completed' })
    expect(executed).toEqual(['first', 'second'])
  })

  it('passes cancellation to the executor and persists cancelled items', async () => {
    const database = setupTask(['active', 'waiting'])
    const started = deferred<AbortSignal>()
    const queue = new TaskQueue(database)
    const running = queue.run('task', async (_item, { signal }) => {
      started.resolve(signal)
      await rejectWhenAborted(signal)
    })
    const signal = await started.promise

    queue.cancel('task')

    expect(signal.aborted).toBe(true)
    await expect(running).resolves.toMatchObject({ status: 'cancelled' })
    expect(taskRow(database)).toMatchObject({ status: 'cancelled', progressCurrent: 2 })
    expect(itemRows(database).map(({ status }) => status)).toEqual(['cancelled', 'cancelled'])
  })

  it('saves a shutdown checkpoint and resumes without repeating completed output', async () => {
    const database = setupTask(['completed', 'active', 'waiting'])
    const activeStarted = deferred<AbortSignal>()
    const firstQueue = new TaskQueue(database)
    const firstRun = firstQueue.run('task', async (item, { signal }) => {
      if (item.id === 'active') {
        activeStarted.resolve(signal)
        await rejectWhenAborted(signal)
      }
    })
    await activeStarted.promise

    firstQueue.stopForShutdown('task')
    await expect(firstRun).resolves.toMatchObject({ status: 'paused' })
    expect(itemRows(database).map(({ status }) => status)).toEqual(['succeeded', 'paused', 'pending'])

    const recovered: string[] = []
    const secondQueue = new TaskQueue(database)
    await secondQueue.recover('task', async (item) => { recovered.push(item.id) })
    expect(recovered).toEqual(['active', 'waiting'])
    expect(taskRow(database)).toMatchObject({ status: 'completed', progressCurrent: 3 })
  })
})

const setupTask = (itemIds: readonly string[]): Database.Database => {
  const database = new Database(':memory:')
  databases.push(database)
  database.pragma('foreign_keys = ON')
  migrateDatabase(database)
  const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('drama', '测试剧目', now, now)
  database.prepare(`
    INSERT INTO production_tasks
      (id, drama_id, type, config_snapshot, status, progress_total, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('task', 'drama', 'multi_episode', '{}', 'pending', itemIds.length, now, now)
  const insert = database.prepare(`
    INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  itemIds.forEach((id, index) => {
    const itemTime = new Date(Date.parse(now) + index).toISOString()
    insert.run(id, 'task', JSON.stringify({ index }), 'pending', itemTime, itemTime)
  })
  return database
}

const setItemStatus = (
  database: Database.Database,
  id: string,
  status: string,
  retryCount = 0,
  reason: string | null = null
): void => {
  database.prepare('UPDATE task_items SET status = ?, retry_count = ?, reason = ? WHERE id = ?')
    .run(status, retryCount, reason, id)
}

const itemRows = (database: Database.Database): Array<{
  id: string; status: string; retryCount: number; reason: string | null
}> => database.prepare(`
  SELECT id, status, retry_count AS retryCount, reason FROM task_items ORDER BY created_at, id
`).all() as Array<{ id: string; status: string; retryCount: number; reason: string | null }>

const taskRow = (database: Database.Database): {
  status: string; progressCurrent: number; progressTotal: number; checkpoint: string | null
} => database.prepare(`
  SELECT status, progress_current AS progressCurrent, progress_total AS progressTotal, checkpoint
  FROM production_tasks WHERE id = 'task'
`).get() as { status: string; progressCurrent: number; progressTotal: number; checkpoint: string | null }

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const rejectWhenAborted = (signal: AbortSignal): Promise<never> => new Promise((_resolve, reject) => {
  if (signal.aborted) reject(new Error('aborted'))
  else signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
})

const waitFor = async (predicate: () => boolean): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  throw new Error('Timed out waiting for condition')
}
