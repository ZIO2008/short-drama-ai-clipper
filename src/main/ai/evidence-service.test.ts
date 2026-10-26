import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { EvidenceService } from './evidence-service.js'

const databases: Database.Database[] = []
afterEach(() => { for (const database of databases.splice(0)) database.close() })

describe('EvidenceService', () => {
  it('persists traceable local evidence without a media payload', () => {
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database)
    const now = new Date().toISOString(); database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama-1', '测试剧', now, now)
    const service = new EvidenceService(database)
    const created = service.record({ dramaId: 'drama-1', sourceType: 'subtitle', startSeconds: 12.5, endSeconds: 21, confidence: 0.8, summary: '人物提出冲突', details: { cueCount: 2 } })
    expect(service.list('drama-1')).toEqual([created])
    expect(JSON.stringify(database.prepare('SELECT * FROM ai_evidence').get())).not.toContain('payload')
  })

  it('rejects inverted timecodes before writing evidence', () => {
    const database = new Database(':memory:'); databases.push(database); migrateDatabase(database)
    const now = new Date().toISOString(); database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama-1', '测试剧', now, now)
    expect(() => new EvidenceService(database).record({ dramaId: 'drama-1', sourceType: 'scene', startSeconds: 10, endSeconds: 2, summary: '错误范围' })).toThrow('结束时间')
    expect(database.prepare('SELECT COUNT(*) AS count FROM ai_evidence').get()).toEqual({ count: 0 })
  })
})
