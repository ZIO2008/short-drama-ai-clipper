import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../security/secret-store.js', () => ({
  canStoreSecrets: () => true,
  decryptSecret: (value: Buffer) => value.toString('utf8'),
}))

import { migrateDatabase } from '../db/migrate.js'
import { packagedRealProviderPreflightResultPath, runPackagedRealProviderPreflight } from './packaged-real-provider-preflight.js'

const folders: string[] = []

afterEach(async () => {
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

describe('packagedRealProviderPreflightResultPath', () => {
  it('does not activate without an explicit absolute result path', () => {
    expect(packagedRealProviderPreflightResultPath()).toBeNull()
  })

  it('keeps the source database unchanged and returns only sanitized capability results', async () => {
    const sourceRoot = await mkdtemp(join(tmpdir(), 'provider-preflight-source-'))
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'provider-preflight-target-'))
    folders.push(sourceRoot)
    const sourcePath = join(sourceRoot, 'material-studio.sqlite')
    seedSourceDatabase(sourcePath)
    const before = await sha256(sourcePath)
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input)
      if (url.includes('asr.tencentcloudapi.com')) return response(400, { Response: { Error: { Code: 'FailedOperation.TaskNotExist' } } })
      if (url.includes('/chat/completions')) return response(200, { id: 'probe', object: 'chat.completion', created: 1, model: 'probe', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }] })
      return response(200, { object: 'list', data: [{ id: 'qwen3.7-flash' }] })
    })

    const summary = await runPackagedRealProviderPreflight({ sourceDatabasePath: () => sourcePath, createTempDirectory: async () => temporaryRoot, fetchImpl })

    expect(summary).toEqual({ asr: { status: 'success', elapsedMs: expect.any(Number) }, textAnalysis: { status: 'success', elapsedMs: expect.any(Number) }, multimodalReview: { status: 'success', elapsedMs: expect.any(Number) }, sourceDatabaseWrites: 0 })
    expect(await sha256(sourcePath)).toBe(before)
    expect(existsSync(temporaryRoot)).toBe(false)
    expect(JSON.stringify(summary)).not.toMatch(/secret|token|endpoint|model|path|private-value/i)
  })

  it('cleans the temporary directory when setup fails', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'provider-preflight-failure-'))
    await expect(runPackagedRealProviderPreflight({ createTempDirectory: async () => temporaryRoot, sourceDatabasePath: () => { throw new Error('setup failed') } })).rejects.toThrow('setup failed')
    expect(existsSync(temporaryRoot)).toBe(false)
  })
})

const response = (status: number, value: unknown): Response => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
const sha256 = async (path: string): Promise<string> => createHash('sha256').update(await readFile(path)).digest('hex')

const seedSourceDatabase = (path: string): void => {
  const database = new Database(path)
  migrateDatabase(database)
  const now = new Date().toISOString()
  const profiles = [
    ['asr-profile', 'asr', 'cn', '腾讯云 ASR', 'https://asr.tencentcloudapi.com/', '16k_zh', '11111111-1111-4111-8111-111111111111', JSON.stringify({ version: 1, schema: 'tencent-cloud-secret-pair', values: { secretId: 'private-value-id', secretKey: 'private-value-key' } })],
    ['text-profile', 'text-analysis', 'cn', 'DeepSeek API', 'https://api.deepseek.com', 'deepseek-chat', '22222222-2222-4222-8222-222222222222', JSON.stringify({ version: 1, schema: 'api-key', values: { apiKey: 'private-value-text' } })],
    ['video-profile', 'multimodal-review', 'cn', '阿里云百炼 / Model Studio', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen3.7-flash', '33333333-3333-4333-8333-333333333333', JSON.stringify({ version: 1, schema: 'api-key', values: { apiKey: 'private-value-video' } })],
  ] as const
  const insertSecret = database.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)')
  const insertProfile = database.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
  for (const [id, capability, region, provider, endpoint, model, secretRef, secret] of profiles) {
    insertSecret.run(secretRef, Buffer.from(secret, 'utf8'), now, now)
    insertProfile.run(id, capability, region, provider, endpoint, model, secretRef, 60_000, now, now)
  }
  database.close()
}
