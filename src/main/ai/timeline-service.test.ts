import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { TimelineService } from './timeline-service.js'

const databases: Database.Database[] = []
const setup = (taskType = 'ai_remix'): { service: TimelineService; draftId: string; database: Database.Database } => {
  const database = new Database(':memory:'); databases.push(database); migrateDatabase(database); const now = new Date().toISOString()
  database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '测试剧', now, now)
  database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)').run('episode', 'drama', 1, 1, 'episode.mp4', 'ready', now, now)
  database.prepare('INSERT INTO production_tasks VALUES (?, ?, ?, ?, ?, 0, 1, NULL, ?, ?, ?)').run('task', 'drama', taskType, '{}', 'completed', '{}', now, now)
  database.prepare('INSERT INTO ai_evidence VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('evidence', 'drama', 'episode', 'subtitle', 10, 40, 0.9, '冲突', '{}', now, now)
  database.prepare('INSERT INTO ai_drafts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('d2719c5e-4a18-4f2a-9f8d-6d9877a4b321', 'task', 'evidence', '冲突', 10, 40, 0.9, 'pending_review', now, now)
  return { service: new TimelineService(database), draftId: 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321', database }
}
afterEach(() => { for (const database of databases.splice(0)) database.close() })

describe('TimelineService', () => {
  it('creates one fixed video track and exactly two music and two sfx tracks', () => {
    const { service, draftId } = setup(); const project = service.getOrCreate(draftId)
    expect(project.timeline.video).toHaveLength(1); expect(project.timeline.music).toHaveLength(2); expect(project.timeline.sfx).toHaveLength(2)
  })

  it('rejects a timeline that tries to add an extra music track', () => {
    const { service, draftId } = setup(); const project = service.getOrCreate(draftId)
    expect(() => service.save(draftId, { ...project.timeline, music: [[], [], []] })).toThrow()
  })

  it('places generated narration on the fixed sound track without adding a new track', () => {
    const { service, draftId } = setup()
    const project = service.addNarration(draftId, { sourcePath: 'narration.wav', durationSeconds: 1 })
    expect(project.timeline.sfx).toHaveLength(2)
    expect(project.timeline.sfx[0]).toMatchObject([{ sourcePath: 'narration.wav', role: 'narration' }])
  })

  it('rejects frozen P2 narration drafts before reading, editing, or confirming their timeline', () => {
    const { service, draftId, database } = setup('ai_narration')
    expect(() => service.getOrCreate(draftId)).toThrow('当前内部试点仅支持 P1 二创审核草稿。')
    expect(() => service.addAudio(draftId, { kind: 'music', trackIndex: 0, sourcePath: 'music.wav', durationSeconds: 1 })).toThrow('当前内部试点仅支持 P1 二创审核草稿。')
    expect(() => service.confirm(draftId)).toThrow('当前内部试点仅支持 P1 二创审核草稿。')
    expect(database.prepare('SELECT status FROM ai_drafts WHERE id = ?').get(draftId)).toEqual({ status: 'pending_review' })
    expect(database.prepare('SELECT id FROM timeline_projects WHERE draft_id = ?').get(draftId)).toBeUndefined()
  })
})
