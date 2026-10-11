import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, join } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const root = resolve(import.meta.dirname, '..')
const output = join(root, 'test-results', 'fidelity')
const contract = JSON.parse(await readFile(join(root, 'docs', 'design-contract-v49.json'), 'utf8'))
const evidenceRoot = join(root, contract.evidencePolicy.root)
const designFile = join(root, contract.authority.entry)
const report = []
const activeScreenIds = contract.activation?.mode === 'scoped'
  ? new Set(contract.activation.screenIds ?? [])
  : new Set(contract.screens.map((screen) => screen.id))

if (contract.status !== 'ready' || contract.activation?.enabled !== true || activeScreenIds.size === 0) {
  report.push({ name: 'design-gate', status: 'blocked-current-design-gate-not-active', contractStatus: contract.status, activationEnabled: contract.activation?.enabled === true })
  await mkdir(output, { recursive: true })
  await writeFile(join(output, 'fidelity-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(`FIDELITY_AUDIT_BLOCKED reason=current-v49-design-gate-not-active report=test-results/fidelity/fidelity-report.json`)
  process.exit(1)
}

const design = await readFile(designFile)
const designSha256 = createHash('sha256').update(design).digest('hex').toUpperCase()
if (designSha256 !== contract.authority.sha256) {
  report.push({ name: 'design-source', status: 'invalid-design-source-sha', expected: contract.authority.sha256, actual: designSha256 })
}

for (const screen of contract.screens.filter((candidate) => activeScreenIds.has(candidate.id))) {
  for (const state of screen.states) {
    for (const viewport of contract.viewports) {
      report.push(await verifyEvidence(screen.id, state, viewport))
    }
  }
}

await mkdir(output, { recursive: true })
await writeFile(join(output, 'fidelity-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
const incomplete = report.filter((entry) => entry.status !== 'captured-and-compared')
console.log(`FIDELITY_AUDIT_${incomplete.length === 0 ? 'OK' : 'INCOMPLETE'} completed=${report.length - incomplete.length} incomplete=${incomplete.length} report=test-results/fidelity/fidelity-report.json`)
if (incomplete.length > 0) process.exitCode = 1

async function verifyEvidence(screen, state, viewport) {
  const viewportName = `${viewport.width}x${viewport.height}`
  const stateDirectory = join(evidenceRoot, screen, state, viewportName)
  const previewPath = join(stateDirectory, 'project-library-preview.png')
  const electronPath = join(stateDirectory, 'electron.png')
  const metadataPath = join(stateDirectory, 'evidence.json')
  const missing = []
  if (!await exists(previewPath)) missing.push('project-library-preview')
  if (!await exists(electronPath)) missing.push('electron-capture')
  if (!await exists(metadataPath)) missing.push('evidence-metadata')
  if (missing.length > 0) {
    return { name: `${screen}:${state}:${viewportName}`, status: 'missing-current-design-evidence', missing, expected: relativeEvidencePaths(screen, state, viewportName) }
  }

  let metadata
  try {
    metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
  } catch (error) {
    return { name: `${screen}:${state}:${viewportName}`, status: 'invalid-evidence-metadata', error: error instanceof Error ? error.message : String(error), expected: relativeEvidencePaths(screen, state, viewportName) }
  }
  const metadataErrors = validateMetadata(metadata, screen, state, viewport)
  if (metadataErrors.length > 0) {
    return { name: `${screen}:${state}:${viewportName}`, status: 'invalid-evidence-metadata', errors: metadataErrors, expected: relativeEvidencePaths(screen, state, viewportName) }
  }

  const preview = await loadImage(previewPath)
  const electron = await loadImage(electronPath)
  if (preview.width !== viewport.width || preview.height !== viewport.height || electron.width !== viewport.width || electron.height !== viewport.height) {
    return {
      name: `${screen}:${state}:${viewportName}`,
      status: 'invalid-evidence-dimensions',
      expected: { width: viewport.width, height: viewport.height },
      preview: { width: preview.width, height: preview.height },
      electron: { width: electron.width, height: electron.height }
    }
  }

  const comparisons = []
  for (const region of metadata.comparisonRegions) comparisons.push(await compareRegion(preview, electron, region))
  const failedRegions = comparisons.filter((comparison) => !comparison.thresholdMet)
  if (failedRegions.length > 0) {
    return { name: `${screen}:${state}:${viewportName}`, status: 'visual-threshold-exceeded', metadata: relativeEvidencePaths(screen, state, viewportName).metadata, comparisons, fixture: metadata.fixture, test: metadata.test, allowedDifferences: metadata.allowedDifferences }
  }
  return { name: `${screen}:${state}:${viewportName}`, status: 'captured-and-compared', preview: relativeEvidencePaths(screen, state, viewportName).preview, electron: relativeEvidencePaths(screen, state, viewportName).electron, fixture: metadata.fixture, test: metadata.test, allowedDifferences: metadata.allowedDifferences, comparisons }
}

function validateMetadata(metadata, screen, state, viewport) {
  const errors = []
  if (metadata.projectId !== contract.authority.projectId) errors.push(`projectId must equal ${contract.authority.projectId}`)
  if (String(metadata.version) !== String(contract.authority.version)) errors.push(`version must equal ${contract.authority.version}`)
  if (metadata.source !== contract.evidencePolicy.source) errors.push(`source must be ${contract.evidencePolicy.source}`)
  if (metadata.screen !== screen || metadata.state !== state) errors.push('screen/state must match evidence directory')
  if (metadata.viewport?.width !== viewport.width || metadata.viewport?.height !== viewport.height) errors.push('viewport must match evidence directory')
  if (typeof metadata.fixture !== 'string' || metadata.fixture.length === 0) errors.push('fixture is required')
  if (typeof metadata.test !== 'string' || metadata.test.length === 0) errors.push('test is required')
  if (!Array.isArray(metadata.allowedDifferences)) errors.push('allowedDifferences must be an array')
  if (!Array.isArray(metadata.comparisonRegions) || metadata.comparisonRegions.length === 0) errors.push('comparisonRegions must include at least one explicit region')
  for (const [index, region] of (metadata.comparisonRegions ?? []).entries()) {
    if (!Number.isFinite(region.x) || !Number.isFinite(region.y) || !Number.isFinite(region.width) || !Number.isFinite(region.height) || region.width <= 0 || region.height <= 0 || region.x < 0 || region.y < 0 || region.x + region.width > viewport.width || region.y + region.height > viewport.height) errors.push(`comparisonRegions[${index}] is outside viewport`)
    if (!Number.isFinite(region.maxChangedPixelRatio) || !Number.isFinite(region.maxMeanRgbDelta) || region.maxChangedPixelRatio < 0 || region.maxMeanRgbDelta < 0) errors.push(`comparisonRegions[${index}] needs non-negative thresholds`)
  }
  return errors
}

async function compareRegion(preview, electron, region) {
  const previewCanvas = createCanvas(region.width, region.height)
  const electronCanvas = createCanvas(region.width, region.height)
  previewCanvas.getContext('2d').drawImage(preview, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
  electronCanvas.getContext('2d').drawImage(electron, region.x, region.y, region.width, region.height, 0, 0, region.width, region.height)
  const reference = previewCanvas.getContext('2d').getImageData(0, 0, region.width, region.height).data
  const actual = electronCanvas.getContext('2d').getImageData(0, 0, region.width, region.height).data
  let changedPixels = 0
  let totalDelta = 0
  for (let index = 0; index < reference.length; index += 4) {
    const delta = Math.abs(reference[index] - actual[index]) + Math.abs(reference[index + 1] - actual[index + 1]) + Math.abs(reference[index + 2] - actual[index + 2])
    if (delta > 24) changedPixels += 1
    totalDelta += delta
  }
  const changedPixelRatio = changedPixels / (region.width * region.height)
  const meanRgbDelta = totalDelta / (region.width * region.height * 3)
  return { label: region.label ?? 'unnamed-region', x: region.x, y: region.y, width: region.width, height: region.height, changedPixelRatio, meanRgbDelta, maxChangedPixelRatio: region.maxChangedPixelRatio, maxMeanRgbDelta: region.maxMeanRgbDelta, thresholdMet: changedPixelRatio <= region.maxChangedPixelRatio && meanRgbDelta <= region.maxMeanRgbDelta }
}

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

function relativeEvidencePaths(screen, state, viewport) {
  const base = `${contract.evidencePolicy.root}/${screen}/${state}/${viewport}`
  return { preview: `${base}/project-library-preview.png`, electron: `${base}/electron.png`, metadata: `${base}/evidence.json` }
}
