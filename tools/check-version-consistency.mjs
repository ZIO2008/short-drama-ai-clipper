import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePlaywrightSuiteTests } from './playwright-suite-boundary.mjs'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (path) => readFileSync(resolve(projectRoot, path), 'utf8')
const packageJson = JSON.parse(read('package.json'))
const metadata = read('src/shared/release-metadata.ts')
const appHealth = read('src/main/index.ts')
const uiFiles = ['src/renderer/src/layout/AppShell.tsx', 'src/renderer/src/pages/SettingsPage.tsx']
const packagedTests = resolvePlaywrightSuiteTests('current', ['packaged-real-dpi.spec.ts', 'long-asset-scroll.spec.ts'], projectRoot)

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(packageJson.version)) throw new Error(`package.json version is not semver: ${packageJson.version}`)
if (!/scope: 'P\d+'/.test(metadata) || !/channel: '[a-z-]+'/.test(metadata)) throw new Error('release metadata must declare a scope and channel')
if (!appHealth.includes('app.getVersion()') || !appHealth.includes('RELEASE_METADATA')) throw new Error('app health must derive version from Electron and scope/channel from release metadata')
for (const path of uiFiles) {
  if (/\bP0\b/.test(read(path))) throw new Error(`${path} still hard-codes the retired P0 release label`)
}
for (const path of packagedTests) {
  if (/release-v\d/.test(read(path))) throw new Error(`${path} must require an explicit current candidate instead of a historical release fallback`)
}
console.log(`VERSION_CHECK_OK version=${packageJson.version}`)
