import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from './db/migrate.js'
import { normalizeP0StartupState } from './p0-startup-recovery.js'
import { ClipGenerationLifecycle } from './services/clip-generation-lifecycle.js'

describe('normalizeP0StartupState', () => {
  it('isolates an in-flight provider round before generic task aggregation can make it replayable', () => {
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString(); const generationTaskId = randomUUID(); const candidateId = randomUUID(); const ordinaryTaskId = randomUUID()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    const insertTask = database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?)')
    insertTask.run(generationTaskId, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e'] }, taskRound: 1 }), 'running', '{}', now, now)
    insertTask.run(ordinaryTaskId, 'd', 'multi_episode', '{}', 'running', '{}', now, now)
    database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(candidateId, generationTaskId, JSON.stringify({ episodeId: 'e', startSeconds: 1, endSeconds: 3 }), 'pending_review', now, now)
    database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), ordinaryTaskId, '{}', 'running', now, now)

    normalizeP0StartupState(database)

    expect(database.prepare('SELECT status, checkpoint FROM production_tasks WHERE id = ?').get(generationTaskId)).toMatchObject({ status: 'interrupted', checkpoint: expect.stringContaining('文本语义候选生成已中断') })
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(ordinaryTaskId)).toEqual({ status: 'paused' })
    const replayed: string[] = []
    new ClipGenerationLifecycle(database, new Map(), new Map(), new Map(), { runGeneration: (taskId) => replayed.push(taskId) }).resumePending()
    expect(replayed).toEqual([])
    database.close()
  })
})
