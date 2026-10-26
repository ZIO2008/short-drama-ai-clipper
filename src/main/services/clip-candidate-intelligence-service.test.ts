import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { ClipCandidateIntelligenceService, ClipSemanticValidationError, type ClipSemanticAdapter } from './clip-candidate-intelligence-service.js'
import type { ClipEvidencePackage } from './clip-evidence-package-service.js'
import { snapshotClipGenerationProvider } from './clip-generation-request-key.js'

const profile = { id: 'p', capability: 'text-analysis', region: 'local', provider: 'fixture', endpoint: 'http://127.0.0.1:3000', model: 'fixture', secretRef: null, timeoutMs: 1000, pricing: null }
const packageRecord: ClipEvidencePackage = { id: 'package', dramaId: 'd', episodeId: 'e', version: 1, sourceMediaFingerprint: 'media', ruleVersion: 'test', status: 'ready', reason: null }
const ids = [randomUUID(), randomUUID()]
const selection = (evidenceIds: string[] = ids, proposalId = 'window-1', seamStatus: 'closed' | 'expanded-closed' | 'unclear' = 'closed') => ({ proposalId, startEvidenceId: evidenceIds[0]!, endEvidenceId: evidenceIds[evidenceIds.length - 1]!, evidenceIds, beat: 'climax' as const, purpose: 'hook' as const, context: 'standalone' as const, narrative: { state: 'completion' as const, characters: [], relationship: 'fixture', conflict: 'fixture', continuity: 'continuous' as const }, seamStatus })
const result = (candidate = selection()) => ({ selections: [candidate] })

const setup = (adapter: ClipSemanticAdapter, profiles: () => typeof profile[] = () => [profile]) => {
  const database = new Database(':memory:'); migrateDatabase(database)
  const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('d', 'Demo', now, now)
  database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('e', 'd', 1, 0, 'fixture.mp4', 10, 'ready', now, now)
  database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run('package', 'd', 'e', 1, 'media', 'test', 'ready', '{}', now, now)
  ids.forEach((id, index) => database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(randomUUID(), 'package', 'semantic-event', index + 1, index + 2, JSON.stringify([id]), 'A', now, now))
  return { database, service: new ClipCandidateIntelligenceService(database, { list: profiles }, () => true, adapter) }
}

