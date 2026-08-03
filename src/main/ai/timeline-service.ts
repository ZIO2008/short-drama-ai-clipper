import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'

const clipSchema = z.object({ id: z.string().min(1), sourcePath: z.string().min(1), sourceStartSeconds: z.number().nonnegative(), sourceEndSeconds: z.number().positive(), positionSeconds: z.number().nonnegative(), volume: z.number().min(0).max(2), fadeInSeconds: z.number().nonnegative(), fadeOutSeconds: z.number().nonnegative(), transition: z.enum(['cut', 'fade']), transitionDurationSeconds: z.number().min(0).max(5), role: z.enum(['source', 'conflict', 'music', 'sfx', 'narration']).optional(), sourceEvidenceId: z.string().min(1).optional(), narrationText: z.string().min(1).optional(), duckOriginalAudio: z.boolean().optional() }).refine((clip) => clip.sourceEndSeconds > clip.sourceStartSeconds, '片段时间范围无效')
const timelineSchema = z.object({ version: z.literal(1), snapEnabled: z.boolean(), video: z.array(clipSchema).min(1), music: z.tuple([z.array(clipSchema), z.array(clipSchema)]), sfx: z.tuple([z.array(clipSchema), z.array(clipSchema)]) })
const audioInputSchema = z.object({ kind: z.enum(['music', 'sfx']), trackIndex: z.number().int().min(0).max(1), sourcePath: z.string().min(1), durationSeconds: z.number().positive(), positionSeconds: z.number().nonnegative().default(0) })

export type TimelineClip = z.infer<typeof clipSchema>
export type FixedTimeline = z.infer<typeof timelineSchema>
export type TimelineProject = { id: string; draftId: string; timeline: FixedTimeline; confirmed: boolean; updatedAt: string }

type DraftSource = { evidenceId: string | null; sourcePath: string | null; startSeconds: number | null; endSeconds: number | null }
type ResolvedDraftSource = { sourcePath: string; startSeconds: number; endSeconds: number }

export class TimelineService {
  constructor(private readonly database: Database.Database) {}

