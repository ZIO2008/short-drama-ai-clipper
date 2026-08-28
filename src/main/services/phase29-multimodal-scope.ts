import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type Database from 'better-sqlite3'
import type { ClipEvidencePackage } from './clip-evidence-package-service.js'
import type { ClipReviewClaimKind } from './clip-multimodal-review-service.js'

export const FROZEN_MULTIMODAL_SCOPE_SHA256 = 'B6ED59B632CC13CCE571D75C90E456936DC5A3D7087A6B44D539863CD5536034'

export type FrozenMultimodalScope = {
  sampleId: 'dev-03' | 'dev-04'
  sceneCard: string
  packageId: string
  evidenceId: string
  taskId: string
  candidateId: string
  snapshotId: string
  startSeconds: number
  endSeconds: number
  factCode: string
  statement: string
  claimKinds: ClipReviewClaimKind[]
  expectedConclusion: 'supported' | 'blocked'
}

type ScopeManifest = { version: number; baselineManifestSha256: string; scopes: FrozenMultimodalScope[] }
type Sample = { id: string; sceneCards: string[] }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i

const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex').toUpperCase()

export const readFrozenMultimodalScope = async (path: string, baselineManifestSha256: string, sample: Sample): Promise<FrozenMultimodalScope> => {
  const bytes = await readFile(path)
  if (sha256(bytes) !== FROZEN_MULTIMODAL_SCOPE_SHA256) throw new Error('视频复核范围清单哈希不匹配，拒绝执行。')
  const manifest = JSON.parse(bytes.toString('utf8')) as ScopeManifest
  if (manifest.version !== 1 || manifest.baselineManifestSha256 !== baselineManifestSha256.toUpperCase() || manifest.scopes.length !== 2) throw new Error('视频复核范围清单未绑定当前 Baseline v1。')
  const scope = manifest.scopes.find((item) => item.sampleId === sample.id)
  if (!scope || !sample.sceneCards.includes(scope.sceneCard)) throw new Error('视频复核范围未绑定当前冻结场景卡。')
  if (![scope.packageId, scope.evidenceId, scope.taskId, scope.candidateId, scope.snapshotId].every((id) => UUID.test(id))) throw new Error('视频复核范围缺少稳定 UUID 身份。')
  if (!Number.isFinite(scope.startSeconds) || !Number.isFinite(scope.endSeconds) || scope.startSeconds < 0 || scope.endSeconds <= scope.startSeconds) throw new Error('视频复核冻结 PTS 范围无效。')
  if (scope.claimKinds.length !== 1 || scope.claimKinds[0] !== 'core-event' || !scope.statement.trim() || !scope.factCode.trim()) throw new Error('视频复核冻结事实合同无效。')
  return scope
}

