import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { verifyProvenance } from './candidate-provenance.mjs'

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const repositoryRoot = git(['rev-parse', '--show-toplevel'], process.cwd())
const packageJson = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8'))

const findWorkspaceEntry = (start) => {
  let current = start
  while (dirname(current) !== current) {
    const candidate = join(current, 'WORKSPACE-CURRENT.md')
    if (existsSync(candidate)) return candidate
    current = dirname(current)
  }
  return null
}

const countWorktreeChanges = (rawStatus) => {
  const records = rawStatus.split('\0').filter(Boolean)
  let staged = 0
  let unstaged = 0
  let untracked = 0
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const status = record.slice(0, 2)
    if (status === '??') {
      untracked += 1
      continue
    }
    if (status === '!!') continue
    if (status[0] !== ' ') staged += 1
    if (status[1] !== ' ') unstaged += 1
    if ('RC'.includes(status[0]) || 'RC'.includes(status[1])) index += 1
  }
  return { staged, unstaged, untracked, total: staged + unstaged + untracked }
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const isInside = (root, path) => {
  const result = relative(root, path)
  return result !== '' && !result.startsWith(`..${path.includes('\\') ? '\\' : '/'}`) && result !== '..' && !isAbsolute(result)
}

const validateCandidateIntegrity = (candidate) => {
  const reasons = []
  const candidateRoot = resolve(candidate.directory)
  if (candidate.releaseId !== basename(candidateRoot)) reasons.push('releaseId 与候选目录不一致')
  if (!candidate.executablePath || !candidate.executableSha256 || !candidate.appAsarSha256) reasons.push('manifest 缺少可核验哈希')
  const executablePath = candidate.executablePath ? resolve(candidate.executablePath) : null
  const appAsarPath = executablePath ? join(dirname(executablePath), 'resources', 'app.asar') : null
  if (executablePath && !isInside(candidateRoot, executablePath)) reasons.push('EXE 不在候选目录内')
  if (appAsarPath && !isInside(candidateRoot, appAsarPath)) reasons.push('app.asar 不在候选目录内')
  if (executablePath && !existsSync(executablePath)) reasons.push('EXE 不存在')
  if (appAsarPath && !existsSync(appAsarPath)) reasons.push('app.asar 不存在')
  if (executablePath && existsSync(executablePath) && candidate.executableSha256 && sha256(executablePath) !== candidate.executableSha256) reasons.push('EXE 哈希不匹配')
  if (appAsarPath && existsSync(appAsarPath) && candidate.appAsarSha256 && sha256(appAsarPath) !== candidate.appAsarSha256) reasons.push('app.asar 哈希不匹配')
  const closurePath = candidate.releaseId ? join(repositoryRoot, 'docs', `${candidate.releaseId}-closure.md`) : null
  return { ...candidate, appAsarPath, closurePath, valid: reasons.length === 0, reasons }
}

const validateCurrentVerification = (candidate) => {
  const reasons = [...candidate.reasons]
  let provenance = { currentSourceMatches: false, sourceIsAncestor: false }
  if (candidate.packageKind !== 'formal-candidate') reasons.push('缺少正式候选标记')
  if (candidate.visualFidelity !== 'passed') reasons.push('缺少当前通过的视觉审计标记')
  const verificationPath = join(candidate.directory, 'verification-evidence.json')
  if (!existsSync(verificationPath)) reasons.push('缺少结构化验证记录')
  else {
    try {
      const verification = JSON.parse(readFileSync(verificationPath, 'utf8'))
      provenance = verifyProvenance(repositoryRoot, candidate, verification)
      reasons.push(...provenance.reasons)
      if (verification.releaseId !== candidate.releaseId) reasons.push('验证记录 releaseId 不匹配')
      if (verification.candidateManifestSha256 !== sha256(candidate.manifestPath)) reasons.push('验证记录 manifest 哈希不匹配')
      if (!verification.verifiedAt || Number.isNaN(Date.parse(verification.verifiedAt))) reasons.push('验证记录缺少有效时间')
      const expectedClosurePath = join(repositoryRoot, 'docs', `${candidate.releaseId}-closure.md`)
      if (verification.closurePath !== expectedClosurePath || !existsSync(expectedClosurePath)) reasons.push('验证记录 closure 路径不匹配')
      else if (verification.closureSha256 !== sha256(expectedClosurePath)) reasons.push('验证记录 closure 哈希不匹配')
    } catch {
      reasons.push('结构化验证记录无法解析')
    }
  }
  return { ...candidate, ...provenance, currentVerified: reasons.length === 0, verificationReasons: reasons }
}

const latestCandidate = () => {
  const candidatesRoot = join(repositoryRoot, 'release', 'candidates')
  if (!existsSync(candidatesRoot)) return { immutableCandidate: null, verifiedCandidate: null, rejectedCount: 0 }
  const candidates = readdirSync(candidatesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const manifestPath = join(candidatesRoot, entry.name, 'candidate-manifest.json')
      if (!existsSync(manifestPath)) return []
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
        return [{ ...manifest, directory: join(candidatesRoot, entry.name), manifestPath }]
      } catch {
        return []
      }
    })
    .map(validateCandidateIntegrity)
  const immutable = candidates.filter((candidate) => candidate.valid)
    .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')))
  const assessed = immutable.map(validateCurrentVerification)
  const verified = assessed.filter((candidate) => candidate.currentVerified)
  return {
    immutableCandidate: immutable[0] ?? null,
    verifiedCandidate: verified[0] ?? null,
    candidateAssessments: assessed.map(({ releaseId, verificationReasons, currentSourceMatches }) => ({ releaseId, verificationReasons, currentSourceMatches })),
    rejectedCount: candidates.length - verified.length
  }
}

