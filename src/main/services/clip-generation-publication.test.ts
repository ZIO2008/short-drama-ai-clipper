import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { ClipEvidencePackageService, type ClipEvidencePackage } from './clip-evidence-package-service.js'
import { OriginalClipService } from './original-clip-service.js'

const provider = { id: 'semantic', capability: 'text-analysis', provider: 'fixture', endpoint: 'http://127.0.0.1:3000', model: 'fixture', region: 'local', secretRef: null, timeoutMs: 1_000, pricing: null }
const packageRecord: ClipEvidencePackage = { id: 'package-v1', dramaId: 'd', episodeId: 'e', version: 1, sourceMediaFingerprint: 'media-v1', ruleVersion: 'evidence-v5', status: 'ready', reason: null }

const setup = () => {
  const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
  const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
  database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 'media-v1', 30, 'ready', now, now)
  database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(packageRecord.id, 'd', 'e', 1, 'media-v1', 'evidence-v5', 'ready', JSON.stringify({ media: { fingerprint: 'media-v1', ptsReadable: true, ptsVerifier: 'ffprobe-frame-pts-v1' } }), now, now)
  database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('unit-v1', packageRecord.id, 'semantic-event', 2.00049, 5.99951, JSON.stringify(['event-v1']), 'A', now, now)
  database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('scene-v1', packageRecord.id, 'scene-anchor', 2.00049, 5.99951, JSON.stringify(['scene-v1']), 'B', now, now)
  return { database, now, publication: new ClipEvidencePackageService(database) }
}

const createRound = (database: Database.Database, now: string, taskRound: number, status: 'running' | 'cancelled' | 'interrupted' = 'running', plannedRange: Record<string, unknown> = { episodeId: 'e', startSeconds: 2, endSeconds: 6, semanticEventIds: ['event-v1'] }) => {
  const taskId = randomUUID(); const candidateId = randomUUID()
  const taskConfig = { generation: { episodeIds: ['e'], candidatesPerEpisode: 1, targetDurationSeconds: 12, maxOverlapRatio: 0.25, allowRepeat: false }, generationRequestKey: `round-${taskRound}`, episodes: [{ episodeId: 'e', packageId: packageRecord.id, packageVersion: 1, sourceMediaFingerprint: 'media-v1', semanticWindowEvidenceIds: [['event-v1']] }], provider, resourceBudget: { textWindows: 1, providerConcurrency: 1 }, taskRound }
  database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?)').run(taskId, 'd', 'original_clip', JSON.stringify(taskConfig), status, JSON.stringify({ version: 1, stage: 'text-semantics', round: taskId, taskRound, startedAt: now }), now, now)
  database.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)').run(candidateId, taskId, JSON.stringify(plannedRange), 'pending_review', now, now)
  return { taskId, candidateId, taskRound, taskConfig }
}

const publicationCandidate = (candidateId: string, summary: unknown = { startSeconds: 2, endSeconds: 6, semanticEventIds: ['event-v1'], qualificationReason: '上下文受限' }): { candidateId: string; package: ClipEvidencePackage; qualification: 'qualified' | 'qualified_with_limit' | 'blocked'; summary: unknown } => ({ candidateId, package: packageRecord, qualification: 'qualified_with_limit', summary })
const publish = (publication: ClipEvidencePackageService, round: ReturnType<typeof createRound>, candidates = [publicationCandidate(round.candidateId)]) => publication.publishGenerationRound({ taskId: round.taskId, taskRound: round.taskRound, dramaId: 'd', config: round.taskConfig, provider, candidates })

