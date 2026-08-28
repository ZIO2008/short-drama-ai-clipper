import { randomUUID } from 'node:crypto'
import { anchorCandidateRanges, type CandidateAnchorRange, type CutAnchor } from './clip-anchor-readiness.js'
import type { ClipSemanticSelection } from './clip-candidate-intelligence-service.js'
import { ClipEvidencePackagePublication } from './clip-evidence-package-publication.js'

export type ClipEvidenceQualification = 'A' | 'B' | 'C' | 'D'
export type ClipCandidateQualification = 'qualified' | 'qualified_with_limit' | 'blocked'
export type ClipCandidateClaim = { kind: 'start-boundary' | 'end-boundary' | 'core-event' | 'narrative-closure' | 'visual-fact'; evidenceIds: string[]; qualification: ClipEvidenceQualification; reason: string }
export type ClipCandidateQualificationResult = { qualification: ClipCandidateQualification; reason: string | null; needsMultimodalReview: boolean; claims: ClipCandidateClaim[] }
export type ClipEvidencePackage = { id: string; dramaId: string; episodeId: string; version: number; sourceMediaFingerprint: string; ruleVersion: string; status: 'building' | 'ready' | 'failed'; reason: string | null }
type UnitRow = { kind: string; startSeconds: number; endSeconds: number; sourceIdsJson: string; qualification: ClipEvidenceQualification }

/** Candidate selection and local multimodal qualification over immutable packages. */
export class ClipEvidencePackageService extends ClipEvidencePackagePublication {
  buildForCandidates(dramaId: string, episodeIds: readonly string[]): Map<string, ClipEvidencePackage> {
    const packages = new Map<string, ClipEvidencePackage>()
    for (const episodeId of episodeIds) if (!packages.has(episodeId)) packages.set(episodeId, this.build(dramaId, episodeId))
    return packages
  }

  candidateRanges(packageRecord: ClipEvidencePackage, targetDurationSeconds: number): CandidateAnchorRange[] {
    if (packageRecord.status !== 'ready') return []
    const rows = this.database.prepare('SELECT kind, start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson, qualification FROM clip_evidence_units WHERE package_id = ? ORDER BY start_seconds, end_seconds, id').all(packageRecord.id) as UnitRow[]
    const anchors: CutAnchor[] = []
    for (const row of rows) {
      let ids: unknown = []; try { ids = JSON.parse(row.sourceIdsJson) } catch { continue }
      if (!Array.isArray(ids) || ids.length !== 1 || typeof ids[0] !== 'string') continue
      if (row.kind === 'semantic-event' && row.qualification === 'A') anchors.push({ startSeconds: row.startSeconds, endSeconds: row.endSeconds, semanticEventId: ids[0] })
      if (row.kind === 'scene-anchor' && row.qualification === 'B') anchors.push({ startSeconds: row.startSeconds, endSeconds: row.endSeconds, sceneAnchorId: ids[0] })
      if (row.kind === 'semantic-event' && row.qualification === 'C') anchors.push({ startSeconds: row.startSeconds, endSeconds: row.endSeconds, blocksAutomaticCandidate: true })
    }
    const duration = this.readDuration(packageRecord.id)
    return duration === null ? [] : anchorCandidateRanges(anchors, duration, targetDurationSeconds)
  }

