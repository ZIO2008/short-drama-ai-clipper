import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasExactSampleIds } from './phase29-acceptance-contract.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const manifestPath = join(root, 'docs', 'clip-evidence-baseline', 'manifest.v1.json')
const ledgerPath = join(root, 'docs', 'phase-29-evidence', 'acceptance-ledger.v2.json')
const multimodalScopePath = join(root, 'docs', 'clip-evidence-baseline', 'multimodal-scopes.v1.json')
const videoManifestPath = join(root, 'docs', 'phase-29-evidence', 'run-manifest-20260829-video-bound.json')
const manifestBytes = readFileSync(manifestPath)
const ledgerBytes = readFileSync(ledgerPath)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex').toUpperCase()
const expectedLedgerSha256 = '7C8CA1AA7733390F43ADED7F51587B426EC39CF4B8F967FDA90529CC853F68E1'
const manifest = JSON.parse(manifestBytes)
const ledger = JSON.parse(ledgerBytes)
const multimodalScopeBytes = readFileSync(multimodalScopePath)
const multimodalScope = JSON.parse(multimodalScopeBytes)
const videoManifest = JSON.parse(readFileSync(videoManifestPath))
const errors = []

if (sha256(ledgerBytes) !== expectedLedgerSha256) errors.push('acceptance ledger sha256 mismatch')
if (ledger.version !== 2 || ledger.baselineManifestSha256 !== sha256(manifestBytes)) errors.push('acceptance ledger is not bound to Baseline v1')
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

if (ledger.entries?.find((entry) => entry.sampleId === 'dev-03')?.outcome !== 'correctly-blocked') errors.push('dev-03 must remain correctly-blocked by the frozen package/candidate review')
if (ledger.entries?.find((entry) => entry.sampleId === 'dev-04')?.outcome !== 'passed') errors.push('dev-04 must remain passed by the frozen package/candidate review')
for (const sampleId of ['hidden-01', 'hidden-02']) {
  if (ledger.entries?.find((entry) => entry.sampleId === sampleId)?.runCount !== 1) errors.push(`${sampleId} hidden run count must be exactly one`)
}

if (videoManifest.status !== 'multimodal-p1-positive-and-negative-passed') errors.push('video manifest status is not passed')
if (videoManifest.acceptanceLedger?.path !== 'docs/phase-29-evidence/acceptance-ledger.v2.json' || videoManifest.acceptanceLedger?.sha256 !== sha256(ledgerBytes)) errors.push('video manifest is not bound to acceptance ledger v2')
if (videoManifest.contract?.baselineManifestSha256 !== sha256(manifestBytes) || videoManifest.contract?.multimodalScopeSha256 !== sha256(multimodalScopeBytes)) errors.push('video manifest is not bound to the frozen manifests')
if (videoManifest.productionConfigurationDatabase?.sha256Before !== videoManifest.productionConfigurationDatabase?.sha256After || videoManifest.productionConfigurationDatabase?.writes !== 0) errors.push('video manifest does not prove a read-only production configuration database')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
for (const run of videoManifest.runs ?? []) {
  const resultPath = resolve(root, run.resultPath ?? '')
  const traversal = relative(root, resultPath)
  if (!run.resultPath || isAbsolute(run.resultPath) || traversal.startsWith('..') || !existsSync(resultPath)) { errors.push(`${run.sampleId}: tracked result is missing or outside the repository`); continue }
  const resultBytes = readFileSync(resultPath)
  const result = JSON.parse(resultBytes)
  const scope = multimodalScope.scopes?.find((item) => item.sampleId === run.sampleId)
  const entry = ledger.entries?.find((item) => item.sampleId === run.sampleId)
  if (sha256(resultBytes) !== run.resultSha256 || entry?.resultSha256 !== run.resultSha256) errors.push(`${run.sampleId}: tracked result sha256 does not match manifest and ledger`)
  for (const key of ['packageId', 'candidateId', 'snapshotId', 'evidenceId', 'factCode', 'startSeconds', 'endSeconds']) if (result[key] !== run[key] || result[key] !== scope?.[key]) errors.push(`${run.sampleId}: ${key} is not bound across scope, result and manifest`)
  if (result.status !== 'passed' || result.sourceDatabaseWrites !== 0 || result.frameCount !== 5 || result.frameFacts?.length !== 5) errors.push(`${run.sampleId}: result is incomplete or not isolated`)
  if (run.frameCount !== result.frameCount || run.conclusion !== result.conclusion || (run.providerConclusion ?? null) !== (result.providerConclusion ?? null) || run.sourceDatabaseWrites !== result.sourceDatabaseWrites) errors.push(`${run.sampleId}: run manifest summary differs from tracked result`)
  if (!result.frameFacts?.every((frame) => Number.isFinite(frame.ptsSeconds) && /^[a-f0-9]{64}$/i.test(frame.sha256) && frame.byteLength > 0)) errors.push(`${run.sampleId}: invalid frame facts`)
  if (!result.frameFacts?.some((frame) => frame.ptsSeconds === scope?.startSeconds) || !result.frameFacts?.some((frame) => frame.ptsSeconds === scope?.endSeconds)) errors.push(`${run.sampleId}: frame facts do not include both frozen PTS boundaries`)
  if (result.providerSnapshot?.provider !== '阿里云百炼 / Model Studio' || result.providerSnapshot?.model !== 'qwen3.7-plus' || !uuid.test(result.providerSnapshot?.modelRunId ?? '')) errors.push(`${run.sampleId}: provider snapshot is missing or invalid`)
  const expectedOutcome = run.sampleId === 'dev-04' ? result.conclusion === 'supported' && entry?.outcome === 'passed' : result.conclusion === 'blocked' && result.providerConclusion === 'unclear' && entry?.outcome === 'correctly-blocked'
  if (!expectedOutcome) errors.push(`${run.sampleId}: conclusion does not match the frozen acceptance outcome`)
}
if (!hasExactSampleIds(videoManifest.runs, ['dev-03', 'dev-04'])) errors.push('video manifest must contain exactly one dev-03 and one dev-04 run')

if (errors.length) {
  console.error(`phase29 acceptance validation failed (${errors.length})`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else {
  console.log('phase29 acceptance ledger valid: public=6 hidden=2 hiddenRuns=1+1 multimodal=passed+correctly-blocked')
}
