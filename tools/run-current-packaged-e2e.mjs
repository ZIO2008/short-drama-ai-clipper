import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePlaywrightSuiteTests } from './playwright-suite-boundary.mjs'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'))
const metadata = readFileSync(join(projectRoot, 'src/shared/release-metadata.ts'), 'utf8')
const scope = /scope: '(P\d+)'/.exec(metadata)?.[1]?.toLowerCase()
const channel = /channel: '([a-z-]+)'/.exec(metadata)?.[1]
const candidateDirectory = resolve(projectRoot, 'release', 'candidates', `v${packageJson.version}-${scope}-${channel}`)
const manifestPath = join(candidateDirectory, 'candidate-manifest.json')
if (!existsSync(manifestPath)) throw new Error(`Current candidate manifest is required: ${manifestPath}`)
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
if (manifest.appVersion !== packageJson.version || !existsSync(manifest.executablePath) || manifest.executableSha256 !== sha256(manifest.executablePath)) throw new Error('Current candidate manifest does not match its executable')
const asarPath = join(candidateDirectory, 'win-unpacked', 'resources', 'app.asar')
if (!existsSync(asarPath) || manifest.appAsarSha256 !== sha256(asarPath)) throw new Error('Current candidate manifest does not match app.asar')
const playwrightCli = resolve(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js')
if (!existsSync(playwrightCli)) throw new Error(`Project Playwright CLI is required: ${playwrightCli}`)
const packagedTests = resolvePlaywrightSuiteTests('current', [
  'packaged-real-dpi.spec.ts',
  'packaged-business-smoke.spec.ts'
], projectRoot)
execFileSync(process.execPath, [playwrightCli, 'test', ...packagedTests], {
  stdio: 'inherit',
  cwd: projectRoot,
  env: { ...process.env, PLAYWRIGHT_OUTPUT_DIR: join(projectRoot, 'test-results', 'packaged-candidate', manifest.releaseId), SHORTDRAMA_PACKAGED_EXE: manifest.executablePath }
})
