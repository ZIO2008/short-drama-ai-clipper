import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { captureProvenance, requiredChecks, assertPackSource } from './candidate-provenance.mjs'

const roots: string[] = []
const statusScript = resolve(process.cwd(), 'tools', 'current-workspace-status.mjs')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

const runGit = (root: string, args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })

const createRepository = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'short-drama-status-'))
  roots.push(root)
  mkdirSync(join(root, 'docs'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }), 'utf8')
  writeFileSync(join(root, 'Product-Spec.md'), '# spec\n', 'utf8')
  writeFileSync(join(root, 'DEV-PLAN.md'), '# plan\n', 'utf8')
  writeFileSync(join(root, 'docs', 'version-governance.md'), '# governance\n', 'utf8')
  writeFileSync(join(root, 'docs', 'current-design-baseline.json'), '{}')
  writeFileSync(join(root, 'docs', 'design-contract-v49.json'), '{}')
  writeFileSync(join(root, '.gitignore'), 'release/\n')
  runGit(root, ['init'])
  runGit(root, ['config', 'user.email', 'test@example.invalid'])
  runGit(root, ['config', 'user.name', 'Status Test'])
  runGit(root, ['add', '.'])
  runGit(root, ['commit', '-m', 'test fixture'])
  return root
}

const readReport = (root: string) => {
  const result = spawnSync(process.execPath, [statusScript, '--json'], { cwd: root, encoding: 'utf8' })
  expect(result.status).toBe(0)
  return JSON.parse(result.stdout) as { currentSourceVerified: boolean; latestImmutableCandidate: { releaseId: string } | null; latestVerifiedCandidate: { releaseId: string; currentSourceMatches: boolean } | null }
}

