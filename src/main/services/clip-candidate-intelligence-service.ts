import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { ClipEvidencePackage } from './clip-evidence-package-service.js'
import type { ProviderProfile } from './provider-profile-service.js'
import { clipGenerationProviderMatches, type ClipGenerationProviderSnapshot } from './clip-generation-request-key.js'

const narrativeSchema = z.object({
  state: z.enum(['entry', 'escalation', 'reversal', 'completion', 'reaction']),
  characters: z.array(z.string().trim().min(1).max(80)).max(12),
  relationship: z.string().trim().min(1).max(240),
  conflict: z.string().trim().min(1).max(240),
  continuity: z.enum(['continuous', 'limited', 'unclear']),
}).strict()

const selectionSchema = z.object({
  proposalId: z.string().trim().regex(/^window-\d+$/),
  startEvidenceId: z.string().uuid(),
  endEvidenceId: z.string().uuid(),
  evidenceIds: z.array(z.string().uuid()).min(1).max(500),
  beat: z.enum(['setup', 'entry', 'escalation', 'reversal', 'climax', 'reaction', 'aftermath']),
  purpose: z.enum(['hook', 'conflict', 'reveal', 'emotion', 'transition']),
  context: z.enum(['standalone', 'limited']),
  narrative: narrativeSchema,
  seamStatus: z.enum(['closed', 'expanded-closed', 'unclear']),
}).strict()
const resultSchema = z.object({ selections: z.array(selectionSchema).min(1).max(50) }).strict()
type ProviderSelection = z.infer<typeof selectionSchema>
type ResolvedNarrativeEvent = { id: string; proposalId: string; coreEvidenceIds: string[]; sourceEvidenceIds: string[]; state: ProviderSelection['narrative']['state']; characters: string[]; relationship: string; conflict: string; continuity: ProviderSelection['narrative']['continuity']; seamStatus: ProviderSelection['seamStatus'] }

export type ClipSemanticProposal = {
  evidenceIds: readonly string[]
  summary: string
  contextBeforeIds?: readonly string[]
  contextAfterIds?: readonly string[]
}

export type ClipSemanticSelection = Omit<ProviderSelection, 'proposalId' | 'seamStatus'> & { seamStatus?: ProviderSelection['seamStatus']; narrativeEventId?: string; repairApplied?: boolean; repairReason?: string }

export type ClipSemanticAdapter = {
  select(input: {
    package: ClipEvidencePackage
    profile: ProviderProfile
    proposals: readonly ClipSemanticProposal[]
    /** Application-owned cap; providers never decide how many candidates to emit. */
    candidateLimit?: number
    repair?: { invalidResult: string }
    signal?: AbortSignal
  }): Promise<unknown>
}

type EvidenceUnitRow = { sourceIdsJson: string; startSeconds: number; endSeconds: number; kind: string }

export type ClipSemanticValidationCode = 'schema' | 'window' | 'event-map' | 'time-order' | 'continuity' | 'candidate-limit' | 'generic'

export class ClipSemanticValidationError extends Error {
  constructor(message: string, readonly validationCode: ClipSemanticValidationCode) { super(message) }
}

const validationCodeFor = (reason: string): ClipSemanticValidationCode => {
  if (/结构合同|Invalid input|Too small|Too big|Unrecognized key|expected/i.test(reason)) return 'schema'
  if (/接缝|连续性|未收束/i.test(reason)) return 'continuity'
  if (/时间顺序|起止锚点|倒置|起止.*无效/i.test(reason)) return 'time-order'
  if (/窗口外|当前证据包之外|不属于当前证据包|候选引用.*分析窗口/i.test(reason)) return 'window'
  if (/叙事事件|事件地图|事件来源|核心单元|核心范围|冻结窗口/i.test(reason)) return 'event-map'
  if (/超过本轮请求.*上限|候选.*上限/i.test(reason)) return 'candidate-limit'
  return 'generic'
}

/**
 * This boundary asks a text model for semantic editorial judgment, but only
 * accepts snapshot-local IDs. Seconds, frames, paths and mutable cue timing
 * are deliberately absent from its return contract.
 */
export class ClipCandidateIntelligenceService {
  constructor(
    private readonly database: Database.Database,
    private readonly profiles: { list: () => ProviderProfile[] },
    private readonly hasValidSecret: (secretRef: string) => boolean,
    private readonly adapter: ClipSemanticAdapter,
  ) {}

