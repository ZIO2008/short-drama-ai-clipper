import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import ffmpegModule from 'ffmpeg-static'
import { path as ffprobePath } from 'ffprobe-static'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../../src/main/db/migrate.js'
import { runMediaProcess } from '../../src/main/media/ffmpeg-runner.js'
import { OriginalClipService } from '../../src/main/services/original-clip-service.js'

const ffmpegPath = typeof ffmpegModule === 'string' ? ffmpegModule : (ffmpegModule as unknown as { default?: string }).default ?? null

describe('original clip retry integration', () => {
  it('persists the export snapshot and retries a failed candidate through the original-clip task path', async () => {
    if (!ffmpegPath || !existsSync(ffmpegPath) || !existsSync(ffprobePath)) throw new Error('static media tools are unavailable')
    const folder = await mkdtemp(join(tmpdir(), 'original-clip-retry-'))
    const sourcePath = join(folder, 'episode.mp4'); const outputDirectory = join(folder, 'output')
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const oldFfmpeg = process.env.SHORTDRAMA_FFMPEG_PATH; const oldFfprobe = process.env.SHORTDRAMA_FFPROBE_PATH
    process.env.SHORTDRAMA_FFMPEG_PATH = ffmpegPath; process.env.SHORTDRAMA_FFPROBE_PATH = ffprobePath
    try {
      expect((await runMediaProcess(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', sourcePath])).exitCode).toBe(0)
      const now = new Date().toISOString()
      database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '重试测试剧目', now, now)
      database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('episode', 'drama', 1, 0, sourcePath, 1, 'ready', now, now)
      const service = new OriginalClipService(database); const candidate = service.createCandidate('drama', 'episode', { startSeconds: 0, endSeconds: 0.8 }); service.confirmCandidate(candidate.id)
      const task = database.prepare('SELECT task_id AS taskId FROM task_items WHERE id = ?').get(candidate.id) as { taskId: string }
      const brokenFfmpeg = join(folder, 'missing-ffmpeg.exe'); const configuredFfmpeg = process.env.SHORTDRAMA_FFMPEG_PATH
      process.env.SHORTDRAMA_FFMPEG_PATH = brokenFfmpeg
      await expect(service.exportCandidates('drama', { candidateIds: [candidate.id], outputDirectory, namingPattern: 'retry_{candidate}', encoding: 'h264-balanced', outputSize: '1920x1080', subtitleStrategy: 'none', conflictStrategy: 'append' })).resolves.toEqual([expect.objectContaining({ candidateId: candidate.id, status: 'failed' })])
      process.env.SHORTDRAMA_FFMPEG_PATH = ffmpegPath
      expect(database.prepare('SELECT config_snapshot AS configSnapshot FROM production_tasks WHERE id = ?').get(task.taskId)).toEqual({ configSnapshot: expect.stringContaining('retry_{candidate}') })
      const result = await service.retryFailedTask(task.taskId)
      expect(result.status).toBe('completed')
      expect(database.prepare('SELECT status, progress_current AS progressCurrent FROM production_tasks WHERE id = ?').get(task.taskId)).toEqual({ status: 'completed', progressCurrent: 1 })
      expect(database.prepare('SELECT status FROM task_items WHERE id = ?').get(candidate.id)).toEqual({ status: 'exported' })
      const material = database.prepare('SELECT path FROM generated_materials WHERE task_item_id = ?').get(candidate.id) as { path: string }
      expect(existsSync(material.path)).toBe(true)
      process.env.SHORTDRAMA_FFMPEG_PATH = configuredFfmpeg
    } finally {
      if (oldFfmpeg === undefined) delete process.env.SHORTDRAMA_FFMPEG_PATH; else process.env.SHORTDRAMA_FFMPEG_PATH = oldFfmpeg
      if (oldFfprobe === undefined) delete process.env.SHORTDRAMA_FFPROBE_PATH; else process.env.SHORTDRAMA_FFPROBE_PATH = oldFfprobe
      database.close(); await rm(folder, { recursive: true, force: true })
    }
  }, 30_000)
})
