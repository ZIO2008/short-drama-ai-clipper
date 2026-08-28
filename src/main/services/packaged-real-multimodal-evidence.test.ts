import { describe, expect, it, vi } from 'vitest'
import { packagedRealMultimodalEvidenceBlockedSummary, packagedRealMultimodalEvidenceFailureCodeFor, packagedRealMultimodalEvidenceFailureSummary, packagedRealMultimodalEvidenceResultPath, packagedRealMultimodalEvidenceSuccessSummary, packagedRealMultimodalModelOverride, readonlyConfigurationDatabasePath, runPackagedRealMultimodalEvidence } from './packaged-real-multimodal-evidence.js'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => 'C:\\app-user-data') } }))

describe('packagedRealMultimodalEvidenceFailureSummary', () => {
  const identity = { sampleId: 'dev-04', packageId: '29000000-0000-4000-8000-000000000004', candidateId: '29000000-0000-4000-8003-000000000004', snapshotId: '29000000-0000-4000-8004-000000000004', evidenceId: '29000000-0000-4000-8001-000000000004', factCode: 'visual-fact-5bc0c1348a3e22d53318e530', startSeconds: 65.64, endSeconds: 65.72 }
  const frames = [{ ptsSeconds: 65.64, sha256: 'a'.repeat(64), byteLength: 123 }]
  const provider = { provider: '阿里云百炼 / Model Studio', model: 'qwen3.7-plus', modelRunId: 'run-1' }

  it('keeps a blocked frame review observable without media or provider content', () => {
    const summary = packagedRealMultimodalEvidenceFailureSummary('not-supported', Date.now() - 5)
    expect(summary).toEqual({ status: 'failed', reason: 'isolated-multimodal-evidence-failed', code: 'not-supported', elapsedMs: expect.any(Number), sourceDatabaseWrites: 0 })
    for (const field of ['sampleId', 'mediaSha256', 'mediaPath', 'endpoint', 'secret', 'subtitle']) expect(summary).not.toHaveProperty(field)
  })

  it('does not include a media identifier in a successful frame-evidence summary', () => {
    const summary = packagedRealMultimodalEvidenceSuccessSummary(identity, frames, provider, 'visual-fact-id')
    expect(summary).toEqual(expect.objectContaining({ ...identity, frameCount: 1, frameFacts: frames, providerSnapshot: provider, visualFactEvidenceId: 'visual-fact-id', conclusion: 'supported', sourceDatabaseWrites: 0 }))
    expect(summary).not.toHaveProperty('mediaSha256')
    expect(summary).not.toHaveProperty('mediaPath')
  })

  it('records an unclear public review as a blocked fact without provider prose', () => {
    const summary = packagedRealMultimodalEvidenceBlockedSummary(identity, frames, provider, 'unclear')
    expect(summary).toEqual(expect.objectContaining({ ...identity, frameCount: 1, conclusion: 'blocked', providerConclusion: 'unclear', sourceDatabaseWrites: 0 }))
    expect(JSON.stringify(summary)).not.toMatch(/reason|path|secret|subtitle/i)
  })

  it('classifies provider failures without persisting response content', () => {
    expect(packagedRealMultimodalEvidenceFailureCodeFor(new Error('视频复核调用失败（HTTP 429）。'))).toBe('provider-rate-limit')
    expect(packagedRealMultimodalEvidenceFailureCodeFor(new Error('视频复核调用失败（HTTP 503）。'))).toBe('provider-server')
    expect(packagedRealMultimodalEvidenceFailureCodeFor(new Error('视频复核调用失败（HTTP 400）。'))).toBe('provider-request-rejected')
    expect(packagedRealMultimodalEvidenceFailureCodeFor(new DOMException('timed out', 'TimeoutError'))).toBe('provider-timeout')
    expect(packagedRealMultimodalEvidenceFailureCodeFor(new Error('fetch failed'))).toBe('provider-network')
  })

  it('refuses every non-baseline sample before reading a profile or media', async () => {
    await expect(runPackagedRealMultimodalEvidence('dev-01')).rejects.toThrow('只允许')
  })

  it('requires a new absolute JSON result path when explicitly requested', () => {
    const original = [...process.argv]
    try {
      process.argv = [...original, '--real-multimodal-evidence-result', 'relative.json']
      expect(() => packagedRealMultimodalEvidenceResultPath()).toThrow()
      process.argv = [...original, '--real-multimodal-evidence-result', 'D:\\evidence-result.json']
      expect(packagedRealMultimodalEvidenceResultPath()).toBe('D:\\evidence-result.json')
    } finally {
      process.argv = original
    }
  })

  it('allows only the explicitly authorized temporary qwen3.7-plus override', () => {
    const original = [...process.argv]
    try {
      process.argv = [...original, '--real-multimodal-model', 'qwen3.7-plus']
      expect(packagedRealMultimodalModelOverride()).toBe('qwen3.7-plus')
      process.argv = [...original, '--real-multimodal-model', 'qwen3.7-flash']
      expect(() => packagedRealMultimodalModelOverride()).toThrow('只允许 qwen3.7-plus')
    } finally { process.argv = original }
  })

  it('rejects a relative manifest before it can read a profile or media', async () => {
    const original = [...process.argv]
    try {
      process.argv = [...original, '--real-multimodal-evidence-manifest', 'manifest.v1.json']
      await expect(runPackagedRealMultimodalEvidence('dev-04')).rejects.toThrow('绝对')
    } finally {
      process.argv = original
    }
  })

  it('allows a separate absolute read-only configuration user-data directory for isolated runs', async () => {
    const original = process.env.SHORTDRAMA_REAL_EVIDENCE_CONFIG_USER_DATA
    try {
      process.env.SHORTDRAMA_REAL_EVIDENCE_CONFIG_USER_DATA = 'C:\\configured-user-data'
      expect(readonlyConfigurationDatabasePath()).toBe('C:\\configured-user-data\\data\\material-studio.sqlite')
    } finally {
      if (original === undefined) delete process.env.SHORTDRAMA_REAL_EVIDENCE_CONFIG_USER_DATA
      else process.env.SHORTDRAMA_REAL_EVIDENCE_CONFIG_USER_DATA = original
    }
  })

  it('uses the packaged application identity as the default read-only configuration source and rejects relative overrides', () => {
    const original = process.env.SHORTDRAMA_REAL_EVIDENCE_CONFIG_USER_DATA
    try {
      delete process.env.SHORTDRAMA_REAL_EVIDENCE_CONFIG_USER_DATA
      expect(readonlyConfigurationDatabasePath()).toBe('C:\\app-user-data\\data\\material-studio.sqlite')
      process.env.SHORTDRAMA_REAL_EVIDENCE_CONFIG_USER_DATA = 'relative-source'
      expect(readonlyConfigurationDatabasePath).toThrow('绝对路径')
    } finally {
      if (original === undefined) delete process.env.SHORTDRAMA_REAL_EVIDENCE_CONFIG_USER_DATA
      else process.env.SHORTDRAMA_REAL_EVIDENCE_CONFIG_USER_DATA = original
    }
  })
})
