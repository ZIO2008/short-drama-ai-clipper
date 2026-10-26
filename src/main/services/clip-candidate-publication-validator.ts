import type Database from 'better-sqlite3'

type PackageIdentity = { id: string; episodeId: string }
type PublicationCandidate = { candidateId: string; package: PackageIdentity; qualification: 'qualified' | 'qualified_with_limit' | 'blocked'; summary: unknown }
type PlannedRange = { episodeId?: unknown; startSeconds?: unknown; endSeconds?: unknown; semanticEventIds?: unknown; sceneAnchorIds?: unknown }
type EvidenceUnit = { startSeconds: number; endSeconds: number; sourceIdsJson: string; kind: string; qualification: string }

const ids = (value: unknown): string[] => Array.isArray(value) && value.every((item) => typeof item === 'string') ? [...new Set(value)] : []
const sameIds = (left: readonly string[], right: readonly string[]): boolean => [...left].sort().join('\n') === [...right].sort().join('\n')

export const validateClipCandidatePublication = (database: Database.Database, input: { taskId: string; taskRound: number; config: unknown; provider: unknown; candidates: readonly PublicationCandidate[] }): void => {
  const task = database.prepare('SELECT config_snapshot AS configSnapshot, checkpoint FROM production_tasks WHERE id = ?').get(input.taskId) as { configSnapshot: string; checkpoint: string | null } | undefined
  if (!task || task.configSnapshot !== JSON.stringify(input.config)) throw new Error('候选发布配置与任务冻结快照不一致。')
  let checkpoint: { taskRound?: unknown } = {}; try { checkpoint = JSON.parse(task.checkpoint ?? '{}') as typeof checkpoint } catch { throw new Error('候选发布检查点无效。') }
  const configRound = input.config && typeof input.config === 'object' && 'taskRound' in input.config ? (input.config as { taskRound?: unknown }).taskRound : undefined
  if (!Number.isInteger(input.taskRound) || input.taskRound < 1 || configRound !== input.taskRound || checkpoint.taskRound !== input.taskRound) throw new Error('候选发布轮次与任务冻结轮次不一致。')
  const configProvider = input.config && typeof input.config === 'object' && 'provider' in input.config ? (input.config as { provider?: unknown }).provider : undefined
  if (JSON.stringify(configProvider) !== JSON.stringify(input.provider)) throw new Error('候选发布供应商与任务冻结快照不一致。')

  for (const candidate of input.candidates) {
    if (candidate.qualification === 'blocked') throw new Error('证据阻断候选不能进入发布轮次。')
    const item = database.prepare('SELECT task_id AS taskId, planned_range AS plannedRange, status FROM task_items WHERE id = ?').get(candidate.candidateId) as { taskId: string; plannedRange: string; status: string } | undefined
    if (!item || item.taskId !== input.taskId || item.status !== 'pending_review') throw new Error('候选不属于当前可发布任务轮次。')
    let planned: PlannedRange = {}
    try { planned = JSON.parse(item.plannedRange) as PlannedRange } catch { throw new Error('候选范围快照无效，不能发布。') }
    if (planned.episodeId !== candidate.package.episodeId || typeof planned.startSeconds !== 'number' || typeof planned.endSeconds !== 'number') throw new Error('候选分集或范围与冻结证据包不一致。')
    const summary = candidate.summary && typeof candidate.summary === 'object' ? candidate.summary as { startSeconds?: unknown; endSeconds?: unknown; semanticEventIds?: unknown; sceneAnchorIds?: unknown } : {}
    if (summary.startSeconds !== planned.startSeconds || summary.endSeconds !== planned.endSeconds) throw new Error('候选摘要范围与任务项冻结范围不一致。')
    const plannedSemanticIds = ids(planned.semanticEventIds); const plannedSceneIds = ids(planned.sceneAnchorIds)
    if (!sameIds(plannedSemanticIds, ids(summary.semanticEventIds)) || !sameIds(plannedSceneIds, ids(summary.sceneAnchorIds))) throw new Error('候选摘要事件或场景锚与任务项冻结证据不一致。')
    if (!plannedSemanticIds.length && !plannedSceneIds.length) throw new Error('候选缺少冻结事件或场景锚，不能发布。')
    const units = database.prepare('SELECT start_seconds AS startSeconds, end_seconds AS endSeconds, source_ids_json AS sourceIdsJson, kind, qualification FROM clip_evidence_units WHERE package_id = ?').all(candidate.package.id) as EvidenceUnit[]
    const semanticUnits = new Map<string, EvidenceUnit>(); const sceneUnits = new Map<string, EvidenceUnit>()
    for (const unit of units) { try { for (const sourceId of ids(JSON.parse(unit.sourceIdsJson) as unknown)) { if (unit.kind === 'semantic-event' && unit.qualification === 'A') semanticUnits.set(sourceId, unit); if (unit.kind === 'scene-anchor' && unit.qualification === 'B') sceneUnits.set(sourceId, unit) } } catch { /* malformed evidence is not publishable */ } }
    const selectedUnits = [...plannedSemanticIds.map((id) => semanticUnits.get(id)), ...plannedSceneIds.map((id) => sceneUnits.get(id))]
    if (selectedUnits.some((unit) => !unit)) throw new Error('候选引用了冻结证据包之外或资格不足的事件锚。')
    const resolved = selectedUnits.filter((unit): unit is EvidenceUnit => Boolean(unit))
    const start = Number(Math.min(...resolved.map((unit) => unit.startSeconds)).toFixed(3)); const end = Number(Math.max(...resolved.map((unit) => unit.endSeconds)).toFixed(3))
    if (start !== planned.startSeconds || end !== planned.endSeconds) throw new Error('候选范围不能由冻结证据单元的 PTS 还原。')
  }
}
