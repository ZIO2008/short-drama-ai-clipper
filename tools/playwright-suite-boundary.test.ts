import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const loadResolver = async () => import('./playwright-suite-boundary.mjs')

describe('Playwright suite boundary', () => {
  it('resolves the registered current packaged tests without the retired e2e directory', async () => {
    const { resolvePlaywrightSuiteTests } = await loadResolver()
    const tests = resolvePlaywrightSuiteTests('current', ['packaged-real-dpi.spec.ts', 'long-asset-scroll.spec.ts'])
    expect(tests).toEqual([
      'tests/current/packaged-real-dpi.spec.ts',
      'tests/current/long-asset-scroll.spec.ts'
    ])
    expect(tests.every((test) => !test.startsWith('tests/e2e/'))).toBe(true)
  })

  it('fails when the boundary points at a missing current test', async () => {
    const { resolvePlaywrightSuiteTests } = await loadResolver()
    const root = join(process.cwd(), 'test-results', 'suite-boundary-fixture')
    try {
      mkdirSync(join(root, 'docs'), { recursive: true })
      mkdirSync(join(root, 'tests', 'current'), { recursive: true })
      writeFileSync(join(root, 'docs', 'test-suite-boundary.json'), JSON.stringify({ suites: { current: ['missing.spec.ts'] } }))
      expect(() => resolvePlaywrightSuiteTests('current', undefined, root)).toThrow('missing test')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
