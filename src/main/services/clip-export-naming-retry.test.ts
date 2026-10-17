import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import type { ClipExportConfig } from '../../shared/contracts.js'
import { migrateDatabase } from '../db/migrate.js'
import { OriginalClipService } from './original-clip-service.js'
import { persistClipExportConfig, readClipExportConfig } from './clip-export-task-config.js'
import { recordMockedClipExport } from '../../../tests/helpers/record-mocked-clip-export.js'

const fixture = () => {
  const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString()
  db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Naming retry', now, now)
  db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 10, 'ready', now, now)
  const service = new OriginalClipService(db)
  const [a, b] = service.createCandidates('d', [{ episodeId: 'e', startSeconds: 1, endSeconds: 3 }, { episodeId: 'e', startSeconds: 4, endSeconds: 6 }])
  service.confirmCandidate(a!.id); service.confirmCandidate(b!.id)
  const task = db.prepare('SELECT task_id AS taskId FROM task_items WHERE id = ?').get(a!.id) as { taskId: string }
  const config = (id: string, namingPattern: string): ClipExportConfig => ({ candidateIds: [id], outputDirectory: 'output', namingPattern, encoding: 'h264-balanced', outputSize: 'source', subtitleStrategy: 'none', conflictStrategy: 'append' })
  const observed: Array<{ id: string; naming: string }> = []
  const runner = vi.spyOn(service as unknown as { runCandidateItem: (id: string, output: string, batch: string, signal?: AbortSignal, config?: ClipExportConfig) => Promise<{ status: 'succeeded' }> }, 'runCandidateItem')
  runner.mockImplementation(async (id, output, batch, _signal, value) => {
    observed.push({ id, naming: value!.namingPattern })
    const materialId = `material-${observed.length}`
    db.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(materialId, 'd', task.taskId, id, `${output}/result-${observed.length}.mp4`, now, now)
    db.prepare("UPDATE task_items SET status = 'exported', export_batch_id = NULL WHERE id = ? AND export_batch_id = ?").run(id, batch)
    recordMockedClipExport(db, batch, id, materialId)
    return { status: 'succeeded' }
  })
  return { db, service, a: a!, b: b!, taskId: task.taskId, config, runner, observed }
}

describe('per-candidate frozen naming recovery', () => {
  it('does not use another candidate naming when retrying an earlier failed export', async () => {
    const f = fixture()
    try {
      f.runner.mockRejectedValueOnce(new Error('fixture export failure'))
      expect((await f.service.exportCandidates('d', f.config(f.a.id, 'first_{candidate}')))[0]?.status).toBe('failed')
      await f.service.exportCandidates('d', f.config(f.b.id, 'second_{candidate}'))
      await f.service.retryFailedCandidate(f.a.id, 'retry-output')
      expect(f.observed).toEqual([{ id: f.b.id, naming: 'second_{candidate}' }, { id: f.a.id, naming: 'first_{candidate}' }])
      expect(readClipExportConfig(f.db, f.taskId, f.b.id).namingPattern).toBe('second_{candidate}')
    } finally { f.db.close() }
  })
  it.each([{ sameName: false, batches: 2 }, { sameName: true, batches: 1 }])('groups task retries by their frozen naming; sameName=$sameName', async ({ sameName, batches }) => {
    const f = fixture()
    try {
      persistClipExportConfig(f.db, f.config(f.a.id, 'first_{candidate}'))
      const second = sameName ? 'first_{candidate}' : 'second_{candidate}'
      persistClipExportConfig(f.db, f.config(f.b.id, second))
      f.db.prepare("UPDATE task_items SET status = 'failed' WHERE task_id = ?").run(f.taskId)
      await expect(f.service.retryFailedTask(f.taskId)).resolves.toEqual({ status: 'completed' })
      expect(f.observed).toEqual(expect.arrayContaining([{ id: f.a.id, naming: 'first_{candidate}' }, { id: f.b.id, naming: second }]))
      expect(f.db.prepare('SELECT COUNT(*) AS count FROM clip_export_batches').get()).toEqual({ count: batches })
    } finally { f.db.close() }
  })
  it('does not change frozen configuration when a competing export cannot claim the item', async () => {
    const f = fixture()
    try {
      persistClipExportConfig(f.db, f.config(f.a.id, 'frozen_{candidate}'))
      f.db.prepare("UPDATE task_items SET status = 'exporting' WHERE id = ?").run(f.a.id)
      await expect(f.service.exportCandidate(f.a.id, 'other')).rejects.toThrow()
      expect(readClipExportConfig(f.db, f.taskId, f.a.id).namingPattern).toBe('frozen_{candidate}')
    } finally { f.db.close() }
  })
  it('keeps group failures separate while retrying the remaining frozen group', async () => {
    const f = fixture()
    try {
      persistClipExportConfig(f.db, f.config(f.a.id, 'first_{candidate}'))
      persistClipExportConfig(f.db, f.config(f.b.id, 'second_{candidate}'))
      f.db.prepare("UPDATE task_items SET status = 'failed' WHERE task_id = ?").run(f.taskId)
      f.runner.mockRejectedValueOnce(new Error('fixture group failure'))
      await expect(f.service.retryFailedTask(f.taskId)).resolves.toEqual({ status: 'failed' })
      expect(f.observed).toHaveLength(1)
      expect(f.db.prepare('SELECT status FROM clip_export_batches ORDER BY created_at, id').all()).toEqual(expect.arrayContaining([{ status: 'failed' }, { status: 'completed' }]))
      expect(readClipExportConfig(f.db, f.taskId, f.a.id).namingPattern).toBe('first_{candidate}')
    } finally { f.db.close() }
  })
  it('reads legacy snapshots but never substitutes another candidate for a missing mapped item', () => {
    const f = fixture()
    try {
      persistClipExportConfig(f.db, f.config(f.a.id, 'legacy_{candidate}'))
      const row = f.db.prepare('SELECT config_snapshot AS snapshot FROM production_tasks WHERE id = ?').get(f.taskId) as { snapshot: string }
      const snapshot = JSON.parse(row.snapshot) as Record<string, unknown>
      delete snapshot.exportConfigsByCandidate
      f.db.prepare('UPDATE production_tasks SET config_snapshot = ? WHERE id = ?').run(JSON.stringify(snapshot), f.taskId)
      expect(readClipExportConfig(f.db, f.taskId, f.a.id).namingPattern).toBe('legacy_{candidate}')
      snapshot.exportConfigsByCandidate = { [f.b.id]: f.config(f.b.id, 'other_{candidate}') }
      f.db.prepare('UPDATE production_tasks SET config_snapshot = ? WHERE id = ?').run(JSON.stringify(snapshot), f.taskId)
      expect(() => readClipExportConfig(f.db, f.taskId, f.a.id)).toThrow('没有可恢复')
    } finally { f.db.close() }
  })
})
