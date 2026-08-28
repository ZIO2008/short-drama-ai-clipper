import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { TaskQueue } from '../tasks/task-queue.js'
import { isProductionReady } from '../../shared/production-readiness.js'
import type { ClipCandidateEvidence, ClipCandidateGenerationInput, ClipCandidateQualification, ClipEpisodeStatus, ClipExportConfig, ClipExportProgress, ClipGenerationPreflight, ClipIntelligentGenerationTask, ClipSubtitleVariant } from '../../shared/contracts.js'
import { ClipSubtitleVariantStore } from './clip-subtitle-variant-store.js'
import { anchorCandidateRanges, readAnchorReadiness, selectAnchorRanges } from './clip-anchor-readiness.js'
import type { SourceVideoFramePts } from '../media/scene-anchor-pts-verifier.js'
import { ClipExportRuntime } from './clip-export-runtime.js'
import { assertFinalOutputDuration, assertFinalOutputFrameTiming, assertFinalOutputSourceBoundaries } from './clip-export-verifier.js'
import { ClipEvidencePackageService } from './clip-evidence-package-service.js'
import { ClipCandidateIntelligenceService, ClipSemanticValidationError, type ClipSemanticAdapter, type ClipSemanticSelection } from './clip-candidate-intelligence-service.js'
import type { ProviderProfile } from './provider-profile-service.js'
import { buildClipReviewQuestion, ClipMultimodalReviewService, extractBoundedReviewFrames, type ClipMultimodalReviewAdapter } from './clip-multimodal-review-service.js'
import { ClipGenerationLifecycle } from './clip-generation-lifecycle.js'
import { buildClipGenerationProviderChain, buildClipGenerationRequestKey, clipGenerationProviderMatches, type ClipGenerationProviderChainSnapshot } from './clip-generation-request-key.js'
import { parseClipCandidateEvidence } from './clip-candidate-evidence-schema.js'
import { buildClipVisualFactCode, readClipVisualFactStatement } from './clip-visual-review-fact.js'
export type ClipCandidate = { id: string; episodeId: string; startSeconds: number; endSeconds: number; semanticEventIds?: string[]; sceneAnchorIds?: string[]; evidence?: ClipCandidateEvidence; status: 'pending_review' | 'editing' | 'confirmed' | 'exporting' | 'exported' | 'failed'; reason: string | null; qualification?: ClipCandidateQualification; qualificationReason?: string | null; createdAt?: string }
const rangeSchema = z.object({ startSeconds: z.number().finite().nonnegative(), endSeconds: z.number().finite().positive() }).refine((range) => range.endSeconds > range.startSeconds, 'End must be after start')
const batchRangeSchema = rangeSchema.extend({ episodeId: z.string().trim().min(1), semanticEventIds: z.array(z.string().uuid()).min(1).max(500).optional(), sceneAnchorIds: z.array(z.string().uuid()).min(1).max(500).optional() })
const generationSchema = z.object({ episodeIds: z.array(z.string().trim().min(1)).min(1).max(100), candidatesPerEpisode: z.number().int().min(1).max(50), targetDurationSeconds: z.number().finite().min(3).max(180), maxOverlapRatio: z.number().min(0).max(0.95), allowRepeat: z.boolean() })
const MAX_MULTIMODAL_REVIEWS_PER_TASK = 24
const MAX_REVIEW_FRAMES_PER_CANDIDATE = 12
const MAX_REVIEW_INPUT_BYTES = 1_500_000