const worktree = countWorktreeChanges(execFileSync('git', ['status', '--porcelain=v1', '-z'], { cwd: repositoryRoot, encoding: 'utf8' }))
const remotes = git(['remote'], repositoryRoot).split(/\r?\n/).filter(Boolean)
const candidateSelection = latestCandidate()
const immutableCandidate = candidateSelection.immutableCandidate
const candidate = candidateSelection.verifiedCandidate
const documentPaths = {
  productSpec: join(repositoryRoot, 'Product-Spec.md'),
  developmentPlan: join(repositoryRoot, 'DEV-PLAN.md'),
  versionGovernance: join(repositoryRoot, 'docs', 'version-governance.md'),
  workspaceEntry: findWorkspaceEntry(repositoryRoot)
}
const documents = Object.fromEntries(Object.entries(documentPaths).map(([name, path]) => [name, { path, exists: Boolean(path && existsSync(path)) }]))
const report = {
  repositoryRoot,
  appVersion: packageJson.version,
  branch: git(['branch', '--show-current'], repositoryRoot) || '(detached HEAD)',
  head: git(['rev-parse', 'HEAD'], repositoryRoot),
  worktree,
  remotes,
  documents,
  rejectedCandidateCount: candidateSelection.rejectedCount,
  candidateAssessments: candidateSelection.candidateAssessments ?? [],
  currentSourceVerified: Boolean(candidate?.currentSourceMatches),
  historicalRecoveryAnchor: immutableCandidate ? { releaseId: immutableCandidate.releaseId, manifestPath: immutableCandidate.manifestPath, sourceCommit: immutableCandidate.sourceCommit ?? null } : null,
  latestVerifiedCandidate: candidate
    ? {
        releaseId: candidate.releaseId ?? null,
        createdAt: candidate.createdAt ?? null,
        manifestPath: candidate.manifestPath,
        executablePath: candidate.executablePath ?? null,
        packageKind: candidate.packageKind ?? null,
        visualFidelity: candidate.visualFidelity ?? null,
        sourceCommit: candidate.sourceCommit,
        sourceInputsSha256: candidate.sourceInputsSha256,
        currentSourceMatches: candidate.currentSourceMatches,
        sourceIsAncestor: candidate.sourceIsAncestor
      }
    : null,
  latestImmutableCandidate: immutableCandidate
    ? {
        releaseId: immutableCandidate.releaseId ?? null,
        createdAt: immutableCandidate.createdAt ?? null,
        manifestPath: immutableCandidate.manifestPath,
        executablePath: immutableCandidate.executablePath ?? null,
        integrity: 'manifest、文件与哈希已核验；不代表当前标准下已验证。'
      }
    : null,
  conclusion: worktree.total === 0
    ? candidate?.currentSourceMatches
      ? '当前开发树干净；源码与已验证内部候选一致，未公开发布。'
      : '当前开发树干净；它仍需经过构建和验证后才能称为候选包。'
    : '当前开发树含未收口改动；它不是可发布版本。最近不可变候选与当前标准下已验证候选必须以状态命令分别显示的结果为准。',
  versionRelation: immutableCandidate?.appVersion === packageJson.version
    ? '当前开发树声明版本与最近不可变候选版本一致；它是否达当前验证标准仍以状态命令的“已验证候选”字段为准。'
    : `当前开发树声明版本 ${packageJson.version} 与最近不可变候选版本 ${immutableCandidate?.appVersion ?? '未找到'} 不一致；开发树尚未形成对应候选。`
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log('短剧 AI 切片工具 · 当前状态')
  console.log(`主线：${report.repositoryRoot}`)
  console.log(`开发树声明版本：${report.appVersion}`)
  console.log(`Git：${report.branch} @ ${report.head}`)
  console.log(`工作树：${report.worktree.total === 0 ? '干净' : `未收口（暂存 ${report.worktree.staged} / 已改 ${report.worktree.unstaged} / 未追踪 ${report.worktree.untracked}）`}`)
  console.log(`远程备份：${report.remotes.length > 0 ? report.remotes.join(', ') : '未配置'}`)
  console.log(`最近不可变候选：${report.latestImmutableCandidate?.releaseId ?? '未找到'}${report.latestImmutableCandidate?.createdAt ? `（${report.latestImmutableCandidate.createdAt}）` : ''}`)
  console.log(`最近已验证候选：${report.latestVerifiedCandidate?.releaseId ?? '未找到'}`)
  console.log(`当前源码匹配已验证候选：${report.currentSourceVerified ? '是（输入指纹及提交祖先关系已核验）' : '否；历史包不能证明当前源码已验证'}`)
  console.log(`候选 manifest：${report.latestImmutableCandidate?.manifestPath ?? '未找到'}`)
  if (report.rejectedCandidateCount > 0) console.log(`已排除不可验证候选：${report.rejectedCandidateCount}`)
  console.log(`结论：${report.conclusion}`)
  console.log(`版本关系：${report.versionRelation}`)
  console.log('使用：pnpm run status:current；JSON：pnpm run status:current -- --json')
}
