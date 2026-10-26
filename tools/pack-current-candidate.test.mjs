import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packScript = join(repositoryRoot, 'tools', 'pack-current-candidate.mjs')

const invokePackPreflight = (args, verificationOutputRoot) => spawnSync(
  process.execPath,
  [packScript, ...args],
  {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: { ...process.env, SHORTDRAMA_VERIFICATION_OUTPUT_ROOT: verificationOutputRoot },
  },
)

describe('pack-current-candidate verification output guard', () => {
  it('rejects an external output root unless verification mode is explicit', () => {
    const result = invokePackPreflight([], 'C:\\shortdrama-verification-outputs')
    expect(result.status).not.toBe(0)
    expect(`${result.stderr}${result.stdout}`).toContain('allowed only for verification packages')
  })

  it('rejects relative verification output roots before build work begins', () => {
    const result = invokePackPreflight(['--verification'], 'relative-verification-output')
    expect(result.status).not.toBe(0)
    expect(`${result.stderr}${result.stdout}`).toContain('must be an absolute path')
  })

  it('rejects the formal candidate directory as a verification output root', () => {
    const result = invokePackPreflight(['--verification'], join(repositoryRoot, 'release', 'candidates'))
    expect(result.status).not.toBe(0)
    expect(`${result.stderr}${result.stdout}`).toContain('cannot point to the formal candidate output directory')
  })

  it('resolves a temporary junction before rejecting an alias of the formal candidate directory', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'shortdrama-pack-guard-'))
    const alias = join(temporaryRoot, 'candidate-alias')
    try {
      symlinkSync(join(repositoryRoot, 'release', 'candidates'), alias, 'junction')
      const result = invokePackPreflight(['--verification'], alias)
      expect(result.status).not.toBe(0)
      expect(`${result.stderr}${result.stdout}`).toContain('cannot point to the formal candidate output directory')
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true })
    }
  })
})
