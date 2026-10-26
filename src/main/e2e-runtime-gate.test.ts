import { describe, expect, it } from 'vitest'
import { disablePackagedE2eEnvironment, isE2eRuntimeEnabled } from './e2e-runtime-gate.js'

describe('E2E runtime gate', () => {
  it('removes every E2E override from a packaged process', () => {
    const environment = { SHORTDRAMA_MATERIAL_E2E: '1', shortdrama_material_e2e_import_paths: 'fixture.mp4', ShortDrama_Material_E2e_DeepSeek_Result: 'success', UNRELATED: 'keep' }
    disablePackagedE2eEnvironment(true, environment)
    expect(environment).toEqual({ UNRELATED: 'keep' })
    expect(isE2eRuntimeEnabled(true, 'e2e', environment)).toBe(false)
  })

  it('requires an unpackaged e2e channel and explicit opt-in together', () => {
    const environment = { SHORTDRAMA_MATERIAL_E2E: '1' }
    expect(isE2eRuntimeEnabled(false, 'e2e', environment)).toBe(true)
    expect(isE2eRuntimeEnabled(false, 'development', environment)).toBe(false)
    expect(isE2eRuntimeEnabled(false, 'e2e', {})).toBe(false)
  })
})
