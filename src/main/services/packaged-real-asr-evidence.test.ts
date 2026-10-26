import { describe, expect, it, vi } from 'vitest'
import { packagedRealAsrEvidenceFailureSummary } from './packaged-real-asr-evidence.js'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => 'C:\\app-user-data') } }))

describe('packagedRealAsrEvidenceFailureSummary', () => {
  it.each(['setup', 'media', 'ocr', 'asr', 'evidence'] as const)('exposes only a bounded %s stage without sensitive evidence', (stage) => {
    const summary = packagedRealAsrEvidenceFailureSummary(stage)
    expect(summary).toEqual({ status: 'failed', reason: 'isolated-asr-evidence-failed', stage, sourceDatabaseWrites: 0 })
    for (const field of ['sampleId', 'mediaSha256', 'mediaPath', 'endpoint', 'secret', 'subtitle', 'providerResponse']) expect(summary).not.toHaveProperty(field)
  })
})
