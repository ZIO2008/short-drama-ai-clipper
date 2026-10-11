import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const currentPointer = JSON.parse(readFileSync(join(root, 'docs', 'current-design-baseline.json'), 'utf8'))
const registry = JSON.parse(readFileSync(join(root, currentPointer.registry), 'utf8'))
const currentEntry = registry.baselines.find((entry) => entry.id === currentPointer.currentId && entry.domain === 'design' && entry.status === 'current')
if (!currentEntry) throw new Error(`当前设计指针没有对应的 current 注册项：${currentPointer.currentId}`)
const contractPath = join(root, 'docs', 'design-contract-v49.json')
const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
const failures = []
const info = []
const sourcePath = resolve(root, contract.authority.entry)
if (currentEntry.path !== contract.authority.entry || currentEntry.sha256 !== contract.authority.sha256 || currentPointer.sha256 !== contract.authority.sha256) {
  failures.push('current 设计指针、注册表和合同的路径或哈希不一致')
}

if (!existsSync(sourcePath)) failures.push(`设计 HTML 不存在：${sourcePath}`)
else {
  const actual = createHash('sha256').update(readFileSync(sourcePath)).digest('hex').toUpperCase()
  if (actual !== contract.authority.sha256) failures.push(`设计 HTML SHA-256 不一致：expected=${contract.authority.sha256} actual=${actual}`)
  else info.push(`设计 HTML 哈希匹配：${actual}`)
  const html = readFileSync(sourcePath, 'utf8')
  for (const screen of contract.screens) if (!html.includes(screen.id)) failures.push(`设计 HTML 缺少屏幕标识：${screen.id}`)
}

const designDirectory = dirname(sourcePath)
for (const artifact of contract.requiredProjectArtifacts) {
  const artifactPath = join(designDirectory, artifact)
  if (!existsSync(artifactPath)) failures.push(`缺少 Open Design 同版本交接物：${artifactPath}`)
}

for (const [artifact, expectedHash] of Object.entries(contract.sourceMirror?.files ?? {})) {
  const artifactPath = join(designDirectory, artifact)
  if (!existsSync(artifactPath)) continue
  const actualHash = createHash('sha256').update(readFileSync(artifactPath)).digest('hex').toUpperCase()
  if (actualHash !== expectedHash) failures.push(`Open Design 交接镜像哈希不一致：${artifactPath} expected=${expectedHash} actual=${actualHash}`)
  else info.push(`Open Design 交接镜像哈希匹配：${artifact}`)
}

if (!['draft', 'ready'].includes(contract.status)) failures.push(`设计合同状态不受支持：${contract.status}`)
if (!Array.isArray(contract.screens) || contract.screens.some((screen) => !screen.id || !Array.isArray(screen.states) || screen.states.length === 0)) failures.push('页面或状态清单不完整')

for (const line of info) console.log(`OK ${line}`)
for (const line of failures) console.error(`FAIL ${line}`)
if (failures.length) process.exitCode = 1
else {
  console.log(`DESIGN_CONTRACT_OK project=${contract.authority.projectId} version=${contract.authority.version} status=${contract.status}`)
  if (contract.activation?.enabled !== true) console.log('DESIGN_GATE_NOT_ACTIVE current V49 contract is valid but not activated for release admission')
}
