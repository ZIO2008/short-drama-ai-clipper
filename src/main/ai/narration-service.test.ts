import Database from 'better-sqlite3'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { NarrationService } from './narration-service.js'
import { TimelineService } from './timeline-service.js'

const databases: Database.Database[] = []
const directories: string[] = []

afterEach(async () => {
  for (const database of databases.splice(0)) database.close()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

const setup = async (withEvidence = true): Promise<{ database: Database.Database; service: NarrationService }> => {
  const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); databases.push(database); migrateDatabase(database)
  const directory = await mkdtemp(join(tmpdir(), 'narration-service-')); directories.push(directory)
  const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '测试剧', now, now)
  for (const episodeNo of [1, 2]) database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)').run(`episode-${episodeNo}`, 'drama', episodeNo, episodeNo, `episode-${episodeNo}.mp4`, 'ready', now, now)
  if (withEvidence) database.prepare('INSERT INTO ai_evidence VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('evidence', 'drama', 'episode-1', 'subtitle', 12, 24, 0.92, '主角发现关键证据并与对手对峙。', '{}', now, now)
  return { database, service: new NarrationService(database, directory) }
}

const create = (service: NarrationService, mode: 'standard' | 'conflict-insert' = 'standard', controlledMode: 'success' | 'low-confidence' | 'timeout' | 'cost-limit' | 'failure' = 'success'): string => service.create({ dramaId: 'drama', episodeStart: 1, episodeEnd: 2, mode, durationMinSeconds: 30, durationMaxSeconds: 60, maxDrafts: 2, controlledMode }).taskId

