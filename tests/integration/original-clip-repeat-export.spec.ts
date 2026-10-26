import { existsSync } from 'node:fs'
import { readdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChildProcess } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { createRepeatFixture, fileHash, killExportProcess, launchExportProcess, waitForOutput } from './original-clip-repeat-export-fixture.js'

type Fixture = Awaited<ReturnType<typeof createRepeatFixture>>
const batches = (fixture: Fixture) => fixture.database.prepare('SELECT * FROM clip_export_batches ORDER BY created_at, id').all()
const materials = (fixture: Fixture) => fixture.database.prepare('SELECT * FROM generated_materials ORDER BY created_at, id').all()
const batchById = (fixture: Fixture, id: string) => fixture.database.prepare('SELECT * FROM clip_export_batches WHERE id = ?').get(id)
async function firstExport(fixture: Fixture) {
  const results = await fixture.service.exportCandidates('drama', fixture.config)
  expect(results).toEqual([expect.objectContaining({ candidateId: fixture.candidateId, status: 'exported' })])
  const path = results[0]!.outputPath!
  const batch = fixture.service.getLatestExportBatch('drama')!
  return { path, hash: await fileHash(path), batch, row: batchById(fixture, batch.id), materials: materials(fixture) }
}
async function assertProtected(fixture: Fixture, previous: Awaited<ReturnType<typeof firstExport>>) {
  expect(await fileHash(previous.path)).toBe(previous.hash)
  expect(batchById(fixture, previous.batch.id)).toEqual(previous.row)
  expect(materials(fixture)).toEqual(previous.materials)
  expect(fixture.service.getCandidate(fixture.candidateId).status).toBe('exported')
  expect(fixture.database.prepare('SELECT export_batch_id FROM task_items WHERE id = ?').get(fixture.candidateId)).toEqual({ export_batch_id: null })
}

