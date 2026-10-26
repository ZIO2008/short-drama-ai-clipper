import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import type { ProcessResult } from '../media/media-types.js'
import { DefaultAsrSubtitleService, reconcileChunkCues } from './default-asr-subtitle-service.js'
import { SubtitleEvidenceService } from './subtitle-evidence-service.js'

describe('DefaultAsrSubtitleService', () => {
  const databases: Database.Database[] = []
  afterEach(() => databases.splice(0).forEach((database) => database.close()))

  it('uses the saved Tencent default, uploads only bounded audio chunks, and persists timed ASR evidence', async () => {
    const database = new Database(':memory:'); databases.push(database); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d1', '剧目', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e1', 'd1', 1, 1, 'D:\\episode.mp4', 240, 'ready', now, now)
    const calls: Array<{ command: string; args: readonly string[] }> = []; const requests: RequestInit[] = []; let requestNumber = 0
    const result = (command: string, stdout = ''): ProcessResult => ({ command, stdout, stderr: '', exitCode: 0, signal: null, durationMs: 1 })
    const service = new DefaultAsrSubtitleService(database, new SubtitleEvidenceService(database), {
      list: () => [{ id: 'asr-profile', capability: 'asr', region: 'cn', provider: '腾讯云 ASR', endpoint: 'https://asr.tencentcloudapi.com', model: '16k_zh', secretRef: 'secret-ref', timeoutMs: 60000, pricing: null }]
    } as never, { readPlaintextForMainProcess: () => JSON.stringify({ version: 1, provider: 'tencent-cloud-asr', secretId: 'id-not-returned', secretKey: 'key-not-returned' }) } as never, {
      resolveFfmpeg: () => 'ffmpeg.exe', resolveFfprobe: () => 'ffprobe.exe', createTempDirectory: async () => 'C:\\temp\\asr', removeTempDirectory: async () => undefined, readFile: async () => Buffer.alloc(1024), wait: async () => undefined,
      run: async (command, args) => { calls.push({ command, args }); return result(command, command === 'ffprobe.exe' ? '240' : '') }
    }, async (_url, options) => {
      requests.push(options ?? {}); requestNumber += 1
      const action = new Headers(options?.headers).get('X-TC-Action')
      if (action === 'CreateRecTask') return new Response(JSON.stringify({ Response: { Data: { TaskId: requestNumber } } }), { status: 200 })
      return new Response(JSON.stringify({ Response: { Data: { Status: 2, ResultDetail: [{ FinalSentence: `字幕 ${requestNumber}`, StartMs: 0, EndMs: 1200 }] } } }), { status: 200 })
    })

    const track = await service.extract({ dramaId: 'd1', episodeId: 'e1', language: 'zh-CN', mode: 'audio-first' })

    expect(track).toEqual(expect.objectContaining({ sourceKind: 'asr', cueCount: 3 }))
    expect(new SubtitleEvidenceService(database).listCues(track.id).map(({ startSeconds, endSeconds }) => ({ startSeconds, endSeconds }))).toEqual([{ startSeconds: 0, endSeconds: 1.2 }, { startSeconds: 117, endSeconds: 118.2 }, { startSeconds: 234, endSeconds: 235.2 }])
    expect(calls.filter(({ command }) => command === 'ffmpeg.exe')).toHaveLength(3)
    const createRequests = requests.filter((request) => new Headers(request.headers).get('X-TC-Action') === 'CreateRecTask')
    expect(createRequests).toHaveLength(3)
    expect(createRequests.map((request) => JSON.parse(String(request.body)))).toEqual(expect.arrayContaining([
      expect.objectContaining({ ResTextFormat: 3, SentenceMaxLength: 40 })
    ]))
    expect(requests.every((request) => !String(request.body).includes('key-not-returned'))).toBe(true)
  })

  it('deduplicates only the same provider sentence repeated across an overlapping chunk boundary', () => {
    const cues = reconcileChunkCues([
      { startSeconds: 118, endSeconds: 120, text: '跨界句。', confidence: null, chunkStartSeconds: 0, chunkEndSeconds: 120 },
      { startSeconds: 118.1, endSeconds: 120.4, text: '跨界句', confidence: null, chunkStartSeconds: 117, chunkEndSeconds: 237 },
      { startSeconds: 120.5, endSeconds: 121.5, text: '下一句', confidence: null, chunkStartSeconds: 117, chunkEndSeconds: 237 },
      { startSeconds: 120.6, endSeconds: 121.6, text: '不同文本', confidence: null, chunkStartSeconds: 117, chunkEndSeconds: 237 }
    ])
    expect(cues).toEqual([
      { startSeconds: 118, endSeconds: 120.4, text: '跨界句。', confidence: null },
      { startSeconds: 120.5, endSeconds: 121.5, text: '下一句', confidence: null },
      { startSeconds: 120.6, endSeconds: 121.6, text: '不同文本', confidence: null }
    ])
  })

  it('does not create an ASR track when the default provider has no executor', async () => {
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database)
    const service = new DefaultAsrSubtitleService(database, new SubtitleEvidenceService(database), { list: () => [{ id: 'asr-profile', capability: 'asr', region: 'cn', provider: '阿里云百炼 / Model Studio', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'paraformer-v2', secretRef: null, timeoutMs: 60000, pricing: null }] } as never, {} as never)
    await expect(service.extract({ dramaId: 'd1', episodeId: 'e1', language: 'zh-CN', mode: 'audio-first' })).rejects.toThrow('尚未接入')
  })
})
