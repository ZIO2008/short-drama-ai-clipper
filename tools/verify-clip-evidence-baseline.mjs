import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'

const manifestPath = resolve('docs/clip-evidence-baseline/manifest.v1.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const sets = [manifest.publicDevelopmentSet, manifest.hiddenAcceptanceSet]
if (!Number.isInteger(manifest.version) || manifest.version < 1 || sets.some((set) => !Array.isArray(set)) || manifest.publicDevelopmentSet.length < 6 || manifest.hiddenAcceptanceSet.length < 2) throw new Error('CLIP_EVIDENCE_BASELINE_INVALID: manifest must declare at least 6 public and 2 hidden samples.')
const root = resolve(manifest.mediaRoot)
const failures = []
for (const sample of sets.flat()) {
  if (!sample?.id || typeof sample.relativePath !== 'string' || !Array.isArray(sample.sceneCards) || sample.sceneCards.length === 0) { failures.push(`${sample?.id ?? 'unknown'}: incomplete sample record`); continue }
  const path = resolve(root, sample.relativePath)
  if (!relative(root, path) || relative(root, path).startsWith('..')) { failures.push(`${sample.id}: path escapes isolated baseline root`); continue }
  if (!sample.sha256 || !/^[a-f0-9]{64}$/i.test(sample.sha256)) { failures.push(`${sample.id}: SHA-256 not registered`); continue }
  if (!existsSync(path)) { failures.push(`${sample.id}: media missing`); continue }
  const digest = createHash('sha256').update(readFileSync(path)).digest('hex')
  if (digest.toLowerCase() !== sample.sha256.toLowerCase()) failures.push(`${sample.id}: SHA-256 mismatch`)
}
if (failures.length) throw new Error(`CLIP_EVIDENCE_BASELINE_INCOMPLETE\n${failures.join('\n')}`)
console.log(`CLIP_EVIDENCE_BASELINE_OK version=${manifest.version} public=${manifest.publicDevelopmentSet.length} hidden=${manifest.hiddenAcceptanceSet.length}`)