describe('real repeated original clip exports', () => {
  it('retains only this batch completed items when interrupted after one successful re-export', async () => {
    const fixture = await createRepeatFixture()
    let child: ChildProcess | undefined
    try {
      const old = await firstExport(fixture)
      const next = fixture.service.createCandidate('drama', 'episode', { startSeconds: 0, endSeconds: 20 })
      fixture.service.confirmCandidate(next.id)
      child = await launchExportProcess(fixture.folder, fixture.databasePath, `${fixture.candidateId},${next.id}`, fixture.config.outputDirectory)
      await waitForOutput(join(fixture.config.outputDirectory, 'same-name_03.mp4'), () => child!.exitCode === null && child!.signalCode === null)
      expect(fixture.service.getCandidate(fixture.candidateId).status).toBe('exported')
      expect(fixture.service.getCandidate(next.id).status).toBe('exporting')
      const completedPath = join(fixture.config.outputDirectory, 'same-name_02.mp4')
      const completedHash = await fileHash(completedPath)
      await killExportProcess(child)
      child = undefined
      fixture.reopen()
      const recovered = fixture.service.getLatestExportBatch('drama')!
      expect(recovered.status).toBe('cancelled')
      expect(recovered.items).toEqual([
        expect.objectContaining({ candidateId: fixture.candidateId, status: 'exported', materialId: expect.any(String) }),
        expect.objectContaining({ candidateId: next.id, status: 'cancelled', materialId: null })
      ])
      expect(recovered.items[0]!.materialId).not.toBe(old.batch.items[0]!.materialId)
      expect(fixture.database.prepare('SELECT path FROM generated_materials WHERE id = ?').get(recovered.items[0]!.materialId)).toEqual({ path: completedPath })
      expect(await fileHash(completedPath)).toBe(completedHash)
      expect(await fileHash(old.path)).toBe(old.hash)
      expect(batchById(fixture, old.batch.id)).toEqual(old.row)
      expect(materials(fixture)).toHaveLength(2)
      expect(fixture.service.getCandidate(next.id).status).toBe('confirmed')
    } finally {
      if (child) await killExportProcess(child)
      await fixture.close()
    }
  }, 90_000)

  it('appends a second FFmpeg output with a different quality config and preserves both immutable batch snapshots', async () => {
    const fixture = await createRepeatFixture()
    try {
      const old = await firstExport(fixture)
      const nextConfig = { ...fixture.config, encoding: 'h264-quality', qualityMode: 'bitrate', bitrateKbps: 1200 }
      const results = await fixture.service.exportCandidates('drama', nextConfig)
      expect(results).toEqual([expect.objectContaining({ status: 'exported' })])
      const nextPath = results[0]!.outputPath!
      expect(old.path).toBe(join(fixture.config.outputDirectory, 'same-name.mp4'))
      expect(nextPath).toBe(join(fixture.config.outputDirectory, 'same-name_02.mp4'))
      expect(await fileHash(old.path)).toBe(old.hash)
      expect(await fileHash(nextPath)).not.toBe(old.hash)
      for (const path of [old.path, nextPath]) {
        const probe = await fixture.probe(path)
        expect(probe.streams[0]).toMatchObject({ codec_name: 'h264', width: 320, height: 180, r_frame_rate: '25/1' })
        expect(Number(probe.streams[0]!.nb_frames)).toBe(500)
        // Match the production one-frame + 50 ms duration contract (H.264 timestamp offset).
        expect(Math.abs(Number(probe.format.duration) - 20)).toBeLessThanOrEqual(1 / 25 + 0.05)
      }
      expect(batchById(fixture, old.batch.id)).toEqual(old.row)
      const nextBatch = fixture.service.getLatestExportBatch('drama')!
      expect(nextBatch.id).not.toBe(old.batch.id)
      expect(nextBatch.config).toMatchObject({ encoding: 'h264-quality', qualityMode: 'bitrate', bitrateKbps: 1200 })
      expect(old.batch.config).toMatchObject({ encoding: 'h264-balanced', qualityMode: 'original' })
      expect(nextBatch.items[0]!.materialId).not.toBe(old.batch.items[0]!.materialId)
      expect(materials(fixture)).toHaveLength(2)
      expect(materials(fixture)).toEqual(expect.arrayContaining(old.materials))
      expect(batches(fixture)).toHaveLength(2)
      fixture.reopen()
      expect(fixture.service.getCandidate(fixture.candidateId).status).toBe('exported')
      expect(batchById(fixture, old.batch.id)).toEqual(old.row)
      expect(materials(fixture)).toHaveLength(2)
    } finally { await fixture.close() }
  }, 90_000)

  it('protects the old file after a real missing-source failure and cancellation after FFmpeg begins writing', async () => {
    const fixture = await createRepeatFixture()
    let exportId: string | undefined
    try {
      const old = await firstExport(fixture)
      const moved = join(fixture.folder, 'source-unavailable.mp4')
      await rename(fixture.sourcePath, moved)
      try {
        expect(await fixture.service.exportCandidates('drama', fixture.config)).toEqual([expect.objectContaining({ status: 'failed', outputPath: null })])
      } finally { await rename(moved, fixture.sourcePath) }
      expect(fixture.service.getLatestExportBatch('drama')).toMatchObject({ status: 'failed', items: [expect.objectContaining({ status: 'failed', materialId: null })] })
      await assertProtected(fixture, old)
      const job = fixture.service.startExportCandidates('drama', { ...fixture.config, outputSize: '1920x1080', encoding: 'h264-quality' })
      exportId = job.exportId
      expect(fixture.service.getCandidate(fixture.candidateId).status).toBe('exporting')
      const count = batches(fixture).length
      expect(() => fixture.service.startExportCandidates('drama', fixture.config)).toThrow()
      expect(batches(fixture)).toHaveLength(count)
      const unconfirmed = fixture.service.createCandidate('drama', 'episode', { startSeconds: 0, endSeconds: 1 })
      await expect(fixture.service.exportCandidates('drama', { ...fixture.config, candidateIds: [unconfirmed.id] })).rejects.toThrow()
      expect(batches(fixture)).toHaveLength(count)
      const partial = join(fixture.config.outputDirectory, 'same-name_02.mp4')
      await waitForOutput(partial, () => fixture.service.getExportProgress(job.exportId).status === 'running')
      expect((await fixture.service.cancelExport(job.exportId)).status).toBe('cancelled')
      exportId = undefined
      expect(existsSync(partial)).toBe(false)
      expect(await readdir(fixture.config.outputDirectory)).toEqual(['same-name.mp4'])
      expect(fixture.service.getLatestExportBatch('drama')).toMatchObject({ status: 'cancelled', items: [expect.objectContaining({ status: 'cancelled', materialId: null })] })
      await assertProtected(fixture, old)
      expect(batches(fixture)).toHaveLength(3)
    } finally {
      if (exportId) await fixture.service.cancelExport(exportId)
      await fixture.close()
    }
  }, 90_000)

  it('recovers a genuinely interrupted process using the persisted database without revoking the successful export', async () => {
    const fixture = await createRepeatFixture()
    let child: ChildProcess | undefined
    try {
      const old = await firstExport(fixture)
      child = await launchExportProcess(fixture.folder, fixture.databasePath, fixture.candidateId, fixture.config.outputDirectory)
      let diagnostics = ''
      child.stderr?.on('data', (chunk: Buffer) => { diagnostics += chunk.toString() })
      const partial = join(fixture.config.outputDirectory, 'same-name_02.mp4')
      await waitForOutput(partial, () => {
        if (child!.exitCode !== null || child!.signalCode !== null) throw new Error(`Child export exited: ${diagnostics}`)
        return true
      })
      expect(fixture.service.getCandidate(fixture.candidateId).status).toBe('exporting')
      const interrupted = fixture.database.prepare("SELECT id FROM clip_export_batches WHERE status = 'running'").get() as { id: string }
      expect(interrupted.id).not.toBe(old.batch.id)
      await killExportProcess(child)
      expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
      child = undefined
      // Before opening a fresh service, the actual interrupted transaction remains persisted.
      expect(fixture.service.getCandidate(fixture.candidateId).status).toBe('exporting')
      fixture.reopen()
      await assertProtected(fixture, old)
      expect(batchById(fixture, interrupted.id)).toMatchObject({ status: 'cancelled', reason: expect.stringContaining('重启') })
      expect(fixture.service.getLatestExportBatch('drama')).toMatchObject({ id: interrupted.id, items: [expect.objectContaining({ status: 'cancelled', materialId: null })] })
      expect(batches(fixture)).toHaveLength(2)
      expect(fixture.service.preflightExport('drama', fixture.config).blocked).toEqual([])
      expect(Number((await fixture.probe(old.path)).streams[0]!.nb_frames)).toBe(500)
    } finally {
      if (child) await killExportProcess(child)
      await fixture.close()
    }
  }, 90_000)
})
