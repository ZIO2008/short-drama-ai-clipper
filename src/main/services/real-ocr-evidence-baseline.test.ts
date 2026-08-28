import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { resolveMediaBinary, runMediaProcess } from '../media/ffmpeg-runner.js'
import { fingerprintMediaSource } from '../media/media-source-fingerprint.js'
import { ClipEvidencePackageService } from './clip-evidence-package-service.js'
import { LocalOcrSubtitleService } from './local-ocr-subtitle-service.js'
import { SubtitleEvidenceService } from './subtitle-evidence-service.js'

const projectRoot = resolve(import.meta.dirname, '../../..')
const manifestPath = join(projectRoot, 'docs', 'clip-evidence-baseline', 'manifest.v1.json')
const supportedSampleIds = new Set(['dev-01', 'dev-02', 'dev-04'])
const pinnedRunnerPath = join(projectRoot, 'tools', 'local-ocr', 'temporal_ocr_runner.py')
const pinnedPythonPath = join(projectRoot, 'tools', 'local-ocr', '.venv', 'Scripts', 'python.exe')
const pinnedRunnerSha256 = '1b593ec5a22473358700a291cf231687836a2b9ecd6b13af8b66302e62d1fae3'
const pinnedPythonSha256 = '5912d0884b23c0343983a864c6064242391e2265536f50b88624857e353882c9'
const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

test.runIf(process.env.SHORTDRAMA_REAL_OCR_EVIDENCE === '1')('real OCR creates only a generated visual-aligned track in an isolated evidence database', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    mediaRoot: string
    publicDevelopmentSet: Array<{ id: string; relativePath: string; sha256: string }>
  }
  const sampleId = process.env.SHORTDRAMA_REAL_OCR_EVIDENCE_SAMPLE_ID?.trim()
  if (!sampleId || !supportedSampleIds.has(sampleId)) throw new Error('set SHORTDRAMA_REAL_OCR_EVIDENCE_SAMPLE_ID to dev-01, dev-02, or dev-04')
  const sample = manifest.publicDevelopmentSet.find((entry) => entry.id === sampleId)
  if (!sample) throw new Error('requested OCR baseline sample is not registered')

  for (const variable of ['SHORTDRAMA_LOCAL_OCR_PYTHON', 'SHORTDRAMA_LOCAL_OCR_RUNNER', 'SHORTDRAMA_LOCAL_OCR_RUNNER_BINARY']) {
    if (process.env[variable]) throw new Error(`${variable} must be unset for the pinned real OCR evidence test`)
  }
  expect(await sha256(pinnedRunnerPath)).toBe(pinnedRunnerSha256)
  expect(await sha256(pinnedPythonPath)).toBe(pinnedPythonSha256)
  const sourcePath = join(manifest.mediaRoot, sample.relativePath)
  expect(await sha256(sourcePath)).toBe(sample.sha256.toLowerCase())

  const folder = await mkdtemp(join(tmpdir(), 'shortdrama-real-ocr-evidence-'))
  temporaryFolders.push(folder)
  const previousPaddleCache = process.env.PADDLE_PDX_CACHE_HOME
  process.env.PADDLE_PDX_CACHE_HOME = join(folder, 'paddle-cache')
  let database: Database.Database | null = null
  let closeFailure: unknown = null
  try {
    database = new Database(join(folder, 'baseline.sqlite'))
    database.pragma('foreign_keys = ON')
    migrateDatabase(database)
    const now = new Date().toISOString()
    const fingerprint = fingerprintMediaSource(sourcePath)
    if (!fingerprint) throw new Error('baseline media cannot be fingerprinted')
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('baseline-drama', '内部 OCR 证据验收', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)').run(sample.id, 'baseline-drama', 1, 0, sourcePath, fingerprint, 'ready', now, now)

    const evidence = new SubtitleEvidenceService(database)
    const ocr = new LocalOcrSubtitleService(database, evidence, () => pinnedPythonPath, {
      resolveFfmpeg: () => resolveMediaBinary('ffmpeg'),
      resolvePythonRunner: () => pinnedRunnerPath,
      run: runMediaProcess,
      createTempDirectory: () => mkdtemp(join(tmpdir(), 'shortdrama-ocr-')),
      removeTempDirectory: (path) => rm(path, { recursive: true, force: true }),
      writeJson: (path, value) => writeFile(path, `${JSON.stringify(value)}\n`, 'utf8'),
      readJson: async (path) => JSON.parse(await readFile(path, 'utf8')) as unknown
    })
    const track = await ocr.extractFixedRegionIndependently({ dramaId: 'baseline-drama', episodeId: sample.id, language: 'chi_sim', regionMode: 'auto-region' })
    const packageRecord = new ClipEvidencePackageService(database).build('baseline-drama', sample.id)

    expect(track).toEqual(expect.objectContaining({ sourceKind: 'ocr', acquisition: 'generated', evidenceNature: 'visual_aligned', status: 'active' }))
    expect(track.cueCount).toBeGreaterThan(0)
    expect(evidence.listCues(track.id)).toHaveLength(track.cueCount)
    expect(packageRecord.status).toBe('ready')
    expect(database.prepare('SELECT COUNT(*) AS count FROM subtitle_tracks').get()).toEqual({ count: 1 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM task_items').get()).toEqual({ count: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_export_batches').get()).toEqual({ count: 0 })
  } finally {
    try { database?.close() } catch (cause) { closeFailure = cause }
    if (previousPaddleCache === undefined) delete process.env.PADDLE_PDX_CACHE_HOME
    else process.env.PADDLE_PDX_CACHE_HOME = previousPaddleCache
    expect(process.env.PADDLE_PDX_CACHE_HOME).toBe(previousPaddleCache)
    const index = temporaryFolders.indexOf(folder)
    if (index >= 0) temporaryFolders.splice(index, 1)
    await rm(folder, { recursive: true, force: true })
    expect(existsSync(folder)).toBe(false)
    if (closeFailure) throw closeFailure
  }
}, 480_000)

const sha256 = async (path: string): Promise<string> => createHash('sha256').update(await readFile(path)).digest('hex')
