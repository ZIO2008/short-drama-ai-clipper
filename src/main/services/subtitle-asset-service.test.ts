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
    try { await writeFile(path, '1\n00:00:01,000 --> 00:00:02,000\nhello\n', 'utf8'); const db = new Database(':memory:'); dbs.push(db); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Demo', now, now); const service = new SubtitleAssetService(db); const asset = await service.importFile('drama', null, path); expect(asset.cueCount).toBe(1); expect(service.list('drama')[0]?.status).toBe('ready'); const importedTrack = db.prepare('SELECT id, source_kind AS sourceKind, acquisition, evidence_nature AS evidenceNature, cue_count AS cueCount FROM subtitle_tracks WHERE asset_id = ?').get(asset.id) as { id: string; sourceKind: string; acquisition: string; evidenceNature: string; cueCount: number }; expect(importedTrack).toMatchObject({ sourceKind: 'import', acquisition: 'imported', evidenceNature: 'reference_unknown', cueCount: 1 }); expect(db.prepare('SELECT acquisition, evidence_nature AS evidenceNature FROM subtitle_assets WHERE id = ?').get(asset.id)).toEqual({ acquisition: 'imported', evidenceNature: 'reference_unknown' }); expect(db.prepare('SELECT COUNT(*) AS count FROM subtitle_cues').get()).toEqual({ count: 1 }); const evidence = new SubtitleEvidenceService(db); const editable = evidence.startManualRevision(importedTrack.id); const editableCue = evidence.listCues(editable.id)[0]; evidence.updateResolvedCue(editable.id, editableCue?.id, { text: 'edited' }); expect(evidence.exportTrackAsVtt(editable.id)).toContain('edited'); service.remove(asset.id); expect(service.list('drama')).toEqual([]); expect(db.prepare('SELECT id FROM subtitle_tracks WHERE id = ?').get(importedTrack.id)).toBeUndefined(); expect(db.prepare('SELECT COUNT(*) AS count FROM subtitle_cues WHERE track_id = ?').get(importedTrack.id)).toEqual({ count: 0 }); expect(evidence.exportTrackAsVtt(editable.id)).toContain('edited') } finally { await rm(folder, { recursive: true, force: true }) }
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

  it('batch imports only uniquely matched episode subtitle files', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'subtitle-asset-batch-'))
    const firstBefore = join(folder, '01（戏前）.srt'); const firstAfter = join(folder, '01（戏后）.srt'); const second = join(folder, '02.srt'); const unclear = join(folder, '8月2日 (3).srt')
    try {
      await Promise.all([firstBefore, firstAfter, second, unclear].map((path) => writeFile(path, '1\n00:00:01,000 --> 00:00:02,000\nhello\n', 'utf8')))
      const db = new Database(':memory:'); dbs.push(db); migrateDatabase(db); const now = new Date().toISOString()
      db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Demo', now, now)
      db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('episode-1', 'drama', 1, 1, '01.mp4', 'ready', now, now)
      db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('episode-2', 'drama', 2, 2, '02.mp4', 'ready', now, now)
      const result = await new SubtitleAssetService(db).importByEpisodeNumbers('drama', [firstBefore, firstAfter, second, unclear])

      expect(result.assets).toEqual([expect.objectContaining({ episodeId: 'episode-2', episodeNo: 2, sourcePath: second })])
      expect(result.skipped).toEqual(expect.arrayContaining([
        expect.objectContaining({ sourcePath: firstBefore, reason: '同次导入中多个字幕文件命中同一剧集，需人工处理' }),
        expect.objectContaining({ sourcePath: firstAfter, reason: '同次导入中多个字幕文件命中同一剧集，需人工处理' }),
        expect.objectContaining({ sourcePath: unclear, reason: '文件名未包含可识别的完整剧集号' })
      ]))
      expect(db.prepare('SELECT episode_id AS episodeId, source_path AS sourcePath FROM subtitle_assets').all()).toEqual([{ episodeId: 'episode-2', sourcePath: second }])
    } finally { await rm(folder, { recursive: true, force: true }) }
  })

  it('skips only subtitle files whose episode number is duplicated in the drama', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'subtitle-asset-duplicate-episode-'))
    const duplicate = join(folder, '01.srt'); const unique = join(folder, '02.srt')
    try {
      await Promise.all([duplicate, unique].map((path) => writeFile(path, '1\n00:00:01,000 --> 00:00:02,000\nhello\n', 'utf8')))
      const db = new Database(':memory:'); dbs.push(db); migrateDatabase(db); const now = new Date().toISOString()
      db.pragma('foreign_keys = OFF')
      db.exec('DROP TABLE episodes; CREATE TABLE episodes (id TEXT PRIMARY KEY, drama_id TEXT NOT NULL, episode_no INTEGER, sort_order INTEGER NOT NULL, source_path TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
      db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Demo', now, now)
      const insertEpisode = db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      insertEpisode.run('episode-1a', 'drama', 1, 1, '01a.mp4', 'ready', now, now)
      insertEpisode.run('episode-1b', 'drama', 1, 2, '01b.mp4', 'ready', now, now)
      insertEpisode.run('episode-2', 'drama', 2, 3, '02.mp4', 'ready', now, now)

      const result = await new SubtitleAssetService(db).importByEpisodeNumbers('drama', [duplicate, unique])

      expect(result.assets).toEqual([expect.objectContaining({ episodeId: 'episode-2', episodeNo: 2, sourcePath: unique })])
      expect(result.skipped).toEqual([expect.objectContaining({ sourcePath: duplicate, reason: '当前剧目第 1 集存在多个剧集记录，无法安全匹配' })])
    } finally { await rm(folder, { recursive: true, force: true }) }
  })

  it('previews each batch mapping before writing and excludes an already imported source', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'subtitle-asset-preview-'))
    const first = join(folder, '01.srt'); const second = join(folder, '02.srt')
    try {
      await Promise.all([first, second].map((path) => writeFile(path, '1\n00:00:01,000 --> 00:00:02,000\nhello\n', 'utf8')))
      const db = new Database(':memory:'); dbs.push(db); migrateDatabase(db); const now = new Date().toISOString()
      db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Demo', now, now)
      const insertEpisode = db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      insertEpisode.run('episode-1', 'drama', 1, 1, '01.mp4', 'ready', now, now); insertEpisode.run('episode-2', 'drama', 2, 2, '02.mp4', 'ready', now, now)
      const service = new SubtitleAssetService(db)
      await service.importByEpisodeNumbers('drama', [first])

      expect(service.previewByEpisodeNumbers('drama', [first, second])).toEqual({
        matches: [expect.objectContaining({ episodeId: 'episode-2', episodeNo: 2, sourcePath: second, format: 'srt' })],
        skipped: [expect.objectContaining({ sourcePath: first, reason: '第 1 集已导入同一字幕文件' })]
      })
      expect(service.list('drama')).toHaveLength(1)
    } finally { await rm(folder, { recursive: true, force: true }) }
  })

  it('deletes every imported subtitle asset for one episode in a single transaction', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'subtitle-asset-delete-episode-'))
    const first = join(folder, '01.srt'); const revised = join(folder, '01（修订）.srt'); const other = join(folder, '02.srt')
    try {
      await Promise.all([first, revised, other].map((path) => writeFile(path, '1\n00:00:01,000 --> 00:00:02,000\nhello\n', 'utf8')))
      const db = new Database(':memory:'); dbs.push(db); migrateDatabase(db); const now = new Date().toISOString()
      db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Demo', now, now)
      const insertEpisode = db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      insertEpisode.run('episode-1', 'drama', 1, 1, '01.mp4', 'ready', now, now); insertEpisode.run('episode-2', 'drama', 2, 2, '02.mp4', 'ready', now, now)
      const service = new SubtitleAssetService(db)
      await service.importFile('drama', 'episode-1', first); await service.importFile('drama', 'episode-1', revised); await service.importFile('drama', 'episode-2', other)

      expect(service.removeByEpisode('drama', 'episode-1')).toBe(2)
      expect(service.list('drama')).toEqual([expect.objectContaining({ episodeId: 'episode-2', sourcePath: other })])
      expect(db.prepare('SELECT COUNT(*) AS count FROM subtitle_tracks WHERE episode_id = ?').get('episode-1')).toEqual({ count: 0 })
      expect(service.removeByEpisode('drama', 'episode-1')).toBe(0)
    } finally { await rm(folder, { recursive: true, force: true }) }
  })
})