  /** Complete semantic runs are grouped before candidate count or duration filters. */
  semanticWindows(packageRecord: ClipEvidencePackage): Array<{ evidenceIds: string[]; contextBeforeIds: string[]; contextAfterIds: string[] }> {
    if (packageRecord.status !== 'ready') return []
    const rows = this.database.prepare("SELECT kind, start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE package_id = ? AND kind IN ('semantic-event', 'scene-anchor') AND (qualification = 'A' OR qualification = 'B') ORDER BY start_seconds, end_seconds, id").all(packageRecord.id) as Array<{ kind: string; startSeconds: number; endSeconds: number; sourceIdsJson: string }>
    const units = rows.flatMap((row) => { try { const ids: unknown = JSON.parse(row.sourceIdsJson); return Array.isArray(ids) && ids.length === 1 && typeof ids[0] === 'string' ? [{ id: ids[0], kind: row.kind, startSeconds: row.startSeconds, endSeconds: row.endSeconds }] : [] } catch { return [] } })
    const semanticIndexes = units.map((unit, index) => ({ unit, index })).filter(({ unit }) => unit.kind === 'semantic-event')
    if (!semanticIndexes.length) return units.map((unit, index) => ({ evidenceIds: [unit.id], contextBeforeIds: index > 0 ? [units[index - 1]!.id] : [], contextAfterIds: index + 1 < units.length ? [units[index + 1]!.id] : [] }))
    const hasSceneSeparator = (left: number, right: number): boolean => units.some((unit) => unit.kind === 'scene-anchor' && unit.startSeconds >= units[left]!.endSeconds && unit.endSeconds <= units[right]!.startSeconds)
    const groups: Array<{ first: number; last: number }> = []
    for (const { index } of semanticIndexes) { const current = groups.at(-1); if (!current || hasSceneSeparator(current.last, index)) groups.push({ first: index, last: index }); else current.last = index }
    return groups.map(({ first, last }) => ({ evidenceIds: units.slice(first, last + 1).filter((unit) => semanticIndexes.some(({ index }) => units[index]!.id === unit.id)).map((unit) => unit.id), contextBeforeIds: first > 0 ? [units[first - 1]!.id] : [], contextAfterIds: last + 1 < units.length ? [units[last + 1]!.id] : [] }))
  }

