import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { TaskExecutor } from '../tasks/task-queue.js'
import { runControlledCapability, type ControlledMode } from './controlled-provider.js'

export const createControlledRemixExecutor = (database: Database.Database): TaskExecutor => async (item) => {
  const task = database.prepare('SELECT drama_id AS dramaId, config_snapshot AS configSnapshot FROM production_tasks WHERE id = ?').get(item.taskId) as { dramaId: string; configSnapshot: string } | undefined
  if (!task) throw new Error('AI 任务不存在。')
  const config = JSON.parse(task.configSnapshot) as { maxDrafts: number; episodeStart: number; episodeEnd: number; durationMinSeconds: number; durationMaxSeconds: number; controlledMode?: ControlledMode }
  const providerResult = runControlledCapability('text-analysis', config.controlledMode ?? 'success')
  const evidence = database.prepare(`
    SELECT evidence.id, evidence.summary, evidence.start_seconds AS startSeconds,
           evidence.end_seconds AS endSeconds, evidence.confidence
    FROM ai_evidence evidence
    JOIN episodes episode ON episode.id = evidence.episode_id
    WHERE evidence.drama_id = ?
      AND episode.episode_no BETWEEN ? AND ?
      AND evidence.confidence >= 0.6
      AND evidence.start_seconds IS NOT NULL
      AND evidence.end_seconds IS NOT NULL
    ORDER BY evidence.confidence DESC, evidence.created_at DESC
    LIMIT ?
  `).all(task.dramaId, config.episodeStart, config.episodeEnd, config.maxDrafts) as Array<{ id: string; summary: string; startSeconds: number | null; endSeconds: number | null; confidence: number | null }>
  const plan = providerResult.mode === 'low-confidence' ? [] : evidence.map((entry) => {
    const sourceDuration = entry.startSeconds !== null && entry.endSeconds !== null ? Math.max(0, entry.endSeconds - entry.startSeconds) : config.durationMinSeconds
    const expectedDurationSeconds = Math.max(config.durationMinSeconds, Math.min(config.durationMaxSeconds, sourceDuration))
    return { draftId: randomUUID(), evidenceId: entry.id, summary: entry.summary, startSeconds: entry.startSeconds, endSeconds: entry.endSeconds, confidence: entry.confidence, editingAngle: '爆点前置', hookReason: `以“${entry.summary}”作为开场钩子，并保留核心冲突后的合理结尾。`, coreStoryRange: `第 ${config.episodeStart}–${config.episodeEnd} 集核心剧情`, episodeStart: config.episodeStart, episodeEnd: config.episodeEnd, expectedDurationSeconds }
  })
  const reason = providerResult.mode === 'low-confidence' ? providerResult.message : plan.length === 0 ? '当前范围内没有符合时长和置信度阈值的本地证据。' : null
  const now = new Date().toISOString()
  database.transaction(() => {
    for (const draft of plan) {
      database.prepare('INSERT INTO ai_drafts (id, task_id, evidence_id, summary, start_seconds, end_seconds, confidence, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(draft.draftId, item.taskId, draft.evidenceId, draft.summary, draft.startSeconds, draft.endSeconds, draft.confidence, 'pending_review', now, now)
    }
    database.prepare('UPDATE production_tasks SET checkpoint = ?, updated_at = ? WHERE id = ?').run(JSON.stringify({ version: 1, stage: 'drafts', startedAt: null, drafts: plan, outcome: plan.length === 0 ? 'no-recommendation' : 'drafts-ready', reason }), now, item.taskId)
  })()
  return { status: 'succeeded' as const, reason, checkpoint: { stage: 'drafts', startedAt: null, drafts: plan, outcome: plan.length === 0 ? 'no-recommendation' : 'drafts-ready', reason } }
}
