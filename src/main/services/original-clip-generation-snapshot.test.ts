import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import type { ClipCandidateGenerationInput, ClipGenerationPreflight } from '../../shared/contracts.js'
import { migrateDatabase } from '../db/migrate.js'
import type { ClipEvidencePackage } from './clip-evidence-package-service.js'
import { buildClipGenerationRequestKey, snapshotClipGenerationProvider } from './clip-generation-request-key.js'
import { OriginalClipService } from './original-clip-service.js'

const profile = { id: 'semantic', capability: 'text-analysis', region: 'local', provider: 'fixture', endpoint: 'http://127.0.0.1:3000', model: 'fixture', modelSelectionSource: null, secretRef: null, timeoutMs: 1_000, pricing: 'fixture' }
const input: ClipCandidateGenerationInput = { episodeIds: ['e1', 'missing'], candidatesPerEpisode: 1, targetDurationSeconds: 12, maxOverlapRatio: 0.25, allowRepeat: false }
const packageRecord = (version: number, fingerprint: string): ClipEvidencePackage => ({ id: `package-${version}`, dramaId: 'd', episodeId: 'e1', version, sourceMediaFingerprint: fingerprint, ruleVersion: 'evidence-v5', status: 'ready', reason: null })
const preflight: ClipGenerationPreflight = { episodeIds: input.episodeIds, eligibleEpisodeIds: ['e1'], requestedCandidates: 2, estimatedCandidates: 1, candidatesPerEpisode: 1, targetDurationSeconds: 12, maxOverlapRatio: 0.25, allowRepeat: false, skipped: [{ episodeId: 'missing', reason: '媒体未就绪，已跳过。' }], subtitleSources: [{ episodeId: 'e1', sourceKind: 'asr', status: 'qualified', reason: null }], resourceBudget: { textWindows: 1, projectedMandatoryReviews: 0, maxFramesPerReview: 12, maxInputBytesPerReview: 1_500_000, providerConcurrency: 1, providerTimeoutMs: 1_000, queuePosition: 1, estimatedWaitMs: 1_000, expectedProviderRequests: 1, projectedDerivedInputBytes: 0, availableProviderSlots: 0, quotaRisk: 'none' } }

const setup = () => {
  const database = new Database(':memory:')
  migrateDatabase(database)
  const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
  const service = new OriginalClipService(database, undefined, { profiles: { list: () => [profile] }, hasValidSecret: () => true, adapter: { select: vi.fn(async () => ({ selections: [] })) } })
  vi.spyOn(service, 'preflightGeneration').mockReturnValue(preflight)
  return { database, service, now }
}

describe('OriginalClipService generation snapshots', () => {
  it('deduplicates only an exact frozen request and queues changed evidence as a new round', () => {
    const { database, service, now } = setup()
    const firstPackage = packageRecord(1, 'media-v1')
    const secondPackage = packageRecord(2, 'media-v2')
    const buildPackages = vi.spyOn(service as unknown as { buildRequestPackages: (dramaId: string, episodeIds: readonly string[]) => ClipEvidencePackage[] }, 'buildRequestPackages')
      .mockReturnValueOnce([firstPackage])
      .mockReturnValue([secondPackage])
    const providerSnapshot = snapshotClipGenerationProvider(profile); const providerChain = { textAnalysis: providerSnapshot, multimodalReview: null }
    const existingTaskId = randomUUID()
    const existingKey = buildClipGenerationRequestKey('d', input, providerChain, [firstPackage])
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)').run(existingTaskId, 'd', 'original_clip', JSON.stringify({ generation: input, generationRequestKey: existingKey, requestedPackages: [firstPackage], provider: providerChain, preflight, taskRound: 1 }), 'running', '{}', now, now)

    expect(service.startIntelligentGeneration('d', input)).toMatchObject({ taskId: existingTaskId, status: 'deduplicated' })
    const changed = service.startIntelligentGeneration('d', input)
    expect(changed.status).toBe('queued')
    expect(buildPackages).toHaveBeenNthCalledWith(1, 'd', ['e1'])
    expect(buildPackages).toHaveBeenNthCalledWith(2, 'd', ['e1'])
    const persisted = database.prepare('SELECT status, config_snapshot AS configSnapshot FROM production_tasks WHERE id = ?').get(changed.taskId) as { status: string; configSnapshot: string }
    const snapshot = JSON.parse(persisted.configSnapshot) as { generationRequestKey: string; requestedPackages: ClipEvidencePackage[]; provider: unknown; preflight: ClipGenerationPreflight }
    expect(persisted.status).toBe('pending')
    expect(snapshot.generationRequestKey).not.toBe(existingKey)
    expect(snapshot.requestedPackages).toEqual([secondPackage])
    expect(snapshot.provider).toEqual(providerChain)
    expect(snapshot.preflight).toEqual(preflight)
    database.close()
  })

  it('settles an unexpected pre-provider failure instead of leaving a phantom running task', async () => {
    const { database, service } = setup()
    vi.spyOn(service as unknown as { buildRequestPackages: () => ClipEvidencePackage[] }, 'buildRequestPackages').mockReturnValue([packageRecord(1, 'media-v1')])
    vi.spyOn(service as unknown as { generateIntelligentCandidates: () => Promise<unknown> }, 'generateIntelligentCandidates').mockRejectedValue(new Error('冻结供应商配置已变化'))

    const task = service.startIntelligentGeneration('d', input)
    expect(task.status).toBe('running')
    await vi.waitFor(() => expect(database.prepare('SELECT status, checkpoint FROM production_tasks WHERE id = ?').get(task.taskId)).toMatchObject({ status: 'failed', checkpoint: expect.stringContaining('冻结供应商配置已变化') }))
    database.close()
  })
})
