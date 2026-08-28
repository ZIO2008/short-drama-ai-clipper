import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

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
  return JSON.parse(result.stdout) as { latestImmutableCandidate: { releaseId: string } | null; latestVerifiedCandidate: { releaseId: string } | null }
}

const addCandidate = (root: string, verification: 'missing' | 'valid', poisonedPaths = false) => {
  const releaseId = 'v1.0.0-p1-internal-trial'
  const candidateRoot = join(root, 'release', 'candidates', releaseId, 'win-unpacked')
  const executablePath = join(candidateRoot, 'tool.exe')
  const asarPath = join(candidateRoot, 'resources', 'app.asar')
  mkdirSync(join(candidateRoot, 'resources'), { recursive: true })
  writeFileSync(executablePath, 'exe', 'utf8')
  writeFileSync(asarPath, 'asar', 'utf8')
  writeFileSync(join(root, 'release', 'candidates', releaseId, 'candidate-manifest.json'), JSON.stringify({
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
    writeFileSync(join(root, 'release', 'candidates', releaseId, 'verification-evidence.json'), JSON.stringify({
      releaseId,
      candidateManifestSha256: hash(readFileSync(manifestPath, 'utf8')),
      closurePath,
      closureSha256: hash(readFileSync(closurePath, 'utf8')),
      verifiedAt: '2026-08-11T00:00:00.000Z',
      checks: { tests: 'passed', typecheck: 'passed', build: 'passed', packagedE2E: 'passed', fidelity: 'passed', review: 'passed' }
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
})
