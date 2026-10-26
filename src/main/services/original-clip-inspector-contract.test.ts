import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { OriginalClipService } from './original-clip-service.js'

describe('OriginalClipService inspector contract', () => {
  it('reads frozen editorial, claim and review facts from the published snapshot', () => {
    const database = new Database(':memory:'); migrateDatabase(database); const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 'media', 30, 'ready', now, now)
    database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('package', 'd', 'e', 1, 'media', 'evidence-v5', 'ready', '{}', now, now)
    const taskId = 'task-inspector'; const candidateId = 'candidate-inspector'; const summary = { startSeconds: 10, endSeconds: 25, semanticEventIds: ['event-1'], sceneAnchorIds: ['anchor-1'], qualificationReason: '上下文受限', evidence: { beat: 'climax', purpose: 'hook', context: 'limited', narrativeState: 'completion', seamStatus: 'closed', claims: [{ kind: 'core-event', evidenceCount: 1, reason: '核心事件已回链' }], reviewStatus: 'supported', reviewReason: '局部视频复核支持', durationDeviationSeconds: 1.2, durationDeviationReason: '与目标 12.0 秒偏离 1.2 秒。' } }
    database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?)').run(taskId, 'd', 'original_clip', JSON.stringify({ generation: { episodeIds: ['e'] } }), 'reviewing', now, now)
    database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(candidateId, taskId, JSON.stringify({ episodeId: 'e', startSeconds: 10, endSeconds: 25, semanticEventIds: ['event-1'], sceneAnchorIds: ['anchor-1'] }), 'pending_review', now, now)
    database.prepare('INSERT INTO clip_candidate_snapshots (id, candidate_id, package_id, qualification, config_json, provider_json, summary_json, task_id, task_round, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('snapshot', candidateId, 'package', 'qualified_with_limit', '{}', '{}', JSON.stringify(summary), taskId, 1, now, now)
    database.prepare('INSERT INTO clip_candidate_publish_pointers (drama_id, episode_id, snapshot_id, task_id, task_round, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('d', 'e', 'snapshot', taskId, 1, now)
    database.prepare('INSERT INTO clip_candidate_publish_members (candidate_id, snapshot_id, drama_id, episode_id, task_id, task_round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(candidateId, 'snapshot', 'd', 'e', taskId, 1, now)

    const service = new OriginalClipService(database); const candidate = service.listCandidates('d')[0]
    expect(candidate?.evidence).toEqual(summary.evidence)
    expect(candidate?.qualificationReason).toBe('上下文受限')
    database.prepare('UPDATE clip_candidate_snapshots SET summary_json = ? WHERE id = ?').run(JSON.stringify({ ...summary, evidence: {} }), 'snapshot')
    expect(service.listCandidates('d')[0]?.evidence).toBeUndefined()
    database.close()
  })
})