export class OriginalClipService {
  private readonly subtitleVariants: ClipSubtitleVariantStore
  private readonly sourceFramePtsCache = new Map<string, SourceVideoFramePts | null>()
  private readonly exportRuntime: ClipExportRuntime
  private readonly evidencePackages: ClipEvidencePackageService
  private readonly candidateIntelligence: ClipCandidateIntelligenceService | null
  private readonly multimodalReview: ClipMultimodalReviewService | null
  private readonly generationControllers = new Map<string, AbortController>()
  private readonly generationStageDeadlineTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly generationExtensionDeadlineTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly generationLifecycle: ClipGenerationLifecycle
  private readonly generationProviderChain: ((textAnalysis: ProviderProfile, requireMultimodal: boolean) => ClipGenerationProviderChainSnapshot) | null
  constructor(private readonly database: Database.Database, private readonly queue = new TaskQueue(database), intelligence?: { profiles: { list: () => ProviderProfile[] }; hasValidSecret: (secretRef: string) => boolean; adapter: ClipSemanticAdapter; multimodalAdapter?: ClipMultimodalReviewAdapter }) {
    this.subtitleVariants = new ClipSubtitleVariantStore(database, (candidateId) => this.getCandidate(candidateId))
    this.evidencePackages = new ClipEvidencePackageService(database)
    this.candidateIntelligence = intelligence ? new ClipCandidateIntelligenceService(database, intelligence.profiles, intelligence.hasValidSecret, intelligence.adapter) : null
    this.multimodalReview = intelligence?.multimodalAdapter ? new ClipMultimodalReviewService(intelligence.profiles, intelligence.hasValidSecret, intelligence.multimodalAdapter) : null
    this.generationProviderChain = intelligence ? (textAnalysis, requireMultimodal) => buildClipGenerationProviderChain(textAnalysis, intelligence.profiles.list(), intelligence.hasValidSecret, requireMultimodal) : null
    this.exportRuntime = new ClipExportRuntime({ database, subtitleVariants: this.subtitleVariants, getCandidate: (id) => this.getCandidate(id), listCandidates: (dramaId) => this.listCandidates(dramaId), refreshTask: (taskId) => this.refreshTask(taskId), refreshTaskByItem: (itemId) => this.refreshTaskByItem(itemId), runCandidateItem: (id, output, batch, signal, config) => this.runCandidateItem(id, output, batch, signal, config), exportCandidateWithConfig: (id, config, batch, signal) => this.exportCandidateWithConfig(id, config, batch, signal), verifiers: { duration: (candidate, duration, fps) => this.assertFinalOutputDuration(candidate, duration, fps), timing: (candidate, path, fps) => this.assertFinalOutputFrameTiming(candidate, path, fps), boundaries: (candidate, source, output, config, subtitle, timestamps, fps) => this.assertFinalOutputSourceBoundaries(candidate, source, output, config, subtitle, timestamps, fps) } })
    this.generationLifecycle = new ClipGenerationLifecycle(database, this.generationControllers, this.generationStageDeadlineTimers, this.generationExtensionDeadlineTimers, { runGeneration: (taskId, dramaId, input, taskRound) => { void this.generateIntelligentCandidates(dramaId, input, { taskId, taskRound }).catch((error: unknown) => this.failGenerationTask(taskId, error)).finally(() => { void this.generationLifecycle.drain().catch(() => undefined) }) } })
  }
  /** The only app-facing automatic generation path. It never falls back to anchor-only proposals. */
  startIntelligentGeneration(dramaIdInput: unknown, inputValue: unknown): ClipIntelligentGenerationTask {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput)
    const input = generationSchema.parse(inputValue) satisfies ClipCandidateGenerationInput
    if (!this.candidateIntelligence) throw new Error('文本语义分析能力未初始化，系统未生成候选。')
    const provider = this.candidateIntelligence.assertAvailable()
    const preflight = this.preflightGeneration(dramaId, input)
    if (preflight.eligibleEpisodeIds.length === 0) throw new Error(preflight.skipped[0]?.reason ?? '没有具备合格证据包和切点锚点的分集，系统未生成候选。')
    const packageSnapshots = this.buildRequestPackages(dramaId, preflight.eligibleEpisodeIds)
    const unavailablePackage = packageSnapshots.find((item) => item.status !== 'ready')
    if (unavailablePackage) throw new Error(unavailablePackage.reason ?? '冻结证据包未就绪，系统未生成候选。')
    if (!this.generationProviderChain) throw new Error('候选生成供应商快照服务未初始化。')
    const providerChain = this.generationProviderChain(provider, Boolean(preflight.resourceBudget?.projectedMandatoryReviews))
    const requestKey = buildClipGenerationRequestKey(dramaId, input, providerChain, packageSnapshots)
    const duplicate = this.database.prepare("SELECT id, status FROM production_tasks WHERE drama_id = ? AND type = ? AND status IN ('running', 'pending') AND json_extract(config_snapshot, '$.generationRequestKey') = ? ORDER BY created_at DESC LIMIT 1").get(dramaId, 'original_clip', requestKey) as { id: string; status: 'running' | 'pending' } | undefined
    if (duplicate) return { taskId: duplicate.id, status: 'deduplicated', stage: duplicate.status === 'pending' ? 'queued' : 'text-semantics', startedAt: new Date().toISOString() }
    const taskId = randomUUID(); const startedAt = new Date().toISOString()
    const taskRound = this.nextGenerationRound(dramaId)
    const active = this.database.prepare("SELECT 1 FROM production_tasks WHERE type = 'original_clip' AND status = 'running' AND json_extract(config_snapshot, '$.generation') IS NOT NULL LIMIT 1").get()
    const status = active ? 'pending' : 'running'
    const queuePosition = active ? (this.database.prepare("SELECT COUNT(*) AS count FROM production_tasks WHERE type = 'original_clip' AND status = 'pending' AND json_extract(config_snapshot, '$.generation') IS NOT NULL").get() as { count: number }).count + 1 : 0
    const estimatedWaitMs = status === 'pending' ? this.estimateQueueWaitMs(queuePosition, provider.timeoutMs) : 0
    this.database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, checkpoint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)').run(taskId, dramaId, 'original_clip', JSON.stringify({ generation: input, generationRequestKey: requestKey, requestedPackages: packageSnapshots, provider: providerChain, preflight, taskRound }), status, JSON.stringify({ version: 1, stage: status === 'pending' ? 'queued' : 'text-semantics', reason: status === 'pending' ? `正在排队：前方还有 ${queuePosition} 个候选生成任务，保守预计等待 ${this.formatWait(estimatedWaitMs)}；尚未调用模型。` : '正在等待文本语义分析。', queuePosition, estimatedWaitMs: status === 'pending' ? estimatedWaitMs : null, availableProviderSlots: status === 'pending' ? 0 : 1, round: taskId, taskRound, startedAt, elapsedMs: 0, activeSince: status === 'running' ? startedAt : null }), startedAt, startedAt)
    if (status === 'running') this.generationLifecycle.startQueued(taskId, dramaId, input, taskRound)
    return { taskId, status: status === 'pending' ? 'queued' : 'running', stage: status === 'pending' ? 'queued' : 'text-semantics', startedAt, ...(status === 'pending' ? { queuePosition, estimatedWaitMs } : {}) }
  }

  /** Only pending work has no provider request to replay, so it is safe to resume after app startup. */
  resumePendingIntelligentGenerations(): void {
    this.generationLifecycle.resumePending()
  }

  /** Runs only a task already created by startIntelligentGeneration with frozen packages. */
  private async generateIntelligentCandidates(dramaId: string, input: ClipCandidateGenerationInput, existingTask: { taskId: string; taskRound: number }): Promise<ClipCandidate[]> {
    if (!this.candidateIntelligence) throw new Error('文本语义分析能力未初始化，系统未生成候选。')
    // Check configuration before touching evidence construction or any provider.
    // This makes the unavailable path a real hard block, not a delayed fallback.
    this.candidateIntelligence.assertAvailable()
    const frozenRequest = this.readFrozenTaskRequest(existingTask.taskId, dramaId)
    const frozenPackages = frozenRequest.packages
    const existing = this.listCandidates(dramaId)
    const generationTaskId = existingTask.taskId; const startedAt = new Date().toISOString()
    const taskRound = existingTask.taskRound
    const controller = new AbortController(); this.generationControllers.set(generationTaskId, controller)
    const prepared: Array<{ episodeId: string; packageRecord: ReturnType<ClipEvidencePackageService['build']>; windows: ReturnType<ClipEvidencePackageService['semanticWindows']> }> = []
    for (const packageRecord of frozenPackages) {
      const episodeId = packageRecord.episodeId
      const episode = this.database.prepare('SELECT duration_seconds AS durationSeconds, status FROM episodes WHERE id = ? AND drama_id = ?').get(episodeId, dramaId) as { durationSeconds: number | null; status: string } | undefined
      if (!episode || !isProductionReady(episode.status) || episode.durationSeconds === null) continue
      this.evidencePackages.assertCurrentPackageSource(packageRecord)
      if (packageRecord.status !== 'ready') throw new Error(packageRecord.reason ?? '当前集证据包未就绪，系统未生成候选。')
      const windows = this.evidencePackages.semanticWindows(packageRecord)
      if (windows.length) prepared.push({ episodeId, packageRecord, windows })
    }
    if (!prepared.length) {
      this.database.prepare('UPDATE production_tasks SET status = ?, checkpoint = ?, updated_at = ? WHERE id = ? AND status = ?').run('failed', JSON.stringify({ version: 1, stage: 'evidence-package', reason: '没有具备可发布证据包和合格锚点的分集，系统未生成候选。', round: generationTaskId, taskRound }), new Date().toISOString(), generationTaskId, 'running')
      this.generationControllers.delete(generationTaskId)
      throw new Error('没有具备可发布证据包和合格锚点的分集，系统未生成候选。')
    }
    const provider = this.candidateIntelligence.assertAvailable()
    if (!clipGenerationProviderMatches(provider, frozenRequest.provider.textAnalysis)) throw new Error('文本语义供应商配置已在排队期间变化；冻结任务不会静默切换供应商，请重新生成。')
    const immutableInput = {
      generation: input,
      generationRequestKey: buildClipGenerationRequestKey(dramaId, input, frozenRequest.provider, frozenPackages),
      requestedPackages: frozenPackages,
      preflight: frozenRequest.preflight,
      taskRound,
      audit: { createdAt: startedAt, createdBy: null, dataPolicyVersion: 'clip-outbound-minimum-v1', requestedEpisodeCount: input.episodeIds.length },
      provider: frozenRequest.provider,
      episodes: prepared.map(({ episodeId, packageRecord, windows }) => ({ episodeId, packageId: packageRecord.id, packageVersion: packageRecord.version, sourceMediaFingerprint: packageRecord.sourceMediaFingerprint, semanticWindowEvidenceIds: windows.map((window) => window.evidenceIds) })),
      resourceBudget: { textWindows: prepared.reduce((total, item) => total + item.windows.length, 0), projectedMandatoryReviews: 0, maxMultimodalReviews: MAX_MULTIMODAL_REVIEWS_PER_TASK, maxFramesPerReview: MAX_REVIEW_FRAMES_PER_CANDIDATE, maxInputBytesPerReview: MAX_REVIEW_INPUT_BYTES, maxFrameWidth: 640, providerConcurrency: 1, providerTimeoutMs: provider.timeoutMs, requestedRangeCount: prepared.reduce((total, item) => total + item.windows.length, 0) },
    }
    const priorCheckpointRow = this.database.prepare('SELECT checkpoint FROM production_tasks WHERE id = ?').get(generationTaskId) as { checkpoint: string | null } | undefined
    let priorCheckpoint: { extensionGranted?: boolean; extensionDeadlineAt?: string } = {}; try { priorCheckpoint = JSON.parse(priorCheckpointRow?.checkpoint ?? '{}') as { extensionGranted?: boolean; extensionDeadlineAt?: string } } catch { /* invalid legacy checkpoint */ }
    const snapshotted = this.database.prepare('UPDATE production_tasks SET config_snapshot = ?, checkpoint = ?, progress_total = ?, updated_at = ? WHERE id = ? AND status = ?').run(JSON.stringify(immutableInput), JSON.stringify({ version: 1, stage: 'text-semantics', reason: `正在分析 ${prepared.length} 个分集的文本语义。`, round: generationTaskId, taskRound, startedAt, elapsedMs: Math.max(0, Date.now() - new Date(startedAt).getTime()), activeSince: new Date().toISOString(), ...(priorCheckpoint.extensionGranted ? { extensionGranted: true, extensionDeadlineAt: priorCheckpoint.extensionDeadlineAt ?? null } : {}), resourceBudget: immutableInput.resourceBudget, resourceUsage: { reviewsRequired: 0, reviewsAttempted: 0, reviewsCompleted: 0, reviewsSupported: 0, retries: 0, frames: 0, frameBytes: 0 } }), prepared.length, new Date().toISOString(), generationTaskId, 'running')
    if (snapshotted.changes !== 1) throw new Error('候选生成任务已失效，拒绝继续处理。')
    const selectedRanges: Array<{ episodeId: string; startSeconds: number; endSeconds: number; semanticEventIds?: string[]; sceneAnchorIds?: string[]; packageRecord: ReturnType<ClipEvidencePackageService['build']>; selection: ClipSemanticSelection; qualification: 'qualified' | 'qualified_with_limit'; qualificationReason: string | null; claims: ReturnType<ClipEvidencePackageService['qualifySemanticSelection']>['claims']; reviewStatus: ClipCandidateEvidence['reviewStatus']; reviewReason: string | null }> = []
    const blocked = new Map<string, number>()
    const recordBlocked = (reason: string): void => { blocked.set(reason, (blocked.get(reason) ?? 0) + 1) }
    const resourceUsage = { reviewsRequired: 0, reviewsAttempted: 0, reviewsCompleted: 0, reviewsSupported: 0, retries: 0, frames: 0, frameBytes: 0 }
    for (const [itemIndex, item] of prepared.entries()) {
        const proposals = item.windows.map((window) => {
          const evidenceIds = this.evidencePackages.orderedEvidenceIds(item.packageRecord, window.evidenceIds)
          const fullWindowIds = this.evidencePackages.orderedEvidenceIds(item.packageRecord, [...window.contextBeforeIds, ...evidenceIds, ...window.contextAfterIds])
          const summary = this.evidencePackages.semanticContext(item.packageRecord, fullWindowIds)
          if (!summary) throw new Error('当前候选缺少可外发的最小字幕语义上下文，系统未生成候选。')
          return { evidenceIds, summary, contextBeforeIds: window.contextBeforeIds, contextAfterIds: window.contextAfterIds }
      })
      try {
        // The model may map every admissible semantic window. Candidate count
        // remains an application-owned request limit, never an unbounded side
        // effect of the number of analysis windows.
        const accepted = await this.candidateIntelligence.select(item.packageRecord, proposals, controller.signal, input.candidatesPerEpisode, frozenRequest.provider.textAnalysis)
        if (controller.signal.aborted) throw new Error('候选生成已取消，拒绝写入迟到结果。')
        const acceptedIds = accepted.flatMap((selection) => selection.evidenceIds)
        this.evidencePackages.recordSemanticRun({ taskId: generationTaskId, package: item.packageRecord, provider, inputIds: acceptedIds, result: { selections: accepted, repair: accepted.some((selection) => selection.repairApplied) ? { applied: true, reasons: accepted.map((selection) => selection.repairReason).filter(Boolean) } : { applied: false } } })
        for (const selection of accepted) {
          const range = this.evidencePackages.resolveSemanticSelection(item.packageRecord, selection)
          if (!range) throw new Error('文本语义分析选择的起止锚点无法在冻结证据包中解析为合法范围，系统未生成候选。')
          const qualification = this.evidencePackages.qualifySemanticSelection(item.packageRecord, selection)
          if (qualification.needsMultimodalReview) {
            const evidenceIds = [...new Set(selection.evidenceIds)]
            const source = this.database.prepare('SELECT source_path AS sourcePath FROM episodes WHERE id = ? AND drama_id = ?').get(item.episodeId, dramaId) as { sourcePath: string } | undefined
            const reviewStarted = Date.now()
            resourceUsage.reviewsRequired += 1
            if (resourceUsage.reviewsRequired > MAX_MULTIMODAL_REVIEWS_PER_TASK) {
              this.generationLifecycle.persistCheckpoint(generationTaskId, taskRound, startedAt, 'multimodal-review', `第 ${resourceUsage.reviewsRequired} 个必须复核片段超出本任务 ${MAX_MULTIMODAL_REVIEWS_PER_TASK} 个的受控预算，未纳入候选。`, itemIndex, prepared.length, immutableInput.resourceBudget, resourceUsage)
              recordBlocked('关键视觉事实超过本轮受控复核预算。为避免猜测画面结论，系统没有生成候选。查看素材资产。')
              continue
            }
            this.generationLifecycle.persistCheckpoint(generationTaskId, taskRound, startedAt, 'multimodal-review', `正在复核第 ${resourceUsage.reviewsRequired} 个关键片段（已完成 ${resourceUsage.reviewsCompleted} 个）。`, itemIndex, prepared.length, immutableInput.resourceBudget, resourceUsage)
            try {
              if (!source || !this.multimodalReview) throw new Error('必须复核的视觉事实缺少可用视频复核能力，系统未纳入候选。')
              const reviewScope = this.evidencePackages.multimodalReviewScope(item.packageRecord, selection)
              if (!reviewScope) throw new Error('关键视觉复核缺少已闭合叙事事件的核心单元及相邻完整单元，系统未猜测画面结论。')
              const frames = await extractBoundedReviewFrames(source.sourcePath, range.startSeconds, range.endSeconds, controller.signal, reviewScope.ranges.flatMap((unit) => [unit.startSeconds, unit.endSeconds]))
              const visualClaimKinds = qualification.claims.filter((claim): claim is typeof claim & { kind: 'start-boundary' | 'end-boundary' | 'core-event' | 'narrative-closure' } => claim.kind !== 'visual-fact' && claim.evidenceIds.some((id) => range.sceneAnchorIds.includes(id))).map((claim) => claim.kind)
              if (!visualClaimKinds.length) throw new Error('关键视觉复核没有本地可声明的具体结论，系统未发送无目标请求。')
              const visualFactStatement = readClipVisualFactStatement(this.database, item.packageRecord.id, reviewScope.evidenceIds)
              if (!visualFactStatement) throw new Error('关键视觉复核没有可回链的本地事实命题，系统未发送无目标请求。')
              resourceUsage.reviewsAttempted += 1
              resourceUsage.frames += frames.length
              resourceUsage.frameBytes += frames.reduce((total, frame) => total + frame.byteLength, 0)
              if (frames.reduce((total, frame) => total + frame.byteLength, 0) > MAX_REVIEW_INPUT_BYTES) throw new Error('关键片段的受限复核输入超过本轮字节预算，系统未压缩或猜测画面结论。')
              const factCode = buildClipVisualFactCode(item.packageRecord.id, reviewScope.evidenceIds, visualFactStatement)
              const review = await this.multimodalReview.review({ package: item.packageRecord, factCode, evidenceIds: reviewScope.evidenceIds, claimKinds: visualClaimKinds, reviewQuestion: buildClipReviewQuestion(visualFactStatement, visualClaimKinds), frames, signal: controller.signal }, frozenRequest.provider.multimodalReview)
              resourceUsage.reviewsCompleted += 1
              if (review.retried) resourceUsage.retries += 1
              const modelRunId = this.evidencePackages.recordMultimodalRun({ taskId: generationTaskId, package: item.packageRecord, provider: review.profile, inputIds: reviewScope.evidenceIds, result: { ...review.result, reviewScope: reviewScope.ranges, frames: frames.map(({ ptsSeconds, sha256, byteLength }) => ({ ptsSeconds, sha256, byteLength })), elapsedMs: Date.now() - reviewStarted, retried: review.retried }, status: 'completed' })
              if (review.result.conclusion !== 'supported') { recordBlocked(`视频复核未能证明关键视觉事实：${review.result.reason}。系统没有猜测切点。查看素材资产。`); continue }
              resourceUsage.reviewsSupported += 1
              const supportedVisualClaimKinds = visualClaimKinds.filter((kind) => review.result.claimKinds.includes(kind))
              const visualFactEvidenceId = this.evidencePackages.recordSupportedVisualFact({ package: item.packageRecord, taskId: generationTaskId, modelRunId, evidenceIds: reviewScope.evidenceIds, claimKinds: supportedVisualClaimKinds, ranges: reviewScope.ranges, frames: frames.map(({ ptsSeconds, sha256, byteLength }) => ({ ptsSeconds, sha256, byteLength })), reason: review.result.reason })
              const reviewedQualification = this.evidencePackages.qualifyReviewedVisualSelection(item.packageRecord, selection, visualFactEvidenceId, review.result.reason)
              if (reviewedQualification.qualification === 'blocked') { recordBlocked(`${reviewedQualification.reason ?? '视频复核没有覆盖全部关键视觉结论。'} 查看素材资产。`); continue }
              selectedRanges.push({ episodeId: item.episodeId, startSeconds: range.startSeconds, endSeconds: range.endSeconds, ...(range.semanticEventIds.length ? { semanticEventIds: range.semanticEventIds } : {}), ...(range.sceneAnchorIds.length ? { sceneAnchorIds: range.sceneAnchorIds } : {}), packageRecord: item.packageRecord, selection, qualification: reviewedQualification.qualification, qualificationReason: reviewedQualification.reason, claims: reviewedQualification.claims, reviewStatus: 'supported', reviewReason: review.result.reason })
              continue
            } catch (error) {
              const reason = error instanceof Error ? error.message : '视频复核失败，系统未纳入候选。'
              this.evidencePackages.recordMultimodalRun({ taskId: generationTaskId, package: item.packageRecord, provider: { provider: 'unavailable', model: null }, inputIds: evidenceIds, result: null, status: controller.signal.aborted ? 'cancelled' : 'failed', reason })
              if (controller.signal.aborted) throw new Error('候选生成已取消，拒绝写入迟到结果。')
              recordBlocked(`${reason} 查看素材资产。`)
              continue
            }
          }
          if (qualification.qualification === 'blocked') { recordBlocked(`${qualification.reason ?? '关键证据不足。'} 前往字幕资产。`); continue }
          selectedRanges.push({ episodeId: item.episodeId, startSeconds: range.startSeconds, endSeconds: range.endSeconds, ...(range.semanticEventIds.length ? { semanticEventIds: range.semanticEventIds } : {}), ...(range.sceneAnchorIds.length ? { sceneAnchorIds: range.sceneAnchorIds } : {}), packageRecord: item.packageRecord, selection, qualification: qualification.qualification, qualificationReason: qualification.reason, claims: qualification.claims, reviewStatus: 'not-required', reviewReason: null })
        }
        this.generationLifecycle.persistCheckpoint(generationTaskId, taskRound, startedAt, 'text-semantics', `已完成 ${itemIndex + 1}/${prepared.length} 个分集的文本语义分析。`, itemIndex + 1, prepared.length, immutableInput.resourceBudget, resourceUsage)
      } catch (error) {
        const reason = error instanceof Error ? error.message : '文本语义分析失败，系统未生成候选。'
        this.evidencePackages.recordSemanticRun({ taskId: generationTaskId, package: item.packageRecord, provider, inputIds: [], result: null, status: 'failed', reason })
        const status = controller.signal.aborted ? 'cancelled' : 'failed'
        this.database.prepare('UPDATE production_tasks SET status = ?, checkpoint = ?, updated_at = ? WHERE id = ? AND status = ?').run(status, JSON.stringify({ version: 1, stage: 'text-semantics', reason, ...(error instanceof ClipSemanticValidationError ? { semanticValidationCode: error.validationCode } : {}), round: generationTaskId }), new Date().toISOString(), generationTaskId, 'running')
        this.generationControllers.delete(generationTaskId)
        throw error
      }
    }
    const blockedSummary = [...blocked.entries()].map(([reason, count]) => ({ reason, count }))
    const blockedTotal = [...blocked.values()].reduce((total, count) => total + count, 0)
    const recovery = this.blockedRecovery(blockedSummary)
    if (!selectedRanges.length) { const reason = blockedSummary.length ? `本次有 ${blockedTotal} 条候选未纳入：${blockedSummary.map((item) => `${item.count} 条${item.reason}`).join('；')}` : '文本语义分析未选出任何已核验候选。'; this.database.prepare('UPDATE production_tasks SET status = ?, checkpoint = ?, updated_at = ? WHERE id = ? AND status = ?').run('failed', JSON.stringify({ version: 1, stage: 'text-semantics', reason, blocked: blockedSummary, blockedTotal, recovery, round: generationTaskId, taskRound, startedAt, elapsedMs: Math.max(0, Date.now() - new Date(startedAt).getTime()), resourceBudget: immutableInput.resourceBudget, resourceUsage }), new Date().toISOString(), generationTaskId, 'running'); this.generationControllers.delete(generationTaskId); throw new Error(reason) }
    const generated = this.createCandidates(dramaId, selectedRanges.map(({ packageRecord: _packageRecord, selection: _selection, ...range }) => range), { id: generationTaskId, config: immutableInput })
    const snapshots: Array<{ candidateId: string; package: ReturnType<ClipEvidencePackageService['build']>; qualification: 'qualified' | 'qualified_with_limit'; qualificationReason: string | null }> = []
    for (const candidate of generated) {
      const range = selectedRanges.find((item) => item.episodeId === candidate.episodeId && item.startSeconds === candidate.startSeconds && item.endSeconds === candidate.endSeconds)
      if (!range) continue
      snapshots.push({ candidateId: candidate.id, package: range.packageRecord, qualification: range.qualification, qualificationReason: range.qualificationReason })
    }
    this.evidencePackages.publishGenerationRound({ taskId: generationTaskId, taskRound, dramaId, config: immutableInput, provider: frozenRequest.provider, blocked: blockedSummary, blockedTotal, recovery, candidates: snapshots.map(({ candidateId, package: packageRecord, qualification, qualificationReason }) => { const selected = selectedRanges.find((range) => generated.some((candidate) => candidate.id === candidateId && candidate.episodeId === range.episodeId && candidate.startSeconds === range.startSeconds && candidate.endSeconds === range.endSeconds)); const candidate = generated.find((item) => item.id === candidateId); const durationDeviationSeconds = selected ? Number((candidate!.endSeconds - candidate!.startSeconds - input.targetDurationSeconds).toFixed(3)) : null; const claims = selected?.claims ?? []; return { candidateId, package: packageRecord, qualification, summary: { semanticEventIds: candidate?.semanticEventIds ?? [], sceneAnchorIds: candidate?.sceneAnchorIds ?? [], startSeconds: candidate?.startSeconds, endSeconds: candidate?.endSeconds, qualificationReason, evidence: selected ? { beat: selected.selection.beat, purpose: selected.selection.purpose, context: selected.selection.context, narrativeState: selected.selection.narrative.state, seamStatus: selected.selection.seamStatus === 'unclear' ? 'closed' : selected.selection.seamStatus, claims: claims.map((claim) => ({ kind: claim.kind, evidenceCount: claim.evidenceIds.length, reason: claim.reason })), reviewStatus: selected.reviewStatus, reviewReason: selected.reviewReason, durationDeviationSeconds, durationDeviationReason: durationDeviationSeconds !== null && Math.abs(durationDeviationSeconds) >= 0.5 ? `与目标 ${input.targetDurationSeconds.toFixed(1)} 秒偏离 ${Math.abs(durationDeviationSeconds).toFixed(1)} 秒。` : null } : undefined } } }) })
    this.generationControllers.delete(generationTaskId)
    return generated
  }
  private buildRequestPackages(dramaId: string, episodeIds: readonly string[]): Array<ReturnType<ClipEvidencePackageService['build']>> {
    return [...new Set(episodeIds)].sort().map((episodeId) => {
      const episode = this.database.prepare('SELECT duration_seconds AS durationSeconds FROM episodes WHERE id = ? AND drama_id = ?').get(episodeId, dramaId) as { durationSeconds: number | null } | undefined
      if (episode?.durationSeconds !== null && episode) this.anchorReadiness(dramaId, episodeId, episode.durationSeconds)
      return this.evidencePackages.build(dramaId, episodeId)
    })
  }
  private readFrozenTaskRequest(taskId: string, dramaId: string): { packages: Array<ReturnType<ClipEvidencePackageService['getById']>>; provider: ClipGenerationProviderChainSnapshot; preflight: ClipGenerationPreflight } {
    const row = this.database.prepare('SELECT config_snapshot AS configSnapshot FROM production_tasks WHERE id = ? AND drama_id = ? AND type = ?').get(taskId, dramaId, 'original_clip') as { configSnapshot: string } | undefined
    if (!row) throw new Error('候选生成任务不存在或不属于当前剧目。')
    let config: { requestedPackages?: Array<{ id?: unknown; episodeId?: unknown }>; provider?: ClipGenerationProviderChainSnapshot; preflight?: ClipGenerationPreflight } = {}
    try { config = JSON.parse(row.configSnapshot) as typeof config } catch { throw new Error('候选生成任务冻结快照无效，不能继续。') }
    if (!Array.isArray(config.requestedPackages) || !config.requestedPackages.length) throw new Error('候选生成任务缺少冻结证据包，不能继续。')
    if (!config.provider || !config.preflight) throw new Error('候选生成任务缺少冻结供应商或预检快照，不能继续。')
    const packages = config.requestedPackages.map((item) => {
      if (!item || typeof item.id !== 'string' || typeof item.episodeId !== 'string') throw new Error('候选生成任务冻结证据包格式无效，不能继续。')
      return this.evidencePackages.getById(dramaId, item.episodeId, item.id)
    })
    return { packages, provider: config.provider, preflight: config.preflight }
  }
  private blockedRecovery(blocked: ReadonlyArray<{ reason: string; count: number }>): 'assets' | 'subtitles' | null {
    const reason = blocked.map((item) => item.reason).join(' ')
    return /素材|视频|视觉|PTS|帧|媒体/.test(reason) ? 'assets' : /字幕|文本|时间轴|语义/.test(reason) ? 'subtitles' : null
  }
  private estimateQueueWaitMs(queuePosition: number, timeoutMs: number | null): number { return Math.max(0, queuePosition) * Math.max(1_000, timeoutMs ?? 60_000) }
  private formatWait(waitMs: number): string { return waitMs >= 60_000 ? `${Math.ceil(waitMs / 60_000)} 分钟` : `${Math.ceil(waitMs / 1_000)} 秒` }
  private failGenerationTask(taskId: string, error: unknown): void { const reason = error instanceof Error ? error.message : '候选生成失败。'; this.database.prepare("UPDATE production_tasks SET status = 'failed', checkpoint = json_set(COALESCE(checkpoint, '{}'), '$.stage', 'failed', '$.reason', ?), updated_at = ? WHERE id = ? AND type = 'original_clip' AND status = 'running'").run(reason, new Date().toISOString(), taskId) }
  private nextGenerationRound(dramaId: string): number { return this.database.transaction(() => { const row = this.database.prepare('SELECT next_round AS nextRound FROM clip_generation_rounds WHERE drama_id = ?').get(dramaId) as { nextRound: number } | undefined; const round = row?.nextRound ?? 1; this.database.prepare('INSERT INTO clip_generation_rounds (drama_id, next_round, updated_at) VALUES (?, ?, ?) ON CONFLICT(drama_id) DO UPDATE SET next_round = excluded.next_round, updated_at = excluded.updated_at').run(dramaId, round + 1, new Date().toISOString()); return round })() }
  cancelIntelligentGeneration(taskIdInput: unknown): void {
    this.generationLifecycle.cancel(taskIdInput)
  }
  stopIntelligentGenerationForShutdown(taskIdInput: unknown): void {
    this.generationLifecycle.stopForShutdown(taskIdInput)
  }
  decideIntelligentGenerationDeadline(taskIdInput: unknown, action: 'continue' | 'stop'): void {
    this.generationLifecycle.decideDeadline(taskIdInput, action)
  }
  createCandidate(dramaId: unknown, episodeId: unknown, range: unknown): ClipCandidate { const [candidate] = this.createCandidates(dramaId, [{ episodeId: z.string().trim().min(1).parse(episodeId), ...rangeSchema.parse(range) }]); if (!candidate) throw new Error('Could not create clip candidate'); return candidate }
  createCandidates(dramaIdInput: unknown, rangesInput: unknown, generationTask?: { id: string; config: unknown }): ClipCandidate[] {
    const dramaId = z.string().trim().min(1).parse(dramaIdInput); const ranges = z.array(batchRangeSchema).min(1).max(500).parse(rangesInput); const seen = new Set<string>()
    const validated = ranges.map((range) => { const key = `${range.episodeId}:${range.startSeconds}:${range.endSeconds}`; if (seen.has(key)) throw new Error('Duplicate clip range in batch'); seen.add(key); const episode = this.database.prepare('SELECT duration_seconds AS durationSeconds, status FROM episodes WHERE id = ? AND drama_id = ?').get(range.episodeId, dramaId) as { durationSeconds: number | null; status: string } | undefined; if (!episode) throw new Error('Episode not found'); if (!isProductionReady(episode.status)) throw new Error(`Episode is not ready for production: ${episode.status}`); if (episode.durationSeconds !== null && range.endSeconds > episode.durationSeconds + 0.05) throw new Error('Clip range exceeds episode duration'); for (const anchorId of range.sceneAnchorIds ?? []) if (!this.database.prepare("SELECT 1 FROM ai_evidence WHERE id = ? AND drama_id = ? AND episode_id = ? AND source_type = 'scene'").get(anchorId, dramaId, range.episodeId)) throw new Error('镜头/场景锚点不属于当前剧集，不能作为候选证据。'); return range })
    const taskId = generationTask?.id ?? randomUUID(); const now = new Date().toISOString(); const candidates = validated.map((range) => ({ id: randomUUID(), episodeId: range.episodeId, startSeconds: range.startSeconds, endSeconds: range.endSeconds, semanticEventIds: range.semanticEventIds, sceneAnchorIds: range.sceneAnchorIds, status: 'pending_review' as const, reason: null, createdAt: now }))
    this.database.transaction(() => { if (generationTask) { const updated = this.database.prepare('UPDATE production_tasks SET config_snapshot = ?, progress_current = 0, progress_total = ?, updated_at = ? WHERE id = ? AND drama_id = ? AND type = ? AND status = ?').run(JSON.stringify(generationTask.config), candidates.length, now, taskId, dramaId, 'original_clip', 'running'); if (updated.changes !== 1) throw new Error('候选生成任务已失效，拒绝写入迟到结果。') } else this.database.prepare('INSERT INTO production_tasks (id, drama_id, type, config_snapshot, status, progress_current, progress_total, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(taskId, dramaId, 'original_clip', JSON.stringify({ batch: true, candidateCount: candidates.length }), 'reviewing', 0, candidates.length, now, now); const insert = this.database.prepare('INSERT INTO task_items (id, task_id, planned_range, actual_range, status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)'); const event = this.database.prepare('INSERT INTO clip_candidate_semantic_events (candidate_id, semantic_event_id) VALUES (?, ?)'); const anchor = this.database.prepare('INSERT INTO clip_candidate_scene_anchors (candidate_id, evidence_id) VALUES (?, ?)'); for (const candidate of candidates) { insert.run(candidate.id, taskId, JSON.stringify(candidate), 'pending_review', now, now); candidate.semanticEventIds?.forEach((id) => event.run(candidate.id, id)); candidate.sceneAnchorIds?.forEach((id) => anchor.run(candidate.id, id)) } })()
    return candidates
  }
  /** @deprecated Automatic anchor-only generation is permanently closed. */
  generateCandidates(dramaIdInput: unknown, inputValue: unknown): ClipCandidate[] {
    void dramaIdInput; void inputValue
    throw new Error('锚点规则自动候选入口已关闭；请使用冻结证据包的智能生成任务，或通过手动候选入口创建。')
  }
  preflightGeneration(dramaIdInput: unknown, inputValue: unknown): ClipGenerationPreflight { const dramaId = z.string().trim().min(1).parse(dramaIdInput); const input = generationSchema.parse(inputValue) satisfies ClipCandidateGenerationInput; const episodeIds = [...new Set(input.episodeIds)]; if (episodeIds.length !== input.episodeIds.length) throw new Error('同一源分集只能选择一次。'); let capabilityReason: string | null = null; let semanticProvider: ProviderProfile | null = null; if (!this.candidateIntelligence) capabilityReason = '文本语义分析能力未初始化，系统未生成候选。'; else { try { semanticProvider = this.candidateIntelligence.assertAvailable() } catch (error) { capabilityReason = error instanceof Error ? error.message : '文本语义分析能力不可用，系统未生成候选。' } } const queued = (this.database.prepare("SELECT COUNT(*) AS count FROM production_tasks WHERE type = 'original_clip' AND status IN ('running', 'pending') AND json_extract(config_snapshot, '$.generation') IS NOT NULL").get() as { count: number }).count; const resourceBudget = (windows: number, mandatory: number) => { const providerTimeoutMs = semanticProvider?.timeoutMs ?? null; return { textWindows: windows, projectedMandatoryReviews: mandatory, maxFramesPerReview: MAX_REVIEW_FRAMES_PER_CANDIDATE, maxInputBytesPerReview: MAX_REVIEW_INPUT_BYTES, providerConcurrency: 1, providerTimeoutMs, queuePosition: queued, estimatedWaitMs: queued ? this.estimateQueueWaitMs(queued, providerTimeoutMs) : null, expectedProviderRequests: windows + mandatory, projectedDerivedInputBytes: mandatory * MAX_REVIEW_INPUT_BYTES, availableProviderSlots: queued ? 0 : 1, quotaRisk: mandatory > MAX_MULTIMODAL_REVIEWS_PER_TASK ? 'review-budget' as const : 'none' as const } }; if (capabilityReason) return { episodeIds, eligibleEpisodeIds: [], requestedCandidates: episodeIds.length * input.candidatesPerEpisode, estimatedCandidates: 0, candidatesPerEpisode: input.candidatesPerEpisode, targetDurationSeconds: input.targetDurationSeconds, maxOverlapRatio: input.maxOverlapRatio, allowRepeat: input.allowRepeat, skipped: episodeIds.map((episodeId) => ({ episodeId, reason: capabilityReason! })), subtitleSources: episodeIds.map((episodeId) => ({ episodeId, sourceKind: null, status: 'blocked' as const, reason: capabilityReason })), resourceBudget: resourceBudget(0, 0) }; const skipped: ClipGenerationPreflight['skipped'] = []; const eligibleEpisodeIds: string[] = []; let estimatedCandidates = 0; let projectedMandatoryReviews = 0; const subtitleSources: ClipGenerationPreflight['subtitleSources'] = []; const existing = this.listCandidates(dramaId); for (const episodeId of episodeIds) { const episode = this.database.prepare('SELECT duration_seconds AS durationSeconds, status FROM episodes WHERE id = ? AND drama_id = ?').get(episodeId, dramaId) as { durationSeconds: number | null; status: string } | undefined; if (!episode) { skipped.push({ episodeId, reason: '源分集不属于当前剧目。' }); continue } if (!isProductionReady(episode.status) || episode.durationSeconds === null) { skipped.push({ episodeId, reason: '媒体未就绪，已跳过。' }); continue } if (Math.min(input.targetDurationSeconds, episode.durationSeconds) < 3) { skipped.push({ episodeId, reason: '源分集时长不足 3 秒，已跳过。' }); continue } const readiness = this.anchorReadiness(dramaId, episodeId, episode.durationSeconds); const anchored = readiness.sourceKind ? anchorCandidateRanges(readiness.anchors, episode.durationSeconds, input.targetDurationSeconds) : []; const reason = readiness.sourceKind && !anchored.length ? `${readiness.sourceKind === 'scene' ? '镜头/场景锚点' : '字幕时间轴'}没有能组成至少 3 秒候选的真实边界，无法生成智能候选。` : null; subtitleSources.push({ episodeId, sourceKind: reason || !readiness.sourceKind ? null : readiness.sourceKind, status: reason || !readiness.sourceKind ? 'blocked' : 'qualified', reason: reason ?? readiness.reason }); if (!readiness.sourceKind) { skipped.push({ episodeId, reason: readiness.reason ?? '没有质量合格的切点锚点，无法生成智能候选。' }); continue } if (reason) { skipped.push({ episodeId, reason }); continue } const occupied = existing.filter((candidate) => candidate.episodeId === episodeId).map((candidate) => ({ start: candidate.startSeconds, end: candidate.endSeconds })); const selected = selectAnchorRanges(anchored, input.candidatesPerEpisode, occupied, input.maxOverlapRatio, input.allowRepeat); if (!selected.length) { skipped.push({ episodeId, reason: `低重合约束下没有可生成的${readiness.sourceKind === 'scene' ? '镜头/场景' : '字幕'}锚定候选；请调整数量、重合度或显式允许重复。` }); continue } eligibleEpisodeIds.push(episodeId); estimatedCandidates += selected.length; if (readiness.sourceKind === 'scene') projectedMandatoryReviews += selected.length } if (projectedMandatoryReviews > MAX_MULTIMODAL_REVIEWS_PER_TASK) { for (const episodeId of eligibleEpisodeIds.splice(0)) skipped.push({ episodeId, reason: '本次必须视频复核的片段超过受控预算，系统未改为普通候选；请缩小生成范围。' }); estimatedCandidates = 0 } return { episodeIds, eligibleEpisodeIds, requestedCandidates: episodeIds.length * input.candidatesPerEpisode, estimatedCandidates, candidatesPerEpisode: input.candidatesPerEpisode, targetDurationSeconds: input.targetDurationSeconds, maxOverlapRatio: input.maxOverlapRatio, allowRepeat: input.allowRepeat, skipped, subtitleSources, resourceBudget: resourceBudget(estimatedCandidates, projectedMandatoryReviews) } }
  private anchorReadiness(dramaId: string, episodeId: string, duration: number) { return readAnchorReadiness(this.database, this.sourceFramePtsCache, dramaId, episodeId, duration) }
  private assertFinalOutputDuration(candidate: ClipCandidate, duration: number, fps: number | null) { return assertFinalOutputDuration(candidate, duration, fps) }
  private assertFinalOutputFrameTiming(candidate: ClipCandidate, path: string, fps: number | null) { return assertFinalOutputFrameTiming(candidate, path, fps) }
  private assertFinalOutputSourceBoundaries(candidate: ClipCandidate, source: string, output: string, config: Pick<ClipExportConfig, 'outputSize' | 'subtitleStrategy' | 'packagingEnabled' | 'packaging'>, subtitle: string | null, timestamps: readonly number[], fps: number | null) { return assertFinalOutputSourceBoundaries(candidate, source, output, config, subtitle, timestamps, fps) }
  listCandidates(dramaIdInput: unknown): ClipCandidate[] { const dramaId = z.string().trim().min(1).parse(dramaIdInput); const rows = this.database.prepare("SELECT i.id, i.planned_range AS plannedRange, i.status, i.reason, i.created_at AS createdAt, snapshot.qualification, snapshot.summary_json AS summaryJson FROM task_items i JOIN production_tasks t ON t.id = i.task_id LEFT JOIN clip_candidate_publish_members member ON member.candidate_id = i.id LEFT JOIN clip_candidate_snapshots snapshot ON snapshot.id = member.snapshot_id WHERE t.drama_id = ? AND t.type = ? AND (json_extract(t.config_snapshot, '$.generation') IS NULL OR i.status IN ('confirmed', 'exporting', 'exported') OR EXISTS (SELECT 1 FROM clip_candidate_publish_members visible_member JOIN clip_candidate_publish_pointers pointer ON pointer.drama_id = visible_member.drama_id AND pointer.episode_id = visible_member.episode_id AND pointer.task_id = visible_member.task_id AND pointer.task_round = visible_member.task_round WHERE visible_member.candidate_id = i.id)) ORDER BY i.created_at ASC, i.id ASC").all(dramaId, 'original_clip') as Array<{ id: string; plannedRange: string; status: ClipCandidate['status']; reason: string | null; createdAt: string; qualification: 'qualified' | 'qualified_with_limit' | null; summaryJson: string | null }>; return rows.map((row) => { const range = JSON.parse(row.plannedRange) as Pick<ClipCandidate, 'episodeId' | 'startSeconds' | 'endSeconds' | 'semanticEventIds' | 'sceneAnchorIds'>; let qualificationReason: string | null = null; let evidence: ClipCandidateEvidence | undefined; try { const summary: unknown = JSON.parse(row.summaryJson ?? '{}'); if (summary && typeof summary === 'object') { const value = summary as { qualificationReason?: unknown; evidence?: unknown }; qualificationReason = typeof value.qualificationReason === 'string' ? value.qualificationReason : null; evidence = parseClipCandidateEvidence(value.evidence) } } catch { /* Historical snapshots stay readable without a new label. */ } return { id: row.id, episodeId: range.episodeId, startSeconds: range.startSeconds, endSeconds: range.endSeconds, semanticEventIds: range.semanticEventIds, sceneAnchorIds: range.sceneAnchorIds, ...(evidence ? { evidence } : {}), status: row.status, reason: row.reason, ...(row.qualification ? { qualification: row.qualification } : {}), ...(qualificationReason ? { qualificationReason } : {}), createdAt: row.createdAt } }) }
  listEpisodeStatuses(dramaIdInput: unknown): ClipEpisodeStatus[] { const dramaId = z.string().trim().min(1).parse(dramaIdInput); const episodes = this.database.prepare('SELECT id, episode_no AS episodeNo, status FROM episodes WHERE drama_id = ? ORDER BY sort_order, id').all(dramaId) as Array<{ id: string; episodeNo: number | null; status: string }>; const candidates = this.listCandidates(dramaId); return episodes.map((episode) => { const items = candidates.filter((candidate) => candidate.episodeId === episode.id); const count = (status: ClipCandidate['status']) => items.filter((item) => item.status === status).length; const pendingCount = count('pending_review') + count('editing'); const confirmedCount = count('confirmed'); const exportedCount = count('exported'); const failedCount = count('failed'); const productionStatus: ClipEpisodeStatus['productionStatus'] = !isProductionReady(episode.status) ? 'missing_media' : failedCount ? 'failed' : count('exporting') ? 'exporting' : items.length && exportedCount === items.length ? 'exported' : confirmedCount && !pendingCount ? 'confirmed' : pendingCount ? 'pending_confirmation' : 'ready_to_generate'; return { episodeId: episode.id, episodeNo: episode.episodeNo, sourceStatus: episode.status, candidateCount: items.length, pendingCount, confirmedCount, exportedCount, failedCount, productionStatus } }) }
  getLatestExportBatch(dramaId: unknown) { return this.exportRuntime.getLatestExportBatch(z.string().trim().min(1).parse(dramaId)) }
  preflightExport(dramaId: unknown, config: unknown) { return this.exportRuntime.preflightExport(z.string().trim().min(1).parse(dramaId), config) }
  exportCandidates(dramaId: unknown, config: unknown) { return this.exportRuntime.exportCandidates(z.string().trim().min(1).parse(dramaId), config) }
  startExportCandidates(dramaId: unknown, config: unknown) { return this.exportRuntime.startExportCandidates(z.string().trim().min(1).parse(dramaId), config) }
  getExportProgress(exportId: unknown) { return this.exportRuntime.getExportProgress(z.string().trim().min(1).parse(exportId)) }
  cancelExport(exportId: unknown) { return this.exportRuntime.cancelExport(z.string().trim().min(1).parse(exportId)) }
  exportCandidate(candidateId: unknown, outputDirectory: unknown) { return this.exportRuntime.exportCandidate(z.string().trim().min(1).parse(candidateId), z.string().trim().min(1).parse(outputDirectory)) }
  runCandidateItem(candidateId: unknown, outputDirectory: string, batchId: string, signal?: AbortSignal, config?: Pick<ClipExportConfig, 'namingPattern' | 'encoding' | 'precisionMode' | 'outputSize' | 'subtitleStrategy' | 'qualityMode' | 'bitrateKbps' | 'targetSizeMb' | 'fps' | 'packagingEnabled' | 'packaging'>) { return this.exportRuntime.runCandidateItem(z.string().trim().min(1).parse(candidateId), outputDirectory, batchId, signal, config) }
  retryFailedCandidate(candidateId: unknown, outputDirectory: unknown) { return this.exportRuntime.retryFailedCandidate(z.string().trim().min(1).parse(candidateId), z.string().trim().min(1).parse(outputDirectory)) }
  retryFailedTask(taskId: unknown) { return this.exportRuntime.retryFailedTask(z.string().trim().min(1).parse(taskId)) }
  private beginExportBatch(dramaId: string, candidateIds: string[], allowed: ClipCandidate['status'][]): string { return this.exportRuntime.beginExportBatch(dramaId, candidateIds, allowed) }
  private releaseExportCandidates(batchId: string, ids: string[]): void { this.exportRuntime.releaseExportCandidates(batchId, ids) }
  private async exportCandidateWithConfig(id: string, config: ClipExportConfig, batchId: string, signal?: AbortSignal) { return this.exportRuntime.exportCandidateWithConfig(id, config, batchId, signal) }
  confirmCandidate(candidateId: unknown): ClipCandidate { const id = z.string().trim().min(1).parse(candidateId); this.evidencePackages.assertPublishedCandidate(id); const result = this.database.prepare('UPDATE task_items SET status = ?, updated_at = ? WHERE id = ? AND status IN (?, ?)').run('confirmed', new Date().toISOString(), id, 'pending_review', 'editing'); if (!result.changes) throw new Error('Candidate is not editable'); return this.getCandidate(id) }
  updateCandidate(candidateId: unknown, range: unknown): ClipCandidate { const id = z.string().trim().min(1).parse(candidateId); const value = rangeSchema.parse(range); const row = this.database.prepare("SELECT e.duration_seconds AS durationSeconds FROM task_items i JOIN episodes e ON e.id = json_extract(i.planned_range, '$.episodeId') WHERE i.id = ?").get(id) as { durationSeconds: number | null } | undefined; if (!row) throw new Error('Candidate not found'); if (row.durationSeconds !== null && value.endSeconds > row.durationSeconds + 0.05) throw new Error('Clip range exceeds episode duration'); this.evidencePackages.assertPublishedCandidate(id, { range: value }); const result = this.database.prepare("UPDATE task_items SET planned_range = json_set(planned_range, '$.startSeconds', ?, '$.endSeconds', ?), status = ?, updated_at = ? WHERE id = ? AND status IN (?, ?)").run(value.startSeconds, value.endSeconds, 'editing', new Date().toISOString(), id, 'pending_review', 'editing'); if (!result.changes) throw new Error('Candidate is not editable'); return this.getCandidate(id) }
  deleteCandidate(candidateId: unknown): void { const id = z.string().trim().min(1).parse(candidateId); const candidate = this.database.prepare("SELECT i.task_id AS taskId, i.status FROM task_items i JOIN production_tasks t ON t.id = i.task_id WHERE i.id = ? AND t.type = 'original_clip'").get(id) as { taskId: string; status: ClipCandidate['status'] } | undefined; if (!candidate) throw new Error('候选不存在或不属于原剧切片。'); if (candidate.status === 'exporting') throw new Error('候选正在导出，无法删除。'); if (candidate.status === 'exported') throw new Error('已导出候选保留完成报告与成果审计，无法删除。'); this.database.transaction(() => { const result = this.database.prepare('DELETE FROM task_items WHERE id = ? AND status IN (?, ?, ?, ?)').run(id, 'pending_review', 'editing', 'confirmed', 'failed'); if (result.changes !== 1) throw new Error('候选状态已变化，无法删除。'); this.refreshTask(candidate.taskId) })() }
  getCandidate(candidateId: string): ClipCandidate { const row = this.database.prepare('SELECT id, planned_range, status, reason, created_at AS createdAt FROM task_items WHERE id = ?').get(candidateId) as { id: string; planned_range: string; status: ClipCandidate['status']; reason: string | null; createdAt: string } | undefined; if (!row) throw new Error('Candidate not found'); const range = JSON.parse(row.planned_range) as Pick<ClipCandidate, 'episodeId' | 'startSeconds' | 'endSeconds' | 'semanticEventIds' | 'sceneAnchorIds'>; return { id: row.id, episodeId: range.episodeId, startSeconds: range.startSeconds, endSeconds: range.endSeconds, semanticEventIds: range.semanticEventIds, sceneAnchorIds: range.sceneAnchorIds, status: row.status, reason: row.reason, createdAt: row.createdAt } }
  listSubtitleVariants(candidateId: unknown): ClipSubtitleVariant[] { return this.subtitleVariants.list(candidateId) }
  saveSubtitleVariant(input: unknown): ClipSubtitleVariant { return this.subtitleVariants.save(input) }
  private refreshTaskByItem(itemId: string): void { const row = this.database.prepare('SELECT task_id AS taskId FROM task_items WHERE id = ?').get(itemId) as { taskId: string } | undefined; if (row) this.refreshTask(row.taskId) }
  private refreshTask(taskId: string): void { const rows = this.database.prepare('SELECT status FROM task_items WHERE task_id = ?').all(taskId) as Array<{ status: string }>; const done = rows.filter(({ status }) => status === 'exported' || status === 'succeeded').length; const processed = rows.filter(({ status }) => ['exported', 'succeeded', 'failed'].includes(status)).length; const status = rows.some(({ status }) => status === 'failed') ? 'failed' : done === rows.length && done > 0 ? 'completed' : rows.some(({ status }) => status === 'exporting') ? 'running' : 'reviewing'; this.database.prepare('UPDATE production_tasks SET status = ?, progress_current = ?, progress_total = ?, updated_at = ? WHERE id = ?').run(status, processed, rows.length, new Date().toISOString(), taskId) }
}
