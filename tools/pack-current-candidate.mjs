import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const releaseSource = readFileSync('src/shared/release-metadata.ts', 'utf8')
const scope = /scope: '(P\d+)'/.exec(releaseSource)?.[1]
const channel = /channel: '([a-z-]+)'/.exec(releaseSource)?.[1]
if (!scope || !channel) throw new Error('Unable to read release scope/channel metadata')
const releaseId = `v${packageJson.version}-${scope.toLowerCase()}-${channel}`
const outputDirectory = resolve('release', 'candidates', releaseId)
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
execFileSync(pnpm, ['run', 'validate:design-contract'], { stdio: 'inherit', shell: process.platform === 'win32' })
execFileSync(pnpm, ['run', 'audit:fidelity'], { stdio: 'inherit', shell: process.platform === 'win32' })
if (existsSync(outputDirectory)) throw new Error(`Candidate already exists and is immutable: ${outputDirectory}`)
const nativeBinding = resolve('node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
if (!existsSync(nativeBinding)) throw new Error(`Electron-native better-sqlite3 binding is required before packaging: ${nativeBinding}. Run pnpm run rebuild:electron and wait for it to finish.`)
execFileSync(pnpm, ['run', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' })
execFileSync(pnpm, ['run', 'rebuild:electron'], { stdio: 'inherit', shell: process.platform === 'win32' })
mkdirSync(dirname(outputDirectory), { recursive: true })
execFileSync(pnpm, ['exec', 'electron-builder', '--dir', `--config.directories.output=${outputDirectory}`], { stdio: 'inherit', shell: process.platform === 'win32' })

const executablePath = join(outputDirectory, 'win-unpacked', '短剧投流素材生成平台.exe')
const asarPath = join(outputDirectory, 'win-unpacked', 'resources', 'app.asar')
const packagedNativeBinding = join(outputDirectory, 'win-unpacked', 'resources', 'app.asar.unpacked', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node')
if (!existsSync(executablePath) || !existsSync(asarPath) || !existsSync(packagedNativeBinding)) throw new Error(`Packaged candidate is incomplete or misses the SQLite native binding: ${outputDirectory}`)
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const manifest = {
  releaseId,
  appVersion: packageJson.version,
  scope,
  channel,
  executablePath,
  executableSha256: sha256(executablePath),
  appAsarSha256: sha256(asarPath),
  createdAt: new Date().toISOString()
}
writeFileSync(join(outputDirectory, 'candidate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`CURRENT_CANDIDATE=${executablePath}`)
console.log(`CURRENT_CANDIDATE_MANIFEST=${join(outputDirectory, 'candidate-manifest.json')}`)