  getOrCreate(draftIdInput: unknown): TimelineProject {
    const draftId = z.string().uuid().parse(draftIdInput)
    this.assertP1RemixDraft(draftId)
    const existing = this.database.prepare('SELECT project.id, project.draft_id AS draftId, project.timeline_json AS timelineJson, project.updated_at AS updatedAt, draft.status AS draftStatus FROM timeline_projects project JOIN ai_drafts draft ON draft.id = project.draft_id WHERE project.draft_id = ?').get(draftId) as { id: string; draftId: string; timelineJson: string; updatedAt: string; draftStatus: string } | undefined
    if (existing) return { id: existing.id, draftId: existing.draftId, timeline: timelineSchema.parse(JSON.parse(existing.timelineJson)), confirmed: existing.draftStatus === 'confirmed', updatedAt: existing.updatedAt }
    const source = this.database.prepare(`
      SELECT draft.evidence_id AS evidenceId, episode.source_path AS sourcePath,
             draft.start_seconds AS startSeconds, draft.end_seconds AS endSeconds
      FROM ai_drafts draft
      LEFT JOIN ai_evidence evidence ON evidence.id = draft.evidence_id
      LEFT JOIN episodes episode ON episode.id = evidence.episode_id
      WHERE draft.id = ?
    `).get(draftId) as DraftSource | undefined
    if (!source?.sourcePath || source.startSeconds === null || source.endSeconds === null) throw new Error('草稿缺少可定位的原片证据，不能创建审核时间线。')
    const now = new Date().toISOString(); const id = randomUUID()
    const clip: TimelineClip = { id: randomUUID(), sourcePath: source.sourcePath, sourceStartSeconds: source.startSeconds, sourceEndSeconds: source.endSeconds, positionSeconds: 0, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, transition: 'cut', transitionDurationSeconds: 0, role: 'source' }
    const timeline: FixedTimeline = { version: 1, snapEnabled: true, video: [clip], music: [[], []], sfx: [[], []] }
    this.database.transaction(() => {
      this.database.prepare('INSERT INTO timeline_projects (id, draft_id, timeline_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, draftId, JSON.stringify(timeline), now, now)
      this.database.prepare('UPDATE ai_drafts SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run('editing', now, draftId, 'pending_review')
    })()
    return { id, draftId, timeline, confirmed: false, updatedAt: now }
  }

  save(draftIdInput: unknown, timelineInput: unknown): TimelineProject {
    const draftId = z.string().uuid().parse(draftIdInput); const timeline = timelineSchema.parse(timelineInput); const now = new Date().toISOString()
    const project = this.getOrCreate(draftId)
    this.database.prepare('UPDATE timeline_projects SET timeline_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(timeline), now, project.id)
    this.database.prepare('UPDATE ai_drafts SET status = ?, updated_at = ? WHERE id = ? AND status IN (?, ?, ?)').run('editing', now, draftId, 'pending_review', 'editing', 'confirmed')
    return { id: project.id, draftId, timeline, confirmed: false, updatedAt: now }
  }

  addAudio(draftIdInput: unknown, input: unknown): TimelineProject {
    const draftId = z.string().uuid().parse(draftIdInput); const value = audioInputSchema.parse(input); const project = this.getOrCreate(draftId)
    const clip: TimelineClip = { id: randomUUID(), sourcePath: value.sourcePath, sourceStartSeconds: 0, sourceEndSeconds: value.durationSeconds, positionSeconds: value.positionSeconds, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, transition: 'cut', transitionDurationSeconds: 0, role: value.kind }
    const tracks = project.timeline[value.kind].map((track, index) => index === value.trackIndex ? [...track, clip] : track) as FixedTimeline[typeof value.kind]
    return this.save(draftId, { ...project.timeline, [value.kind]: tracks })
  }

  addNarration(draftIdInput: unknown, input: unknown): TimelineProject {
    const draftId = z.string().uuid().parse(draftIdInput)
    const value = z.object({ sourcePath: z.string().min(1), durationSeconds: z.number().positive(), positionSeconds: z.number().nonnegative().default(0) }).parse(input)
    const project = this.getOrCreate(draftId)
    const narration: TimelineClip = { id: randomUUID(), sourcePath: value.sourcePath, sourceStartSeconds: 0, sourceEndSeconds: value.durationSeconds, positionSeconds: value.positionSeconds, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, transition: 'cut', transitionDurationSeconds: 0, role: 'narration' }
    return this.save(draftId, { ...project.timeline, sfx: [[...project.timeline.sfx[0], narration], project.timeline.sfx[1]] })
  }

  createNarrationPlan(draftIdInput: unknown, input: unknown): TimelineProject {
    const draftId = z.string().uuid().parse(draftIdInput)
    const value = z.object({ narrationPath: z.string().min(1), targetDurationSeconds: z.number().positive(), mode: z.enum(['standard', 'conflict-insert']), evidenceId: z.string().min(1), narrationText: z.string().min(1) }).parse(input)
    const source = this.getSource(draftId)
    const sourceDuration = source.endSeconds - source.startSeconds
    if (sourceDuration > value.targetDurationSeconds) throw new Error('原片证据超过目标时长，不能静默截断解说草稿。')
    const existing = this.database.prepare('SELECT id FROM timeline_projects WHERE draft_id = ?').get(draftId) as { id: string } | undefined
    if (existing) this.database.prepare('DELETE FROM timeline_projects WHERE id = ?').run(existing.id)
    const video = value.mode === 'conflict-insert'
      ? this.buildConflictVideo(source, value.targetDurationSeconds)
      : this.repeatSource(source, value.targetDurationSeconds, 0, 'source')
    const beforeDuration = value.mode === 'conflict-insert' ? (value.targetDurationSeconds - sourceDuration) / 2 : 0
    const narration: TimelineClip[] = value.mode === 'conflict-insert'
      ? [this.audioClip(value.narrationPath, 0, beforeDuration, 0, value), this.audioClip(value.narrationPath, value.targetDurationSeconds - beforeDuration, beforeDuration, beforeDuration + sourceDuration, value)]
      : [this.audioClip(value.narrationPath, 0, value.targetDurationSeconds, 0, value)]
    const now = new Date().toISOString(); const id = randomUUID(); const timeline: FixedTimeline = { version: 1, snapEnabled: true, video, music: [[], []], sfx: [narration, []] }
    this.database.transaction(() => {
      this.database.prepare('INSERT INTO timeline_projects (id, draft_id, timeline_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, draftId, JSON.stringify(timeline), now, now)
      this.database.prepare('UPDATE ai_drafts SET status = ?, updated_at = ? WHERE id = ? AND status = ?').run('editing', now, draftId, 'pending_review')
    })()
    return { id, draftId, timeline, confirmed: false, updatedAt: now }
  }

  confirm(draftIdInput: unknown): TimelineProject {
    const project = this.getOrCreate(draftIdInput); const now = new Date().toISOString()
    const result = this.database.prepare('UPDATE ai_drafts SET status = ?, updated_at = ? WHERE id = ? AND status IN (?, ?)').run('confirmed', now, project.draftId, 'pending_review', 'editing')
    if (result.changes === 0) {
      const status = this.database.prepare('SELECT status FROM ai_drafts WHERE id = ?').get(project.draftId) as { status: string } | undefined
      if (status?.status === 'confirmed') return { ...project, confirmed: true, updatedAt: now }
      throw new Error('草稿不能确认导出。')
    }
    return { ...project, confirmed: true, updatedAt: now }
  }

  private getSource(draftId: string): ResolvedDraftSource {
    const source = this.database.prepare(`
      SELECT draft.evidence_id AS evidenceId, episode.source_path AS sourcePath,
             draft.start_seconds AS startSeconds, draft.end_seconds AS endSeconds
      FROM ai_drafts draft
      LEFT JOIN ai_evidence evidence ON evidence.id = draft.evidence_id
      LEFT JOIN episodes episode ON episode.id = evidence.episode_id
      WHERE draft.id = ?
    `).get(draftId) as DraftSource | undefined
    if (!source?.sourcePath || source.startSeconds === null || source.endSeconds === null) throw new Error('草稿缺少可定位的原片证据，不能创建审核时间线。')
    return { sourcePath: source.sourcePath, startSeconds: source.startSeconds, endSeconds: source.endSeconds }
  }

  private assertP1RemixDraft(draftId: string): void {
    const draft = this.database.prepare('SELECT task.type FROM ai_drafts draft JOIN production_tasks task ON task.id = draft.task_id WHERE draft.id = ?').get(draftId) as { type: string } | undefined
    if (draft?.type !== 'ai_remix') throw new Error('当前内部试点仅支持 P1 二创审核草稿。')
  }

  private repeatSource(source: ResolvedDraftSource, durationSeconds: number, positionSeconds: number, role: 'source' | 'conflict'): TimelineClip[] {
    const clips: TimelineClip[] = []; const sourceDuration = source.endSeconds - source.startSeconds; let remaining = durationSeconds; let position = positionSeconds
    while (remaining > 0.001) {
      const length = Math.min(sourceDuration, remaining)
      clips.push({ id: randomUUID(), sourcePath: source.sourcePath, sourceStartSeconds: source.startSeconds, sourceEndSeconds: source.startSeconds + length, positionSeconds: position, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, transition: 'cut', transitionDurationSeconds: 0, role })
      remaining -= length; position += length
    }
    return clips
  }

  private buildConflictVideo(source: ResolvedDraftSource, targetDurationSeconds: number): TimelineClip[] {
    const sourceDuration = source.endSeconds - source.startSeconds; const beforeDuration = (targetDurationSeconds - sourceDuration) / 2; const afterDuration = targetDurationSeconds - beforeDuration - sourceDuration
    return [...this.repeatSource(source, beforeDuration, 0, 'source'), ...this.repeatSource(source, sourceDuration, beforeDuration, 'conflict'), ...this.repeatSource(source, afterDuration, beforeDuration + sourceDuration, 'source')]
  }

  private audioClip(sourcePath: string, sourceStartSeconds: number, durationSeconds: number, positionSeconds: number, metadata: { evidenceId: string; narrationText: string }): TimelineClip {
    return { id: randomUUID(), sourcePath, sourceStartSeconds, sourceEndSeconds: sourceStartSeconds + durationSeconds, positionSeconds, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, transition: 'cut', transitionDurationSeconds: 0, role: 'narration', sourceEvidenceId: metadata.evidenceId, narrationText: metadata.narrationText, duckOriginalAudio: true }
  }
}
