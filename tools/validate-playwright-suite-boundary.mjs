import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const map = JSON.parse(readFileSync(join(root, 'docs', 'test-suite-boundary.json'), 'utf8'))
const errors = []
const seen = new Map()
for (const [suite, files] of Object.entries(map.suites ?? {})) {
  if (!Array.isArray(files) || files.length === 0) errors.push(`${suite} must contain tests`)
  for (const file of files ?? []) {
    const path = join(root, 'tests', suite, file)
    if (!existsSync(path)) errors.push(`${suite} references missing test: ${file}`)
    if (seen.has(file)) errors.push(`${file} appears in ${seen.get(file)} and ${suite}`)
    seen.set(file, suite)
  }
}
if (map.defaultSuite !== 'current') errors.push(`defaultSuite must be current, got ${map.defaultSuite}`)
if (errors.length) {
  console.error(`playwright suite boundary validation failed (${errors.length})`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else console.log(`playwright suite boundary valid: ${seen.size} tests across ${Object.keys(map.suites).length} suites; default=${map.defaultSuite}`)
