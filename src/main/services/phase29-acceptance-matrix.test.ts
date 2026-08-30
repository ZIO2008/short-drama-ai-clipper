import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { readFile } from 'node:fs/promises'
import { assertHiddenAcceptanceUnused, buildPhase29AcceptanceMatrix, readSealedPhase29AcceptanceLedger } from './phase29-acceptance-matrix.js'

const manifest = {
  publicDevelopmentSet: ['dev-01', 'dev-02', 'dev-03', 'dev-04', 'dev-05', 'dev-06'].map((id) => ({ id, sceneCards: [`scene-${id}`] })),
  hiddenAcceptanceSet: ['hidden-01', 'hidden-02'].map((id) => ({ id, sceneCards: [`scene-${id}`] })),
}

describe('buildPhase29AcceptanceMatrix', () => {
  it('keeps missing, external failure, correct block and completed e2e distinct', () => {
    const matrix = buildPhase29AcceptanceMatrix(manifest, [
      { sampleId: 'dev-01', status: 'failed', code: 'provider-response-invalid-continuity' },
      { sampleId: 'dev-03', status: 'passed', conclusion: 'blocked' },
      { sampleId: 'dev-04', status: 'failed', code: 'provider-request-rejected' },
      { sampleId: 'dev-06', status: 'passed', e2e: { exportStatus: 'completed' } },
    ])
    expect(matrix.map(({ sampleId, outcome }) => [sampleId, outcome])).toEqual([
      ['dev-01', 'external-failed'], ['dev-02', 'not-run'], ['dev-03', 'correctly-blocked'], ['dev-04', 'external-failed'], ['dev-05', 'not-run'], ['dev-06', 'passed'], ['hidden-01', 'not-run'], ['hidden-02', 'not-run'],
    ])
  })

  it('rejects a second hidden-sample result instead of tuning from it', () => {
    expect(() => buildPhase29AcceptanceMatrix(manifest, [{ sampleId: 'hidden-01', status: 'failed' }, { sampleId: 'hidden-01', status: 'passed' }])).toThrow('隐藏样本只能执行一次')
  })

  it('loads the complete sealed 6+2 ledger and blocks every repeated hidden run across processes', async () => {
    const path = resolve(import.meta.dirname, '../../../docs/phase-29-evidence/acceptance-ledger.v2.json')
    const frozenManifest = JSON.parse(await readFile(resolve(import.meta.dirname, '../../../docs/clip-evidence-baseline/manifest.v1.json'), 'utf8'))
    const entries = await readSealedPhase29AcceptanceLedger(path, '6CF8D83D12837C3BCFEB8EAC341B8CE814005607359BCD3A3FDAF76302845339', frozenManifest)
    expect(entries).toHaveLength(8)
    expect(entries.filter((entry) => entry.tier === 'hidden')).toHaveLength(2)
    expect(entries.find((entry) => entry.sampleId === 'dev-04')?.outcome).toBe('passed')
    expect(entries.find((entry) => entry.sampleId === 'dev-03')?.outcome).toBe('correctly-blocked')
    expect(() => assertHiddenAcceptanceUnused(entries, 'hidden-01')).toThrow('唯一一次')
    expect(() => assertHiddenAcceptanceUnused(entries, 'hidden-02')).toThrow('唯一一次')
  })
})
