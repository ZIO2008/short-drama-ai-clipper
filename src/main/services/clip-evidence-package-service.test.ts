import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { ClipEvidencePackageService } from './clip-evidence-package-service.js'
import { writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { fingerprintMediaSource } from '../media/media-source-fingerprint.js'

describe('ClipEvidencePackageService', () => {
  it('allows a previously exported candidate to be exported again after a newer round is published', async () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); const sourcePath = join(tmpdir(), `repeat-published-${randomUUID()}.mp4`)
    await writeFile(sourcePath, 'frozen-media')
    try {
      const fingerprint = fingerprintMediaSource(sourcePath); if (!fingerprint) throw new Error('fixture fingerprint unavailable')
      database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
      database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 2, 0, sourcePath, fingerprint, 30, 'ready', now, now)
      database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('package', 'd', 'e', 1, fingerprint, 'test', 'ready', '{}', now, now)
      for (const round of [1, 2]) {
        const taskId = `task-${round}`; const candidateId = `candidate-${round}`; const snapshotId = `snapshot-${round}`
        database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(taskId, 'd', 'original_clip', JSON.stringify({ generation: {} }), 'reviewing', 0, 1, now, now)
        database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(candidateId, taskId, JSON.stringify({ episodeId: 'e', startSeconds: 10, endSeconds: 20 }), round === 1 ? 'exported' : 'confirmed', now, now)
        database.prepare('INSERT INTO clip_candidate_snapshots (id, candidate_id, package_id, qualification, config_json, provider_json, summary_json, task_id, task_round, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(snapshotId, candidateId, 'package', 'qualified', '{}', '{}', JSON.stringify({ startSeconds: 10, endSeconds: 20 }), taskId, round, now, now)
        database.prepare('INSERT INTO clip_candidate_publish_members (candidate_id, snapshot_id, drama_id, episode_id, task_id, task_round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(candidateId, snapshotId, 'd', 'e', taskId, round, now)
      }
      database.prepare('INSERT INTO clip_candidate_publish_pointers (drama_id, episode_id, snapshot_id, task_id, task_round, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('d', 'e', 'snapshot-2', 'task-2', 2, now)
      database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('old-material', 'd', 'task-1', 'candidate-1', 'old-output.mp4', now, now)
      const service = new ClipEvidencePackageService(database)
      expect(() => service.assertPublishedCandidate('candidate-1')).toThrow('当前已发布')
      expect(service.assertPublishedCandidate('candidate-1', { allowHistoricalExport: true })).toMatchObject({ packageId: 'package' })
      database.prepare("UPDATE task_items SET status = 'exporting' WHERE id = 'candidate-1'").run()
      expect(service.assertPublishedCandidate('candidate-1')).toMatchObject({ packageId: 'package' })
      await writeFile(sourcePath, 'changed-media')
      expect(() => service.assertPublishedCandidate('candidate-1', { allowHistoricalExport: true })).toThrow('源媒体指纹不一致')
    } finally { database.close(); await rm(sourcePath, { force: true }) }
  })
  it('persists a failed package when the source media cannot be fingerprinted', () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'missing.mp4', 10, 'ready', now, now)
    const result = new ClipEvidencePackageService(database).build('d', 'e')
    expect(result).toMatchObject({ episodeId: 'e', version: 1, status: 'failed' })
    expect(database.prepare('SELECT status, version FROM clip_evidence_packages').get()).toEqual({ status: 'failed', version: 1 })
    database.close()
  })
  it('reconstructs automatic candidate ranges only from A package units and excludes C conflicts', () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); const eventOne = '11111111-1111-4111-8111-111111111111'; const eventTwo = '22222222-2222-4222-8222-222222222222'
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 30, 'ready', now, now)
    database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('p', 'd', 'e', 1, 'media', 'test', 'ready', JSON.stringify({ durationSeconds: 30 }), now, now)
    const add = (id: string, start: number, end: number, qualification: string) => database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(`unit-${id}`, 'p', 'semantic-event', start, end, JSON.stringify([id]), qualification, now, now)
    add(eventOne, 1, 3, 'A'); add(eventTwo, 10.5, 12.5, 'A')
    const record = new ClipEvidencePackageService(database).latest('d', 'e')
    expect(new ClipEvidencePackageService(database).candidateRanges(record, 10)).toEqual([expect.objectContaining({ startSeconds: 1, endSeconds: 12.5, semanticEventIds: [eventOne, eventTwo] })])
    database.close()
  })
  it('returns only cue text linked to selected package events as semantic context', () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); const eventId = '11111111-1111-4111-8111-111111111111'
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 30, 'ready', now, now)
    database.prepare('INSERT INTO subtitle_tracks (id, drama_id, episode_id, source_kind, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('track', 'd', 'e', 'asr', 'ASR', 'zh-CN', 'active', 1, '{}', now, now)
    database.prepare('INSERT INTO subtitle_cues (id, track_id, cue_index, start_seconds, end_seconds, text, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('cue', 'track', 1, 1, 3, '关键台词', 0.9, now, now)
    database.prepare('INSERT INTO subtitle_semantic_events (id, drama_id, episode_id, rule_version, conclusion, source_kinds_json, start_seconds, end_seconds, cut_start_seconds, cut_end_seconds, text_similarity, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)').run(eventId, 'd', 'e', 'semantic-event-v1', 'asr-only', '["asr"]', 1, 3, 1, 3, now, now)
    database.prepare('INSERT INTO subtitle_semantic_event_cues (event_id, cue_id, role) VALUES (?, ?, ?)').run(eventId, 'cue', 'asr')
    database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('p', 'd', 'e', 1, 'media', 'test', 'ready', '{}', now, now)
    database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('unit', 'p', 'semantic-event', 1, 3, JSON.stringify([eventId]), 'A', now, now)
    const service = new ClipEvidencePackageService(database); const record = service.latest('d', 'e')
    expect(service.semanticContext(record, [eventId])).toBe('关键台词')
    expect(service.semanticContext(record, ['22222222-2222-4222-8222-222222222222'])).toBe('')
    database.close()
  })
  it('labels limited-context selections as qualified_with_limit but blocks any non-A core evidence', () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); const eventId = '11111111-1111-4111-8111-111111111111'
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 30, 'ready', now, now)
    database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('p', 'd', 'e', 1, 'media', 'test', 'ready', JSON.stringify({ durationSeconds: 30 }), now, now)
    database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('unit', 'p', 'semantic-event', 1, 3, JSON.stringify([eventId]), 'A', now, now)
    const service = new ClipEvidencePackageService(database); const record = service.latest('d', 'e')
    expect(service.qualifySemanticSelection(record, { startEvidenceId: eventId, endEvidenceId: eventId, evidenceIds: [eventId], beat: 'climax', purpose: 'hook', context: 'limited', narrative: { state: 'completion', characters: [], relationship: 'fixture', conflict: 'fixture', continuity: 'limited' } })).toMatchObject({ qualification: 'qualified_with_limit' })
    database.prepare("UPDATE clip_evidence_units SET qualification = 'C' WHERE id = 'unit'").run()
    expect(service.qualifySemanticSelection(record, { startEvidenceId: eventId, endEvidenceId: eventId, evidenceIds: [eventId], beat: 'climax', purpose: 'hook', context: 'standalone', narrative: { state: 'completion', characters: [], relationship: 'fixture', conflict: 'fixture', continuity: 'continuous' } })).toMatchObject({ qualification: 'blocked' })
    database.close()
  })
  it('records distinct boundary, core-event and narrative-closure claims and blocks an unfinished beat', () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); const first = '11111111-1111-4111-8111-111111111111'; const last = '22222222-2222-4222-8222-222222222222'
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 30, 'ready', now, now)
    database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('p', 'd', 'e', 1, 'media', 'test', 'ready', JSON.stringify({ durationSeconds: 30 }), now, now)
    const insert = database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)')
    insert.run('first-unit', 'p', 'semantic-event', 1, 3, JSON.stringify([first]), 'A', now, now); insert.run('last-unit', 'p', 'semantic-event', 4, 6, JSON.stringify([last]), 'A', now, now)
    const result = new ClipEvidencePackageService(database).qualifySemanticSelection(new ClipEvidencePackageService(database).latest('d', 'e'), { startEvidenceId: first, endEvidenceId: last, evidenceIds: [first, last], beat: 'escalation', purpose: 'conflict', context: 'standalone', narrative: { state: 'escalation', characters: [], relationship: 'fixture', conflict: 'fixture', continuity: 'continuous' } })
    expect(result).toMatchObject({ qualification: 'blocked', reason: expect.stringContaining('升级中段') })
    expect(result.claims).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'start-boundary', qualification: 'A', evidenceIds: [first] }), expect.objectContaining({ kind: 'end-boundary', qualification: 'A', evidenceIds: [last] }), expect.objectContaining({ kind: 'core-event', qualification: 'A' }), expect.objectContaining({ kind: 'narrative-closure', qualification: 'A' })]))
    database.close()
  })
  it('keeps scene anchors B after a supported review and grants A only to its separate visual-fact claim', () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); const sceneId = '11111111-1111-4111-8111-111111111111'
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 30, 'ready', now, now)
    database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('p', 'd', 'e', 1, 'media', 'test', 'ready', JSON.stringify({ durationSeconds: 30 }), now, now)
    database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('scene-unit', 'p', 'scene-anchor', 1, 3, JSON.stringify([sceneId]), 'B', now, now)
    const service = new ClipEvidencePackageService(database); const record = service.latest('d', 'e')
    const selection = { startEvidenceId: sceneId, endEvidenceId: sceneId, evidenceIds: [sceneId], beat: 'climax' as const, purpose: 'hook' as const, context: 'standalone' as const, narrative: { state: 'completion' as const, characters: [], relationship: 'fixture', conflict: 'fixture', continuity: 'continuous' as const } }
    expect(service.qualifySemanticSelection(record, selection)).toMatchObject({ qualification: 'blocked', needsMultimodalReview: true })
    const factId = service.recordSupportedVisualFact({ package: record, taskId: 'review-task', modelRunId: 'run-1', evidenceIds: [sceneId], claimKinds: ['start-boundary', 'end-boundary', 'core-event', 'narrative-closure'], ranges: [{ evidenceId: sceneId, startSeconds: 1, endSeconds: 3, role: 'core' }], frames: [{ ptsSeconds: 1, sha256: 'a'.repeat(64), byteLength: 12 }], reason: '人物回头完成反应。' })
    expect(database.prepare("SELECT qualification, source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE id = 'scene-unit'").get()).toEqual({ qualification: 'B', sourceIdsJson: JSON.stringify([sceneId]) })
    expect(database.prepare('SELECT qualification, source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE id = ?').get(factId)).toEqual({ qualification: 'A', sourceIdsJson: JSON.stringify([factId]) })
    const reviewed = service.qualifyReviewedVisualSelection(record, selection, factId, '人物回头完成反应。')
    expect(reviewed).toMatchObject({ qualification: 'qualified' })
    expect(reviewed.claims).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'visual-fact', qualification: 'A', evidenceIds: [factId] })]))
    database.close()
  })
  it('does not let a visual fact upgrade a visual claim outside its declared scope', () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); const sceneId = '11111111-1111-4111-8111-111111111111'
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 30, 'ready', now, now)
    database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('p', 'd', 'e', 1, 'media', 'test', 'ready', '{}', now, now)
    database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('scene-unit', 'p', 'scene-anchor', 1, 3, JSON.stringify([sceneId]), 'B', now, now)
    const service = new ClipEvidencePackageService(database); const record = service.latest('d', 'e')
    const selection = { startEvidenceId: sceneId, endEvidenceId: sceneId, evidenceIds: [sceneId], beat: 'climax' as const, purpose: 'hook' as const, context: 'standalone' as const, narrative: { state: 'completion' as const, characters: [], relationship: 'fixture', conflict: 'fixture', continuity: 'continuous' as const } }
    const factId = service.recordSupportedVisualFact({ package: record, taskId: 'review-task', modelRunId: 'run-1', evidenceIds: [sceneId], claimKinds: ['core-event'], ranges: [{ evidenceId: sceneId, startSeconds: 1, endSeconds: 3, role: 'core' }], frames: [{ ptsSeconds: 1, sha256: 'b'.repeat(64), byteLength: 12 }], reason: '只证明核心动作。' })
    expect(service.qualifyReviewedVisualSelection(record, selection, factId, '只证明核心动作。')).toMatchObject({ qualification: 'blocked' })
    database.close()
  })
  it('forms variable-length semantic cores without candidate target duration or fixed unit counts', () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333']
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 30, 'ready', now, now)
    database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('p', 'd', 'e', 1, 'media', 'test', 'ready', '{}', now, now)
    const insert = database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)')
    ids.forEach((id, index) => insert.run(`unit-${index}`, 'p', 'semantic-event', index * 10, index * 10 + 4, JSON.stringify([id]), 'A', now, now))
    expect(new ClipEvidencePackageService(database).semanticWindows(new ClipEvidencePackageService(database).latest('d', 'e'))).toEqual([{ evidenceIds: ids, contextBeforeIds: [], contextAfterIds: [] }])
    database.close()
  })
  it('uses a verified scene transition as a natural semantic-core separator while preserving one whole unit of context', () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555']
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 30, 'ready', now, now)
    database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('p', 'd', 'e', 1, 'media', 'test', 'ready', '{}', now, now)
    const insert = database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)')
    insert.run('one', 'p', 'semantic-event', 0, 1, JSON.stringify([ids[0]]), 'A', now, now); insert.run('two', 'p', 'semantic-event', 1, 2, JSON.stringify([ids[1]]), 'A', now, now); insert.run('three', 'p', 'semantic-event', 2, 3, JSON.stringify([ids[2]]), 'A', now, now)
    insert.run('scene', 'p', 'scene-anchor', 3, 4, JSON.stringify([ids[3]]), 'B', now, now)
    insert.run('four', 'p', 'semantic-event', 4, 5, JSON.stringify([ids[4]]), 'A', now, now)
    expect(new ClipEvidencePackageService(database).semanticWindows(new ClipEvidencePackageService(database).latest('d', 'e'))).toEqual([{ evidenceIds: ids.slice(0, 3), contextBeforeIds: [], contextAfterIds: [ids[3]] }, { evidenceIds: [ids[4]], contextBeforeIds: [ids[3]], contextAfterIds: [] }])
    database.close()
  })
  it('records track provenance and fails the package when media PTS cannot be read', async () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); const sourcePath = join(tmpdir(), `invalid-pts-${randomUUID()}.mp4`)
    await writeFile(sourcePath, 'not-video')
    try {
      database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
      const fingerprint = fingerprintMediaSource(sourcePath)
      database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, sourcePath, fingerprint, 30, 'ready', now, now)
      database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, source_kind, acquisition, evidence_nature, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES ('track', 'd', 'e', 'asr', 'generated', 'audio_aligned', 'ASR', 'zh-CN', 'active', 1, '{\"resultFormat\":3}', ?, ?)").run(now, now)
      database.prepare("INSERT INTO subtitle_cues (id, track_id, cue_index, start_seconds, end_seconds, text, confidence, created_at, updated_at) VALUES ('cue', 'track', 1, 1, 3, '台词', NULL, ?, ?)").run(now, now)
      const record = new ClipEvidencePackageService(database).build('d', 'e')
      expect(record).toMatchObject({ status: 'failed', reason: expect.stringContaining('PTS') })
      const saved = database.prepare('SELECT evidence_json AS evidenceJson FROM clip_evidence_packages WHERE id = ?').get(record.id) as { evidenceJson: string }
      expect(JSON.parse(saved.evidenceJson)).toMatchObject({ media: { ptsReadable: false }, tracks: [expect.objectContaining({ id: 'track', sourceKind: 'asr', evidenceNature: 'audio_aligned' })] })
    } finally { database.close(); await rm(sourcePath, { force: true }) }
  })
  it('never upgrades a semantic event above the qualification of its linked subtitle track', () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'missing.mp4', 30, 'ready', now, now)
    database.prepare("INSERT INTO subtitle_tracks (id, drama_id, episode_id, source_kind, acquisition, evidence_nature, label, language, status, cue_count, cost_json, created_at, updated_at) VALUES ('track', 'd', 'e', 'asr', 'generated', 'audio_aligned', 'ASR', 'zh-CN', 'active', 1, '{}', ?, ?)").run(now, now)
    database.prepare("INSERT INTO subtitle_cues (id, track_id, cue_index, start_seconds, end_seconds, text, confidence, created_at, updated_at) VALUES ('cue', 'track', 1, 1, 29, '粗粒度时间轴', NULL, ?, ?)").run(now, now)
    database.prepare("INSERT INTO subtitle_semantic_events (id, drama_id, episode_id, rule_version, conclusion, source_kinds_json, start_seconds, end_seconds, cut_start_seconds, cut_end_seconds, text_similarity, reason, created_at, updated_at) VALUES ('11111111-1111-4111-8111-111111111111', 'd', 'e', 'semantic-event-v1', 'asr-only', '[\"asr\"]', 1, 29, 1, 29, NULL, NULL, ?, ?)").run(now, now)
    database.prepare("INSERT INTO subtitle_semantic_event_cues (event_id, cue_id, role) VALUES ('11111111-1111-4111-8111-111111111111', 'cue', 'asr')").run()
    const result = new ClipEvidencePackageService(database).build('d', 'e')
    expect(database.prepare("SELECT qualification FROM clip_evidence_units WHERE package_id = ? AND kind = 'semantic-event'").get(result.id)).toEqual({ qualification: 'B' })
    database.close()
  })
  it('authorizes only a current published automatic candidate within its frozen range', async () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); const sourcePath = join(tmpdir(), `published-candidate-${randomUUID()}.mp4`)
    await writeFile(sourcePath, 'frozen-media')
    try {
      const fingerprint = fingerprintMediaSource(sourcePath); if (!fingerprint) throw new Error('fixture fingerprint unavailable')
      const taskId = randomUUID(); const candidateId = randomUUID()
      database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
      database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, sourcePath, fingerprint, 30, 'ready', now, now)
      database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(taskId, 'd', 'original_clip', JSON.stringify({ generation: {} }), 'reviewing', 0, 1, now, now)
      database.prepare('INSERT INTO task_items (id, task_id, planned_range, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(candidateId, taskId, JSON.stringify({ episodeId: 'e', startSeconds: 10, endSeconds: 20 }), 'pending_review', now, now)
      database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('package', 'd', 'e', 1, fingerprint, 'test', 'ready', '{}', now, now)
      database.prepare('INSERT INTO clip_candidate_snapshots (id, candidate_id, package_id, qualification, config_json, provider_json, summary_json, task_id, task_round, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('snapshot', candidateId, 'package', 'qualified', '{}', '{}', JSON.stringify({ startSeconds: 10, endSeconds: 20 }), taskId, 1, now, now)
      database.prepare('INSERT INTO clip_candidate_publish_pointers (drama_id, episode_id, snapshot_id, task_id, task_round, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run('d', 'e', 'snapshot', taskId, 1, now)
      database.prepare('INSERT INTO clip_candidate_publish_members (candidate_id, snapshot_id, drama_id, episode_id, task_id, task_round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(candidateId, 'snapshot', 'd', 'e', taskId, 1, now)
      const service = new ClipEvidencePackageService(database)
      expect(service.assertPublishedCandidate(candidateId)).toMatchObject({ qualification: 'qualified', packageId: 'package' })
      expect(service.assertPublishedCandidate(candidateId, { range: { startSeconds: 9.9, endSeconds: 20.1 } })).toMatchObject({ qualification: 'qualified' })
      expect(() => service.assertPublishedCandidate(candidateId, { range: { startSeconds: 9.899, endSeconds: 20 } })).toThrow('脱离冻结证据候选范围')
      database.prepare("UPDATE task_items SET planned_range = ? WHERE id = ?").run(JSON.stringify({ episodeId: 'e', startSeconds: 9, endSeconds: 20 }), candidateId)
      expect(() => service.assertPublishedCandidate(candidateId)).toThrow('脱离冻结证据候选范围')
      database.prepare("UPDATE task_items SET planned_range = ? WHERE id = ?").run(JSON.stringify({ episodeId: 'e', startSeconds: 10, endSeconds: 20 }), candidateId)
      database.prepare("UPDATE clip_candidate_snapshots SET qualification = 'blocked' WHERE id = 'snapshot'").run()
      expect(() => service.assertPublishedCandidate(candidateId)).toThrow('已发布且合格')
      database.prepare("UPDATE clip_candidate_snapshots SET qualification = 'qualified' WHERE id = 'snapshot'").run()
      await writeFile(sourcePath, 'changed-media')
      expect(() => service.assertPublishedCandidate(candidateId)).toThrow('源媒体指纹不一致')
    } finally { database.close(); await rm(sourcePath, { force: true }) }
  })
})