  resolveSemanticSelection(packageRecord: ClipEvidencePackage, selection: ClipSemanticSelection): CandidateAnchorRange | null {
    if (packageRecord.status !== 'ready') return null
    const rows = this.database.prepare("SELECT kind, start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson, qualification FROM clip_evidence_units WHERE package_id = ? AND (qualification = 'A' OR (kind = 'scene-anchor' AND qualification = 'B')) ORDER BY start_seconds, end_seconds, id").all(packageRecord.id) as UnitRow[]
    const byEvidenceId = new Map<string, UnitRow>()
    for (const row of rows) { try { const ids: unknown = JSON.parse(row.sourceIdsJson); if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') byEvidenceId.set(id, row) } catch { /* unusable legacy unit */ } }
    const selectedRows = selection.evidenceIds.map((id) => ({ id, row: byEvidenceId.get(id) })).filter((value): value is { id: string; row: UnitRow } => Boolean(value.row))
    const start = byEvidenceId.get(selection.startEvidenceId); const end = byEvidenceId.get(selection.endEvidenceId)
    if (selectedRows.length !== selection.evidenceIds.length || !start || !end || end.endSeconds <= start.startSeconds) return null
    return { startSeconds: Number(start.startSeconds.toFixed(3)), endSeconds: Number(end.endSeconds.toFixed(3)), semanticEventIds: selectedRows.filter(({ row }) => row.kind === 'semantic-event').map(({ id }) => id), sceneAnchorIds: selectedRows.filter(({ row }) => row.kind === 'scene-anchor').map(({ id }) => id) }
  }

  qualifySemanticSelection(packageRecord: ClipEvidencePackage, selection: ClipSemanticSelection): ClipCandidateQualificationResult {
    if (packageRecord.status !== 'ready') return { qualification: 'blocked', reason: packageRecord.reason ?? '证据包不可用。', needsMultimodalReview: false, claims: [] }
    const rows = this.database.prepare('SELECT kind, start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson, qualification, reason FROM clip_evidence_units WHERE package_id = ? ORDER BY start_seconds, end_seconds, id').all(packageRecord.id) as Array<UnitRow & { reason: string | null }>
    const evidence = new Map<string, UnitRow & { reason: string | null }>()
    for (const row of rows) { try { const ids: unknown = JSON.parse(row.sourceIdsJson); if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') evidence.set(id, row) } catch { /* unusable frozen unit */ } }
    const selected = selection.evidenceIds.map((id) => evidence.get(id)); const start = evidence.get(selection.startEvidenceId); const end = evidence.get(selection.endEvidenceId)
    if (!start || !end || selected.some((item) => !item)) return { qualification: 'blocked', reason: '候选起止或核心事件缺少当前证据包中的可核验证据。', needsMultimodalReview: false, claims: [] }
    const selectedRows = selected.filter((item): item is UnitRow & { reason: string | null } => Boolean(item))
    const claim = (kind: ClipCandidateClaim['kind'], evidenceIds: string[], units: Array<UnitRow & { reason: string | null }>, reason: string): ClipCandidateClaim => ({ kind, evidenceIds, qualification: units.every((item) => item.qualification === 'A') ? 'A' : units.some((item) => item.qualification === 'C') ? 'C' : units.some((item) => item.qualification === 'B') ? 'B' : 'D', reason })
    const claims = [claim('start-boundary', [selection.startEvidenceId], [start], '候选入点由冻结证据包中的起始锚点解析。'), claim('end-boundary', [selection.endEvidenceId], [end], '候选出点由冻结证据包中的结束锚点解析。'), claim('core-event', [...selection.evidenceIds], selectedRows, '候选核心事件仅引用当前证据包中的已选证据单元。'), claim('narrative-closure', [selection.endEvidenceId], [end], selection.beat === 'setup' || selection.beat === 'entry' || selection.beat === 'escalation' ? '模型将结束节拍判为未收束状态，不能作为完整候选。' : '结束锚点承载已声明的反转、高点、反应或余韵节拍。')]
    if (selection.beat === 'setup' || selection.beat === 'entry' || selection.beat === 'escalation') return { qualification: 'blocked', reason: '候选结束仍处于铺垫、进入或情绪升级中段，未形成可审阅的叙事收束。', needsMultimodalReview: false, claims }
    if (selected.some((item) => item?.kind === 'scene-anchor')) return { qualification: 'blocked', reason: '候选依赖具体视觉事实，但当前仅有结构锚点；需完成局部视频复核后才可自动纳入候选。', needsMultimodalReview: true, claims }
    if (claims.some((item) => item.qualification !== 'A')) return { qualification: 'blocked', reason: '候选关键起止、核心事件或完整性结论存在冲突、缺失或非主证据，系统未猜测切点。', needsMultimodalReview: false, claims }
    return selection.context === 'limited' ? { qualification: 'qualified_with_limit', reason: '核心事件与切点证据完整，但前情或后续上下文受限。', needsMultimodalReview: false, claims } : { qualification: 'qualified', reason: null, needsMultimodalReview: false, claims }
  }

  recordSupportedVisualFact(input: { package: ClipEvidencePackage; taskId: string; modelRunId: string; evidenceIds: readonly string[]; claimKinds: readonly ClipCandidateClaim['kind'][]; ranges: ReadonlyArray<{ evidenceId: string; startSeconds: number; endSeconds: number; role: 'context-before' | 'core' | 'context-after' }>; frames: ReadonlyArray<{ ptsSeconds: number; sha256: string; byteLength: number }>; reason: string }): string {
    if (!input.evidenceIds.length || !input.claimKinds.length || !input.ranges.length || !input.frames.length) throw new Error('局部视频复核缺少可回链的范围、关键结论或帧事实，不能创建视觉主证据。')
    const id = randomUUID(); const now = new Date().toISOString(); const startSeconds = Math.min(...input.ranges.map((item) => item.startSeconds)); const endSeconds = Math.max(...input.ranges.map((item) => item.endSeconds))
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) throw new Error('局部视频复核范围无效，不能创建视觉主证据。')
    this.database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, coverage_json, source_version, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, input.package.id, 'multimodal-visual-fact', startSeconds, endSeconds, JSON.stringify([id]), 'A', JSON.stringify({ scope: 'multimodal-visual-fact', visualFact: 'available', claimKinds: [...new Set(input.claimKinds)], reviewTaskId: input.taskId, modelRunId: input.modelRunId, sourceEvidenceIds: [...new Set(input.evidenceIds)], reviewScope: input.ranges, frames: input.frames, limitedTo: '本次局部审阅已支持的具体视觉事实' }), 'multimodal-review-v1', `局部视频复核已支持的具体视觉事实：${input.reason}`, now, now)
    return id
  }

  qualifyReviewedVisualSelection(packageRecord: ClipEvidencePackage, selection: ClipSemanticSelection, visualFactEvidenceId: string, visualFactReason: string): ClipCandidateQualificationResult {
    const base = this.qualifySemanticSelection(packageRecord, selection)
    if (!base.needsMultimodalReview) return { qualification: 'blocked', reason: '候选并未处于必须视频复核状态，拒绝把视觉事实用于不匹配的资格提升。', needsMultimodalReview: false, claims: base.claims }
    const unit = this.database.prepare("SELECT qualification, coverage_json AS coverageJson FROM clip_evidence_units WHERE id = ? AND package_id = ? AND kind = 'multimodal-visual-fact'").get(visualFactEvidenceId, packageRecord.id) as { qualification: ClipEvidenceQualification; coverageJson: string } | undefined
    if (!unit || unit.qualification !== 'A') return { qualification: 'blocked', reason: '关键视觉事实没有可回链的 A 级局部视频复核证据。', needsMultimodalReview: false, claims: base.claims }
    let coverage: unknown = null; try { coverage = JSON.parse(unit.coverageJson) } catch { /* unavailable */ }
    const scopeIds = coverage && typeof coverage === 'object' && 'reviewScope' in coverage && Array.isArray((coverage as { reviewScope?: unknown }).reviewScope) ? (coverage as { reviewScope: Array<{ evidenceId?: unknown }> }).reviewScope.map((item) => item.evidenceId).filter((id): id is string => typeof id === 'string') : []
    const claimKinds = coverage && typeof coverage === 'object' && 'claimKinds' in coverage && Array.isArray((coverage as { claimKinds?: unknown }).claimKinds) ? (coverage as { claimKinds: unknown[] }).claimKinds.filter((kind): kind is ClipCandidateClaim['kind'] => kind === 'start-boundary' || kind === 'end-boundary' || kind === 'core-event' || kind === 'narrative-closure') : []
    const sceneIds = selection.evidenceIds.filter((id) => this.isSceneAnchor(packageRecord.id, id))
    if (!sceneIds.length || !sceneIds.every((id) => scopeIds.includes(id))) return { qualification: 'blocked', reason: '局部视频复核没有覆盖候选依赖的每个关键视觉锚点，系统未提升资格。', needsMultimodalReview: false, claims: base.claims }
    const claims = base.claims.map((claim) => { const claimSceneIds = claim.evidenceIds.filter((id) => this.isSceneAnchor(packageRecord.id, id)); const nonScenePrimary = claim.evidenceIds.filter((id) => !claimSceneIds.includes(id)).every((id) => this.evidenceQualification(packageRecord.id, id) === 'A'); return claimKinds.includes(claim.kind) && claimSceneIds.length && claimSceneIds.every((id) => scopeIds.includes(id)) && nonScenePrimary ? { ...claim, evidenceIds: [...claim.evidenceIds, visualFactEvidenceId], qualification: 'A' as const, reason: '该关键结论中的具体视觉事实由本次局部视频复核的 A 级事实证据覆盖。' } : claim })
    claims.push({ kind: 'visual-fact', evidenceIds: [visualFactEvidenceId], qualification: 'A', reason: `局部视频复核已支持的具体视觉事实：${visualFactReason}` })
    if (claims.some((claim) => claim.qualification !== 'A')) return { qualification: 'blocked', reason: '候选仍有未由主证据覆盖的关键结论，系统未纳入候选。', needsMultimodalReview: false, claims }
    return selection.context === 'limited' ? { qualification: 'qualified_with_limit', reason: '关键视觉事实已完成局部视频复核；前情或后续上下文受限。', needsMultimodalReview: false, claims } : { qualification: 'qualified', reason: null, needsMultimodalReview: false, claims }
  }

  orderedEvidenceIds(packageRecord: ClipEvidencePackage, evidenceIds: readonly string[]): string[] {
    const ranges = new Map<string, number>(); const rows = this.database.prepare('SELECT start_seconds AS startSeconds, source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE package_id = ?').all(packageRecord.id) as Array<{ startSeconds: number; sourceIdsJson: string }>
    for (const row of rows) { try { const ids: unknown = JSON.parse(row.sourceIdsJson); if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') ranges.set(id, row.startSeconds) } catch { /* ignored */ } }
    return [...new Set(evidenceIds)].sort((left, right) => (ranges.get(left) ?? Number.POSITIVE_INFINITY) - (ranges.get(right) ?? Number.POSITIVE_INFINITY) || left.localeCompare(right))
  }

  surroundingEvidenceIds(packageRecord: ClipEvidencePackage, coreEvidenceIds: readonly string[]): { before: string[]; after: string[] } {
    const rows = this.database.prepare("SELECT start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE package_id = ? AND kind IN ('semantic-event', 'scene-anchor') AND qualification IN ('A', 'B') ORDER BY start_seconds, end_seconds, id").all(packageRecord.id) as Array<{ startSeconds: number; endSeconds: number; sourceIdsJson: string }>
    const units = rows.flatMap((row) => { try { const ids: unknown = JSON.parse(row.sourceIdsJson); return Array.isArray(ids) && ids.length === 1 && typeof ids[0] === 'string' ? [{ id: ids[0], ...row }] : [] } catch { return [] } }); const core = new Set(coreEvidenceIds); const indexes = units.map((unit, index) => core.has(unit.id) ? index : -1).filter((index) => index >= 0)
    if (!indexes.length) return { before: [], after: [] }; const first = Math.min(...indexes); const last = Math.max(...indexes); return { before: first > 0 ? [units[first - 1]!.id] : [], after: last + 1 < units.length ? [units[last + 1]!.id] : [] }
  }

  multimodalReviewScope(packageRecord: ClipEvidencePackage, selection: ClipSemanticSelection): { evidenceIds: string[]; ranges: Array<{ evidenceId: string; startSeconds: number; endSeconds: number; role: 'context-before' | 'core' | 'context-after' }> } | null {
    if (!selection.narrativeEventId) return null
    const row = this.database.prepare('SELECT source_evidence_ids_json AS sourceIdsJson, core_evidence_ids_json AS coreIdsJson, context_before_ids_json AS beforeIdsJson, context_after_ids_json AS afterIdsJson, continuity, seam_status AS seamStatus FROM clip_narrative_events WHERE package_id = ? AND event_key = ?').get(packageRecord.id, selection.narrativeEventId) as { sourceIdsJson: string; coreIdsJson: string; beforeIdsJson: string; afterIdsJson: string; continuity: string; seamStatus: string } | undefined
    if (!row || row.continuity === 'unclear' || row.seamStatus === 'unclear') return null
    try { const sourceIds = JSON.parse(row.sourceIdsJson) as string[]; const coreIds = JSON.parse(row.coreIdsJson) as string[]; const beforeIds = JSON.parse(row.beforeIdsJson) as string[]; const afterIds = JSON.parse(row.afterIdsJson) as string[]; if (![sourceIds, coreIds, beforeIds, afterIds].every(Array.isArray)) return null; const ordered = this.orderedEvidenceIds(packageRecord, [...new Set([...beforeIds, ...coreIds, ...afterIds])]); if (!ordered.length || !coreIds.every((id) => sourceIds.includes(id))) return null; const units = new Map<string, { startSeconds: number; endSeconds: number }>(); const unitRows = this.database.prepare('SELECT start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE package_id = ?').all(packageRecord.id) as Array<{ startSeconds: number; endSeconds: number; sourceIdsJson: string }>; for (const unit of unitRows) { try { const ids: unknown = JSON.parse(unit.sourceIdsJson); if (Array.isArray(ids)) for (const id of ids) if (typeof id === 'string') units.set(id, unit) } catch { /* ignored */ } } const core = new Set(coreIds); const before = new Set(beforeIds); const ranges = ordered.map((evidenceId) => { const unit = units.get(evidenceId); return unit ? { evidenceId, ...unit, role: core.has(evidenceId) ? 'core' as const : before.has(evidenceId) ? 'context-before' as const : 'context-after' as const } : null }).filter((item): item is { evidenceId: string; startSeconds: number; endSeconds: number; role: 'context-before' | 'core' | 'context-after' } => Boolean(item)); return ranges.length === ordered.length ? { evidenceIds: ordered, ranges } : null } catch { return null }
  }

  semanticContext(packageRecord: ClipEvidencePackage, evidenceIds: readonly string[]): string {
    const eventIds = [...new Set(evidenceIds)].filter((id) => this.database.prepare("SELECT 1 FROM clip_evidence_units WHERE package_id = ? AND (qualification = 'A' OR (kind = 'scene-anchor' AND qualification = 'B')) AND source_ids_json LIKE ?").get(packageRecord.id, `%${id}%`)); if (!eventIds.length) return ''
    const rows = this.database.prepare(`SELECT DISTINCT cue.text FROM subtitle_semantic_event_cues link JOIN subtitle_cues cue ON cue.id = link.cue_id WHERE link.event_id IN (${eventIds.map(() => '?').join(',')}) ORDER BY cue.start_seconds, cue.id`).all(...eventIds) as Array<{ text: string }>; const text = rows.map((row) => row.text.trim()).filter(Boolean).join('\n'); if (text) return text.slice(0, 12_000)
    const sceneRows = this.database.prepare(`SELECT evidence.summary FROM clip_evidence_units unit JOIN ai_evidence evidence ON unit.source_ids_json LIKE '%' || evidence.id || '%' WHERE unit.package_id = ? AND unit.kind = 'scene-anchor'`).all(packageRecord.id) as Array<{ summary: string }>; return sceneRows.map((row) => row.summary.trim()).filter(Boolean).join('\n').slice(0, 12_000)
  }

  private isSceneAnchor(packageId: string, evidenceId: string): boolean { const rows = this.database.prepare("SELECT source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE package_id = ? AND kind = 'scene-anchor'").all(packageId) as Array<{ sourceIdsJson: string }>; return rows.some((row) => { try { const ids: unknown = JSON.parse(row.sourceIdsJson); return Array.isArray(ids) && ids.includes(evidenceId) } catch { return false } }) }
  private evidenceQualification(packageId: string, evidenceId: string): ClipEvidenceQualification | null { const rows = this.database.prepare('SELECT qualification, source_ids_json AS sourceIdsJson FROM clip_evidence_units WHERE package_id = ?').all(packageId) as Array<{ qualification: ClipEvidenceQualification; sourceIdsJson: string }>; for (const row of rows) { try { const ids: unknown = JSON.parse(row.sourceIdsJson); if (Array.isArray(ids) && ids.includes(evidenceId)) return row.qualification } catch { /* ignored */ } } return null }
  private readDuration(packageId: string): number | null { const row = this.database.prepare('SELECT evidence_json AS evidenceJson FROM clip_evidence_packages WHERE id = ?').get(packageId) as { evidenceJson: string } | undefined; try { const value: unknown = JSON.parse(row?.evidenceJson ?? '{}'); return value && typeof value === 'object' && 'durationSeconds' in value && typeof value.durationSeconds === 'number' && value.durationSeconds > 0 ? value.durationSeconds : null } catch { return null } }
}