describe('clip generation publication boundary', () => {
  it('publishes a complete candidate snapshot that links frozen config, provider, evidence and PTS range', () => {
    const { database, now, publication } = setup(); const round = createRound(database, now, 2)
    publish(publication, round)

    const row = database.prepare(`SELECT pointer.task_id AS pointerTaskId, pointer.task_round AS pointerTaskRound,
      snapshot.qualification, snapshot.config_json AS configJson, snapshot.provider_json AS providerJson, snapshot.summary_json AS summaryJson,
      package.source_media_fingerprint AS sourceMediaFingerprint, package.rule_version AS ruleVersion,
      unit.start_seconds AS evidenceStart, unit.end_seconds AS evidenceEnd
      FROM clip_candidate_publish_pointers pointer
      JOIN clip_candidate_publish_members member ON member.task_id = pointer.task_id AND member.task_round = pointer.task_round
      JOIN clip_candidate_snapshots snapshot ON snapshot.id = member.snapshot_id
      JOIN clip_evidence_packages package ON package.id = snapshot.package_id
      JOIN clip_evidence_units unit ON unit.package_id = package.id
      WHERE member.candidate_id = ?`).get(round.candidateId) as { pointerTaskId: string; pointerTaskRound: number; qualification: string; configJson: string; providerJson: string; summaryJson: string; sourceMediaFingerprint: string; ruleVersion: string; evidenceStart: number; evidenceEnd: number }
    expect(row).toMatchObject({ pointerTaskId: round.taskId, pointerTaskRound: 2, qualification: 'qualified_with_limit', sourceMediaFingerprint: 'media-v1', ruleVersion: 'evidence-v5', evidenceStart: 2.00049, evidenceEnd: 5.99951 })
    expect(JSON.parse(row.configJson)).toEqual(round.taskConfig)
    expect(JSON.parse(row.providerJson)).toEqual(provider)
    expect(JSON.parse(row.summaryJson)).toEqual(expect.objectContaining({ startSeconds: 2, endSeconds: 6, semanticEventIds: ['event-v1'], qualificationReason: '上下文受限' }))
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(round.taskId)).toEqual({ status: 'reviewing' })
    database.close()
  })

  it('keeps the stable higher round visible when late, cancelled or media-drifted rounds arrive', () => {
    const { database, now, publication } = setup(); const stable = createRound(database, now, 2); publish(publication, stable)
    const snapshotCount = database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_snapshots').get() as { count: number }
    const late = createRound(database, now, 1); expect(() => publish(publication, late)).toThrow('轮次已过期')
    expect(database.prepare('SELECT task_id AS taskId, task_round AS taskRound FROM clip_candidate_publish_pointers WHERE drama_id = ? AND episode_id = ?').get('d', 'e')).toEqual({ taskId: stable.taskId, taskRound: 2 })
    expect(new OriginalClipService(database).listCandidates('d').map(({ id }) => id)).toEqual([stable.candidateId])
    expect(database.prepare('SELECT status, checkpoint FROM production_tasks WHERE id = ?').get(late.taskId)).toMatchObject({ status: 'failed', checkpoint: expect.stringContaining('obsolete') })
    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_snapshots').get()).toEqual(snapshotCount)

    const cancelled = createRound(database, now, 3, 'cancelled')
    expect(() => publish(publication, cancelled)).toThrow('任务已失效')
    const interrupted = createRound(database, now, 4, 'interrupted')
    expect(() => publish(publication, interrupted)).toThrow('任务已失效')
    database.prepare("UPDATE episodes SET source_fingerprint = 'media-v2' WHERE id = 'e'").run()
    const drifted = createRound(database, now, 5)
    expect(() => publish(publication, drifted)).toThrow('任务已失效')
    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_snapshots').get()).toEqual(snapshotCount)
    expect(database.prepare('SELECT task_id AS taskId, task_round AS taskRound FROM clip_candidate_publish_pointers WHERE drama_id = ? AND episode_id = ?').get('d', 'e')).toEqual({ taskId: stable.taskId, taskRound: 2 })
    database.close()
  })

  it('rejects cross-task candidates and summaries that cannot reproduce the frozen task item', () => {
    const { database, now, publication } = setup(); const owner = createRound(database, now, 1); const foreign = createRound(database, now, 2)
    expect(() => publish(publication, owner, [publicationCandidate(foreign.candidateId)])).toThrow('不属于当前可发布任务轮次')
    expect(() => publish(publication, owner, [publicationCandidate(owner.candidateId, { startSeconds: 3, endSeconds: 6, semanticEventIds: ['event-v1'] })])).toThrow('摘要范围')
    database.prepare("UPDATE task_items SET planned_range = json_set(planned_range, '$.semanticEventIds', json('[\"missing-event\"]')) WHERE id = ?").run(owner.candidateId)
    expect(() => publish(publication, owner, [publicationCandidate(owner.candidateId, { startSeconds: 2, endSeconds: 6, semanticEventIds: ['missing-event'] })])).toThrow('资格不足的事件锚')
    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_snapshots').get()).toEqual({ count: 0 })
    database.close()
  })

  it('accepts scene-only and multi-candidate rounds while preserving millisecond PTS semantics', () => {
    const { database, now, publication } = setup(); const round = createRound(database, now, 1, 'running', { episodeId: 'e', startSeconds: 2, endSeconds: 6, sceneAnchorIds: ['scene-v1'] }); const secondCandidateId = randomUUID()
    database.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)').run(secondCandidateId, round.taskId, JSON.stringify({ episodeId: 'e', startSeconds: 2, endSeconds: 6, semanticEventIds: ['event-v1'] }), 'pending_review', now, now)

    publish(publication, round, [publicationCandidate(round.candidateId, { startSeconds: 2, endSeconds: 6, sceneAnchorIds: ['scene-v1'] }), publicationCandidate(secondCandidateId)])

    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_publish_members WHERE task_id = ?').get(round.taskId)).toEqual({ count: 2 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_snapshots WHERE task_id = ?').get(round.taskId)).toEqual({ count: 2 })
    database.close()
  })

  it('rejects config, provider, qualification and evidence-kind drift', () => {
    const { database, now, publication } = setup()
    const configDrift = createRound(database, now, 1); expect(() => publish(publication, { ...configDrift, taskConfig: { ...configDrift.taskConfig, generationRequestKey: 'changed' } })).toThrow('配置')
    const providerDrift = createRound(database, now, 2)
    expect(() => publication.publishGenerationRound({ taskId: providerDrift.taskId, taskRound: 2, dramaId: 'd', config: providerDrift.taskConfig, provider: { ...provider, model: 'changed' }, candidates: [publicationCandidate(providerDrift.candidateId)] })).toThrow('供应商')
    const blocked = createRound(database, now, 3)
    expect(() => publish(publication, blocked, [{ ...publicationCandidate(blocked.candidateId), qualification: 'blocked' }])).toThrow('阻断候选')
    const kindDrift = createRound(database, now, 4, 'running', { episodeId: 'e', startSeconds: 2, endSeconds: 6, semanticEventIds: ['scene-v1'] })
    expect(() => publish(publication, kindDrift, [publicationCandidate(kindDrift.candidateId, { startSeconds: 2, endSeconds: 6, semanticEventIds: ['scene-v1'] })])).toThrow('资格不足的事件锚')
    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_snapshots').get()).toEqual({ count: 0 })
    database.close()
  })

  it('rejects a forged higher publication round before it can bypass the stable pointer', () => {
    const { database, now, publication } = setup(); const stable = createRound(database, now, 2); publish(publication, stable); const attacker = createRound(database, now, 1)
    const before = { snapshots: database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_snapshots').get(), members: database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_publish_members').get() }

    expect(() => publication.publishGenerationRound({ taskId: attacker.taskId, taskRound: 3, dramaId: 'd', config: attacker.taskConfig, provider, candidates: [publicationCandidate(attacker.candidateId)] })).toThrow('冻结轮次不一致')

    expect(database.prepare('SELECT task_id AS taskId, task_round AS taskRound FROM clip_candidate_publish_pointers WHERE drama_id = ? AND episode_id = ?').get('d', 'e')).toEqual({ taskId: stable.taskId, taskRound: 2 })
    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_snapshots').get()).toEqual(before.snapshots)
    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_publish_members').get()).toEqual(before.members)
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(attacker.taskId)).toEqual({ status: 'running' })
    database.close()
  })

  it('rolls back snapshots, pointer and task status when member insertion fails mid-transaction', () => {
    const { database, now, publication } = setup(); const round = createRound(database, now, 1); const secondCandidateId = randomUUID()
    database.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)').run(secondCandidateId, round.taskId, JSON.stringify({ episodeId: 'e', startSeconds: 2, endSeconds: 6, semanticEventIds: ['event-v1'] }), 'pending_review', now, now)
    database.prepare('INSERT INTO clip_candidate_snapshots (id, candidate_id, package_id, qualification, config_json, provider_json, summary_json, task_id, task_round, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('preexisting-snapshot', secondCandidateId, packageRecord.id, 'qualified_with_limit', JSON.stringify(round.taskConfig), JSON.stringify(provider), JSON.stringify({ startSeconds: 2, endSeconds: 6, semanticEventIds: ['event-v1'] }), round.taskId, 1, now, now)
    database.prepare('INSERT INTO clip_candidate_publish_members (candidate_id, snapshot_id, drama_id, episode_id, task_id, task_round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(secondCandidateId, 'preexisting-snapshot', 'd', 'e', round.taskId, 1, now)
    const before = { snapshots: database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_snapshots').get(), members: database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_publish_members').get() }

    expect(() => publish(publication, round, [publicationCandidate(round.candidateId), publicationCandidate(secondCandidateId)])).toThrow()

    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_snapshots').get()).toEqual(before.snapshots)
    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_publish_members').get()).toEqual(before.members)
    expect(database.prepare('SELECT COUNT(*) AS count FROM clip_candidate_publish_pointers').get()).toEqual({ count: 0 })
    expect(database.prepare('SELECT status FROM production_tasks WHERE id = ?').get(round.taskId)).toEqual({ status: 'running' })
    database.close()
  })
})
