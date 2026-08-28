import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import type { ProcessResult } from '../media/media-types.js'
import { DefaultAsrSubtitleService } from './default-asr-subtitle-service.js'
import { SubtitleEvidenceService } from './subtitle-evidence-service.js'

const projectRoot = resolve(import.meta.dirname, '../../..')
const manifestPath = join(projectRoot, 'docs', 'clip-evidence-baseline', 'manifest.v1.json')
const allowedSampleIds = new Set(['dev-01', 'dev-02', 'dev-04'])
const temporaryFolders: string[] = []

afterEach(async () => {
  await Promise.all(temporaryFolders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

test.runIf(process.env.SHORTDRAMA_REAL_ASR_PREFLIGHT === '1')('real ASR refuses before media extraction or network when cloud authorization is absent', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { mediaRoot: string; publicDevelopmentSet: Array<{ id: string; relativePath: string; sha256: string }> }
  const sampleId = process.env.SHORTDRAMA_REAL_ASR_PREFLIGHT_SAMPLE_ID?.trim()
  if (!sampleId || !allowedSampleIds.has(sampleId)) throw new Error('set SHORTDRAMA_REAL_ASR_PREFLIGHT_SAMPLE_ID to dev-01, dev-02, or dev-04')
  const sample = manifest.publicDevelopmentSet.find((entry) => entry.id === sampleId)
  if (!sample) throw new Error('requested ASR baseline sample is not registered')
  // Media identity is verified by verify:clip-evidence-baseline. This gate
  // deliberately never opens the real source file: its subject is whether an
  // unconfigured ASR call stops before extraction or outbound activity.
  const sourcePath = join(manifest.mediaRoot, sample.relativePath)

  const folder = await mkdtemp(join(tmpdir(), 'shortdrama-real-asr-preflight-'))
  temporaryFolders.push(folder)
  let database: Database.Database | null = null
  let closeFailure: unknown = null
  try {
    database = new Database(join(folder, 'baseline.sqlite'))
    database.pragma('foreign_keys = ON')
    migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('baseline-drama', '内部 ASR 预检', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)').run(sample.id, 'baseline-drama', 1, 0, sourcePath, `baseline-v1:${sample.sha256.toLowerCase()}`, 'ready', now, now)

    const blockedConfigurations = [
      { name: 'profile-missing', profiles: [] as unknown[], secret: vi.fn(), reason: '保存并设定默认供应商' },
      { name: 'credential-missing', profiles: [tencentProfile(null)], secret: vi.fn(), reason: '尚未保存 SecretId' },
      { name: 'credential-invalid', profiles: [tencentProfile('11111111-1111-4111-8111-111111111111')], secret: vi.fn(() => 'not-a-tencent-credential'), reason: '凭据不可用' }
    ]
    for (const configuration of blockedConfigurations) {
      const run = vi.fn<(command: string, args: readonly string[]) => Promise<ProcessResult>>()
      const fetchImpl = vi.fn<typeof fetch>()
      const service = new DefaultAsrSubtitleService(database, new SubtitleEvidenceService(database), { list: () => configuration.profiles } as never, { readPlaintextForMainProcess: configuration.secret } as never, {
        resolveFfmpeg: () => 'ffmpeg.exe', resolveFfprobe: () => 'ffprobe.exe', run,
        createTempDirectory: async () => join(folder, 'audio'), removeTempDirectory: async () => undefined,
        readFile: async () => Buffer.alloc(0), wait: async () => undefined
      }, fetchImpl)
      await expect(service.extract({ dramaId: 'baseline-drama', episodeId: sample.id, language: 'zh-CN', mode: 'audio-first' })).rejects.toThrow(configuration.reason)
      expect(run, configuration.name).not.toHaveBeenCalled()
      expect(fetchImpl, configuration.name).not.toHaveBeenCalled()
    }
    expect(database.prepare('SELECT COUNT(*) AS count FROM subtitle_tracks').get()).toEqual({ count: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM production_tasks').get()).toEqual({ count: 0 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_export_batches').get()).toEqual({ count: 0 })
  } finally {
    try { database?.close() } catch (cause) { closeFailure = cause }
    const index = temporaryFolders.indexOf(folder)
    if (index >= 0) temporaryFolders.splice(index, 1)
    await rm(folder, { recursive: true, force: true })
    expect(existsSync(folder)).toBe(false)
    if (closeFailure) throw closeFailure
  }
}, 60_000)

const tencentProfile = (secretRef: string | null) => ({ id: 'asr', capability: 'asr', region: 'cn', provider: '腾讯云 ASR', endpoint: 'https://asr.tencentcloudapi.com', model: '16k_zh', secretRef, timeoutMs: 60_000, pricing: null })
