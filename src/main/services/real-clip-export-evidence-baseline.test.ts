import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, expect, test } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { fingerprintMediaSource } from '../media/media-source-fingerprint.js'
import { probeMedia } from '../media/media-probe.js'
import { OriginalClipService } from './original-clip-service.js'

type BaselineManifest = { mediaRoot: string; publicDevelopmentSet: Array<{ id: string; relativePath: string; sha256: string }> }
const projectRoot = resolve(import.meta.dirname, '../../..')
const manifestPath = join(projectRoot, 'docs', 'clip-evidence-baseline', 'manifest.v1.json')
const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

test.runIf(process.env.SHORTDRAMA_REAL_EXPORT_EVIDENCE === '1')('real dev-06 media export verifies final FFmpeg boundaries in isolated storage', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as BaselineManifest
  const sample = manifest.publicDevelopmentSet.find((item) => item.id === 'dev-06')
  if (!sample) throw new Error('dev-06 baseline entry is missing')
  const sourcePath = join(manifest.mediaRoot, sample.relativePath)
  const sourceSha = createHash('sha256').update(await readFile(sourcePath)).digest('hex').toUpperCase()
  expect(sourceSha).toBe(sample.sha256)
  const media = await probeMedia(sourcePath)
  const startSeconds = 0.5
  const endSeconds = Math.min(media.durationSeconds - 0.25, startSeconds + 3)
  expect(endSeconds - startSeconds).toBeGreaterThanOrEqual(2.75)

  const root = await mkdtemp(join(tmpdir(), 'shortdrama-real-export-evidence-'))
  temporaryFolders.push(root)
  const outputDirectory = join(root, 'exports')
  const database = new Database(join(root, 'export.sqlite'))
  const now = new Date().toISOString()
  try {
    database.pragma('foreign_keys = ON')
    migrateDatabase(database)
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('real-export-drama', '内部真实导出验收', now, now)
    const sourceFingerprint = fingerprintMediaSource(sourcePath)
    if (!sourceFingerprint) throw new Error('dev-06 source fingerprint is unavailable')
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('dev-06', 'real-export-drama', 6, 0, sourcePath, sourceFingerprint, media.durationSeconds, 'ready', now, now)
    const service = new OriginalClipService(database)
    const candidate = service.createCandidate('real-export-drama', 'dev-06', { startSeconds, endSeconds })
    service.confirmCandidate(candidate.id)
    const result = await service.exportCandidate(candidate.id, outputDirectory)
    expect(existsSync(result.outputPath)).toBe(true)
    expect((await stat(result.outputPath)).size).toBeGreaterThan(0)
    const outputMedia = await probeMedia(result.outputPath)
    expect(Math.abs(outputMedia.durationSeconds - (endSeconds - startSeconds))).toBeLessThanOrEqual((outputMedia.fps && outputMedia.fps > 0 ? 1 / outputMedia.fps : 0.04) + 0.1)
    expect(database.prepare('SELECT status FROM clip_export_batches').get()).toEqual({ status: 'completed' })
    expect(database.prepare('SELECT status, actual_range AS actualRange FROM task_items WHERE id = ?').get(candidate.id)).toMatchObject({ status: 'exported', actualRange: expect.stringContaining('startSeconds') })
    expect(database.prepare('SELECT COUNT(*) AS count FROM generated_materials').get()).toEqual({ count: 1 })
    expect(createHash('sha256').update(await readFile(sourcePath)).digest('hex').toUpperCase()).toBe(sample.sha256)
  } finally {
    database.close()
  }
}, 180_000)
