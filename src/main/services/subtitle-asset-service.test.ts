import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { SubtitleAssetService } from './subtitle-asset-service.js'
import { SubtitleEvidenceService } from './subtitle-evidence-service.js'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const dbs: Database.Database[] = []
afterEach(() => { for (const db of dbs.splice(0)) db.close() })
describe('SubtitleAssetService', () => {
  it('persists parsed subtitle status and cue count', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'subtitle-asset-')); const path = join(folder, 'episode.srt')
    try { await writeFile(path, '1\n00:00:01,000 --> 00:00:02,000\nhello\n', 'utf8'); const db = new Database(':memory:'); dbs.push(db); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Demo', now, now); const service = new SubtitleAssetService(db); const asset = await service.importFile('drama', null, path); expect(asset.cueCount).toBe(1); expect(service.list('drama')[0]?.status).toBe('ready'); const importedTrack = db.prepare('SELECT id, source_kind AS sourceKind, cue_count AS cueCount FROM subtitle_tracks WHERE asset_id = ?').get(asset.id) as { id: string; sourceKind: string; cueCount: number }; expect(importedTrack).toMatchObject({ sourceKind: 'import', cueCount: 1 }); expect(db.prepare('SELECT COUNT(*) AS count FROM subtitle_cues').get()).toEqual({ count: 1 }); const evidence = new SubtitleEvidenceService(db); const editable = evidence.startManualRevision(importedTrack.id); const editableCue = evidence.listCues(editable.id)[0]; evidence.updateResolvedCue(editable.id, editableCue?.id, { text: 'edited' }); expect(evidence.exportTrackAsVtt(editable.id)).toContain('edited'); service.remove(asset.id); expect(service.list('drama')).toEqual([]); expect(db.prepare('SELECT status, asset_id AS assetId FROM subtitle_tracks WHERE id = ?').get(importedTrack.id)).toEqual({ status: 'archived', assetId: null }) } finally { await rm(folder, { recursive: true, force: true }) }
  })

  it('returns the existing asset when a late retry imports the same subtitle source', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'subtitle-asset-idempotent-')); const path = join(folder, 'episode.vtt')
    try {
      await writeFile(path, 'WEBVTT\n\n00:00.000 --> 00:01.000\nhello\n', 'utf8')
      const db = new Database(':memory:'); dbs.push(db); migrateDatabase(db); const now = new Date().toISOString()
      db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Demo', now, now)
      const service = new SubtitleAssetService(db)

      const first = await service.importFile('drama', null, path)
      const retry = await service.importFile('drama', null, path)

      expect(retry).toEqual(first)
      expect(service.list('drama')).toHaveLength(1)
      expect(db.prepare('SELECT COUNT(*) AS count FROM subtitle_tracks').get()).toEqual({ count: 1 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM subtitle_cues').get()).toEqual({ count: 1 })
    } finally { await rm(folder, { recursive: true, force: true }) }
  })

  it('rejects unsupported extensions and cross-drama episode links', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'subtitle-asset-invalid-')); const srt = join(folder, 'episode.srt'); const txt = join(folder, 'episode.txt')
    try {
      await writeFile(srt, '1\n00:00:01,000 --> 00:00:02,000\nhello\n', 'utf8'); await writeFile(txt, 'hello', 'utf8')
      const db = new Database(':memory:'); dbs.push(db); migrateDatabase(db); const now = new Date().toISOString()
      db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Demo', now, now); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('other', 'Other', now, now)
      db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('other-episode', 'other', 1, 0, 'other.mp4', 'ready', now, now)
      const service = new SubtitleAssetService(db)
      await expect(service.importFile('drama', 'other-episode', srt)).rejects.toThrow('does not belong')
      await expect(service.importFile('drama', null, txt)).rejects.toThrow()
    } finally { await rm(folder, { recursive: true, force: true }) }
  })
})
