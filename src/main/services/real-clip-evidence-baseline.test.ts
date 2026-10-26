import Database from 'better-sqlite3'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { fingerprintMediaSource } from '../media/media-source-fingerprint.js'
import { ClipEvidencePackageService } from './clip-evidence-package-service.js'

const projectRoot = resolve(import.meta.dirname, '../../..')
const manifestPath = join(projectRoot, 'docs', 'clip-evidence-baseline', 'manifest.v1.json')
const ledgerPath = join(projectRoot, 'docs', 'phase-29-evidence', 'acceptance-ledger.v2.json')
const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

test.runIf(process.env.SHORTDRAMA_REAL_EVIDENCE_BASELINE === '1')('real public media baseline creates isolated PTS-verifiable evidence packages without reopening sealed hidden samples', async () => {
  const manifest = JSON.parse(await (await import('node:fs/promises')).readFile(manifestPath, 'utf8')) as {
    mediaRoot: string
    publicDevelopmentSet: Array<{ id: string; relativePath: string; sha256: string; sceneCards: string[] }>
    hiddenAcceptanceSet: Array<{ id: string; relativePath: string; sha256: string; sceneCards: string[] }>
  }
  const requestedIds = new Set((process.env.SHORTDRAMA_REAL_EVIDENCE_SAMPLE_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean))
  const folder = await mkdtemp(join(tmpdir(), 'shortdrama-real-evidence-baseline-'))
  temporaryFolders.push(folder)
  const database = new Database(join(folder, 'baseline.sqlite'))
  try {
    database.pragma('foreign_keys = ON')
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('baseline-drama', '内部6+2证据验收', now, now)
    const { readSealedPhase29AcceptanceLedger } = await import('./phase29-acceptance-matrix.js')
    const ledger = await readSealedPhase29AcceptanceLedger(ledgerPath, '6CF8D83D12837C3BCFEB8EAC341B8CE814005607359BCD3A3FDAF76302845339', manifest)
    expect(ledger.filter((entry) => entry.tier === 'hidden').map(({ sampleId, runCount }) => ({ sampleId, runCount }))).toEqual([{ sampleId: 'hidden-01', runCount: 1 }, { sampleId: 'hidden-02', runCount: 1 }])
    if ([...requestedIds].some((id) => id.startsWith('hidden-'))) throw new Error('sealed hidden baseline samples cannot be reopened')
    const allSamples = manifest.publicDevelopmentSet.map((sample) => ({ ...sample, tier: 'public' as const }))
    const samples = requestedIds.size ? allSamples.filter((sample) => requestedIds.has(sample.id)) : allSamples
    if (!samples.length || (requestedIds.size && samples.length !== requestedIds.size)) throw new Error('requested public baseline sample IDs are invalid')
    const insertEpisode = database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)')
    for (const [index, sample] of samples.entries()) {
      const sourcePath = join(manifest.mediaRoot, sample.relativePath)
      const fingerprint = fingerprintMediaSource(sourcePath)
      if (!fingerprint) throw new Error(`${sample.id}: baseline media cannot be fingerprinted`)
      insertEpisode.run(sample.id, 'baseline-drama', index + 1, index, sourcePath, fingerprint, 'ready', now, now)
    }
    const service = new ClipEvidencePackageService(database)
    const packages = samples.map((sample) => {
      const record = service.build('baseline-drama', sample.id)
      const units = database.prepare('SELECT qualification, COUNT(*) AS count FROM clip_evidence_units WHERE package_id = ? GROUP BY qualification ORDER BY qualification').all(record.id) as Array<{ qualification: string; count: number }>
      const candidatesCreated = database.prepare('SELECT COUNT(*) AS count FROM task_items').get() as { count: number }
      const subtitleTracksCreated = database.prepare('SELECT COUNT(*) AS count FROM subtitle_tracks').get() as { count: number }
      const exportsCreated = database.prepare('SELECT COUNT(*) AS count FROM clip_export_batches').get() as { count: number }
      return { id: sample.id, tier: sample.tier, sceneCards: sample.sceneCards, sourceSha256: sample.sha256, status: record.status, reason: record.reason, sourceMediaFingerprint: record.sourceMediaFingerprint, units, candidatesCreated, subtitleTracksCreated, exportsCreated }
    })
    expect(packages).toHaveLength(samples.length)
    expect(packages.every((record) => record.status === 'ready')).toBe(true)
    expect(packages.every((record) => record.candidatesCreated.count === 0)).toBe(true)
    expect(packages.every((record) => record.subtitleTracksCreated.count === 0)).toBe(true)
    expect(packages.every((record) => record.exportsCreated.count === 0)).toBe(true)
  } finally {
    database.close()
  }
}, 60_000)
