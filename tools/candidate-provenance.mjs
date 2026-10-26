import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, existsSync, realpathSync } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'

const git = (root, args, input) => execFileSync('git', args, { cwd: root, encoding: 'utf8', input, maxBuffer: 32 * 1024 * 1024 })
const digest = (value) => createHash('sha256').update(value).digest('hex')
export const fileSha256 = (path) => digest(readFileSync(path))
export const requiredChecks = ['tests', 'typecheck', 'build', 'currentE2E', 'packagedE2E', 'fidelity', 'review']
const included = (path) => !/^(docs|release|test-results|playwright-report|\.tmp|\.codex)\//.test(path) && !/\.md$/i.test(path)
const inventoryHash = (entries) => digest(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, hash]) => `${JSON.stringify(path)}\t${hash}\n`).join(''))

// Git blob IDs normalize checkout filters (including CRLF); names are also hashed.
export const sourceInputsSha256 = (root, commit) => {
  if (commit) return inventoryHash(git(root, ['ls-tree', '-rz', '--full-tree', commit]).split('\0').filter(Boolean).map((line) => {
    const [meta, path] = line.split('\t')
    return [path, meta.split(' ')[2]]
  }).filter(([path]) => included(path)))
  const paths = [...new Set(git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter((path) => path && included(path) && existsSync(resolve(root, path))))].sort()
  if (!paths.length) return inventoryHash([])
  const hashes = git(root, ['hash-object', '--stdin-paths'], paths.map((path) => JSON.stringify(path)).join('\n') + '\n').trim().split(/\r?\n/)
  return inventoryHash(paths.map((path, index) => [path, hashes[index]]))
}

export const designContractSha256 = (root) => digest(['docs/current-design-baseline.json', 'docs/design-contract-v49.json'].map((path) => `${path}\t${fileSha256(resolve(root, path))}\n`).join(''))
export const captureProvenance = (root) => ({
  schemaVersion: 2,
  sourceCommit: git(root, ['rev-parse', 'HEAD']).trim(),
  sourceInputsSha256: sourceInputsSha256(root),
  sourceDirty: Boolean(git(root, ['status', '--porcelain=v1', '--untracked-files=all']).trim()),
  designContractSha256: designContractSha256(root)
})
export const assertPackSource = (before, after, verificationOnly) => {
  if (!verificationOnly && (before.sourceDirty || after.sourceDirty)) throw new Error('Formal candidates require a clean Git worktree.')
  for (const key of ['sourceCommit', 'sourceInputsSha256', 'designContractSha256']) {
    if (before[key] !== after[key]) throw new Error(`Packaging inputs changed: ${key}`)
  }
}

const boundFile = (root, path, hash) => {
  if (typeof path !== 'string' || isAbsolute(path) || !/^[a-f0-9]{64}$/.test(hash ?? '')) throw new Error('invalid evidence reference')
  const full = realpathSync(resolve(root, path))
  const rel = relative(realpathSync(root), full)
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || fileSha256(full) !== hash) throw new Error('missing or tampered evidence')
  return full
}

export const verifyProvenance = (root, candidate, verification) => {
  const reasons = []
  let sourceIsAncestor = false
  let currentSourceMatches = false
  try {
    if (candidate.schemaVersion !== 2 || candidate.sourceDirty !== false || !/^[a-f0-9]{40,64}$/.test(candidate.sourceCommit ?? '')) throw new Error('manifest 缺少干净源码来源')
    if (git(root, ['rev-parse', '--verify', `${candidate.sourceCommit}^{commit}`]).trim() !== candidate.sourceCommit) throw new Error('sourceCommit 不存在')
    if (sourceInputsSha256(root, candidate.sourceCommit) !== candidate.sourceInputsSha256) throw new Error('提交与构建输入指纹不符')
    sourceIsAncestor = spawnSync('git', ['merge-base', '--is-ancestor', candidate.sourceCommit, 'HEAD'], { cwd: root }).status === 0
    currentSourceMatches = sourceIsAncestor && sourceInputsSha256(root) === candidate.sourceInputsSha256
    if (candidate.designContractSha256 !== designContractSha256(root)) throw new Error('当前 V49 scoped 合同指纹不符')
    if (verification.schemaVersion !== 2) throw new Error('验证记录缺少 schemaVersion 2')
    for (const key of ['sourceCommit', 'sourceInputsSha256', 'designContractSha256']) if (verification[key] !== candidate[key]) throw new Error(`验证记录 ${key} 不符`)
    for (const check of requiredChecks) {
      const ref = verification.checks?.[check]
      const record = JSON.parse(readFileSync(boundFile(candidate.directory, ref?.evidencePath, ref?.evidenceSha256), 'utf8'))
      if (record.schemaVersion !== 2 || record.check !== check || typeof record.command !== 'string' || !record.command.trim() || record.exitCode !== 0) throw new Error(`${check} 缺少成功命令结果`)
      if (record.sourceDirty !== false) throw new Error(`${check} 不是干净源码上的验证`)
      if (check === 'packagedE2E' && record.candidateManifestSha256 !== fileSha256(candidate.manifestPath)) throw new Error('包级测试未绑定当前 manifest')
      const start = Date.parse(record.startedAt), end = Date.parse(record.completedAt)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new Error(`${check} 时间无效`)
      for (const key of ['sourceCommit', 'sourceInputsSha256', 'designContractSha256']) if (record[key] !== candidate[key]) throw new Error(`${check} ${key} 不符`)
      boundFile(candidate.directory, record.outputPath, record.outputSha256)
    }
  } catch (error) { reasons.push(error.message) }
  return { reasons, sourceIsAncestor, currentSourceMatches }
}