describe('NarrationService', () => {
  it('creates traceable controlled narration and an editable review draft from credible evidence', async () => {
    const { database, service } = await setup(); const taskId = create(service)
    const result = await service.run(taskId)
    expect(result.outcome).toBe('segments-ready')
    expect(result.segments).toHaveLength(1)
    expect(result.segments[0]).toMatchObject({ evidenceId: 'evidence', mode: 'standard', insertStartSeconds: null, status: 'pending_review' })
    expect(result.segments[0]?.assetPath).toBeTruthy()
    expect(await stat(result.segments[0]?.assetPath ?? '')).toMatchObject({ size: expect.any(Number) })
    expect(database.prepare('SELECT status FROM ai_drafts WHERE id = ?').get(result.segments[0]?.draftId)).toEqual({ status: 'pending_review' })
    expect(database.prepare('SELECT provider, region, actual_cost AS actualCost FROM narration_assets').get()).toEqual({ provider: 'controlled', region: 'local', actualCost: 0 })
    expect(service.list(taskId)).toMatchObject([{ draftId: result.segments[0]?.draftId, narrationAssetId: result.segments[0]?.narrationAssetId }])
    const project = new TimelineService(database).createNarrationPlan(result.segments[0]?.draftId, { narrationPath: result.segments[0]?.assetPath, targetDurationSeconds: result.segments[0]?.targetDurationSeconds, mode: 'standard', evidenceId: result.segments[0]?.evidenceId, narrationText: result.segments[0]?.text })
    expect(project.timeline.video.reduce((total, clip) => total + clip.sourceEndSeconds - clip.sourceStartSeconds, 0)).toBe(30)
    expect(project.timeline).toMatchObject({ sfx: [[{ role: 'narration', sourceStartSeconds: 0, sourceEndSeconds: 30, positionSeconds: 0 }], []] })
  })

  it('keeps the source conflict timecode and plans narration before and after the original conflict', async () => {
    const { database, service } = await setup(); const result = await service.run(create(service, 'conflict-insert'))
    expect(result.segments[0]).toMatchObject({ insertStartSeconds: 12, insertEndSeconds: 24, mode: 'conflict-insert' })
    const project = new TimelineService(database).createNarrationPlan(result.segments[0]?.draftId, { narrationPath: result.segments[0]?.assetPath, targetDurationSeconds: result.segments[0]?.targetDurationSeconds, mode: 'conflict-insert', evidenceId: result.segments[0]?.evidenceId, narrationText: result.segments[0]?.text })
    expect(project.timeline.video.find((clip) => clip.role === 'conflict')).toMatchObject({ positionSeconds: 9, sourceStartSeconds: 12, sourceEndSeconds: 24 })
    expect(project.timeline.sfx[0]).toMatchObject([{ role: 'narration', positionSeconds: 0, sourceEndSeconds: 9 }, { role: 'narration', positionSeconds: 21, sourceStartSeconds: 21, sourceEndSeconds: 30 }])
  })

  it('uses a target duration that can contain a longer valid source evidence', async () => {
    const { database, service } = await setup(); database.prepare('UPDATE ai_evidence SET end_seconds = ? WHERE id = ?').run(48, 'evidence')
    const result = await service.run(create(service))
    expect(result.segments[0]?.targetDurationSeconds).toBe(36)
  })

  it('returns no recommendation without an unsupported narration when evidence is absent or low-confidence', async () => {
    const empty = await setup(false); const emptyTask = create(empty.service)
    await expect(empty.service.run(emptyTask)).resolves.toMatchObject({ outcome: 'no-recommendation', segments: [] })
    expect(empty.database.prepare('SELECT COUNT(*) AS count FROM narration_segments').get()).toEqual({ count: 0 })
    const lowConfidence = await setup(); const lowTask = create(lowConfidence.service, 'standard', 'low-confidence')
    await expect(lowConfidence.service.run(lowTask)).resolves.toMatchObject({ outcome: 'no-recommendation', segments: [] })
  })

  it.each(['timeout', 'cost-limit', 'failure'] as const)('records %s as a stopped checkpoint instead of a false success', async (controlledMode) => {
    const { database, service } = await setup(); const taskId = create(service, 'standard', controlledMode)
    await expect(service.run(taskId)).rejects.toThrow('未发送网络请求')
    expect(database.prepare('SELECT status, checkpoint FROM production_tasks WHERE id = ?').get(taskId)).toMatchObject({ status: 'failed' })
    expect(database.prepare('SELECT status, reason FROM task_items WHERE task_id = ?').get(taskId)).toMatchObject({ status: 'failed', reason: expect.stringContaining('未发送网络请求') })
    expect(database.prepare('SELECT COUNT(*) AS count FROM narration_segments').get()).toEqual({ count: 0 })
  })

  it('can resume an interrupted pending narration task without routing through the generic media queue', async () => {
    const { database, service } = await setup(); const taskId = create(service)
    database.prepare("UPDATE production_tasks SET status = 'paused' WHERE id = ?").run(taskId)
    database.prepare("UPDATE task_items SET status = 'paused' WHERE task_id = ?").run(taskId)
    await expect(service.run(taskId)).resolves.toMatchObject({ taskId, outcome: 'segments-ready' })
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(taskId)).toEqual({ status: 'completed' })
    expect(database.prepare('SELECT status FROM task_items WHERE task_id = ?').get(taskId)).toEqual({ status: 'succeeded' })
  })

  it('snapshots configured TTS pricing and blocks a request above its limit', async () => {
    const { database, service } = await setup(); const now = new Date().toISOString()
    database.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('tts', 'tts', 'cn', 'provider', 'https://example.com', 'general-mandarin', 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321', '{"perRequest":1.2}', 30000, now, now)
    expect(() => service.create({ dramaId: 'drama', episodeStart: 1, episodeEnd: 2, mode: 'standard', durationMinSeconds: 30, durationMaxSeconds: 60, maxDrafts: 1, costLimit: 1 })).toThrow('超过本次上限')
    const taskId = service.create({ dramaId: 'drama', episodeStart: 1, episodeEnd: 2, mode: 'standard', durationMinSeconds: 30, durationMaxSeconds: 60, maxDrafts: 1, costLimit: 2 }).taskId
    expect((database.prepare('SELECT cost_json AS costJson FROM production_tasks WHERE id = ?').get(taskId) as { costJson: string }).costJson).toContain('provider')
  })
})
