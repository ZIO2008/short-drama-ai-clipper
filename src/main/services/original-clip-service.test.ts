import Database from 'better-sqlite3'
import { copyFile, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { OriginalClipService } from './original-clip-service.js'
import { recordMockedClipExport } from '../../../tests/helpers/record-mocked-clip-export.js'
import { persistClipExportConfig, readClipExportConfig } from './clip-export-task-config.js'
import ffmpegModule from 'ffmpeg-static'
import ffprobeModule from 'ffprobe-static'
import { runMediaProcess } from '../media/ffmpeg-runner.js'

const ffmpegPath = typeof ffmpegModule === 'string' ? ffmpegModule : (ffmpegModule as unknown as { default?: string }).default ?? ''
const ffprobePath = ffprobeModule.path

describe('OriginalClipService', () => {
  it('creates and confirms a bounded candidate with traceable task item', () => {
    const db = new Database(':memory:'); db.pragma('foreign_keys = ON'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 10, 'available', now, now)
    const service = new OriginalClipService(db); const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 }); expect(candidate.status).toBe('pending_review'); expect(service.confirmCandidate(candidate.id).status).toBe('confirmed'); expect(db.prepare('SELECT COUNT(*) AS count FROM production_tasks').get()).toEqual({ count: 1 }); db.close()
  })
  it('rejects ranges beyond known episode duration', () => { const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 2, 'ready', now, now); expect(() => new OriginalClipService(db).createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 })).toThrow('exceeds'); db.close() })
  it('creates one traceable batch task for candidates across multiple source episodes', () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    for (const id of ['e1', 'e2']) db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, 'd', Number(id.slice(1)), 0, `${id}.mp4`, 10, 'ready', now, now)
    const candidates = new OriginalClipService(db).createCandidates('d', [{ episodeId: 'e1', startSeconds: 1, endSeconds: 3 }, { episodeId: 'e2', startSeconds: 2, endSeconds: 4 }])
    expect(candidates.map(({ episodeId }) => episodeId)).toEqual(['e1', 'e2']); expect(db.prepare("SELECT progress_total AS progressTotal, status FROM production_tasks WHERE type = 'original_clip'").get()).toEqual({ progressTotal: 2, status: 'reviewing' }); expect(db.prepare('SELECT COUNT(*) AS count FROM task_items').get()).toEqual({ count: 2 }); db.close()
  })
  it('lists candidates in immutable creation order so later generation cannot renumber older C-xx rows', () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 80, 'ready', now, now)
    const service = new OriginalClipService(db); const older = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 }); const newer = service.createCandidate('d', 'e', { startSeconds: 8, endSeconds: 11 })
    db.prepare('UPDATE task_items SET created_at = ? WHERE id = ?').run('2026-07-31T00:00:00.000Z', older.id)
    db.prepare('UPDATE task_items SET created_at = ? WHERE id = ?').run('2026-07-31T00:01:00.000Z', newer.id)
    expect(service.listCandidates('d').map((candidate) => candidate.id)).toEqual([older.id, newer.id])
    expect(service.listCandidates('d').map((candidate) => candidate.createdAt)).toEqual(['2026-07-31T00:00:00.000Z', '2026-07-31T00:01:00.000Z'])
    db.close()
  })
  it('deletes an unexported candidate and its subtitle variants without touching the source episode', () => {
    const db = new Database(':memory:'); db.pragma('foreign_keys = ON'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 10, 'ready', now, now)
    const service = new OriginalClipService(db); const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 }); db.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, source_kind, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, ?, 'asr', ?, 'zh-CN', 'active', 0, '{}', ?, ?)").run('track', 'd', 'e', 'ASR', now, now); service.saveSubtitleVariant({ candidateId: candidate.id, text: '展示文字', startSeconds: 0, endSeconds: 2, sourceTrackIds: ['track'], reason: '人工校验' })
    service.deleteCandidate(candidate.id)
    expect(service.listCandidates('d')).toEqual([]); expect(db.prepare('SELECT COUNT(*) AS count FROM clip_subtitle_variants').get()).toEqual({ count: 0 }); expect(db.prepare('SELECT source_path AS sourcePath FROM episodes WHERE id = ?').get('e')).toEqual({ sourcePath: 'episode.mp4' }); db.close()
  })
  it('refuses to delete candidates that are exporting or exported', () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 10, 'ready', now, now)
    const service = new OriginalClipService(db); const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 }); db.prepare("UPDATE task_items SET status = 'exporting' WHERE id = ?").run(candidate.id); expect(() => service.deleteCandidate(candidate.id)).toThrow('正在导出'); db.prepare("UPDATE task_items SET status = 'exported' WHERE id = ?").run(candidate.id); expect(() => service.deleteCandidate(candidate.id)).toThrow('已导出候选'); expect(service.listCandidates('d')).toHaveLength(1); db.close()
  })
  it('returns a partially exported candidate task to review instead of leaving a phantom running task', () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    for (const id of ['e1', 'e2']) db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, 'd', Number(id.slice(1)), 0, `${id}.mp4`, 10, 'ready', now, now)
    const service = new OriginalClipService(db); const candidates = service.createCandidates('d', [{ episodeId: 'e1', startSeconds: 1, endSeconds: 3 }, { episodeId: 'e2', startSeconds: 2, endSeconds: 4 }]); const task = db.prepare('SELECT task_id AS taskId FROM task_items WHERE id = ?').get(candidates[0]!.id) as { taskId: string }
    db.prepare("UPDATE task_items SET status = 'exported' WHERE id = ?").run(candidates[0]!.id)
    ;(service as unknown as { refreshTask: (taskId: string) => void }).refreshTask(task.taskId)
    expect(db.prepare('SELECT status, progress_current AS progressCurrent FROM production_tasks WHERE id = ?').get(task.taskId)).toEqual({ status: 'reviewing', progressCurrent: 1 })
    db.close()
  })
  it('rejects an invalid batch before any task or item is persisted', () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 2, 'ready', now, now)
    expect(() => new OriginalClipService(db).createCandidates('d', [{ episodeId: 'e', startSeconds: 0, endSeconds: 1 }, { episodeId: 'e', startSeconds: 1, endSeconds: 4 }])).toThrow('exceeds')
    expect(db.prepare("SELECT COUNT(*) AS count FROM production_tasks WHERE type = 'original_clip'").get()).toEqual({ count: 0 }); expect(db.prepare('SELECT COUNT(*) AS count FROM task_items').get()).toEqual({ count: 0 }); db.close()
  })
  it('permanently closes the legacy anchor-only generation entry without writing candidates', () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 80, 'ready', now, now)
    const service = new OriginalClipService(db); const input = { episodeIds: ['e'], candidatesPerEpisode: 3, targetDurationSeconds: 10, maxOverlapRatio: 0.25, allowRepeat: false }
    expect(service.preflightGeneration('d', input)).toMatchObject({ eligibleEpisodeIds: [], estimatedCandidates: 0 })
    expect(() => service.generateCandidates('d', input)).toThrow('入口已关闭')
    expect(service.listCandidates('d')).toEqual([]); expect(db.prepare("SELECT COUNT(*) AS count FROM production_tasks WHERE type = 'original_clip'").get()).toEqual({ count: 0 }); db.close()
  })

  it('preflights multiple episodes and reports media that must be skipped without creating candidates', () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('ready', 'd', 1, 0, 'ready.mp4', 80, 'ready', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('missing', 'd', 2, 1, 'missing.mp4', null, 'missing', now, now)
    const service = new OriginalClipService(db, undefined, { profiles: { list: () => [{ id: 'text', capability: 'text-analysis' as const, region: 'local' as const, provider: 'fixture', endpoint: 'http://127.0.0.1:3000', model: 'fixture', secretRef: null, timeoutMs: 1000, pricing: null }] }, hasValidSecret: () => false, adapter: { select: async () => ({ narrativeEvents: [], selections: [] }) } }); const preflight = service.preflightGeneration('d', { episodeIds: ['ready', 'missing'], candidatesPerEpisode: 5, targetDurationSeconds: 15, maxOverlapRatio: 0.25, allowRepeat: false })
    expect(preflight).toMatchObject({ eligibleEpisodeIds: [], requestedCandidates: 10, estimatedCandidates: 0, skipped: expect.arrayContaining([{ episodeId: 'ready', reason: expect.stringContaining('没有导入、OCR 或已验证 ASR') }, { episodeId: 'missing', reason: '媒体未就绪，已跳过。' }]) }); expect(service.listCandidates('d')).toEqual([]); db.close()
  })

  it('blocks an unavailable text semantic capability before task creation and preserves existing candidates', () => {
    const db = new Database(':memory:'); migrateDatabase(db)
    const now = new Date().toISOString()
    db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 80, 'ready', now, now)
    const adapter = { select: vi.fn(async () => ({ narrativeEvents: [], selections: [] })) }
    const service = new OriginalClipService(db, undefined, { profiles: { list: () => [] }, hasValidSecret: () => false, adapter })
    const anchorReadiness = vi.spyOn(service as unknown as { anchorReadiness: () => unknown }, 'anchorReadiness')
    const existing = service.createCandidate('d', 'e', { startSeconds: 10, endSeconds: 20 })
    const beforeTasks = db.prepare("SELECT COUNT(*) AS count FROM production_tasks WHERE type = 'original_clip' AND json_extract(config_snapshot, '$.generation') IS NOT NULL").get() as { count: number }
    const input = { episodeIds: ['e'], candidatesPerEpisode: 1, targetDurationSeconds: 10, maxOverlapRatio: 0.25, allowRepeat: false }

    expect(service.preflightGeneration('d', input)).toMatchObject({ eligibleEpisodeIds: [], estimatedCandidates: 0, skipped: [{ episodeId: 'e', reason: expect.stringContaining('未配置文本语义分析能力') }] })
    expect(() => service.startIntelligentGeneration('d', input)).toThrow('未配置文本语义分析能力')
    expect(anchorReadiness).not.toHaveBeenCalled(); expect(adapter.select).not.toHaveBeenCalled()
    expect(service.listCandidates('d').map((candidate) => candidate.id)).toEqual([existing.id])
    expect(db.prepare("SELECT COUNT(*) AS count FROM production_tasks WHERE type = 'original_clip' AND json_extract(config_snapshot, '$.generation') IS NOT NULL").get()).toEqual(beforeTasks)
    db.close()
  })

  it('blocks an uninitialized text semantic capability before anchor preflight and preserves existing candidates', () => {
    const db = new Database(':memory:'); migrateDatabase(db)
    const now = new Date().toISOString()
    db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 80, 'ready', now, now)
    const service = new OriginalClipService(db)
    const anchorReadiness = vi.spyOn(service as unknown as { anchorReadiness: () => unknown }, 'anchorReadiness')
    const existing = service.createCandidate('d', 'e', { startSeconds: 10, endSeconds: 20 })
    const beforeTasks = db.prepare("SELECT COUNT(*) AS count FROM production_tasks WHERE type = 'original_clip' AND json_extract(config_snapshot, '$.generation') IS NOT NULL").get() as { count: number }
    const input = { episodeIds: ['e'], candidatesPerEpisode: 1, targetDurationSeconds: 10, maxOverlapRatio: 0.25, allowRepeat: false }

    expect(service.preflightGeneration('d', input)).toMatchObject({ eligibleEpisodeIds: [], estimatedCandidates: 0, skipped: [{ episodeId: 'e', reason: expect.stringContaining('未初始化') }] })
    expect(() => service.startIntelligentGeneration('d', input)).toThrow('未初始化')
    expect(anchorReadiness).not.toHaveBeenCalled()
    expect(service.listCandidates('d').map((candidate) => candidate.id)).toEqual([existing.id])
    expect(db.prepare("SELECT COUNT(*) AS count FROM production_tasks WHERE type = 'original_clip' AND json_extract(config_snapshot, '$.generation') IS NOT NULL").get()).toEqual(beforeTasks)
    db.close()
  })

  it('blocks invalid semantic credentials or endpoint before task creation and preserves existing candidates', () => {
    const cases = [
      { name: 'remote profile without a secret reference', profile: { id: 'text', capability: 'text-analysis' as const, region: 'cn' as const, provider: 'fixture', endpoint: 'https://example.invalid', model: 'fixture', secretRef: null, timeoutMs: 1000, pricing: null }, hasValidSecret: () => false, expected: '缺少可用密钥' },
      { name: 'remote profile with an invalid secret reference', profile: { id: 'text', capability: 'text-analysis' as const, region: 'cn' as const, provider: 'fixture', endpoint: 'https://example.invalid', model: 'fixture', secretRef: 'missing-secret', timeoutMs: 1000, pricing: null }, hasValidSecret: () => false, expected: '缺少可用密钥' },
      { name: 'local profile without an endpoint', profile: { id: 'text', capability: 'text-analysis' as const, region: 'local' as const, provider: 'fixture', endpoint: '', model: 'fixture', secretRef: null, timeoutMs: 1000, pricing: null }, hasValidSecret: () => false, expected: '缺少可调用地址' },
    ]
    for (const scenario of cases) {
      const db = new Database(':memory:'); migrateDatabase(db)
      const now = new Date().toISOString()
      db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
      db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 80, 'ready', now, now)
      const adapter = { select: vi.fn(async () => ({ narrativeEvents: [], selections: [] })) }
      const service = new OriginalClipService(db, undefined, { profiles: { list: () => [scenario.profile] }, hasValidSecret: scenario.hasValidSecret, adapter })
      const anchorReadiness = vi.spyOn(service as unknown as { anchorReadiness: () => unknown }, 'anchorReadiness')
      const existing = service.createCandidate('d', 'e', { startSeconds: 10, endSeconds: 20 })
      const beforeTasks = db.prepare("SELECT COUNT(*) AS count FROM production_tasks WHERE type = 'original_clip' AND json_extract(config_snapshot, '$.generation') IS NOT NULL").get() as { count: number }
      const input = { episodeIds: ['e'], candidatesPerEpisode: 1, targetDurationSeconds: 10, maxOverlapRatio: 0.25, allowRepeat: false }

      expect(service.preflightGeneration('d', input), scenario.name).toMatchObject({ eligibleEpisodeIds: [], estimatedCandidates: 0, skipped: [{ episodeId: 'e', reason: expect.stringContaining(scenario.expected) }] })
      expect(() => service.startIntelligentGeneration('d', input), scenario.name).toThrow(scenario.expected)
      expect(anchorReadiness, scenario.name).not.toHaveBeenCalled(); expect(adapter.select, scenario.name).not.toHaveBeenCalled()
      expect(service.listCandidates('d').map((candidate) => candidate.id), scenario.name).toEqual([existing.id])
      expect(db.prepare("SELECT COUNT(*) AS count FROM production_tasks WHERE type = 'original_clip' AND json_extract(config_snapshot, '$.generation') IS NOT NULL").get(), scenario.name).toEqual(beforeTasks)
      db.close()
    }
  })

  it('requires confirmation and source-backed subtitle variants during export preflight', () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 30, 'ready', now, now)
    const service = new OriginalClipService(db); const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 }); const baseConfig = { candidateIds: [candidate.id], outputDirectory: 'D:\\out', namingPattern: 'E{episode}_C{candidate}', encoding: 'copy' as const, outputSize: 'source' as const, subtitleStrategy: 'none' as const, conflictStrategy: 'append' as const }
    db.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, source_kind, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, ?, 'asr', ?, 'zh-CN', 'active', 0, '{}', ?, ?)").run('asr', 'd', 'e', 'ASR', now, now)
    service.saveSubtitleVariant({ candidateId: candidate.id, text: '展示文字', startSeconds: 0, endSeconds: 2, sourceTrackIds: ['asr'], reason: '压缩口播' })
    expect(service.preflightExport('d', baseConfig).blocked[0]?.reason).toContain('尚未确认'); service.confirmCandidate(candidate.id)
    expect(service.preflightExport('d', { ...baseConfig, subtitleStrategy: 'soft' }).blocked).toEqual([]); db.close()
  })
  it('rejects duplicate candidates and atomically claims a candidate for one export batch', () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 30, 'ready', now, now)
    const service = new OriginalClipService(db); const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 }); service.confirmCandidate(candidate.id)
    const config = { candidateIds: [candidate.id], outputDirectory: 'D:\\out', namingPattern: 'E{episode}_C{candidate}', encoding: 'copy' as const, outputSize: 'source' as const, subtitleStrategy: 'none' as const, conflictStrategy: 'append' as const }
    expect(() => service.preflightExport('d', { ...config, candidateIds: [candidate.id, candidate.id] })).toThrow('不能重复')
    const internals = service as unknown as { beginExportBatch: (dramaId: string, candidateIds: string[], allowedStatuses: Array<'confirmed' | 'failed'>) => string; releaseExportCandidates: (batchId: string, candidateIds: string[]) => void }
    const batchId = internals.beginExportBatch('d', [candidate.id], ['confirmed'])
    expect(db.prepare('SELECT status, export_batch_id AS exportBatchId FROM task_items WHERE id = ?').get(candidate.id)).toEqual({ status: 'exporting', exportBatchId: batchId })
    expect(() => internals.beginExportBatch('d', [candidate.id], ['confirmed'])).toThrow('已在导出')
    expect(db.prepare('SELECT status FROM clip_export_batches WHERE id = ?').get(batchId)).toEqual({ status: 'running' })
    internals.releaseExportCandidates(batchId, [candidate.id])
    expect(db.prepare('SELECT status, export_batch_id AS exportBatchId FROM task_items WHERE id = ?').get(candidate.id)).toEqual({ status: 'confirmed', exportBatchId: null })
    const cancelledBatch = internals.beginExportBatch('d', [candidate.id], ['confirmed'])
    internals.releaseExportCandidates(cancelledBatch, [candidate.id])
    const nextBatch = internals.beginExportBatch('d', [candidate.id], ['confirmed'])
    internals.releaseExportCandidates(cancelledBatch, [candidate.id])
    expect(db.prepare('SELECT status, export_batch_id AS exportBatchId FROM task_items WHERE id = ?').get(candidate.id)).toEqual({ status: 'exporting', exportBatchId: nextBatch })
    internals.releaseExportCandidates(nextBatch, [candidate.id])
    db.close()
  })

  it('returns the latest completed batch even after a newer cancelled or failed batch', () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    db.prepare('INSERT INTO clip_export_batches (id, drama_id, candidate_ids_json, status, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('completed', 'd', '["candidate-completed"]', 'completed', null, '2026-07-31T00:00:00.000Z', '2026-07-31T00:01:00.000Z')
    db.prepare('INSERT INTO clip_export_batches (id, drama_id, candidate_ids_json, status, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('failed', 'd', '["candidate-failed"]', 'failed', 'FFmpeg 不可用', '2026-07-31T00:02:00.000Z', '2026-07-31T00:03:00.000Z')
    db.prepare('INSERT INTO clip_export_batches (id, drama_id, candidate_ids_json, status, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('cancelled', 'd', '["candidate-cancelled"]', 'cancelled', '用户取消', '2026-07-31T00:04:00.000Z', '2026-07-31T00:05:00.000Z')
    expect(new OriginalClipService(db).getLatestExportBatch('d')).toMatchObject({ id: 'cancelled', candidateIds: ['candidate-cancelled'], status: 'cancelled' })
    db.close()
  })
  it('cancels interrupted batches on service restart and releases only candidates that batch still owns', () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString()
    db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    for (const id of ['e1', 'e2']) db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, 'd', Number(id.slice(1)), 0, `${id}.mp4`, 10, 'ready', now, now)
    const service = new OriginalClipService(db); const [interrupted, completed] = service.createCandidates('d', [{ episodeId: 'e1', startSeconds: 1, endSeconds: 4 }, { episodeId: 'e2', startSeconds: 1, endSeconds: 4 }])
    if (!interrupted || !completed) throw new Error('fixture candidates missing')
    service.confirmCandidate(interrupted.id); service.confirmCandidate(completed.id)
    const internals = service as unknown as { beginExportBatch: (dramaId: string, candidateIds: string[], allowedStatuses: Array<'confirmed' | 'failed'>) => string }
    const batchId = internals.beginExportBatch('d', [interrupted.id, completed.id], ['confirmed'])
    db.prepare('UPDATE task_items SET status = ?, export_batch_id = NULL WHERE id = ?').run('exported', completed.id)

    new OriginalClipService(db)

    expect(db.prepare('SELECT status, export_batch_id AS exportBatchId, reason FROM task_items WHERE id = ?').get(interrupted.id)).toEqual({ status: 'confirmed', exportBatchId: null, reason: null })
    expect(db.prepare('SELECT status, export_batch_id AS exportBatchId FROM task_items WHERE id = ?').get(completed.id)).toEqual({ status: 'exported', exportBatchId: null })
    expect(db.prepare('SELECT status, reason FROM clip_export_batches WHERE id = ?').get(batchId)).toEqual({ status: 'cancelled', reason: '应用重启，未完成导出已取消。' })
    expect(db.prepare('SELECT status FROM production_tasks WHERE id = (SELECT task_id FROM task_items WHERE id = ?)').get(interrupted.id)).toEqual({ status: 'reviewing' })
    db.close()
  })
  it('cancels an in-flight batch without leaving its candidate claimed for export', async () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString()
    db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 10, 'ready', now, now)
    const service = new OriginalClipService(db); const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 }); service.confirmCandidate(candidate.id)
    vi.spyOn(service as unknown as { exportCandidateWithConfig: (candidateId: string, config: unknown, batchId: string, signal?: AbortSignal) => Promise<unknown> }, 'exportCandidateWithConfig').mockImplementation(async (_candidateId, _config, _batchId, signal) => await new Promise((_, reject) => signal?.addEventListener('abort', () => setTimeout(() => reject(new Error('aborted')), 25), { once: true })))
    const progress = service.startExportCandidates('d', { candidateIds: [candidate.id], outputDirectory: 'D:\\out', namingPattern: 'E{episode}_C{candidate}', encoding: 'copy', outputSize: 'source', subtitleStrategy: 'none', conflictStrategy: 'append' })
    expect(db.prepare('SELECT status FROM task_items WHERE id = ?').get(candidate.id)).toEqual({ status: 'exporting' })
    expect((await service.cancelExport(progress.exportId)).status).toBe('cancelled')
    expect(db.prepare('SELECT status, export_batch_id AS exportBatchId, reason FROM task_items WHERE id = ?').get(candidate.id)).toEqual({ status: 'confirmed', exportBatchId: null, reason: null })
    expect(db.prepare('SELECT status, reason FROM clip_export_batches').get()).toEqual({ status: 'cancelled', reason: '导出已取消。' })
    db.close()
  })
  it('synchronizes a failed export to its parent task so task-center retry can reach it', async () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString()
    db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 10, 'ready', now, now)
    const service = new OriginalClipService(db); const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 }); service.confirmCandidate(candidate.id)
    const output = await mkdtemp(join(tmpdir(), 'original-clip-failure-')); const previous = process.env.SHORTDRAMA_FFMPEG_PATH
    process.env.SHORTDRAMA_FFMPEG_PATH = join(output, 'missing-ffmpeg.exe')
    try {
      await expect(service.exportCandidate(candidate.id, output)).rejects.toThrow()
      expect(db.prepare('SELECT status, progress_current AS progressCurrent, progress_total AS progressTotal FROM production_tasks').get()).toEqual({ status: 'failed', progressCurrent: 1, progressTotal: 1 })
      expect(db.prepare('SELECT status, reason FROM task_items WHERE id = ?').get(candidate.id)).toEqual(expect.objectContaining({ status: 'failed', reason: expect.any(String) }))
      expect(db.prepare('SELECT status, reason FROM clip_export_batches').get()).toEqual(expect.objectContaining({ status: 'failed', reason: expect.any(String) }))
      expect(db.prepare('SELECT COUNT(*) AS count FROM generated_materials').get()).toEqual({ count: 0 })
    } finally {
      if (previous === undefined) delete process.env.SHORTDRAMA_FFMPEG_PATH; else process.env.SHORTDRAMA_FFMPEG_PATH = previous
      db.close(); await rm(output, { recursive: true, force: true })
    }
  })

  it('refuses to fake-retry a historical task that lacks its export snapshot', async () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString()
    db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 10, 'ready', now, now)
    const service = new OriginalClipService(db); const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 })
    const task = db.prepare('SELECT task_id AS taskId FROM task_items WHERE id = ?').get(candidate.id) as { taskId: string }
    db.prepare("UPDATE task_items SET status = 'failed', reason = '旧任务导出失败' WHERE id = ?").run(candidate.id)
    await expect(service.retryFailedTask(task.taskId)).rejects.toThrow('返回候选池选择输出目录')
    expect(db.prepare('SELECT status FROM task_items WHERE id = ?').get(candidate.id)).toEqual({ status: 'failed' })
    db.close()
  })

  it('retries one failed candidate with its task snapshot, allowing only the output directory to change', async () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString()
    db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 10, 'ready', now, now)
    const service = new OriginalClipService(db); const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 }); const task = db.prepare('SELECT task_id AS taskId FROM task_items WHERE id = ?').get(candidate.id) as { taskId: string }
    persistClipExportConfig(db, { candidateIds: [candidate.id], outputDirectory: 'D:\\first-output', namingPattern: 'quality_E{episode}_{candidate}', encoding: 'h264-quality', outputSize: '1080x1920', subtitleStrategy: 'burn', conflictStrategy: 'append' })
    db.prepare("UPDATE task_items SET status = 'failed', reason = '模拟失败' WHERE id = ?").run(candidate.id)
    const runner = vi.spyOn(service as unknown as { runCandidateItem: (id: string, outputDirectory: string, batchId: string, signal?: AbortSignal, config?: unknown) => Promise<{ status: 'succeeded' }> }, 'runCandidateItem').mockImplementation(async (id, _output, batch) => {
      db.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, duration_seconds, fps, size_bytes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('material', 'd', task.taskId, candidate.id, 'D:\\retry-output\\quality.mp4', 3, 25, 1, now, now)
      recordMockedClipExport(db, batch, id, 'material')
      return { status: 'succeeded' }
    })
    await expect(service.retryFailedCandidate(candidate.id, 'D:\\retry-output')).resolves.toMatchObject({ outputPath: 'D:\\retry-output\\quality.mp4' })
    expect(runner).toHaveBeenCalledWith(candidate.id, 'D:\\retry-output', expect.any(String), undefined, expect.objectContaining({ candidateIds: [candidate.id], outputDirectory: 'D:\\retry-output', namingPattern: 'quality_E{episode}_{candidate}', encoding: 'h264-quality', outputSize: '1080x1920', subtitleStrategy: 'burn', conflictStrategy: 'append' }))
    expect(readClipExportConfig(db, task.taskId)).toEqual({ outputDirectory: 'D:\\retry-output', namingPattern: 'quality_E{episode}_{candidate}', encoding: 'h264-quality', precisionMode: 'final', outputSize: '1080x1920', subtitleStrategy: 'burn', conflictStrategy: 'append' })
    const batch = db.prepare('SELECT candidate_ids_json AS candidateIdsJson, status, reason FROM clip_export_batches ORDER BY created_at DESC LIMIT 1').get() as { candidateIdsJson: string; status: string; reason: string | null }
    expect(JSON.parse(batch.candidateIdsJson)).toMatchObject({ candidateIds: [candidate.id], items: [expect.objectContaining({ status: 'exported' })] }); expect(batch.status).toBe('completed'); expect(batch.reason).toBeNull()
    db.close()
  })

  it('keeps a failed candidate failed when its historical task has no export snapshot', async () => {
    const db = new Database(':memory:'); migrateDatabase(db); const now = new Date().toISOString()
    db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'episode.mp4', 10, 'ready', now, now)
    const service = new OriginalClipService(db); const candidate = service.createCandidate('d', 'e', { startSeconds: 1, endSeconds: 4 })
    db.prepare("UPDATE task_items SET status = 'failed', reason = '旧任务导出失败' WHERE id = ?").run(candidate.id)
    await expect(service.retryFailedCandidate(candidate.id, 'D:\\retry-output')).rejects.toThrow('返回候选池选择输出目录')
    expect(db.prepare('SELECT status FROM task_items WHERE id = ?').get(candidate.id)).toEqual({ status: 'failed' })
    db.close()
  })

  it('exports with the runtime-root FFmpeg when PATH and explicit overrides are unavailable', async () => {
    if (!ffmpegPath || !ffprobePath) throw new Error('static media tools are unavailable')
    const runtime = await mkdtemp(join(tmpdir(), 'original-clip-runtime-')); const models = join(runtime, 'models'); const media = await mkdtemp(join(tmpdir(), 'original-clip-media-')); const output = await mkdtemp(join(tmpdir(), 'original-clip-output-')); const previousRoot = process.env.SHORTDRAMA_RUNTIME_ROOT; const previousPath = process.env.PATH; const previousFfmpeg = process.env.SHORTDRAMA_FFMPEG_PATH; const previousFfprobe = process.env.SHORTDRAMA_FFPROBE_PATH
    try {
      await (await import('node:fs/promises')).mkdir(models, { recursive: true }); await copyFile(ffmpegPath, join(models, 'ffmpeg.exe')); await copyFile(ffprobePath, join(models, 'ffprobe.exe'))
      const sourcePath = join(media, 'episode.mp4'); await runMediaProcess(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=320x180:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', sourcePath])
      const db = new Database(':memory:'); db.pragma('foreign_keys = ON'); migrateDatabase(db); const now = new Date().toISOString(); db.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now); db.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, sourcePath, 1, 'ready', now, now)
      process.env.SHORTDRAMA_RUNTIME_ROOT = runtime; process.env.PATH = 'C:\\Windows\\System32'; delete process.env.SHORTDRAMA_FFMPEG_PATH; delete process.env.SHORTDRAMA_FFPROBE_PATH
      const service = new OriginalClipService(db); const candidate = service.createCandidate('d', 'e', { startSeconds: 0, endSeconds: 0.8 }); service.confirmCandidate(candidate.id); const result = await service.exportCandidate(candidate.id, output); expect(await stat(result.outputPath)).toMatchObject({ isFile: expect.any(Function) }); expect((await stat(result.outputPath)).size).toBeGreaterThan(0); const batch = db.prepare('SELECT candidate_ids_json AS candidateIdsJson, status, reason FROM clip_export_batches').get() as { candidateIdsJson: string; status: string; reason: string | null }; expect(JSON.parse(batch.candidateIdsJson)).toMatchObject({ candidateIds: [candidate.id], items: [expect.objectContaining({ status: 'exported' })] }); expect(batch.status).toBe('completed'); expect(batch.reason).toBeNull(); db.close()
    } finally { if (previousRoot === undefined) delete process.env.SHORTDRAMA_RUNTIME_ROOT; else process.env.SHORTDRAMA_RUNTIME_ROOT = previousRoot; if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath; if (previousFfmpeg === undefined) delete process.env.SHORTDRAMA_FFMPEG_PATH; else process.env.SHORTDRAMA_FFMPEG_PATH = previousFfmpeg; if (previousFfprobe === undefined) delete process.env.SHORTDRAMA_FFPROBE_PATH; else process.env.SHORTDRAMA_FFPROBE_PATH = previousFfprobe; await rm(runtime, { recursive: true, force: true }); await rm(media, { recursive: true, force: true }); await rm(output, { recursive: true, force: true }) }
  }, 30_000)
})