  assertAvailable(): ProviderProfile {
    const profile = this.profiles.list().find((item) => item.capability === 'text-analysis')
    if (!profile) throw new Error('未配置文本语义分析能力，系统不会用锚点规则冒充智能候选。请先在设置中完成配置。')
    if (profile.region === 'local') {
      if (!profile.endpoint) throw new Error('本地文本语义分析服务缺少可调用地址，系统未生成候选。')
      return profile
    }
    if (!profile.secretRef || !this.hasValidSecret(profile.secretRef)) throw new Error('文本语义分析能力缺少可用密钥，系统未生成候选。')
    if (!profile.endpoint) throw new Error('文本语义分析能力缺少可调用地址，系统未生成候选。')
    return profile
  }

  async select(packageRecord: ClipEvidencePackage, proposals: readonly ClipSemanticProposal[], signal?: AbortSignal, requestedCandidateLimit = 50, expectedProvider?: ClipGenerationProviderSnapshot): Promise<ClipSemanticSelection[]> {
    if (packageRecord.status !== 'ready') throw new Error(packageRecord.reason ?? '当前集证据包未就绪，系统未生成候选。')
    if (!proposals.length) return []
    const profile = this.assertAvailable()
    if (expectedProvider && !clipGenerationProviderMatches(profile, expectedProvider)) throw new Error('文本语义供应商配置已在排队期间变化；冻结任务不会静默切换供应商，请重新生成。')
    const candidateLimit = Math.max(1, Math.min(50, Math.floor(requestedCandidateLimit)))
    const allowedEvidence = this.packageEvidence(packageRecord.id)
    const boundaryKey = (selection: Pick<ProviderSelection, 'startEvidenceId' | 'endEvidenceId'>): string => JSON.stringify([allowedEvidence.get(selection.startEvidenceId)?.startSeconds, allowedEvidence.get(selection.endEvidenceId)?.endSeconds])
    const allowedIds = new Set(allowedEvidence.keys())
    // Proposal order is package timeline order. Never UUID-sort it: lexical UUID
    // order is unrelated to PTS and would turn a valid model boundary backwards.
    const normalized = proposals.map((proposal, index) => ({ ...proposal, evidenceIds: [...new Set(proposal.evidenceIds)], contextBeforeIds: [...new Set(proposal.contextBeforeIds ?? [])], contextAfterIds: [...new Set(proposal.contextAfterIds ?? [])], windowKey: `window-${index + 1}` }))
    if (normalized.some((proposal) => !proposal.evidenceIds.length || [...proposal.evidenceIds, ...proposal.contextBeforeIds, ...proposal.contextAfterIds].some((id) => !allowedIds.has(id)))) throw new Error('候选语义窗口包含不属于当前证据包的锚点，系统已拒绝生成。')

    let repair: { invalidResult: string } | undefined
    let unfinishedRanges = new Set<string>()
    let attemptProposals = normalized
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await this.adapter.select({ package: packageRecord, profile, proposals: attemptProposals, candidateLimit, repair, signal })
      const parsed = resultSchema.safeParse(raw)
      // Zod issue text can echo an untrusted unknown field name. It must never
      // flow into repair prompts, model-run history, task checkpoints or the
      // packaged evidence summary; persist only this fixed failure category.
      const validation = parsed.success ? this.validate(parsed.data.selections, attemptProposals, allowedEvidence, candidateLimit) : { ok: false as const, reason: '文本语义分析输出不满足结构合同。' }
      if (validation.ok) {
        if (parsed.success && parsed.data.selections.some((selection) => unfinishedRanges.has(boundaryKey(selection)))) throw new ClipSemanticValidationError('未收束候选的修正只改变了标签，起止证据范围没有变化，已停止生成。', 'continuity')
        this.persistNarrativeEvents(packageRecord, profile, validation.narrativeEvents, attemptProposals, allowedEvidence)
        return validation.selections.map((selection) => repair ? { ...selection, repairApplied: true, repairReason: repair.invalidResult } : selection)
      }
      if (attempt === 1) throw new ClipSemanticValidationError(/未收束/.test(validation.reason) ? `一次自动修正后仍没有已收束候选，已停止生成：${validation.reason}` : `文本语义分析返回的结构化结果无效，已停止生成候选：${validation.reason}`, validationCodeFor(validation.reason))
      // One repair is allowed for every invalid response, including syntactically
      // valid but snapshot-escaping IDs or illegal start/end relationships.
      repair = { invalidResult: validation.reason }
      if (parsed.success && /未收束/.test(validation.reason)) unfinishedRanges = new Set(parsed.data.selections.filter((selection) => selection.beat === 'setup' || selection.beat === 'entry' || selection.beat === 'escalation').map(boundaryKey))
      // An unclear seam is never silently accepted. The one permitted repair
      // re-analyses a window expanded by one whole unit on both sides; these
      // are already frozen in the first attempt's protected contexts.
      if (/接缝|连续性/.test(validation.reason)) attemptProposals = attemptProposals.map((proposal) => ({ ...proposal, evidenceIds: [...new Set([...(proposal.contextBeforeIds ?? []), ...proposal.evidenceIds, ...(proposal.contextAfterIds ?? [])])], contextBeforeIds: [], contextAfterIds: [] }))
    }
    throw new ClipSemanticValidationError('文本语义分析返回的结构化结果无效，已停止生成候选。', 'generic')
  }

  private validate(selections: ProviderSelection[], proposals: ReadonlyArray<ClipSemanticProposal & { windowKey: string }>, allowedEvidence: Map<string, EvidenceUnitRow>, candidateLimit: number): { ok: true; selections: ClipSemanticSelection[]; narrativeEvents: ResolvedNarrativeEvent[] } | { ok: false; reason: string } {
    if (selections.length > candidateLimit) return { ok: false, reason: `模型返回 ${selections.length} 条候选，超过本轮请求的 ${candidateLimit} 条上限。` }
    const accepted: ClipSemanticSelection[] = []
    const events: ResolvedNarrativeEvent[] = []
    const selectedWindows = new Set<string>()
    for (const selection of selections) {
      const evidenceIds = [...new Set(selection.evidenceIds)]
      const sourceWindow = proposals.find((proposal) => proposal.windowKey === selection.proposalId)
      if (!sourceWindow) return { ok: false, reason: '候选引用了当前证据包之外的分析窗口。' }
      const hasProtectedContext = Boolean(sourceWindow.contextBeforeIds?.length || sourceWindow.contextAfterIds?.length)
      if (selectedWindows.has(selection.proposalId)) return { ok: false, reason: '同一冻结窗口只能生成一个叙事事件候选。' }
      if (selection.beat === 'setup' || selection.beat === 'entry' || selection.beat === 'escalation') return { ok: false, reason: '候选结尾未收束；请从给定冻结窗口重选有反转、高点、反应或余韵依据的区间，不得仅修改节拍标签。' }
      if (selection.seamStatus === 'unclear') return { ok: false, reason: '叙事事件接缝连续性未闭合，不能生成自动候选。' }
      if (!evidenceIds.every((id) => sourceWindow.evidenceIds.includes(id)) || !sourceWindow.evidenceIds.includes(selection.startEvidenceId) || !sourceWindow.evidenceIds.includes(selection.endEvidenceId)) return { ok: false, reason: '候选证据超出其冻结窗口核心范围。' }
      if ([selection.startEvidenceId, selection.endEvidenceId, ...evidenceIds].some((id) => !allowedEvidence.has(id))) return { ok: false, reason: '返回了当前证据包之外的 ID。' }
      if (!evidenceIds.includes(selection.startEvidenceId) || !evidenceIds.includes(selection.endEvidenceId)) return { ok: false, reason: '起止锚点必须同时列入候选证据。' }
      const start = allowedEvidence.get(selection.startEvidenceId); const end = allowedEvidence.get(selection.endEvidenceId)
      if (!start || !end || start.startSeconds >= end.endSeconds) return { ok: false, reason: '起止锚点的时间顺序无效。' }
      if (evidenceIds.some((id) => { const unit = allowedEvidence.get(id); return !unit || unit.startSeconds < start.startSeconds || unit.endSeconds > end.endSeconds })) return { ok: false, reason: '候选核心证据超出模型声明的起止锚点范围。' }
      if (selection.narrative.continuity === 'unclear' || (!hasProtectedContext && selection.context === 'standalone' && selection.narrative.continuity !== 'continuous')) return { ok: false, reason: '剧情事件的跨窗连续性未闭合，不能生成自动候选。' }
      if ((selection.beat === 'reversal' || selection.beat === 'climax') && selection.narrative.state !== 'reversal' && selection.narrative.state !== 'completion') return { ok: false, reason: '候选节拍与事件状态不相容。' }
      if ((selection.beat === 'reaction' || selection.beat === 'aftermath') && selection.narrative.state !== 'reaction' && selection.narrative.state !== 'completion') return { ok: false, reason: '候选节拍与事件状态不相容。' }
      const eventId = `event-${selection.proposalId}`
      const sourceEvidenceIds = [...(sourceWindow.contextBeforeIds ?? []), ...sourceWindow.evidenceIds, ...(sourceWindow.contextAfterIds ?? [])]
      // A model cannot overstate an event as standalone when the frozen
      // analysis window relies on protected neighboring context. Keep the
      // qualification conservative even if the provider says standalone.
      const effectiveContext = sourceWindow.contextBeforeIds?.length || sourceWindow.contextAfterIds?.length ? 'limited' as const : selection.context
      events.push({ id: eventId, proposalId: selection.proposalId, coreEvidenceIds: [...sourceWindow.evidenceIds], sourceEvidenceIds, state: selection.narrative.state, characters: [...selection.narrative.characters], relationship: selection.narrative.relationship, conflict: selection.narrative.conflict, continuity: selection.narrative.continuity, seamStatus: selection.seamStatus })
      accepted.push({ startEvidenceId: selection.startEvidenceId, endEvidenceId: selection.endEvidenceId, evidenceIds, beat: selection.beat, purpose: selection.purpose, context: effectiveContext, narrative: selection.narrative, seamStatus: selection.seamStatus, narrativeEventId: eventId })
      selectedWindows.add(selection.proposalId)
    }
    return { ok: true, selections: accepted, narrativeEvents: events }
  }

  private persistNarrativeEvents(packageRecord: ClipEvidencePackage, profile: ProviderProfile, events: ResolvedNarrativeEvent[], proposals: ReadonlyArray<ClipSemanticProposal & { windowKey: string }>, evidence: Map<string, EvidenceUnitRow>): void {
    const now = new Date().toISOString()
    const insert = this.database.prepare(`INSERT INTO clip_narrative_events (id, package_id, event_key, window_key, source_evidence_ids_json, core_evidence_ids_json, context_before_ids_json, context_after_ids_json, start_seconds, end_seconds, state, characters_json, relationship, conflict, continuity, seam_status, provider, model, rule_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(package_id, event_key) DO UPDATE SET window_key = excluded.window_key, source_evidence_ids_json = excluded.source_evidence_ids_json, core_evidence_ids_json = excluded.core_evidence_ids_json, context_before_ids_json = excluded.context_before_ids_json, context_after_ids_json = excluded.context_after_ids_json, start_seconds = excluded.start_seconds, end_seconds = excluded.end_seconds, state = excluded.state, characters_json = excluded.characters_json, relationship = excluded.relationship, conflict = excluded.conflict, continuity = excluded.continuity, seam_status = excluded.seam_status, provider = excluded.provider, model = excluded.model, updated_at = excluded.updated_at`)
    this.database.transaction(() => {
      for (const event of events) {
        const matching = proposals.find((item) => item.windowKey === event.proposalId)
        if (!matching) continue
        const contextBefore = [...(matching.contextBeforeIds ?? [])]
        const contextAfter = [...(matching.contextAfterIds ?? [])]
        const units = event.sourceEvidenceIds.map((id) => evidence.get(id)).filter((item): item is EvidenceUnitRow => Boolean(item))
        const start = Math.min(...units.map((item) => item.startSeconds)); const end = Math.max(...units.map((item) => item.endSeconds))
        insert.run(randomUUID(), packageRecord.id, event.id, matching.windowKey, JSON.stringify(event.sourceEvidenceIds), JSON.stringify(event.coreEvidenceIds), JSON.stringify(contextBefore), JSON.stringify(contextAfter), start, end, event.state, JSON.stringify(event.characters), event.relationship, event.conflict, event.continuity, event.seamStatus, profile.provider, profile.model, 'narrative-event-map-v1', now, now)
      }
    })()
  }

  private packageEvidence(packageId: string): Map<string, EvidenceUnitRow> {
    const rows = this.database.prepare("SELECT source_ids_json AS sourceIdsJson, start_seconds AS startSeconds, end_seconds AS endSeconds, kind FROM clip_evidence_units WHERE package_id = ? AND (qualification = 'A' OR (kind = 'scene-anchor' AND qualification = 'B'))").all(packageId) as EvidenceUnitRow[]
    const evidence = new Map<string, EvidenceUnitRow>()
    for (const row of rows) {
      try {
        const value: unknown = JSON.parse(row.sourceIdsJson)
        if (Array.isArray(value)) for (const id of value) if (typeof id === 'string') evidence.set(id, row)
      } catch { /* Malformed legacy unit cannot be model-visible. */ }
    }
    return evidence
  }
}
