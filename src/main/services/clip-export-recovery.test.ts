import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { persistClipExportConfig } from './clip-export-task-config.js'
import { OriginalClipService } from './original-clip-service.js'

describe('original clip export recovery', () => {
  it.each(['paused', 'pending', 'running'] as const)('atomically resumes a published %s export item from its frozen config', async (recoverableStatus) => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database); const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 30, 'ready', now, now)
    const service = new OriginalClipService(database); const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 }); service.confirmCandidate(candidate.id)
    const task = database.prepare('SELECT task_id AS taskId FROM task_items WHERE id = ?').get(candidate.id) as { taskId: string }
    persistClipExportConfig(database, { candidateIds: [candidate.id], outputDirectory: 'D:\\old', namingPattern: 'recover_{candidate}', encoding: 'h264-balanced', outputSize: 'source', subtitleStrategy: 'none', conflictStrategy: 'append' })
    database.prepare('UPDATE task_items SET status = ? WHERE id = ?').run(recoverableStatus, candidate.id)
    vi.spyOn(service as unknown as { runCandidateItem: (id: string, output: string, batch: string) => Promise<{ status: 'succeeded' }> }, 'runCandidateItem').mockImplementation(async (id, output, batch) => {
      database.prepare("UPDATE task_items SET status = 'exported', export_batch_id = NULL WHERE id = ? AND export_batch_id = ?").run(id, batch)
      database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`material-${recoverableStatus}`, 'd', task.taskId, id, `${output}\\result.mp4`, now, now)
      return { status: 'succeeded' }
    })

    await expect(service.retryFailedCandidate(candidate.id, 'D:\\new')).resolves.toMatchObject({ outputPath: 'D:\\new\\result.mp4' })
    expect(database.prepare('SELECT status, export_batch_id AS exportBatchId FROM task_items WHERE id = ?').get(candidate.id)).toEqual({ status: 'exported', exportBatchId: null })
    database.close()
  })
})
