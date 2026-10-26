import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { openDatabase } from '../db/migrate.js'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DramaService } from './drama-service.js'

const databases: Database.Database[] = []
afterEach(() => { for (const database of databases.splice(0)) database.close() })
const setup = (): DramaService => { const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); databases.push(database); migrateDatabase(database); return new DramaService(database) }

describe('DramaService', () => {
  it('flags an ultra-short episode without blocking it and persists a user dismissal', () => {
    const service = setup(); const database = (service as unknown as { database: Database.Database }).database
    const drama = service.create('时长异常')
    const now = new Date().toISOString()
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('episode-short', drama.id, 48, 0, '48.mp4', 1.4, 25, 'ready', now, now)
    expect(service.get(drama.id)).toMatchObject({ issueCount: 1, episodes: [expect.objectContaining({ id: 'episode-short', durationAlertDismissedAt: null, status: 'ready' })] })
    const dismissed = service.dismissDurationAlert(drama.id, 'episode-short')
    expect(dismissed).toMatchObject({ issueCount: 0, episodes: [expect.objectContaining({ id: 'episode-short', durationAlertDismissedAt: expect.any(String), status: 'ready' })] })
    expect(database.prepare('SELECT source_path AS sourcePath, duration_seconds AS durationSeconds FROM episodes WHERE id = ?').get('episode-short')).toEqual({ sourcePath: '48.mp4', durationSeconds: 1.4 })
  })

  it('creates and imports source references in natural order', async () => {
    const service = setup()
    const created = service.create('  Demo drama  ')
    const { drama: detail } = await service.importEpisodes(created.id, ['10.mp4', '02.mp4', '01（戏后）.mp4'])
    expect(detail.name).toBe('Demo drama')
    expect(detail.episodes.map(({ episodeNo }) => episodeNo)).toEqual([1, 2, 10])
    expect(detail.episodes[0]?.sourcePath).toContain('01')
    expect(service.list()[0]?.episodeCount).toBe(3)
  })

  it('recursively imports supported videos selected through a folder', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'short-drama-folder-import-'))
    try {
      const nested = join(folder, 'nested'); await mkdir(nested)
      await writeFile(join(folder, '02.mp4'), 'not a real video', 'utf8')
      await writeFile(join(nested, '01.mov'), 'not a real video', 'utf8')
      await writeFile(join(nested, 'notes.txt'), 'ignore me', 'utf8')
      const service = setup(); const drama = service.create('Folder import')
      const { drama: detail } = await service.importEpisodes(drama.id, [folder])
      expect(detail.episodes.map(({ episodeNo }) => episodeNo)).toEqual([1, 2])
      expect(detail.episodes.map(({ sourcePath }) => sourcePath)).toEqual([join(nested, '01.mov'), join(folder, '02.mp4')])
    } finally { await rm(folder, { recursive: true, force: true }) }
  })

  it('stops a folder import when it exceeds the supported video limit', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'short-drama-folder-limit-'))
    try {
      await Promise.all(Array.from({ length: 2001 }, (_, index) => writeFile(join(folder, `${index + 1}.mp4`), '', 'utf8')))
      const service = setup(); const drama = service.create('Folder limit')
      await expect(service.importEpisodes(drama.id, [folder])).rejects.toThrow('Too many video files selected')
    } finally { await rm(folder, { recursive: true, force: true }) }
  }, 30_000)

  it('keeps the existing duplicate and continues importing other episodes', async () => {
    const service = setup()
    const drama = service.create('Demo')
    const first = await service.importEpisodes(drama.id, ['02.mp4'])
    const result = await service.importEpisodes(drama.id, ['01.mp4', '02-copy.mp4', '03.mp4'])
    expect(first.summary.imported).toBe(1)
    expect(result.summary).toMatchObject({ imported: 2, skipped: 0 })
    expect(result.summary.conflicts).toEqual([{ episodeNo: 2, sourcePath: '02-copy.mp4', existingSourcePath: '02.mp4' }])
    expect(result.drama.episodes.map((episode) => episode.episodeNo)).toEqual([1, 2, 3])
    service.delete(drama.id, false)
    expect(service.list()).toEqual([])
  })

  it('skips existing paths, retains natural order, and remembers the selected directory', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'short-drama-incremental-import-'))
    try {
      const files = await Promise.all(Array.from({ length: 3 }, async (_, index) => {
        const path = join(folder, `${index + 1}.mp4`); await writeFile(path, '', 'utf8'); return path
      }))
      const service = setup(); const drama = service.create('Incremental')
      await service.importEpisodes(drama.id, files.slice(0, 2))
      const result = await service.importEpisodes(drama.id, files)
      expect(result.summary).toMatchObject({ imported: 1, skipped: 2 })
      expect(result.drama.episodes.map((episode) => episode.episodeNo)).toEqual([1, 2, 3])
      expect(new DramaService((service as unknown as { database: Database.Database }).database).getLastImportDirectory(drama.id)).toBe(folder)
      const differentFolder = await mkdtemp(join(tmpdir(), 'short-drama-no-import-'))
      try {
        const conflictingPaths = await Promise.all(Array.from({ length: 3 }, async (_, index) => {
          const path = join(differentFolder, `${index + 1}.mp4`); await writeFile(path, '', 'utf8'); return path
        }))
        const noImport = await service.importEpisodes(drama.id, conflictingPaths)
        expect(noImport.summary).toMatchObject({ imported: 0, skipped: 0 })
        expect(noImport.summary.conflicts).toHaveLength(3)
        expect(service.getLastImportDirectory(drama.id)).toBe(folder)
      } finally { await rm(differentFolder, { recursive: true, force: true }) }
      const source = result.drama.episodes[0]?.sourcePath
      if (!source) throw new Error('episode missing')
      service.removeEpisode(drama.id, result.drama.episodes[0]!.id)
      expect(existsSync(source)).toBe(true)
    } finally { await rm(folder, { recursive: true, force: true }) }
  })

  it('deletes only this drama cache when the user explicitly opts in', async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'short-drama-cache-')); const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); databases.push(database); migrateDatabase(database)
    try {
      const service = new DramaService(database, cacheRoot); const drama = service.create('Cached')
      const cacheFile = join(cacheRoot, drama.id, 'analysis.json'); await writeFile(cacheFile, '{}', 'utf8')
      service.delete(drama.id, true)
      expect(existsSync(cacheFile)).toBe(false)
    } finally { await rm(cacheRoot, { recursive: true, force: true }) }
  })

  it('reports the exact cache size before deletion', async () => {
    const cacheRoot = await mkdtemp(join(tmpdir(), 'short-drama-cache-size-')); const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); databases.push(database); migrateDatabase(database)
    try {
      const service = new DramaService(database, cacheRoot); const drama = service.create('Cached size')
      await writeFile(join(cacheRoot, drama.id, 'analysis.json'), '12345', 'utf8')
      expect(service.estimateCacheBytes(drama.id)).toBe(5)
    } finally { await rm(cacheRoot, { recursive: true, force: true }) }
  })

  it('persists drama data after closing and reopening a disk database', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'short-drama-persistence-')); const path = join(folder, 'data.sqlite')
    try { const first = openDatabase(path); new DramaService(first).create('Persistent drama'); first.close(); const second = openDatabase(path); expect(new DramaService(second).list()[0]?.name).toBe('Persistent drama'); second.close() } finally { await rm(folder, { recursive: true, force: true }) }
  })

  it('clears stale timing metadata but retains the last known frame when an episode is relocated to an unavailable path', async () => {
    const service = setup(); const drama = service.create('Relink'); const { drama: detail } = await service.importEpisodes(drama.id, ['01.mp4']); const episode = detail.episodes[0]
    if (!episode) throw new Error('episode missing')
    const database = (service as unknown as { database: Database.Database }).database
    database.prepare('UPDATE episodes SET video_width = ?, video_height = ? WHERE id = ?').run(180, 320, episode.id)
    const updated = await service.updateEpisode(drama.id, episode.id, { episodeNo: 1, sortOrder: 0, sourcePath: 'new-location.mp4' })
    expect(updated.episodes[0]?.status).toBe('missing'); expect(updated.episodes[0]?.durationSeconds).toBeNull(); expect(updated.episodes[0]?.fps).toBeNull(); expect(updated.episodes[0]?.videoWidth).toBe(180); expect(updated.episodes[0]?.videoHeight).toBe(320)
  })

  it('removes application task references for a deleted episode without touching its source file', async () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); databases.push(database); migrateDatabase(database)
    const service = new DramaService(database); const drama = service.create('Task reference')
    const imported = await service.importEpisodes(drama.id, ['01.mp4']); const episode = imported.drama.episodes[0]
    if (!episode) throw new Error('episode missing')
    const now = new Date().toISOString()
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('task-1', drama.id, 'original_clip', JSON.stringify({ episodeId: episode.id }), 'reviewing', 0, 1, now, now)
    database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('item-1', 'task-1', JSON.stringify({ episodeId: episode.id, startSeconds: 0, endSeconds: 10 }), 'pending_review', now, now)
    service.removeEpisode(drama.id, episode.id)
    expect(database.prepare('SELECT COUNT(*) AS count FROM task_items WHERE id = ?').get('item-1')).toEqual({ count: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM production_tasks WHERE id = ?').get('task-1')).toEqual({ count: 0 })
  })

  it('prevents duplicate drama identities without changing existing projects', () => {
    const service = setup()
    service.create('同名剧目')
    expect(() => service.create(' 同名剧目 ')).toThrow('已存在同名剧目')
  })

  it('keeps generated materials and refreshes script links when an episode is removed', async () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); databases.push(database); migrateDatabase(database)
    const service = new DramaService(database); const drama = service.create('关联修复')
    const imported = await service.importEpisodes(drama.id, ['01.mp4']); const episode = imported.drama.episodes[0]
    if (!episode) throw new Error('episode missing')
    const now = new Date().toISOString()
    database.prepare('INSERT INTO script_assets (id, drama_id, episode_id, source_path, format, link_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('script-1', drama.id, episode.id, 'script.txt', 'txt', 'linked', now, now)
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('task-2', drama.id, 'original_clip', '{}', 'running', 0, 1, now, now)
    database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('item-2', 'task-2', JSON.stringify({ episodeId: episode.id }), 'running', now, now)
    database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('item-3', 'task-2', JSON.stringify({ episodeId: 'other-episode' }), 'pending', now, now)
    database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('material-1', drama.id, 'task-2', 'item-2', 'result.mp4', now, now)
    service.removeEpisode(drama.id, episode.id)
    expect(database.prepare('SELECT episode_id, link_status FROM script_assets WHERE id = ?').get('script-1')).toEqual({ episode_id: null, link_status: 'unlinked' })
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get('task-2')).toEqual({ status: 'partial' })
    expect(database.prepare('SELECT task_id, task_item_id FROM generated_materials WHERE id = ?').get('material-1')).toEqual({ task_id: 'task-2', task_item_id: null })
  })

  it('marks a multi-episode task partial and skips the affected range when an episode is removed', async () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); databases.push(database); migrateDatabase(database)
    const service = new DramaService(database); const drama = service.create('多集拼接关联修复')
    const imported = await service.importEpisodes(drama.id, ['01.mp4', '02.mp4']); const episode = imported.drama.episodes[0]
    if (!episode) throw new Error('episode missing')
    const now = new Date().toISOString()
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('multi-task', drama.id, 'multi_episode', '{}', 'completed', 1, 1, now, now)
    database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('multi-item', 'multi-task', JSON.stringify({ episodeNumbers: [1, 2] }), 'completed', now, now)
    database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('multi-material', drama.id, 'multi-task', 'multi-item', 'multi-result.mp4', now, now)
    service.removeEpisode(drama.id, episode.id)
    expect(database.prepare('SELECT status, reason FROM task_items WHERE id = ?').get('multi-item')).toEqual({ status: 'skipped', reason: '关联剧集已删除，请重建任务。' })
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get('multi-task')).toEqual({ status: 'partial' })
    expect(database.prepare('SELECT task_id, task_item_id FROM generated_materials WHERE id = ?').get('multi-material')).toEqual({ task_id: 'multi-task', task_item_id: 'multi-item' })
  })

  it('marks an AI remix range task partial and skips the affected range when an episode is removed', async () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); databases.push(database); migrateDatabase(database)
    const service = new DramaService(database); const drama = service.create('二创关联修复')
    const imported = await service.importEpisodes(drama.id, ['01.mp4', '02.mp4']); const episode = imported.drama.episodes[0]
    if (!episode) throw new Error('episode missing')
    const now = new Date().toISOString()
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('remix-task', drama.id, 'ai_remix', '{}', 'completed', 1, 1, now, now)
    database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('remix-item', 'remix-task', JSON.stringify({ episodeStart: 1, episodeEnd: 2 }), 'completed', now, now)
    database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('remix-material', drama.id, 'remix-task', 'remix-item', 'remix-result.mp4', now, now)
    service.removeEpisode(drama.id, episode.id)
    expect(database.prepare('SELECT status, reason FROM task_items WHERE id = ?').get('remix-item')).toEqual({ status: 'skipped', reason: '关联剧集已删除，请重建任务。' })
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get('remix-task')).toEqual({ status: 'partial' })
    expect(database.prepare('SELECT task_id, task_item_id FROM generated_materials WHERE id = ?').get('remix-material')).toEqual({ task_id: 'remix-task', task_item_id: 'remix-item' })
  })
})
