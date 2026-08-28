import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { SubtitleRecognitionRunService } from './subtitle-recognition-run-service.js'

const databases: Database.Database[] = []
const settings = { recognitionMode: 'asr-only', scope: 'all', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' } as const

const setup = (): SubtitleRecognitionRunService => {
  const database = new Database(':memory:'); databases.push(database); migrateDatabase(database)
  const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d1', '剧目', now, now)
  for (const episodeNo of [1, 2, 3]) database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(`e${episodeNo}`, 'd1', episodeNo, episodeNo, `${episodeNo}.mp4`, 'ready', now, now)
  return new SubtitleRecognitionRunService(database, () => now)
}

afterEach(() => databases.splice(0).forEach((database) => database.close()))

describe('SubtitleRecognitionRunService', () => {
  it('persists every episode checkpoint and reaches partial completion without hiding a failed episode', () => {
    const service = setup(); const run = service.start({ dramaId: 'd1', settings, episodeIds: ['e1', 'e2', 'e3'] })
    service.markRunning({ runId: run.id, episodeId: 'e1' }); service.markSucceeded({ runId: run.id, episodeId: 'e1' })
    service.markRunning({ runId: run.id, episodeId: 'e2' }); service.markFailed({ runId: run.id, episodeId: 'e2', reason: '腾讯云 ASR 请求超时。' })
    service.markRunning({ runId: run.id, episodeId: 'e3' }); service.markSucceeded({ runId: run.id, episodeId: 'e3' })
    const finished = service.finish(run.id)

    expect(finished).toMatchObject({ status: 'partial', completed: 2, failed: 1 })
    expect(finished.items).toEqual(expect.arrayContaining([expect.objectContaining({ episodeId: 'e2', status: 'failed', reason: '腾讯云 ASR 请求超时。' })]))
  })

  it('marks an app-close running batch interrupted and resumes only unfinished episodes', () => {
    const service = setup(); const run = service.start({ dramaId: 'd1', settings, episodeIds: ['e1', 'e2', 'e3'] })
    service.markRunning({ runId: run.id, episodeId: 'e1' }); service.markSucceeded({ runId: run.id, episodeId: 'e1' })
    service.markRunning({ runId: run.id, episodeId: 'e2' })
    service.recoverInterruptedRuns()
    const interrupted = service.latest('d1')!
    expect(interrupted).toMatchObject({ status: 'interrupted', completed: 1, reason: '工具已关闭或重启' })
    expect(interrupted.items).toEqual(expect.arrayContaining([expect.objectContaining({ episodeId: 'e2', status: 'interrupted' }), expect.objectContaining({ episodeId: 'e3', status: 'pending' })]))

    const resumed = service.resume({ runId: run.id, ocrRuntime: null })
    expect(resumed).toMatchObject({ status: 'running', completed: 1 })
    expect(resumed.items.filter((item) => item.status === 'pending').map((item) => item.episodeId)).toEqual(['e2', 'e3'])
  })

  it('marks a renderer-side batch failure interrupted so the user is not left in a false running state', () => {
    const service = setup(); const run = service.start({ dramaId: 'd1', settings, episodeIds: ['e1', 'e2'] })
    service.markRunning({ runId: run.id, episodeId: 'e1' })
    const interrupted = service.interrupt({ runId: run.id, reason: '识别请求通道已断开' })

    expect(interrupted).toMatchObject({ status: 'interrupted', completed: 0, reason: '识别请求通道已断开' })
    expect(interrupted.items).toEqual(expect.arrayContaining([expect.objectContaining({ episodeId: 'e1', status: 'interrupted' }), expect.objectContaining({ episodeId: 'e2', status: 'pending' })]))
  })

  it('persists OCR runner identity while keeping legacy batches identifiable as unknown', () => {
    const service = setup()
    const sha256 = 'a'.repeat(64)
    const current = service.start({ dramaId: 'd1', settings, episodeIds: ['e1'], ocrRuntime: { buildId: 'runner-r1', sha256 } })
    expect(current.ocrRuntime).toEqual({ buildId: 'runner-r1', sha256 })

    const legacy = service.start({ dramaId: 'd1', settings, episodeIds: ['e2'] })
    expect(legacy.ocrRuntime).toBeNull()
  })

  it('retries failed items in the original batch so remaining failures stay visible', () => {
    const service = setup(); const run = service.start({ dramaId: 'd1', settings, episodeIds: ['e1', 'e2', 'e3'] })
    service.markRunning({ runId: run.id, episodeId: 'e1' }); service.markSucceeded({ runId: run.id, episodeId: 'e1' })
    service.markRunning({ runId: run.id, episodeId: 'e2' }); service.markFailed({ runId: run.id, episodeId: 'e2', reason: 'OCR 失败' })
    service.markRunning({ runId: run.id, episodeId: 'e3' }); service.markFailed({ runId: run.id, episodeId: 'e3', reason: 'OCR 失败' }); service.finish(run.id)

    const retried = service.retryFailed({ runId: run.id, ocrRuntime: null })
    expect(retried).toMatchObject({ status: 'running', total: 3, completed: 1, failed: 0 })
    expect(retried.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ episodeId: 'e1', status: 'succeeded' }),
      expect.objectContaining({ episodeId: 'e2', status: 'pending', reason: null }),
      expect.objectContaining({ episodeId: 'e3', status: 'pending', reason: null })
    ]))
  })

  it('rejects an OCR batch that bypasses the runner self-test identity', () => {
    const service = setup()
    const ocrSettings = { ...settings, recognitionMode: 'ocr-only' as const }
    expect(() => service.start({ dramaId: 'd1', settings: ocrSettings, episodeIds: ['e1'] })).toThrow('缺少已通过自检的 runner 身份')
  })

  it('refuses to resume or retry an OCR batch with a different runner identity', () => {
    const service = setup(); const current = { buildId: 'runner-r1', sha256: 'a'.repeat(64) }
    const ocrSettings = { ...settings, recognitionMode: 'ocr-only' as const }
    const interrupted = service.start({ dramaId: 'd1', settings: ocrSettings, episodeIds: ['e1'], ocrRuntime: current })
    service.markRunning({ runId: interrupted.id, episodeId: 'e1' }); service.recoverInterruptedRuns()
    expect(() => service.resume({ runId: interrupted.id, ocrRuntime: { buildId: 'runner-r2', sha256: 'b'.repeat(64) } })).toThrow('当前 OCR runner 与该历史批次不一致')
    expect(service.get(interrupted.id).status).toBe('interrupted')
    expect(service.resume({ runId: interrupted.id, ocrRuntime: current }).status).toBe('running')

    const failed = service.start({ dramaId: 'd1', settings: ocrSettings, episodeIds: ['e2'], ocrRuntime: current })
    service.markRunning({ runId: failed.id, episodeId: 'e2' }); service.markFailed({ runId: failed.id, episodeId: 'e2', reason: 'OCR 失败' }); service.finish(failed.id)
    expect(() => service.retryFailed({ runId: failed.id, ocrRuntime: { buildId: 'runner-r2', sha256: 'b'.repeat(64) } })).toThrow('当前 OCR runner 与该历史批次不一致')
    expect(service.retryFailed({ runId: failed.id, ocrRuntime: current }).status).toBe('running')
  })
})
