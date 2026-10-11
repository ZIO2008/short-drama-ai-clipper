import { randomUUID } from 'node:crypto'
import { fingerprintMediaSource } from '../media/media-source-fingerprint.js'
import { validateClipCandidatePublication } from './clip-candidate-publication-validator.js'
import { CLIP_EVIDENCE_RULE_VERSION, ClipEvidencePackageBuilder } from './clip-evidence-package-builder.js'
import type { ClipCandidateQualification, ClipEvidencePackage } from './clip-evidence-package-service.js'

export class ClipEvidencePackagePublication extends ClipEvidencePackageBuilder {
  createCandidateSnapshot(input: { candidateId: string; package: ClipEvidencePackage; taskId?: string; taskRound?: number; qualification?: ClipCandidateQualification; config?: unknown; provider?: unknown; summary?: unknown }): string {
    const id = randomUUID(); const now = new Date().toISOString()
    this.database.prepare('INSERT INTO clip_candidate_snapshots (id, candidate_id, package_id, qualification, config_json, provider_json, summary_json, task_id, task_round, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, input.candidateId, input.package.id, input.qualification ?? 'qualified', JSON.stringify(input.config ?? {}), JSON.stringify(input.provider ?? { capability: 'text-analysis', status: 'not-configured' }), JSON.stringify(input.summary ?? {}), input.taskId ?? null, input.taskRound ?? 0, now, now)
    return id
  }

  /** A generation round becomes visible only after every candidate snapshot is durable. */
  publishGenerationRound(input: { taskId: string; taskRound: number; dramaId: string; config: unknown; provider: unknown; blocked?: Array<{ reason: string; count: number }>; blockedTotal?: number; recovery?: 'assets' | 'subtitles' | null; candidates: Array<{ candidateId: string; package: ClipEvidencePackage; qualification: ClipCandidateQualification; summary: unknown }> }): void {
    if (!input.candidates.length) throw new Error('没有可发布的候选快照。')
    const now = new Date().toISOString(); let rejectedAsStale = false
    this.database.transaction(() => {
      const task = this.database.prepare('SELECT status, checkpoint FROM production_tasks WHERE id = ? AND drama_id = ? AND type = ?').get(input.taskId, input.dramaId, 'original_clip') as { status: string; checkpoint: string | null } | undefined
      if (!task || task.status !== 'running' || !input.candidates.every((candidate) => this.hasPublicationAuthority(candidate.package, input.taskId, input.taskRound))) throw new Error('候选生成任务已失效，拒绝发布迟到结果。')
      validateClipCandidatePublication(this.database, input)
      const stale = input.candidates.some((candidate) => { const pointer = this.database.prepare('SELECT task_id AS taskId, task_round AS taskRound FROM clip_candidate_publish_pointers WHERE drama_id = ? AND episode_id = ?').get(input.dramaId, candidate.package.episodeId) as { taskId: string; taskRound: number } | undefined; return Boolean(pointer && (pointer.taskRound > input.taskRound || (pointer.taskRound === input.taskRound && pointer.taskId !== input.taskId))) })
      if (stale) { this.database.prepare("UPDATE production_tasks SET status = 'failed', checkpoint = ?, updated_at = ? WHERE id = ? AND status = 'running'").run(JSON.stringify({ version: 1, stage: 'obsolete', reason: '该候选生成轮次晚于更高或同轮稳定发布结果返回，已终结且不会进入候选列表。', taskRound: input.taskRound }), now, input.taskId); rejectedAsStale = true; return }
      const snapshots = input.candidates.map((candidate) => ({ candidate, snapshotId: this.createCandidateSnapshot({ candidateId: candidate.candidateId, package: candidate.package, taskId: input.taskId, taskRound: input.taskRound, qualification: candidate.qualification, config: input.config, provider: input.provider, summary: candidate.summary }) }))
      const publish = this.database.prepare('INSERT INTO clip_candidate_publish_pointers (drama_id, episode_id, snapshot_id, task_id, task_round, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(drama_id, episode_id) DO UPDATE SET snapshot_id = excluded.snapshot_id, task_id = excluded.task_id, task_round = excluded.task_round, updated_at = excluded.updated_at WHERE excluded.task_round > clip_candidate_publish_pointers.task_round')
      const publishMember = this.database.prepare('INSERT INTO clip_candidate_publish_members (candidate_id, snapshot_id, drama_id, episode_id, task_id, task_round, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      const firstSnapshotByEpisode = new Set<string>()
      for (const { candidate, snapshotId } of snapshots) {
        if (candidate.qualification === 'blocked') continue
        if (!firstSnapshotByEpisode.has(candidate.package.episodeId)) { publish.run(candidate.package.dramaId, candidate.package.episodeId, snapshotId, input.taskId, input.taskRound, now); firstSnapshotByEpisode.add(candidate.package.episodeId) }
        publishMember.run(candidate.candidateId, snapshotId, candidate.package.dramaId, candidate.package.episodeId, input.taskId, input.taskRound, now)
      }
      const previousCheckpoint = this.readCheckpoint(task.checkpoint)
      const blockedTotal = input.blockedTotal ?? input.blocked?.reduce((total, item) => total + item.count, 0) ?? 0
      const blockedReason = blockedTotal ? `已发布 ${snapshots.length} 条候选；另有 ${blockedTotal} 条未纳入：${(input.blocked ?? []).map((item) => `${item.count} 条${item.reason}`).join('；')}` : `已生成 ${snapshots.length} 条候选，等待人工审阅。`
      const startedAt = this.readStartedAt(task.checkpoint)
      this.database.prepare('UPDATE production_tasks SET status = ?, checkpoint = ?, updated_at = ? WHERE id = ? AND status = ?').run('reviewing', JSON.stringify({ version: 1, stage: 'reviewing', reason: blockedReason, taskRound: input.taskRound, startedAt, completedAt: now, elapsedMs: Math.max(0, Date.now() - new Date(startedAt).getTime()), activeSince: null, candidateCount: snapshots.length, blocked: input.blocked ?? [], blockedTotal, recovery: input.recovery ?? null, ...(previousCheckpoint.resourceBudget ? { resourceBudget: previousCheckpoint.resourceBudget } : {}), ...(previousCheckpoint.resourceUsage ? { resourceUsage: previousCheckpoint.resourceUsage } : {}) }), now, input.taskId, 'running')
    })()
    if (rejectedAsStale) throw new Error('候选生成轮次已过期，稳定发布指针未改变。')
  }

  recordLocalSemanticRun(packageRecord: ClipEvidencePackage, inputIds: readonly string[], result: unknown): string {
    const id = randomUUID(); const now = new Date().toISOString()
    this.database.prepare('INSERT INTO clip_model_runs (id, package_id, capability, status, provider, model, input_ids_json, result_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, packageRecord.id, 'text-analysis', 'completed', 'local-evidence-adapter', CLIP_EVIDENCE_RULE_VERSION, JSON.stringify(inputIds), JSON.stringify(result), null, now, now)
    return id
  }

  recordSemanticRun(input: { taskId?: string; package: ClipEvidencePackage; provider: { provider: string; model: string | null }; inputIds: readonly string[]; result: unknown; status?: 'completed' | 'failed' | 'cancelled'; reason?: string | null }): string {
    const id = randomUUID(); const now = new Date().toISOString()
    this.database.prepare('INSERT INTO clip_model_runs (id, task_id, package_id, capability, status, provider, model, input_ids_json, result_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, input.taskId ?? null, input.package.id, 'text-analysis', input.status ?? 'completed', input.provider.provider, input.provider.model, JSON.stringify(input.inputIds), JSON.stringify(input.result), input.reason ?? null, now, now)
    return id
  }

  recordMultimodalRun(input: { taskId: string; package: ClipEvidencePackage; provider: { provider: string; model: string | null }; inputIds: readonly string[]; result: unknown; status: 'completed' | 'failed' | 'cancelled'; reason?: string | null }): string {
    const id = randomUUID(); const now = new Date().toISOString()
    this.database.prepare('INSERT INTO clip_model_runs (id, task_id, package_id, capability, status, provider, model, input_ids_json, result_json, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, input.taskId, input.package.id, 'multimodal-review', input.status, input.provider.provider, input.provider.model, JSON.stringify(input.inputIds), JSON.stringify(input.result), input.reason ?? null, now, now)
    return id
  }

  latest(dramaId: string, episodeId: string): ClipEvidencePackage {
    const row = this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, version, source_media_fingerprint AS sourceMediaFingerprint, rule_version AS ruleVersion, status, reason FROM clip_evidence_packages WHERE drama_id = ? AND episode_id = ? ORDER BY version DESC LIMIT 1').get(dramaId, episodeId) as ClipEvidencePackage | undefined
    if (!row) throw new Error('当前分集没有已构建证据包。')
    return row
  }

  getById(dramaId: string, episodeId: string, packageId: string): ClipEvidencePackage {
    const row = this.database.prepare('SELECT id, drama_id AS dramaId, episode_id AS episodeId, version, source_media_fingerprint AS sourceMediaFingerprint, rule_version AS ruleVersion, status, reason FROM clip_evidence_packages WHERE id = ? AND drama_id = ? AND episode_id = ?').get(packageId, dramaId, episodeId) as ClipEvidencePackage | undefined
    if (!row) throw new Error('候选生成冻结证据包不存在、已损坏或不属于当前分集。')
    return row
  }

  assertCurrentPackageSource(packageRecord: ClipEvidencePackage): void {
    const row = this.database.prepare('SELECT source_path AS sourcePath, source_fingerprint AS sourceFingerprint FROM episodes WHERE id = ? AND drama_id = ?').get(packageRecord.episodeId, packageRecord.dramaId) as { sourcePath: string; sourceFingerprint: string | null } | undefined
    const currentFingerprint = row ? fingerprintMediaSource(row.sourcePath) : null
    if (!row?.sourceFingerprint || !currentFingerprint || row.sourceFingerprint !== currentFingerprint || currentFingerprint !== packageRecord.sourceMediaFingerprint) throw new Error('当前源媒体指纹已变化，不能继续使用冻结证据包。')
  }

  assertPublishedCandidate(candidateId: string, options: { range?: { startSeconds: number; endSeconds: number }; allowHistoricalExport?: boolean } = {}): { qualification: Exclude<ClipCandidateQualification, 'blocked'>; packageId: string } {
    const row = this.database.prepare(`SELECT snapshot.qualification, snapshot.package_id AS packageId, package.source_media_fingerprint AS sourceMediaFingerprint,
      episode.source_path AS sourcePath, episode.source_fingerprint AS currentSourceFingerprint, item.planned_range AS plannedRange, snapshot.summary_json AS summaryJson,
      member.episode_id AS episodeId, member.task_id AS taskId, member.task_round AS taskRound, item.status AS candidateStatus, pointer.task_id AS pointerTaskId, pointer.task_round AS pointerTaskRound
      FROM clip_candidate_publish_members member JOIN clip_candidate_snapshots snapshot ON snapshot.id = member.snapshot_id JOIN clip_evidence_packages package ON package.id = snapshot.package_id
      JOIN task_items item ON item.id = member.candidate_id JOIN episodes episode ON episode.id = member.episode_id LEFT JOIN clip_candidate_publish_pointers pointer ON pointer.drama_id = member.drama_id AND pointer.episode_id = member.episode_id
      WHERE member.candidate_id = ?`).get(candidateId) as { qualification: ClipCandidateQualification; packageId: string; sourceMediaFingerprint: string; sourcePath: string; currentSourceFingerprint: string | null; plannedRange: string; summaryJson: string; episodeId: string; taskId: string; taskRound: number; candidateStatus: string; pointerTaskId: string | null; pointerTaskRound: number | null } | undefined
    if (!row) {
      const task = this.database.prepare("SELECT task.config_snapshot AS configSnapshot FROM task_items item JOIN production_tasks task ON task.id = item.task_id WHERE item.id = ? AND task.type = 'original_clip'").get(candidateId) as { configSnapshot: string } | undefined
      let automatic = false; try { const config: unknown = JSON.parse(task?.configSnapshot ?? '{}'); automatic = Boolean(config && typeof config === 'object' && 'generation' in config) } catch { automatic = true }
      if (automatic) throw new Error('自动候选缺少当前已发布且合格的证据快照，不能继续操作。')
      return { qualification: 'qualified', packageId: 'manual-candidate' }
    }
    const hasPriorMaterial = Boolean(this.database.prepare('SELECT 1 FROM generated_materials WHERE task_item_id = ? LIMIT 1').get(candidateId))
    const historicalExport = (options.allowHistoricalExport === true || hasPriorMaterial) && ['exported', 'exporting'].includes(row.candidateStatus)
    if (row.qualification === 'blocked' || (!historicalExport && (row.pointerTaskId !== row.taskId || row.pointerTaskRound !== row.taskRound))) throw new Error('候选不属于当前已发布且合格的证据快照，不能继续操作。')
    const currentFingerprint = fingerprintMediaSource(row.sourcePath)
    if (!row.currentSourceFingerprint || !currentFingerprint || row.currentSourceFingerprint !== currentFingerprint || currentFingerprint !== row.sourceMediaFingerprint) throw new Error('候选冻结证据与当前源媒体指纹不一致，不能继续操作。')
    let planned: { episodeId?: unknown; startSeconds?: unknown; endSeconds?: unknown } = {}; let frozen: { startSeconds?: unknown; endSeconds?: unknown } = {}
    try { planned = JSON.parse(row.plannedRange) as typeof planned; frozen = JSON.parse(row.summaryJson) as typeof frozen } catch { throw new Error('候选范围快照无效，不能继续操作。') }
    if (planned.episodeId !== row.episodeId || typeof planned.startSeconds !== 'number' || typeof planned.endSeconds !== 'number' || typeof frozen.startSeconds !== 'number' || typeof frozen.endSeconds !== 'number') throw new Error('候选范围与发布快照不一致，不能继续操作。')
    const range = options.range ?? { startSeconds: planned.startSeconds, endSeconds: planned.endSeconds }
    if (range.startSeconds < frozen.startSeconds - 0.1001 || range.endSeconds > frozen.endSeconds + 0.1001) throw new Error('当前候选范围已脱离冻结证据候选范围，不能继续操作。')
    return { qualification: row.qualification, packageId: row.packageId }
  }

  private readStartedAt(checkpoint: string | null): string { try { const value: unknown = JSON.parse(checkpoint ?? '{}'); return value && typeof value === 'object' && 'startedAt' in value && typeof (value as { startedAt?: unknown }).startedAt === 'string' ? (value as { startedAt: string }).startedAt : new Date().toISOString() } catch { return new Date().toISOString() } }
  private readCheckpoint(checkpoint: string | null): { resourceBudget?: unknown; resourceUsage?: unknown } { try { const value: unknown = JSON.parse(checkpoint ?? '{}'); return value && typeof value === 'object' ? value as { resourceBudget?: unknown; resourceUsage?: unknown } : {} } catch { return {} } }
  private hasPublicationAuthority(packageRecord: ClipEvidencePackage, taskId: string | undefined, taskRound: number): boolean {
    if (!taskId) return taskRound === 0
    const task = this.database.prepare('SELECT status, checkpoint, config_snapshot AS configSnapshot FROM production_tasks WHERE id = ? AND drama_id = ? AND type = ?').get(taskId, packageRecord.dramaId, 'original_clip') as { status: string; checkpoint: string | null; configSnapshot: string } | undefined
    if (!task || task.status !== 'running') return false
    try {
      const checkpoint: unknown = JSON.parse(task.checkpoint ?? '{}'); const config: unknown = JSON.parse(task.configSnapshot)
      const episodes = config && typeof config === 'object' && 'episodes' in config && Array.isArray((config as { episodes?: unknown }).episodes) ? (config as { episodes: unknown[] }).episodes : []
      const packageMatchesTask = episodes.some((entry) => entry && typeof entry === 'object' && (entry as { episodeId?: unknown }).episodeId === packageRecord.episodeId && (entry as { packageId?: unknown }).packageId === packageRecord.id && (entry as { sourceMediaFingerprint?: unknown }).sourceMediaFingerprint === packageRecord.sourceMediaFingerprint)
      const current = this.database.prepare('SELECT source_fingerprint AS sourceFingerprint FROM episodes WHERE id = ? AND drama_id = ?').get(packageRecord.episodeId, packageRecord.dramaId) as { sourceFingerprint: string | null } | undefined
      return typeof checkpoint === 'object' && checkpoint !== null && 'round' in checkpoint && (checkpoint as { round?: unknown }).round === taskId && taskRound > 0 && packageMatchesTask && current?.sourceFingerprint === packageRecord.sourceMediaFingerprint
    } catch { return false }
  }
}
