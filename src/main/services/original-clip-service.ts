import { randomUUID } from 'node:crypto'
import { mkdir, stat } from 'node:fs/promises'
import { dirname, extname, join, basename } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { probeMedia } from '../media/media-probe.js'
import { assertSuccessfulProcess, runMediaProcess } from '../media/ffmpeg-runner.js'

export type ClipCandidate = { id: string; episodeId: string; startSeconds: number; endSeconds: number; status: 'pending_review' | 'editing' | 'confirmed' | 'exporting' | 'exported' | 'failed'; reason: string | null }
const rangeSchema = z.object({ startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().positive() }).refine((range) => range.endSeconds > range.startSeconds, 'End must be after start')

export class OriginalClipService {
  constructor(private readonly database: Database.Database) {}

  createCandidate(dramaId: unknown, episodeId: unknown, range: unknown): ClipCandidate {
    const drama = z.string().trim().min(1).parse(dramaId); const episode = z.string().trim().min(1).parse(episodeId); const value = rangeSchema.parse(range)
    const row = this.database.prepare('SELECT source_path, duration_seconds FROM episodes WHERE id = ? AND drama_id = ?').get(episode, drama) as { source_path: string; duration_seconds: number | null } | undefined
    if (!row) throw new Error('Episode not found')
    if (row.duration_seconds !== null && value.endSeconds > row.duration_seconds + 0.05) throw new Error('Clip range exceeds episode duration')
    const taskId = randomUUID(); const itemId = randomUUID(); const now = new Date().toISOString()
    this.database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(taskId, drama, 'original_clip', JSON.stringify({ episodeId: episode }), 'reviewing', 0, 1, now, now)
    this.database.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)').run(itemId, taskId, JSON.stringify({ episodeId: episode, ...value }), 'pending_review', now, now)
    return { id: itemId, episodeId: episode, startSeconds: value.startSeconds, endSeconds: value.endSeconds, status: 'pending_review', reason: null }
  }

  confirmCandidate(candidateId: unknown): ClipCandidate {
    const id = z.string().trim().min(1).parse(candidateId); const now = new Date().toISOString()
    const result = this.database.prepare('UPDATE task_items SET status = ?, updated_at = ? WHERE id = ? AND status IN (?, ?)').run('confirmed', now, id, 'pending_review', 'editing')
    if (result.changes === 0) throw new Error('Candidate is not editable')
    return this.getCandidate(id)
  }

  getCandidate(candidateId: string): ClipCandidate {
    const row = this.database.prepare('SELECT id, planned_range, status, reason FROM task_items WHERE id = ?').get(candidateId) as { id: string; planned_range: string; status: ClipCandidate['status']; reason: string | null } | undefined
    if (!row) throw new Error('Candidate not found')
    const range = JSON.parse(row.planned_range) as { episodeId: string; startSeconds: number; endSeconds: number }
    return { id: row.id, episodeId: range.episodeId, startSeconds: range.startSeconds, endSeconds: range.endSeconds, status: row.status, reason: row.reason }
  }

  async exportCandidate(candidateId: unknown, outputDirectory: unknown): Promise<{ candidate: ClipCandidate; outputPath: string }> {
    const id = z.string().trim().min(1).parse(candidateId); const directory = z.string().trim().min(1).parse(outputDirectory); const candidate = this.getCandidate(id)
    if (candidate.status !== 'confirmed') throw new Error('Confirm the candidate before export')
    const source = this.database.prepare(`SELECT e.source_path, t.drama_id FROM episodes e JOIN task_items i ON json_extract(i.planned_range, '$.episodeId') = e.id JOIN production_tasks t ON t.id = i.task_id WHERE i.id = ?`).get(id) as { source_path: string; drama_id: string } | undefined
    if (!source) throw new Error('Source episode not found')
    await mkdir(directory, { recursive: true }); const outputPath = await uniqueOutputPath(directory, `clip-${id.slice(0, 8)}.mp4`); const now = new Date().toISOString()
    this.database.prepare('UPDATE task_items SET status = ?, updated_at = ? WHERE id = ?').run('exporting', now, id)
    try {
      const result = await runMediaProcess(process.env.SHORTDRAMA_FFMPEG_PATH ?? 'ffmpeg', ['-y', '-ss', String(candidate.startSeconds), '-to', String(candidate.endSeconds), '-i', source.source_path, '-c', 'copy', outputPath])
      assertSuccessfulProcess(result); const metadata = await probeMedia(outputPath); const task = this.database.prepare('SELECT task_id FROM task_items WHERE id = ?').get(id) as { task_id: string }
      this.database.prepare('UPDATE task_items SET status = ?, actual_range = ?, updated_at = ? WHERE id = ?').run('exported', JSON.stringify({ startSeconds: candidate.startSeconds, endSeconds: candidate.endSeconds }), now, id)
      this.database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, duration_seconds, fps, size_bytes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), source.drama_id, task.task_id, id, outputPath, metadata.durationSeconds, metadata.fps, (await stat(outputPath)).size, now, now)
      return { candidate: this.getCandidate(id), outputPath }
    } catch (error) { this.database.prepare('UPDATE task_items SET status = ?, reason = ?, updated_at = ? WHERE id = ?').run('failed', error instanceof Error ? error.message : 'Export failed', new Date().toISOString(), id); throw error }
  }
}

const uniqueOutputPath = async (directory: string, fileName: string): Promise<string> => { let index = 0; while (true) { const suffix = index === 0 ? '' : `_${String(index + 1).padStart(2, '0')}`; const path = join(directory, `${basename(fileName, extname(fileName))}${suffix}${extname(fileName)}`); try { await stat(path); index += 1 } catch { return path } } }
