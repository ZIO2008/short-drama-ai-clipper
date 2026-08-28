import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, expect, test } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { fingerprintMediaSource } from '../media/media-source-fingerprint.js'
import { ClipEvidencePackageService, type ClipEvidencePackage } from './clip-evidence-package-service.js'
import { ClipGenerationLifecycle } from './clip-generation-lifecycle.js'

type BaselineSample = { id: string; relativePath: string; sha256: string; sceneCards: string[] }
type BaselineManifest = { mediaRoot: string; publicDevelopmentSet: BaselineSample[]; hiddenAcceptanceSet: BaselineSample[] }

const projectRoot = resolve(import.meta.dirname, '../../..')
const manifestPath = join(projectRoot, 'docs', 'clip-evidence-baseline', 'manifest.v1.json')
const ledgerPath = join(projectRoot, 'docs', 'phase-29-evidence', 'acceptance-ledger.v1.json')
const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

const sha256 = async (path: string): Promise<string> => createHash('sha256').update(await readFile(path)).digest('hex').toUpperCase()

const loadSample = async (manifest: BaselineManifest, id: string): Promise<{ sample: BaselineSample; sourcePath: string }> => {
  const sample = manifest.publicDevelopmentSet.find((item) => item.id === id)
  if (!sample) throw new Error(`baseline sample ${id} is missing`)
  const sourcePath = join(manifest.mediaRoot, sample.relativePath)
  expect(await sha256(sourcePath)).toBe(sample.sha256)
  return { sample, sourcePath }
}

const insertEpisode = (database: Database.Database, dramaId: string, episodeId: string, sourcePath: string, now: string): void => {
  const fingerprint = fingerprintMediaSource(sourcePath)
  if (!fingerprint) throw new Error(`${episodeId}: frozen baseline media cannot be fingerprinted`)
  const nextNo = ((database.prepare('SELECT COUNT(*) AS count FROM episodes WHERE drama_id = ?').get(dramaId) as { count: number }).count) + 1
  database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)').run(episodeId, dramaId, nextNo, nextNo - 1, sourcePath, fingerprint, 'ready', now, now)
}

const buildPackage = (database: Database.Database, dramaId: string, episodeId: string): ClipEvidencePackage => {
  const record = new ClipEvidencePackageService(database).build(dramaId, episodeId)
  expect(record.status).toBe('ready')
  return record
}