describe('ClipCandidateIntelligenceService', () => {
  it('also rejects new evidence IDs that alias the same unfinished time range', async () => {
    let calls = 0; const aliases = [randomUUID(), randomUUID()]
    const { database, service } = setup({ select: async () => { calls += 1; return calls === 1 ? { selections: [{ ...selection(), beat: 'escalation' }] } : result(selection(aliases, 'window-2')) } })
    const now = new Date().toISOString()
    aliases.forEach((id, index) => database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(randomUUID(), 'package', 'semantic-event', index + 1, index + 2, JSON.stringify([id]), 'A', now, now))
    try {
      await expect(service.select(packageRecord, [{ evidenceIds: ids, summary: 'unfinished' }, { evidenceIds: aliases, summary: 'same time range' }], undefined, 1)).rejects.toThrow('起止证据范围没有变化')
      expect(calls).toBe(2)
    } finally { database.close() }
  })
  it('does not accept relabeling the same unfinished boundaries as climax', async () => {
    let calls = 0
    const { database, service } = setup({ select: async () => { calls += 1; return calls === 1 ? { selections: [{ ...selection(), beat: 'escalation' }] } : result() } })
    try {
      await expect(service.select(packageRecord, [{ evidenceIds: ids, summary: 'unfinished' }], undefined, 1)).rejects.toThrow('只改变了标签')
      expect(calls).toBe(2)
      expect(database.prepare('SELECT COUNT(*) AS count FROM clip_narrative_events').get()).toEqual({ count: 0 })
    } finally { database.close() }
  })
  it('repairs an unfinished proposal once and can choose a different frozen window', async () => {
    let calls = 0
    const other = [randomUUID(), randomUUID()]
    const adapter: ClipSemanticAdapter = { select: async ({ repair, proposals }) => {
      calls += 1
      if (calls === 1) return { selections: [{ ...selection(), beat: 'escalation', narrative: { ...selection().narrative, state: 'escalation' } }] }
      expect(repair?.invalidResult).toContain('未收束')
      expect(proposals).toHaveLength(2)
      return result(selection(other, 'window-2'))
    } }
    const { database, service } = setup(adapter)
    const now = new Date().toISOString()
    other.forEach((id, index) => database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(randomUUID(), 'package', 'semantic-event', index + 5, index + 6, JSON.stringify([id]), 'A', now, now))
    try {
      const selected = await service.select(packageRecord, [{ evidenceIds: ids, summary: 'setup' }, { evidenceIds: other, summary: 'climax' }], undefined, 1)
      expect(calls).toBe(2)
      expect(selected).toEqual([expect.objectContaining({ evidenceIds: other, beat: 'climax', repairApplied: true })])
      expect(database.prepare('SELECT COUNT(*) AS count FROM clip_narrative_events').get()).toEqual({ count: 1 })
    } finally { database.close() }
  })

  it.each(['setup', 'entry', 'escalation'] as const)('stops after one repair for persistent %s without blaming subtitles', async (beat) => {
    let calls = 0
    const { database, service } = setup({ select: async () => { calls += 1; return { selections: [{ ...selection(), beat }] } } })
    try {
      await expect(service.select(packageRecord, [{ evidenceIds: ids, summary: 'unfinished' }], undefined, 1)).rejects.toThrow('未收束')
      expect(calls).toBe(2)
      expect(database.prepare('SELECT COUNT(*) AS count FROM clip_narrative_events').get()).toEqual({ count: 0 })
    } finally { database.close() }
  })
  it('requires a configured text semantic provider instead of falling back to anchor rules', () => {
    const database = new Database(':memory:')
    const service = new ClipCandidateIntelligenceService(database, { list: () => [] }, () => false, { select: async () => ({ selections: [] }) })
    expect(() => service.assertAvailable()).toThrow('未配置文本语义分析能力')
    database.close()
  })

  it('rejects a queued task when its frozen provider snapshot has changed', async () => {
    const adapter = { select: vi.fn(async () => result()) }
    const changedProfile = { ...profile, model: 'changed-after-queue' }
    const { database, service } = setup(adapter, () => [changedProfile])

    await expect(service.select(packageRecord, [{ evidenceIds: ids, summary: 'fixture' }], undefined, 1, snapshotClipGenerationProvider(profile))).rejects.toThrow('排队期间变化')
    expect(adapter.select).not.toHaveBeenCalled()
    database.close()
  })

  it('derives event evidence and event key from a frozen selected proposal', async () => {
    const { database, service } = setup({ select: async () => result() })
    const before = randomUUID(); const after = randomUUID(); const now = new Date().toISOString()
    for (const [id, start] of [[before, 0], [after, 4]] as const) database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(randomUUID(), 'package', 'semantic-event', start, start + 1, JSON.stringify([id]), 'A', now, now)
    await expect(service.select(packageRecord, [{ evidenceIds: ids, contextBeforeIds: [before], contextAfterIds: [after], summary: 'fixture' }])).resolves.toEqual([expect.objectContaining({ narrativeEventId: 'event-window-1', evidenceIds: ids, context: 'limited' })])
    const event = database.prepare('SELECT event_key AS eventKey, source_evidence_ids_json AS sourceIdsJson, core_evidence_ids_json AS coreIdsJson FROM clip_narrative_events WHERE package_id = ?').get('package') as { eventKey: string; sourceIdsJson: string; coreIdsJson: string }
    expect(event.eventKey).toBe('event-window-1'); expect(JSON.parse(event.sourceIdsJson)).toEqual([before, ...ids, after]); expect(JSON.parse(event.coreIdsJson)).toEqual(ids)
    database.close()
  })

  it('accepts limited continuity when the frozen window carries protected context', async () => {
    const before = randomUUID(); const after = randomUUID(); const now = new Date().toISOString()
    const limitedSelection = { ...selection(), narrative: { state: 'completion' as const, characters: [], relationship: 'fixture', conflict: 'fixture', continuity: 'limited' as const }, context: 'standalone' as const }
    const { database, service } = setup({ select: async () => ({ selections: [limitedSelection] }) })
    for (const [id, start] of [[before, 0], [after, 4]] as const) database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(randomUUID(), 'package', 'semantic-event', start, start + 1, JSON.stringify([id]), 'A', now, now)
    await expect(service.select(packageRecord, [{ evidenceIds: ids, contextBeforeIds: [before], contextAfterIds: [after], summary: 'fixture' }])).resolves.toEqual([expect.objectContaining({ context: 'limited' })])
    database.close()
  })

  it('repairs invalid provider-owned IDs once before rejecting', async () => {
    let calls = 0
    const { database, service } = setup({ select: async () => { calls += 1; return result(selection([randomUUID()])) } })
    await expect(service.select(packageRecord, [{ evidenceIds: ids, summary: 'fixture' }])).rejects.toMatchObject({ validationCode: 'event-map' } satisfies Partial<ClipSemanticValidationError>)
    expect(calls).toBe(2); database.close()
  })

  it('rejects nonexistent or repeated frozen proposal selections', async () => {
    const { database, service } = setup({ select: async () => ({ selections: [selection(ids, 'window-2'), selection(ids)] }) })
    await expect(service.select(packageRecord, [{ evidenceIds: ids, summary: 'fixture' }])).rejects.toMatchObject({ validationCode: 'window' } satisfies Partial<ClipSemanticValidationError>)
    database.close()
  })

  it('rejects repeated selections of one frozen proposal', async () => {
    const { database, service } = setup({ select: async () => ({ selections: [selection(), selection()] }) })
    await expect(service.select(packageRecord, [{ evidenceIds: ids, summary: 'fixture' }])).rejects.toMatchObject({ validationCode: 'event-map' } satisfies Partial<ClipSemanticValidationError>)
    database.close()
  })

  it('rejects selection context borrowing even if another window exposes it as core', async () => {
    const before = randomUUID(); const now = new Date().toISOString()
    const { database, service } = setup({ select: async () => result(selection([before, ids[0]!])) })
    database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(randomUUID(), 'package', 'semantic-event', 0, 1, JSON.stringify([before]), 'A', now, now)
    await expect(service.select(packageRecord, [{ evidenceIds: ids, contextBeforeIds: [before], summary: 'primary' }, { evidenceIds: [before, ids[0]!], summary: 'other' }])).rejects.toMatchObject({ validationCode: 'event-map' } satisfies Partial<ClipSemanticValidationError>)
    database.close()
  })

  it.each(['narrativeEvents', 'narrativeEventId', 'coreEvidenceIds', 'sourceEvidenceIds'])('rejects legacy %s fields as schema errors without leaking their names', async (marker) => {
    const response = marker === 'narrativeEvents' ? { selections: [selection()], [marker]: [] } : { selections: [{ ...selection(), [marker]: [] }] }
    const { database, service } = setup({ select: async () => response })
    let captured: unknown = null
    try { await service.select(packageRecord, [{ evidenceIds: ids, summary: 'fixture' }]) } catch (error) { captured = error }
    expect(captured).toMatchObject({ validationCode: 'schema' } satisfies Partial<ClipSemanticValidationError>)
    expect((captured as Error).message).not.toContain(marker); database.close()
  })

  it('repairs an unclear seam by expanding whole protected units once', async () => {
    const third = randomUUID(); let calls = 0
    const { database, service } = setup({ select: async ({ proposals }) => { calls += 1; return calls === 1 ? result(selection(ids, 'window-1', 'unclear')) : result(selection([...proposals[0]!.evidenceIds])) } })
    const now = new Date().toISOString()
    database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(randomUUID(), 'package', 'semantic-event', 3, 4, JSON.stringify([third]), 'A', now, now)
    await expect(service.select(packageRecord, [{ evidenceIds: ids, contextAfterIds: [third], summary: 'fixture' }])).resolves.toEqual([expect.objectContaining({ evidenceIds: [...ids, third] })])
    expect(calls).toBe(2); database.close()
  })
})