export const seedFrozenMultimodalCandidate = (database: Database.Database, input: { scope: FrozenMultimodalScope; sourcePath: string; sourceFingerprint: string; durationSeconds: number }): ClipEvidencePackage => {
  const { scope } = input
  if (scope.endSeconds > input.durationSeconds) throw new Error('视频复核范围超出源片时长。')
  const now = new Date().toISOString()
  const dramaId = `phase29-${scope.sampleId}`
  database.prepare('INSERT INTO dramas (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(dramaId, 'Phase 29 冻结视频复核', now, now)
  database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, source_fingerprint, duration_seconds, status, created_at, updated_at) VALUES (?, ?, 1, 0, ?, ?, ?, ?, ?, ?)').run(scope.sampleId, dramaId, input.sourcePath, input.sourceFingerprint, input.durationSeconds, 'ready', now, now)
  database.prepare('INSERT INTO ai_evidence (id, drama_id, episode_id, source_type, start_seconds, end_seconds, confidence, summary, details_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)').run(scope.evidenceId, dramaId, scope.sampleId, 'scene', scope.startSeconds, scope.endSeconds, scope.statement, JSON.stringify({ sceneCard: scope.sceneCard, factCode: scope.factCode, frozen: true }), now, now)
  database.prepare('INSERT INTO clip_evidence_packages (id, drama_id, episode_id, version, source_media_fingerprint, rule_version, status, evidence_json, reason, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?, NULL, ?, ?)').run(scope.packageId, dramaId, scope.sampleId, input.sourceFingerprint, 'phase29-multimodal-scope-v1', 'ready', JSON.stringify({ scopeManifestSha256: FROZEN_MULTIMODAL_SCOPE_SHA256, sceneCard: scope.sceneCard, ptsReadable: true }), now, now)
  database.prepare('INSERT INTO clip_evidence_units (id, package_id, kind, start_seconds, end_seconds, source_ids_json, qualification, coverage_json, source_version, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(scope.evidenceId, scope.packageId, 'scene-anchor', scope.startSeconds, scope.endSeconds, JSON.stringify([scope.evidenceId]), 'B', JSON.stringify({ role: 'core', factCode: scope.factCode }), 'phase29-multimodal-scope-v1', '冻结视觉场景锚点，等待局部视频复核。', now, now)
  database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?)').run(scope.taskId, dramaId, 'original_clip', JSON.stringify({ phase: 29, sampleId: scope.sampleId, packageId: scope.packageId }), 'reviewing', JSON.stringify({ stage: 'multimodal-review', evidenceId: scope.evidenceId }), now, now)
  database.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, reason, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)').run(scope.candidateId, scope.taskId, JSON.stringify({ startSeconds: scope.startSeconds, endSeconds: scope.endSeconds }), 'pending_review', '等待冻结视觉事实复核。', now, now)
  database.prepare('INSERT INTO clip_candidate_snapshots (id, candidate_id, package_id, qualification, config_json, provider_json, summary_json, task_id, task_round, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)').run(scope.snapshotId, scope.candidateId, scope.packageId, 'blocked', JSON.stringify({ phase: 29, frozen: true }), JSON.stringify({ capability: 'multimodal-review', status: 'pending' }), JSON.stringify({ startSeconds: scope.startSeconds, endSeconds: scope.endSeconds, evidenceIds: [scope.evidenceId], factCode: scope.factCode }), scope.taskId, now, now)
  return { id: scope.packageId, dramaId, episodeId: scope.sampleId, version: 1, sourceMediaFingerprint: input.sourceFingerprint, ruleVersion: 'phase29-multimodal-scope-v1', status: 'ready', reason: null }
}

export const assertFrozenCandidateScope = (database: Database.Database, scope: FrozenMultimodalScope): void => {
  const row = database.prepare(`SELECT snapshot.candidate_id AS candidateId, snapshot.package_id AS packageId, unit.source_ids_json AS sourceIdsJson,
    unit.start_seconds AS startSeconds, unit.end_seconds AS endSeconds, snapshot.summary_json AS summaryJson
    FROM clip_candidate_snapshots snapshot JOIN clip_evidence_units unit ON unit.package_id = snapshot.package_id
    WHERE snapshot.id = ? AND snapshot.candidate_id = ? AND unit.id = ? AND unit.kind = 'scene-anchor'`).get(scope.snapshotId, scope.candidateId, scope.evidenceId) as { candidateId: string; packageId: string; sourceIdsJson: string; startSeconds: number; endSeconds: number; summaryJson: string } | undefined
  if (!row || row.packageId !== scope.packageId || row.startSeconds !== scope.startSeconds || row.endSeconds !== scope.endSeconds) throw new Error('视频复核候选未回链冻结证据范围。')
  const sourceIds = JSON.parse(row.sourceIdsJson) as unknown
  const summary = JSON.parse(row.summaryJson) as { startSeconds?: unknown; endSeconds?: unknown; evidenceIds?: unknown; factCode?: unknown }
  if (!Array.isArray(sourceIds) || sourceIds.length !== 1 || sourceIds[0] !== scope.evidenceId || summary.startSeconds !== scope.startSeconds || summary.endSeconds !== scope.endSeconds || !Array.isArray(summary.evidenceIds) || summary.evidenceIds[0] !== scope.evidenceId || summary.factCode !== scope.factCode) throw new Error('视频复核候选快照与冻结事实身份不一致。')
}