test.runIf(process.env.SHORTDRAMA_REAL_EVIDENCE_GOVERNANCE === '1')('real baseline governance cards use only temporary SQLite and never publish or export media', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as BaselineManifest
  const { readSealedPhase29AcceptanceLedger } = await import('./phase29-acceptance-matrix.js')
  const ledger = await readSealedPhase29AcceptanceLedger(ledgerPath, '6CF8D83D12837C3BCFEB8EAC341B8CE814005607359BCD3A3FDAF76302845339', manifest)
  expect(ledger.filter((entry) => entry.tier === 'hidden').map(({ sampleId, runCount }) => ({ sampleId, runCount }))).toEqual([{ sampleId: 'hidden-01', runCount: 1 }, { sampleId: 'hidden-02', runCount: 1 }])
  const root = await mkdtemp(join(tmpdir(), 'shortdrama-real-governance-baseline-'))
  temporaryFolders.push(root)
  const database = new Database(join(root, 'governance.sqlite'))
  const now = new Date().toISOString()
  const dramaId = 'baseline-governance-drama'
  try {
    database.pragma('foreign_keys = ON')
    migrateDatabase(database)
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(dramaId, '内部隔离治理验收', now, now)

    const dev05 = await loadSample(manifest, 'dev-05')
    insertEpisode(database, dramaId, dev05.sample.id, dev05.sourcePath, now)
    const dev05Package = buildPackage(database, dramaId, dev05.sample.id)
    const queuedTaskId = randomUUID()
    const frozenInput = { episodeIds: [dev05.sample.id], candidatesPerEpisode: 1, targetDurationSeconds: 12, maxOverlapRatio: 0.25, allowRepeat: false }
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)').run(queuedTaskId, dramaId, 'original_clip', JSON.stringify({ generation: frozenInput, requestedPackages: [{ episodeId: dev05.sample.id, packageId: dev05Package.id, sourceMediaFingerprint: dev05Package.sourceMediaFingerprint }], taskRound: 7 }), 'pending', JSON.stringify({ version: 1, stage: 'queued', round: queuedTaskId, taskRound: 7 }), now, now)
    const resumed: Array<{ taskId: string; dramaId: string; input: unknown; taskRound: number }> = []
    const lifecycle = new ClipGenerationLifecycle(database, new Map(), new Map(), new Map(), { runGeneration: (taskId, resumedDramaId, input, taskRound) => resumed.push({ taskId, dramaId: resumedDramaId, input, taskRound }) })
    await lifecycle.drain()
    expect(resumed).toEqual([{ taskId: queuedTaskId, dramaId, input: frozenInput, taskRound: 7 }])
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(queuedTaskId)).toEqual({ status: 'running' })

    const dev06 = await loadSample(manifest, 'dev-06')
    insertEpisode(database, dramaId, dev06.sample.id, dev06.sourcePath, now)
    const dev06Package = buildPackage(database, dramaId, dev06.sample.id)
    const partialTaskId = randomUUID()
    const candidateId = randomUUID()
    const governanceConfig = { evidenceFixture: true, taskRound: 8, provider: { provider: 'local-governance-fixture', model: null }, episodes: [{ episodeId: dev06.sample.id, packageId: dev06Package.id, sourceMediaFingerprint: dev06Package.sourceMediaFingerprint }] }
    const governanceEvidenceId = randomUUID()
    database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, coverage_json, source_version, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), dev06Package.id, 'semantic-event', 0, 3, JSON.stringify([governanceEvidenceId]), 'A', '{}', 'governance-fixture-v1', '隔离治理夹具', now, now)
    const governanceUnit = database.prepare("SELECT start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson, kind FROM clip_evidence_units WHERE package_id = ? AND kind IN ('semantic-event', 'scene-anchor') AND qualification IN ('A', 'B') ORDER BY start_seconds, id LIMIT 1").get(dev06Package.id) as { startSeconds: number; endSeconds: number; sourceIdsJson: string; kind: string } | undefined
    if (!governanceUnit) throw new Error('governance fixture evidence unit is missing')
    const governanceSourceId = (JSON.parse(governanceUnit.sourceIdsJson) as string[])[0]
    const plannedRange = { episodeId: dev06.sample.id, startSeconds: governanceUnit.startSeconds, endSeconds: governanceUnit.endSeconds, ...(governanceUnit.kind === 'scene-anchor' ? { sceneAnchorIds: [governanceSourceId] } : { semanticEventIds: [governanceSourceId] }) }
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?)').run(partialTaskId, dramaId, 'original_clip', JSON.stringify(governanceConfig), 'running', JSON.stringify({ version: 1, stage: 'text-semantics', round: partialTaskId, taskRound: 8, startedAt: now }), now, now)
    database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(candidateId, partialTaskId, JSON.stringify(plannedRange), 'pending_review', now, now)
    new ClipEvidencePackageService(database).publishGenerationRound({ taskId: partialTaskId, taskRound: 8, dramaId, config: governanceConfig, provider: governanceConfig.provider, blocked: [{ reason: '缺少同集真实语义输入', count: 1 }], blockedTotal: 1, recovery: 'subtitles', candidates: [{ candidateId, package: dev06Package, qualification: 'qualified', summary: { ...plannedRange, fixtureOnly: true } }] })
    const partial = database.prepare('SELECT status, checkpoint FROM production_tasks WHERE id = ?').get(partialTaskId) as { status: string; checkpoint: string }
    expect(partial.status).toBe('reviewing')
    expect(JSON.parse(partial.checkpoint)).toMatchObject({ blockedTotal: 1, recovery: 'subtitles', candidateCount: 1 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_publish_members WHERE candidate_id = ?').get(candidateId)).toEqual({ count: 1 })

    const fingerprintTaskId = randomUUID()
    const fingerprintCandidateId = randomUUID()
    const snapshotId = randomUUID()
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?)').run(fingerprintTaskId, dramaId, 'original_clip', '{}', 'reviewing', JSON.stringify({ round: fingerprintTaskId, taskRound: 9 }), now, now)
    database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(fingerprintCandidateId, fingerprintTaskId, JSON.stringify({ episodeId: dev05.sample.id, startSeconds: 0, endSeconds: 3 }), 'pending_review', now, now)
    database.prepare('INSERT INTO clip_candidate_snapshots (id, candidate_id, package_id, qualification, config_json, provider_json, summary_json, task_id, task_round, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(snapshotId, fingerprintCandidateId, dev05Package.id, 'qualified', '{}', '{}', JSON.stringify({ startSeconds: 0, endSeconds: 3, fixtureOnly: true }), fingerprintTaskId, 9, now, now)
    database.prepare('INSERT INTO clip_candidate_publish_pointers (drama_id, episode_id, snapshot_id, task_id, task_round, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(dramaId, dev05.sample.id, snapshotId, fingerprintTaskId, 9, now)
    database.prepare('INSERT INTO clip_candidate_publish_members (candidate_id, snapshot_id, drama_id, episode_id, task_id, task_round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(fingerprintCandidateId, snapshotId, dramaId, dev05.sample.id, fingerprintTaskId, 9, now)
    database.prepare('UPDATE episodes SET source_fingerprint = ? WHERE id = ?').run('stale-fingerprint-for-isolated-test', dev05.sample.id)
    expect(() => new ClipEvidencePackageService(database).assertPublishedCandidate(fingerprintCandidateId)).toThrow('源媒体指纹')

    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_export_batches').get()).toEqual({ count: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM generated_materials').get()).toEqual({ count: 0 })
    expect(await sha256(dev05.sourcePath)).toBe(dev05.sample.sha256)
    expect(await sha256(dev06.sourcePath)).toBe(dev06.sample.sha256)
  } finally {
    database.close()
  }
}, 90_000)
