import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolvePackagedSmokeUserData } from './packaged-smoke-runtime.js'

describe('packaged smoke runtime', () => {
  it('accepts only an explicit packaged path inside the system temporary root', () => {
    const directory = mkdtempSync(join(tmpdir(), 'packaged-smoke-runtime-'))
    try { expect(resolvePackagedSmokeUserData(true, ['app', '--packaged-smoke', '--packaged-smoke-user-data', directory], tmpdir())).toBe(directory) } finally { rmSync(directory, { recursive: true, force: true }) }
  })

  it('does not change ordinary packaged or development userData', () => {
    expect(resolvePackagedSmokeUserData(true, ['app'], 'C:\\Temp')).toBeNull()
    expect(resolvePackagedSmokeUserData(false, ['app'], 'C:\\Temp')).toBeNull()
  })

  it('rejects development use, missing opt-in and paths outside the temporary root', () => {
    const directory = mkdtempSync(join(tmpdir(), 'packaged-smoke-runtime-'))
    try {
      expect(() => resolvePackagedSmokeUserData(false, ['app', '--packaged-smoke', '--packaged-smoke-user-data', directory], tmpdir())).toThrow('packaged')
      expect(() => resolvePackagedSmokeUserData(true, ['app', '--packaged-smoke-user-data', directory], tmpdir())).toThrow('显式')
      expect(() => resolvePackagedSmokeUserData(true, ['app', '--packaged-smoke', '--packaged-smoke-user-data', process.cwd()], tmpdir())).toThrow('临时目录')
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
})
