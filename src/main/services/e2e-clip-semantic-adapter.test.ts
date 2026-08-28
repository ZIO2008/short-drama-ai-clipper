import { describe, expect, it } from 'vitest'
import { createE2eClipSemanticAdapter } from './e2e-clip-semantic-adapter.js'

describe('createE2eClipSemanticAdapter', () => {
  it('honors candidateLimit and uses only the selected frozen window', async () => {
    const result = await createE2eClipSemanticAdapter().select({ package: { id: 'p', dramaId: 'd', episodeId: 'e', version: 1, sourceMediaFingerprint: 'fixture', ruleVersion: 'fixture', status: 'ready', reason: null }, profile: { id: 'fixture', capability: 'text-analysis', region: 'local', provider: 'fixture', endpoint: 'http://127.0.0.1', model: 'fixture', secretRef: null, timeoutMs: 1_000, pricing: null }, candidateLimit: 1, proposals: [{ evidenceIds: ['11111111-1111-4111-8111-111111111111'], summary: 'first' }, { evidenceIds: ['22222222-2222-4222-8222-222222222222'], summary: 'second' }] }) as { selections: Array<{ proposalId: string }> }
    expect(result.selections).toHaveLength(1); expect(result.selections[0]?.proposalId).toBe('window-1')
  })
})
