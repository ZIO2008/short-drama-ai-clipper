import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const files = ['Product-Spec.md', 'Design-Brief.md', 'DEV-PLAN.md']
const forbidden = [
  /当前唯一全产品设计源：`design\/open-design\//,
  /V49 SHA-256：/,
  /V49 HTML SHA-256：/,
  /V49 是 V48 的完整推进版本/,
  /有变化和无变化的页面都不得回拼 V48/,
  /V49 HTML 为唯一当前来源/
]
const errors = []
for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8')
  if (!text.includes('docs/current-design-baseline.json')) errors.push(`${file} does not reference current-design-baseline.json`)
  for (const pattern of forbidden) if (pattern.test(text)) errors.push(`${file} contains obsolete active-reference wording: ${pattern}`)
}
const registry = JSON.parse(readFileSync(join(root, 'docs', 'baseline-registry.json'), 'utf8'))
const pointer = JSON.parse(readFileSync(join(root, 'docs', 'current-design-baseline.json'), 'utf8'))
const target = registry.baselines.find((entry) => entry.id === pointer.currentId)
if (!target || target.domain !== 'design' || target.status !== 'current') errors.push('design current pointer does not target a current design registry entry')
if (errors.length) {
  console.error(`current reference boundary validation failed (${errors.length})`)
  for (const error of errors) console.error(`- ${error}`)
  process.exitCode = 1
} else console.log(`current reference boundary valid: ${files.length} active docs use the current design pointer`)
