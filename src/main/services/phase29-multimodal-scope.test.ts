import { resolve } from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateDatabase } from '../db/migrate.js'
import { assertFrozenCandidateScope, readFrozenMultimodalScope, seedFrozenMultimodalCandidate } from './phase29-multimodal-scope.js'

const baselineSha256 = '6CF8D83D12837C3BCFEB8EAC341B8CE814005607359BCD3A3FDAF76302845339'
const scopePath = resolve(import.meta.dirname, '../../../docs/clip-evidence-baseline/multimodal-scopes.v1.json')

describe('Phase 29 frozen multimodal scope', () => {
  it('loads the immutable dev-04 scene card with stable package, candidate, evidence and PTS identities', async () => {
    const scope = await readFrozenMultimodalScope(scopePath, baselineSha256, { id: 'dev-04', sceneCards: ['visual-only-supported'] })
    expect(scope).toEqual(expect.objectContaining({ packageId: '29000000-0000-4000-8000-000000000004', candidateId: '29000000-0000-4000-8003-000000000004', evidenceId: '29000000-0000-4000-8001-000000000004', startSeconds: 65.64, endSeconds: 65.72, expectedConclusion: 'supported' }))
  })

  it('seeds and re-reads the exact frozen candidate-to-scene-unit boundary', async () => {
    const database = new Database(':memory:')
    migrateDatabase(database)
    const scope = await readFrozenMultimodalScope(scopePath, baselineSha256, { id: 'dev-03', sceneCards: ['visual-review-unclear'] })
    const packageRecord = seedFrozenMultimodalCandidate(database, { scope, sourcePath: 'D:\\frozen\\dev-03.mp4', sourceFingerprint: 'media-fingerprint', durationSeconds: 64.44 })
    expect(packageRecord.id).toBe(scope.packageId)
    expect(() => assertFrozenCandidateScope(database, scope)).not.toThrow()
    expect(database.prepare('SELECT summary FROM ai_evidence WHERE id = ?').get(scope.evidenceId)).toEqual({ summary: scope.statement })
    database.close()
  })

  it('rejects a scope when the frozen scene card does not belong to the sample', async () => {
    await expect(readFrozenMultimodalScope(scopePath, baselineSha256, { id: 'dev-04', sceneCards: ['different-card'] })).rejects.toThrow('场景卡')
  })
})
