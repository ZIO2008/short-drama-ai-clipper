import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { OriginalClipService } from './original-clip-service.js'
import { recordMockedClipExport } from '../../../tests/helpers/record-mocked-clip-export.js'

const setup = () => {
  const database = new Database(':memory:')
  database.pragma('foreign_keys = ON')
  migrateDatabase(database)
  const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
  database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 30, 'ready', now, now)
  const service = new OriginalClipService(database)
  const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 })
  service.confirmCandidate(candidate.id)
  const task = database.prepare('SELECT task_id AS taskId FROM task_items WHERE id = ?').get(candidate.id) as { taskId: string }
  const config = (outputDirectory: string) => ({ candidateIds: [candidate.id], outputDirectory, namingPattern: 'clip_{candidate}', encoding: 'h264-balanced' as const, outputSize: 'source' as const, subtitleStrategy: 'none' as const, conflictStrategy: 'append' as const })
  return { database, service, candidate, taskId: task.taskId, config, now }
}

describe('repeat original-clip export', () => {
  it('creates a second batch and material without replacing the first result', async () => {
    const { database, service, candidate, taskId, config, now } = setup()
    let number = 0
    vi.spyOn(service as unknown as { runCandidateItem: (id: string, output: string, batch: string) => Promise<{ status: 'succeeded' }> }, 'runCandidateItem').mockImplementation(async (id, output, batch) => {
      number += 1
      database.prepare("UPDATE task_items SET status = 'exported', export_batch_id = NULL WHERE id = ? AND export_batch_id = ?").run(id, batch)
      database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`material-${number}`, 'd', taskId, id, `${output}\\clip-${number}.mp4`, now, now)
      recordMockedClipExport(database, batch, id, `material-${number}`)
      return { status: 'succeeded' }
    })
    expect(await service.exportCandidates('d', config('D:\\first'))).toEqual([expect.objectContaining({ status: 'exported' })])
    expect(service.preflightExport('d', config('D:\\second')).blocked).toEqual([])
    expect(await service.exportCandidates('d', config('D:\\second'))).toEqual([expect.objectContaining({ status: 'exported' })])
    expect(database.prepare('SELECT path FROM generated_materials ORDER BY id').all()).toEqual([{ path: 'D:\\first\\clip-1.mp4' }, { path: 'D:\\second\\clip-2.mp4' }])
    expect(database.prepare('SELECT COUNT(*) AS n FROM clip_export_batches').get()).toEqual({ n: 2 })
    expect(service.getCandidate(candidate.id).status).toBe('exported')
    database.close()
  })

  it('does not offer an exporting candidate for a concurrent repeat', () => {
    const { database, service, candidate, config } = setup()
    database.prepare("UPDATE task_items SET status = 'exporting' WHERE id = ?").run(candidate.id)
    expect(service.preflightExport('d', config('D:\\second')).blocked).toEqual([expect.objectContaining({ candidateId: candidate.id })])
    database.close()
  })

  it('retains the first exported state and material when a repeat export fails', async () => {
    const { database, service, candidate, taskId, config, now } = setup()
    const runner = vi.spyOn(service as unknown as { runCandidateItem: (id: string, output: string, batch: string) => Promise<{ status: 'succeeded' }> }, 'runCandidateItem')
    runner.mockImplementationOnce(async (id, output, batch) => {
      database.prepare("UPDATE task_items SET status = 'exported', export_batch_id = NULL WHERE id = ? AND export_batch_id = ?").run(id, batch)
      database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('first-material', 'd', taskId, id, `${output}\\first.mp4`, now, now)
      recordMockedClipExport(database, batch, id, 'first-material')
      return { status: 'succeeded' }
    }).mockRejectedValueOnce(new Error('repeat render failed'))
    await service.exportCandidates('d', config('D:\\first'))
    expect(await service.exportCandidates('d', config('D:\\second'))).toEqual([expect.objectContaining({ candidateId: candidate.id, status: 'failed' })])
    expect(service.getCandidate(candidate.id).status).toBe('exported')
    expect(database.prepare('SELECT path FROM generated_materials').all()).toEqual([{ path: 'D:\\first\\first.mp4' }])
    expect(database.prepare('SELECT status FROM clip_export_batches ORDER BY created_at, id').all()).toEqual(expect.arrayContaining([{ status: 'completed' }, { status: 'failed' }]))
    database.close()
  })
})
