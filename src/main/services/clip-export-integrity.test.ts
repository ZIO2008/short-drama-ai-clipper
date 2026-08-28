import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import ffmpegModule from 'ffmpeg-static'
import { describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { runMediaProcess } from '../media/ffmpeg-runner.js'
import { OriginalClipService } from './original-clip-service.js'

const ffmpegPath = typeof ffmpegModule === 'string' ? ffmpegModule : (ffmpegModule as unknown as { default?: string }).default ?? ''
const sha256 = async (path: string): Promise<string> => createHash('sha256').update(await readFile(path)).digest('hex')

describe('original clip export integrity', () => {
  it('removes a rejected real output, registers no material and never changes the source', async () => {
    if (!ffmpegPath || !existsSync(ffmpegPath)) throw new Error('static ffmpeg unavailable')
    const root = await mkdtemp(join(tmpdir(), 'clip-export-integrity-')); const sourcePath = join(root, 'source.mp4'); const output = join(root, 'output'); const previousFfmpeg = process.env.SHORTDRAMA_FFMPEG_PATH
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    process.env.SHORTDRAMA_FFMPEG_PATH = ffmpegPath
    try {
      expect((await runMediaProcess(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', sourcePath])).exitCode).toBe(0)
      const sourceHash = await sha256(sourcePath); const now = new Date().toISOString(); database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now); database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, sourcePath, 1, 'ready', now, now)
      const service = new OriginalClipService(database); const candidate = service.createCandidate('d', 'e', { startSeconds: 0, endSeconds: 0.8 }); service.confirmCandidate(candidate.id)
      vi.spyOn(service as unknown as { assertFinalOutputDuration: () => void }, 'assertFinalOutputDuration').mockImplementation(() => { throw new Error('模拟最终边界验证失败') })

      await expect(service.exportCandidate(candidate.id, output)).rejects.toThrow('模拟最终边界验证失败')

      expect(await sha256(sourcePath)).toBe(sourceHash)
      expect(database.prepare('SELECT status FROM task_items WHERE id = ?').get(candidate.id)).toEqual({ status: 'failed' })
      expect(database.prepare('SELECT COUNT(*) AS count FROM generated_materials').get()).toEqual({ count: 0 })
      expect((await readdir(output)).filter((name) => name.endsWith('.mp4'))).toEqual([])
    } finally { if (previousFfmpeg === undefined) delete process.env.SHORTDRAMA_FFMPEG_PATH; else process.env.SHORTDRAMA_FFMPEG_PATH = previousFfmpeg; database.close(); await rm(root, { recursive: true, force: true }) }
  }, 30_000)
})