const addCandidate = (root: string, verification: 'missing' | 'valid', poisonedPaths = false) => {
  const provenance = captureProvenance(root)
  const releaseId = 'v1.0.0-p1-internal-trial'
  const candidateRoot = join(root, 'release', 'candidates', releaseId, 'win-unpacked')
  const executablePath = join(candidateRoot, 'tool.exe')
  const asarPath = join(candidateRoot, 'resources', 'app.asar')
  mkdirSync(join(candidateRoot, 'resources'), { recursive: true })
  writeFileSync(executablePath, 'exe', 'utf8')
  writeFileSync(asarPath, 'asar', 'utf8')
  writeFileSync(join(root, 'release', 'candidates', releaseId, 'candidate-manifest.json'), JSON.stringify({
    ...(verification === 'valid' ? provenance : {}),
    releaseId,
    appVersion: '1.0.0',
    packageKind: 'formal-candidate',
    visualFidelity: 'passed',
    executablePath,
    executableSha256: hash('exe'),
    appAsarSha256: hash('asar'),
    createdAt: '2026-08-11T00:00:00.000Z',
    ...(poisonedPaths ? { directory: join(root, 'outside'), manifestPath: join(root, 'outside', 'candidate-manifest.json') } : {})
  }), 'utf8')
  const closurePath = join(root, 'docs', `${releaseId}-closure.md`)
  writeFileSync(closurePath, `# ${releaseId}\n\n## 验证证据\n`, 'utf8')
  if (verification === 'valid') {
    const manifestPath = join(root, 'release', 'candidates', releaseId, 'candidate-manifest.json')
    const evidenceRoot = join(root, 'release', 'candidates', releaseId)
    const checks = Object.fromEntries(requiredChecks.map((check: string) => {
      const outputPath = `${check}.log`
      writeFileSync(join(evidenceRoot, outputPath), 'actual command output')
      const evidencePath = `${check}.json`
      const record = JSON.stringify({ ...provenance, candidateManifestSha256: hash(readFileSync(manifestPath, 'utf8')), check, command: `fixture ${check}`, exitCode: 0, startedAt: '2026-10-13T00:00:00Z', completedAt: '2026-10-13T00:01:00Z', outputPath, outputSha256: hash('actual command output') })
      writeFileSync(join(evidenceRoot, evidencePath), record)
      return [check, { evidencePath, evidenceSha256: hash(record) }]
    }))
    writeFileSync(join(root, 'release', 'candidates', releaseId, 'verification-evidence.json'), JSON.stringify({
      ...provenance,
      releaseId,
      candidateManifestSha256: hash(readFileSync(manifestPath, 'utf8')),
      closurePath,
      closureSha256: hash(readFileSync(closurePath, 'utf8')),
      verifiedAt: '2026-08-11T00:00:00.000Z',
      checks
    }), 'utf8')
  }
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('current workspace status', () => {
  it('reports no candidate instead of failing in a fresh repository', () => {
    const report = readReport(createRepository())
    expect(report.latestImmutableCandidate).toBeNull()
    expect(report.latestVerifiedCandidate).toBeNull()
  })

  it('keeps a legacy candidate without structured evidence out of currently verified candidates', () => {
    const root = createRepository()
    addCandidate(root, 'missing')
    const report = readReport(root)
    expect(report.latestImmutableCandidate?.releaseId).toBe('v1.0.0-p1-internal-trial')
    expect(report.latestVerifiedCandidate).toBeNull()
  }, 30_000)

  it('accepts only a candidate whose structured evidence binds its manifest and closure', () => {
    const root = createRepository()
    addCandidate(root, 'valid')
    const report = readReport(root)
    expect(report.latestVerifiedCandidate?.releaseId).toBe('v1.0.0-p1-internal-trial')
  })

  it('ignores manifest attempts to override the directory and manifest path discovered by enumeration', () => {
    const root = createRepository()
    addCandidate(root, 'valid', true)
    const report = readReport(root)
    expect(report.latestVerifiedCandidate?.releaseId).toBe('v1.0.0-p1-internal-trial')
  })

  it('keeps verified history but does not claim changed source was verified', () => {
    const root = createRepository()
    addCandidate(root, 'valid')
    writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.1' }))
    const report = readReport(root)
    expect(report.latestVerifiedCandidate).not.toBeNull()
    expect(report.currentSourceVerified).toBe(false)
  })

  it('permits a later docs-only registration commit', () => {
    const root = createRepository()
    addCandidate(root, 'valid')
    runGit(root, ['add', 'docs'])
    runGit(root, ['commit', '-m', 'register candidate closure'])
    expect(readReport(root).currentSourceVerified).toBe(true)
  })

  it.each(['missing', 'tampered', 'nonzero', 'legacy', 'commit', 'contract'])('rejects %s evidence', (mode) => {
    const root = createRepository()
    addCandidate(root, 'valid')
    const directory = join(root, 'release', 'candidates', 'v1.0.0-p1-internal-trial')
    const verificationPath = join(directory, 'verification-evidence.json')
    const verification = JSON.parse(readFileSync(verificationPath, 'utf8'))
    if (mode === 'missing') rmSync(join(directory, 'tests.json'))
    if (mode === 'tampered') writeFileSync(join(directory, 'tests.log'), 'changed output')
    if (mode === 'legacy') verification.checks.tests = 'passed'
    if (mode === 'commit') verification.sourceCommit = '0'.repeat(40)
    if (mode === 'contract') writeFileSync(join(root, 'docs', 'design-contract-v49.json'), '{"changed":true}')
    if (mode === 'nonzero') {
      const recordPath = join(directory, 'tests.json')
      const record = JSON.parse(readFileSync(recordPath, 'utf8'))
      record.exitCode = 1
      writeFileSync(recordPath, JSON.stringify(record))
      verification.checks.tests.evidenceSha256 = hash(JSON.stringify(record))
    }
    writeFileSync(verificationPath, JSON.stringify(verification))
    expect(readReport(root).latestVerifiedCandidate).toBeNull()
    expect(readReport(root).latestImmutableCandidate).not.toBeNull()
  })

  it('guards formal packaging and detects source changes during packaging', () => {
    const root = createRepository()
    const before = captureProvenance(root)
    writeFileSync(join(root, 'new-source.js'), 'export const changed = true')
    const after = captureProvenance(root)
    expect(() => assertPackSource(after, after, false)).toThrow('clean Git')
    expect(() => assertPackSource(after, after, true)).not.toThrow()
    expect(() => assertPackSource(before, after, true)).toThrow('inputs changed')
  })
})
