import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const manifestPath = join(root, 'docs', 'clip-evidence-baseline', 'manifest.v1.json')
const ledgerPath = join(root, 'docs', 'phase-29-evidence', 'acceptance-ledger.v1.json')
const manifestBytes = readFileSync(manifestPath)
const ledgerBytes = readFileSync(ledgerPath)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const expectedLedgerSha256 = '19BFA1D05BB487C4ECB1F3E9BC1EB586311A0A043A7F584EDE1D7CE8E020ABDC'
const manifest = JSON.parse(manifestBytes)
const ledger = JSON.parse(ledgerBytes)
const errors = []

if (sha256(ledgerBytes) !== expectedLedgerSha256) errors.push('acceptance ledger sha256 mismatch')
if (ledger.version !== 1 || ledger.baselineManifestSha256 !== sha256(manifestBytes)) errors.push('acceptance ledger is not bound to Baseline v1')
const expected = [...manifest.publicDevelopmentSet.map((sample) => ({ ...sample, tier: 'public' })), ...manifest.hiddenAcceptanceSet.map((sample) => ({ ...sample, tier: 'hidden' }))]
if (expected.length !== 8 || manifest.publicDevelopmentSet.length !== 6 || manifest.hiddenAcceptanceSet.length !== 2) errors.push('baseline must remain public 6 + hidden 2')
if (!Array.isArray(ledger.entries) || ledger.entries.length !== 8) errors.push('ledger must contain exactly 8 entries')

const seen = new Set()
for (const sample of expected) {
  const entry = ledger.entries?.find((candidate) => candidate.sampleId === sample.id)
  if (!entry || seen.has(sample.id)) { errors.push(`missing or duplicate sample: ${sample.id}`); continue }
  seen.add(sample.id)
  if (entry.tier !== sample.tier || JSON.stringify(entry.sceneCards) !== JSON.stringify(sample.sceneCards)) errors.push(`identity mismatch: ${sample.id}`)
  if (entry.runCount !== 1 || entry.productionDatabaseWrites !== 0 || entry.sourceShaVerified !== true || entry.temporaryDataCleaned !== true || !Array.isArray(entry.evidence) || entry.evidence.length === 0) errors.push(`incomplete isolation evidence: ${sample.id}`)
}

for (const sampleId of ['dev-03', 'dev-04']) {
  if (ledger.entries?.find((entry) => entry.sampleId === sampleId)?.outcome !== 'limited-evidence') errors.push(`${sampleId} must remain limited-evidence until the frozen package/candidate review is rerun`)
}
for (const sampleId of ['hidden-01', 'hidden-02']) {
  if (ledger.entries?.find((entry) => entry.sampleId === sampleId)?.runCount !== 1) errors.push(`${sampleId} hidden run count must be exactly one`)
}

if (errors.length) {
  console.error(`phase29 acceptance validation failed (${errors.length})`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log('phase29 acceptance ledger valid: public=6 hidden=2 hiddenRuns=1+1 multimodal=limited-evidence')
}
