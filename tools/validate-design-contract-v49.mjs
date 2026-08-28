import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const contractPath = join(root, 'docs', 'design-contract-v49.json')
const contract = JSON.parse(readFileSync(contractPath, 'utf8'))
const failures = []
const warnings = []
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase()
const fail = (message) => failures.push(message)
const warn = (message) => warnings.push(message)
const required = (value, label) => {
  if (value === undefined || value === null || value === '') fail(`${label} is required`)
}

required(contract.authority?.projectId, 'authority.projectId')
required(contract.authority?.entry, 'authority.entry')
required(contract.authority?.sha256, 'authority.sha256')
required(contract.evidencePolicy?.root, 'evidencePolicy.root')
required(contract.evidencePolicy?.metadataSchema, 'evidencePolicy.metadataSchema')
required(contract.evidencePolicy?.ledger, 'evidencePolicy.ledger')

const sourcePath = resolve(root, contract.authority.entry)
if (!existsSync(sourcePath)) fail(`V49 design source does not exist: ${contract.authority.entry}`)
else if (sha256(sourcePath) !== contract.authority.sha256) fail(`V49 design source SHA-256 mismatch: expected=${contract.authority.sha256} actual=${sha256(sourcePath)}`)

const html = existsSync(sourcePath) ? readFileSync(sourcePath, 'utf8') : ''
const screens = Array.isArray(contract.screens) ? contract.screens : []
const viewports = Array.isArray(contract.viewports) ? contract.viewports : []
if (screens.length === 0) fail('screens must contain at least one screen')
if (viewports.length === 0) fail('viewports must contain at least one viewport')
const seenScreens = new Set()
let plannedSlots = 0
for (const screen of screens) {
  required(screen.id, 'screen.id')
  if (seenScreens.has(screen.id)) fail(`duplicate screen id: ${screen.id}`)
  seenScreens.add(screen.id)
  if (!html.includes(screen.id)) fail(`V49 design source does not contain screen marker: ${screen.id}`)
  if (!Array.isArray(screen.states) || screen.states.length === 0) fail(`screen has no states: ${screen.id}`)
  if (new Set(screen.states).size !== screen.states.length) fail(`duplicate states in screen: ${screen.id}`)
  if (typeof screen.stateStatus !== 'string' || !screen.stateStatus.includes('pending')) warn(`screen state status is not explicitly pending: ${screen.id}`)
  plannedSlots += (screen.states?.length ?? 0) * viewports.length
}

const artifactName = contract.requiredProjectArtifacts?.[0]
const artifactPath = artifactName ? join(dirname(sourcePath), artifactName) : undefined
if (!artifactPath || !existsSync(artifactPath)) fail(`V49 artifact JSON does not exist: ${artifactName ?? '(missing)'}`)
else if (contract.sourceMirror?.files?.[artifactName] && sha256(artifactPath) !== contract.sourceMirror.files[artifactName]) fail(`V49 artifact SHA-256 mismatch: ${artifactName}`)

const schemaPath = resolve(root, contract.evidencePolicy.metadataSchema)
if (!existsSync(schemaPath)) fail(`evidence metadata schema does not exist: ${contract.evidencePolicy.metadataSchema}`)
else {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
  if (schema.properties?.schemaVersion?.const !== contract.evidencePolicy.metadataVersion) fail('evidence metadata schema version does not match contract')
  for (const field of ['projectId', 'contractRevision', 'version', 'source', 'designSource', 'screen', 'state', 'viewport', 'fixture', 'test', 'evidenceStatus', 'captures', 'allowedDifferences', 'comparisonRegions']) {
    if (!schema.required?.includes(field)) fail(`evidence metadata schema missing required field: ${field}`)
  }
}

const evidenceRoot = resolve(root, contract.evidencePolicy.root)
if (!existsSync(evidenceRoot)) fail(`V49 evidence root does not exist: ${contract.evidencePolicy.root}`)
const ledgerPath = resolve(root, contract.evidencePolicy.ledger)
if (!existsSync(ledgerPath)) fail(`V49 evidence ledger does not exist: ${contract.evidencePolicy.ledger}`)
const captureFiles = []
const walk = (directory) => {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path)
    else if (/\.(png|json)$/i.test(entry.name) && !entry.name.endsWith('schema.json')) captureFiles.push(relative(root, path).replaceAll('\\', '/'))
  }
}
walk(evidenceRoot)
if (captureFiles.length > 0) warn(`V49 evidence files present but not evaluated by this contract-only checker: ${captureFiles.length}`)

const requireEvidence = process.argv.includes('--require-evidence')
if (requireEvidence && captureFiles.length === 0) fail(`V49 evidence is required but no captures exist; plannedSlots=${plannedSlots}`)
if (contract.status === 'ready' && contract.activation?.enabled !== true) warn('contract is ready but activation.enabled is not true')
if (contract.status === 'draft') warn('contract is draft; this command validates source/schema/planning only')

const summary = {
  status: contract.status,
  activation: contract.activation?.enabled === true,
  screens: screens.length,
  states: screens.reduce((total, screen) => total + screen.states.length, 0),
  viewports: viewports.length,
  plannedSlots,
  captureFiles: captureFiles.length,
  evidenceRequired: requireEvidence,
  sourceSha256: contract.authority.sha256,
  evidenceRoot: contract.evidencePolicy.root
}
for (const warning of warnings) console.warn(`WARN ${warning}`)
for (const failure of failures) console.error(`FAIL ${failure}`)
console.log(`V49_CONTRACT_${failures.length === 0 ? 'OK' : 'INVALID'} ${JSON.stringify(summary)}`)
if (failures.length > 0) process.exitCode = 1
