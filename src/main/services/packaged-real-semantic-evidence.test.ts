import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { assertFrozenSemanticQualification, assertProductionSemanticQualification, PackagedRealSemanticEvidenceError, packagedRealExportFailureCode, packagedRealSemanticFailureCode, packagedSemanticValidationFailureCode, runPackagedRealSemanticEvidence } from './packaged-real-semantic-evidence.js'

describe('packagedRealSemanticFailureCode', () => {
  it('classifies safe structural failures without returning provider content', () => {
    expect(packagedRealSemanticFailureCode('返回了当前证据包之外的 ID。')).toBe('provider-response-invalid-window')
    expect(packagedRealSemanticFailureCode('候选未引用可闭合的叙事事件地图。')).toBe('provider-response-invalid-event-map')
    expect(packagedRealSemanticFailureCode('叙事事件接缝连续性未闭合，不能生成自动候选。')).toBe('provider-response-invalid-continuity')
    expect(packagedRealSemanticFailureCode('起止锚点的时间顺序无效。')).toBe('provider-response-invalid-time-order')
    expect(packagedRealSemanticFailureCode('剧情事件的跨窗连续性未闭合。')).toBe('provider-response-invalid-continuity')
    expect(packagedRealSemanticFailureCode('模型返回 2 条候选，超过本轮请求的 1 条上限。')).toBe('provider-response-invalid-candidate-limit')
    expect(packagedRealSemanticFailureCode('PROVIDER_CONTENT_DO_NOT_PERSIST')).toBe('unknown')
  })

  it('maps the checkpoint schema subtype to the packaged summary code', () => {
    expect(packagedSemanticValidationFailureCode('schema')).toBe('provider-response-invalid-schema')
    expect(packagedSemanticValidationFailureCode('window')).toBe('provider-response-invalid-window')
    expect(packagedSemanticValidationFailureCode('not-a-known-code')).toBeNull()
  })

  it('freezes the public samples at qualified_with_limit instead of accepting qualified drift', () => {
    expect(() => assertFrozenSemanticQualification({ candidateCount: 1, qualifiedCount: 0, qualifiedWithLimitCount: 1, blockedCount: 0 })).not.toThrow()
    expect(() => assertFrozenSemanticQualification({ candidateCount: 1, qualifiedCount: 1, qualifiedWithLimitCount: 0, blockedCount: 0 })).toThrow('isolated semantic evidence failed during summary')
    expect(() => assertFrozenSemanticQualification({ candidateCount: 1, qualifiedCount: 0, qualifiedWithLimitCount: 0, blockedCount: 1 })).toThrow('isolated semantic evidence failed during summary')
  })

  it('retains only safe numeric qualification counts for a frozen-summary failure', () => {
    const counts = { candidateCount: 0, qualifiedCount: 0, qualifiedWithLimitCount: 0, blockedCount: 0 }
    try { assertFrozenSemanticQualification(counts) } catch (error) {
      expect(error).toMatchObject({ stage: 'summary', code: 'candidate-not-qualified', qualificationCounts: counts })
      expect(JSON.stringify(error)).not.toContain('PROVIDER_CONTENT_DO_NOT_PERSIST')
    }
  })

  it('keeps confirmation, export and report failures as fixed local stages', () => {
    for (const stage of ['confirmation', 'export', 'report'] as const) expect(new PackagedRealSemanticEvidenceError(stage, 'task-state-invalid')).toMatchObject({ stage, code: 'task-state-invalid' })
  })

  it('allows either qualified production status while keeping blocked and duplicate outcomes closed', () => {
    expect(() => assertProductionSemanticQualification({ candidateCount: 1, qualifiedCount: 1, qualifiedWithLimitCount: 0, blockedCount: 0 })).not.toThrow()
    expect(() => assertProductionSemanticQualification({ candidateCount: 1, qualifiedCount: 0, qualifiedWithLimitCount: 1, blockedCount: 0 })).not.toThrow()
    expect(() => assertProductionSemanticQualification({ candidateCount: 1, qualifiedCount: 0, qualifiedWithLimitCount: 0, blockedCount: 1 })).toThrow()
    expect(() => assertProductionSemanticQualification({ candidateCount: 2, qualifiedCount: 1, qualifiedWithLimitCount: 1, blockedCount: 0 })).toThrow()
  })

  it('classifies local export failures without persisting paths or process output', () => {
    expect(packagedRealExportFailureCode(new Error('最终边界验证失败'))).toBe('export-verification')
    expect(packagedRealExportFailureCode(new Error('FFmpeg process exited'))).toBe('export-media-process')
    expect(packagedRealExportFailureCode(new Error('导出未生成成果'))).toBe('export-output')
  })

  it('keeps the hidden semantic allowlist limited to the frozen cross-window sample', async () => {
    await expect(runPackagedRealSemanticEvidence('hidden-02')).rejects.toThrow('只允许')
  })

  it('blocks the sealed hidden-01 before reading media or provider configuration', async () => {
    const original = [...process.argv]
    try {
      process.argv = [...original, '--real-semantic-evidence-manifest', resolve(import.meta.dirname, '../../../docs/clip-evidence-baseline/manifest.v1.json'), '--phase29-acceptance-ledger', resolve(import.meta.dirname, '../../../docs/phase-29-evidence/acceptance-ledger.v1.json')]
      await expect(runPackagedRealSemanticEvidence('hidden-01')).rejects.toThrow('唯一一次')
    } finally { process.argv = original }
  })
})
