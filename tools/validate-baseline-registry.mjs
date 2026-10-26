import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const registryPath = join(root, 'docs', 'baseline-registry.json')
const registry = JSON.parse(readFileSync(registryPath, 'utf8'))
const errors = []
const allowedStatuses = new Set(['draft', 'candidate', 'current', 'superseded', 'legacy', 'archived'])
const domains = new Set(['design', 'runtime', 'test', 'release', 'evidence'])
const byId = new Map()

if (!Array.isArray(registry.baselines) || registry.baselines.length === 0) errors.push('baselines must be a non-empty array')
for (const entry of registry.baselines ?? []) {
  if (byId.has(entry.id)) errors.push(`duplicate id: ${entry.id}`)
  byId.set(entry.id, entry)
  for (const key of ['id', 'snapshotId', 'domain', 'path', 'sha256', 'status', 'createdAt', 'allowedUse']) {
    if (!(key in entry)) errors.push(`${entry.id ?? '<unknown>'} missing ${key}`)
  }
  if (!domains.has(entry.domain)) errors.push(`${entry.id} invalid domain: ${entry.domain}`)
  if (!allowedStatuses.has(entry.status)) errors.push(`${entry.id} invalid status: ${entry.status}`)
  if (!/^[A-F0-9]{64}$/.test(entry.sha256)) errors.push(`${entry.id} invalid sha256`)
  const filePath = resolve(root, entry.path)
  if (!filePath.startsWith(`${root}${process.platform === 'win32' ? '\\' : '/'}`) && filePath !== root) errors.push(`${entry.id} path escapes project root`)
  if (!existsSync(filePath) || !statSync(filePath).isFile()) errors.push(`${entry.id} path missing or not a file: ${entry.path}`)
  else {
    const ignored = spawnSync('git', ['check-ignore', '-q', '--', filePath], { cwd: root, windowsHide: true })
    if (ignored.status === 0) errors.push(`${entry.id} path is ignored by Git and cannot form a reproducible baseline: ${entry.path}`)
    else if (ignored.status !== 1) errors.push(`${entry.id} Git trackability check failed: ${entry.path}`)
    const digest = createHash('sha256').update(readFileSync(filePath)).digest('hex').toUpperCase()
    if (digest !== entry.sha256) errors.push(`${entry.id} sha256 mismatch: expected ${entry.sha256}, got ${digest}`)
  }
}

for (const entry of registry.baselines ?? []) {
  if (entry.supersedes !== null && !byId.has(entry.supersedes)) errors.push(`${entry.id} supersedes unknown entry: ${entry.supersedes}`)
}

for (const domain of domains) {
  const pointerPath = join(root, 'docs', `current-${domain}-baseline.json`)
  if (!existsSync(pointerPath)) { errors.push(`missing pointer for domain: ${domain}`); continue }
  const pointer = JSON.parse(readFileSync(pointerPath, 'utf8'))
  if (pointer.domain !== domain) errors.push(`${domain} pointer has wrong domain: ${pointer.domain}`)
  const target = byId.get(pointer.currentId)
  if (!target) errors.push(`${domain} pointer references unknown id: ${pointer.currentId}`)
  else {
    if (target.domain !== domain) errors.push(`${domain} pointer crosses domain to ${target.domain}`)
    if (pointer.sha256 !== target.sha256) errors.push(`${domain} pointer sha256 differs from registry`)
    if (target.status !== 'current' && !(domain === 'release' && target.status === 'candidate') && !(domain === 'evidence' && target.status === 'legacy')) errors.push(`${domain} pointer targets invalid status: ${target.status}`)
  }
}

if (errors.length) {
  console.error(`baseline registry validation failed (${errors.length})`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log(`baseline registry valid: ${registry.baselines.length} entries, ${domains.size} domain pointers`)
}
