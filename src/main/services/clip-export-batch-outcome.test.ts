import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { OriginalClipService } from './original-clip-service.js'
import { recordMockedClipExport } from '../../../tests/helpers/record-mocked-clip-export.js'

const setup = () => {
  const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database); const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
  database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 30, 'ready', now, now)
  const service = new OriginalClipService(database); const candidates = service.createCandidates('d', [{ episodeId: 'e', startSeconds: 1, endSeconds: 4 }, { episodeId: 'e', startSeconds: 5, endSeconds: 8 }])
  candidates.forEach((candidate) => service.confirmCandidate(candidate.id))
  const task = database.prepare('SELECT task_id AS taskId FROM task_items WHERE id = ?').get(candidates[0]!.id) as { taskId: string }
  const config = { candidateIds: candidates.map(({ id }) => id), outputDirectory: 'D:\\output', namingPattern: 'batch_{candidate}', encoding: 'h264-balanced' as const, outputSize: 'source' as const, subtitleStrategy: 'none' as const, conflictStrategy: 'append' as const }
  return { database, service, candidates, taskId: task.taskId, config, now }
}

describe('original clip multi-candidate export outcomes', () => {
  it('keeps this batch material identity when a later export of its completed candidate exists', async () => {
    const { database, service, candidates, config, taskId, now } = setup()
    const [first, sibling] = candidates as [typeof candidates[number], typeof candidates[number]]
    vi.spyOn(service as unknown as { exportCandidateWithConfig: (id: string, config: unknown, batch: string) => Promise<{ candidate: typeof first; outputPath: string }> }, 'exportCandidateWithConfig').mockImplementation(async (id, _config, batch) => {
      if (id === sibling.id) {
        database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('later-export', 'd', taskId, first.id, 'later.mp4', '2099-01-01', '2099-01-01')
        throw new Error('sibling failed')
      }
      database.prepare("UPDATE task_items SET status = 'exported', export_batch_id = NULL WHERE id = ?").run(id)
      database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('this-batch', 'd', taskId, id, 'first.mp4', now, now)
      recordMockedClipExport(database, batch, id, 'this-batch')
      return { candidate: service.getCandidate(id), outputPath: 'first.mp4' }
    })
    await service.exportCandidates('d', config)
    expect(service.getLatestExportBatch('d')?.items).toEqual([
      expect.objectContaining({ candidateId: first.id, materialId: 'this-batch', status: 'exported' }),
      expect.objectContaining({ candidateId: sibling.id, materialId: null, status: 'failed' })
    ])
    database.close()
  })

  it('preserves one successful material when a sibling export fails', async () => {
    const { database, service, candidates, config, taskId, now } = setup(); const [success, failure] = candidates as [typeof candidates[number], typeof candidates[number]]
    vi.spyOn(service as unknown as { exportCandidateWithConfig: (id: string) => Promise<{ candidate: typeof success; outputPath: string }> }, 'exportCandidateWithConfig').mockImplementation(async (id) => {
      if (id === failure.id) { database.prepare("UPDATE task_items SET status = 'failed', export_batch_id = NULL, reason = '模拟边界验证失败' WHERE id = ?").run(id); throw new Error('模拟边界验证失败') }
      const outputPath = `D:\\output\\${id}.mp4`; database.prepare("UPDATE task_items SET status = 'exported', export_batch_id = NULL WHERE id = ?").run(id); database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('material-success', 'd', taskId, id, outputPath, now, now); return { candidate: service.getCandidate(id), outputPath }
    })
    const started = service.startExportCandidates('d', config)
    await vi.waitFor(() => expect(service.getExportProgress(started.exportId).status).toBe('failed'))
    const progress = service.getExportProgress(started.exportId)
    expect(progress.completed).toBe(2); expect(progress.results).toEqual([expect.objectContaining({ candidateId: success.id, status: 'exported' }), expect.objectContaining({ candidateId: failure.id, status: 'failed', outputPath: null })])
    expect(database.prepare('SELECT id, status FROM task_items WHERE id IN (?, ?) ORDER BY id').all(success.id, failure.id)).toEqual(expect.arrayContaining([{ id: success.id, status: 'exported' }, { id: failure.id, status: 'failed' }]))
    expect(database.prepare('SELECT task_item_id AS taskItemId FROM generated_materials').all()).toEqual([{ taskItemId: success.id }])
    expect(database.prepare('SELECT status, reason FROM clip_export_batches').get()).toMatchObject({ status: 'failed', reason: expect.stringContaining('1 项导出失败') })
    database.close()
  })

  it('keeps the completed result and restores only the active sibling when cancelled', async () => {
    const { database, service, candidates, config, taskId, now } = setup(); const [success, active] = candidates as [typeof candidates[number], typeof candidates[number]]; let activeStarted!: () => void; const activePromise = new Promise<void>((resolve) => { activeStarted = resolve })
    vi.spyOn(service as unknown as { exportCandidateWithConfig: (id: string, config: unknown, batch: string, signal?: AbortSignal) => Promise<{ candidate: typeof success; outputPath: string }> }, 'exportCandidateWithConfig').mockImplementation(async (id, _config, _batch, signal) => {
      if (id === active.id) { activeStarted(); await new Promise<never>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); throw new Error('unreachable') }
      const outputPath = `D:\\output\\${id}.mp4`; database.prepare("UPDATE task_items SET status = 'exported', export_batch_id = NULL WHERE id = ?").run(id); database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('material-before-cancel', 'd', taskId, id, outputPath, now, now); return { candidate: service.getCandidate(id), outputPath }
    })
    const started = service.startExportCandidates('d', config); await activePromise
    const cancelled = await service.cancelExport(started.exportId)
    expect(cancelled.status).toBe('cancelled'); expect(cancelled.completed).toBe(1); expect(cancelled.results).toEqual([expect.objectContaining({ candidateId: success.id, status: 'exported' })])
    expect(database.prepare('SELECT status FROM task_items WHERE id = ?').get(success.id)).toEqual({ status: 'exported' }); expect(database.prepare('SELECT status FROM task_items WHERE id = ?').get(active.id)).toEqual({ status: 'confirmed' })
    expect(database.prepare('SELECT task_item_id AS taskItemId FROM generated_materials').all()).toEqual([{ taskItemId: success.id }]); expect(database.prepare('SELECT status FROM clip_export_batches').get()).toEqual({ status: 'cancelled' })
    database.close()
  })
})
