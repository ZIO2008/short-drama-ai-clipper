import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { EvaluationService } from './evaluation-service.js'

describe('EvaluationService', () => {
  it('records metrics without provider payloads or secrets', () => {
    const database = new Database(':memory:'); migrateDatabase(database)
    const run = new EvaluationService(database).record({ capability: 'text-analysis', mode: 'controlled', metrics: { usableDraftRate: 0.6, traceabilityRate: 1 }, notes: '受控评估' })
    expect(run.metrics.usableDraftRate).toBe(0.6)
    expect(JSON.stringify(database.prepare('SELECT * FROM evaluation_runs').get())).not.toContain('secret')
    database.close()
  })
})
