import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { NotificationService } from '../services/notification-service.js'
import { TaskQueue } from '../tasks/task-queue.js'
import { AiAnalysisService } from './ai-analysis-service.js'
import { AiTaskLifecycleService } from './ai-task-lifecycle-service.js'

const databases: Database.Database[] = []

const setup = (): { database: Database.Database; service: AiTaskLifecycleService; setNow: (value: Date) => void; taskId: string } => {
  const database = new Database(':memory:'); databases.push(database); migrateDatabase(database)
  const createdAt = new Date('2026-07-21T00:00:00.000Z'); let now = createdAt
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '测试剧', createdAt.toISOString(), createdAt.toISOString())
  for (const episodeNo of [1, 2]) database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)').run(`episode-${episodeNo}`, 'drama', episodeNo, episodeNo, `episode-${episodeNo}.mp4`, 'ready', createdAt.toISOString(), createdAt.toISOString())
  database.prepare('INSERT INTO ai_evidence VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('evidence', 'drama', 'episode-1', 'subtitle', 12, 24, 0.9, '关键冲突', '{}', createdAt.toISOString(), createdAt.toISOString())
  const taskId = new AiAnalysisService(database).create({ dramaId: 'drama', maxDrafts: 2, episodeStart: 1, episodeEnd: 2, durationMinSeconds: 30, durationMaxSeconds: 60 }).taskId
  database.prepare('UPDATE production_tasks SET checkpoint = ? WHERE id = ?').run(JSON.stringify({ version: 1, stage: 'evidence', startedAt: createdAt.toISOString(), drafts: [] }), taskId)
  const service = new AiTaskLifecycleService(database, new TaskQueue(database), new NotificationService(database), () => now)
  return { database, service, setNow: (value) => { now = value }, taskId }
}

afterEach(() => { for (const database of databases.splice(0)) database.close() })

describe('AiTaskLifecycleService', () => {
  it('runs controlled evidence into an explainable draft checkpoint', async () => {
    const { service, taskId } = setup()
    const result = await service.run(taskId)
    expect(result.status).toBe('completed')
    expect(result.checkpoint.drafts).toHaveLength(1)
    expect(result.checkpoint.drafts[0]?.evidenceId).toBe('evidence')
    expect(result.checkpoint.drafts[0]).toMatchObject({ editingAngle: '爆点前置', hookReason: expect.any(String), coreStoryRange: '第 1–2 集核心剧情', episodeStart: 1, episodeEnd: 2, expectedDurationSeconds: 30 })
    expect(service.listEvidence(taskId)).toMatchObject([{ id: 'evidence', episodeId: 'episode-1' }])
  })

  it('pauses at 40 minutes, permits one extension, then force-stops at 50 minutes', async () => {
    const { service, setNow, taskId } = setup()
    setNow(new Date('2026-07-21T00:40:00.000Z'))
    expect(service.applyDuration(taskId).checkpoint.stage).toBe('awaiting-decision')
    expect((await service.decide(taskId, 'continue')).status).toBe('completed')
    const forcedSetup = setup()
    forcedSetup.setNow(new Date('2026-07-21T00:50:00.000Z'))
    const stopped = forcedSetup.service.applyDuration(forcedSetup.taskId)
    expect(stopped.checkpoint.stage).toBe('force-stopped')
    expect(stopped.status).toBe('paused')
  })

  it('automatically monitors an active task and creates the 40-minute decision state', () => {
    vi.useFakeTimers()
    const { service, setNow, taskId } = setup()
    ;(service as unknown as { startMonitoring: (id: string) => void }).startMonitoring(taskId)
    setNow(new Date('2026-07-21T00:40:00.000Z'))
    vi.advanceTimersByTime(1_000)
    expect(service.get(taskId).checkpoint.stage).toBe('awaiting-decision')
    vi.useRealTimers()
  })

  it('allows only one new execution after a force-stop checkpoint', async () => {
    const { database, service, taskId } = setup()
    database.prepare('UPDATE production_tasks SET status = ?, checkpoint = ? WHERE id = ?').run('paused', JSON.stringify({ version: 1, stage: 'force-stopped', startedAt: '2026-07-21T00:50:00.000Z', recoveryCount: 1, drafts: [] }), taskId)
    database.prepare('UPDATE task_items SET status = ? WHERE task_id = ?').run('paused', taskId)
    await expect(service.recover(taskId)).rejects.toThrow('恢复上限')
  })
})
