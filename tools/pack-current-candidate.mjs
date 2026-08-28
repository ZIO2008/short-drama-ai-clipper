import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { auditPackagePrivacy, developmentPathStrings, redactFileDevelopmentPaths } from './package-privacy-audit.mjs'

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const verificationOnly = process.argv.includes('--verification')
const releaseSource = readFileSync('src/shared/release-metadata.ts', 'utf8')
const scope = /scope: '(P\d+)'/.exec(releaseSource)?.[1]
const channel = /channel: '([a-z-]+)'/.exec(releaseSource)?.[1]
if (!scope || !channel) throw new Error('Unable to read release scope/channel metadata')
const releaseId = `v${packageJson.version}-${scope.toLowerCase()}-${channel}`
const verificationOutputRoot = process.env.SHORTDRAMA_VERIFICATION_OUTPUT_ROOT
if (verificationOutputRoot && (!verificationOnly || !isAbsolute(verificationOutputRoot))) {
  throw new Error('SHORTDRAMA_VERIFICATION_OUTPUT_ROOT is allowed only for verification packages and must be an absolute path.')
}
const candidateOutputRoot = resolve('release', 'candidates')
const resolvedVerificationOutputRoot = verificationOutputRoot ? resolve(verificationOutputRoot) : undefined
const isWithinDirectory = (path, directory) => {
  const pathFromDirectory = relative(directory, path)
  return pathFromDirectory === '' || (!pathFromDirectory.startsWith('..') && !isAbsolute(pathFromDirectory))
}
const canonicalDirectory = (path, name) => {
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`${name} must be an existing directory.`)
  return realpathSync.native(path)
}
const canonicalCandidateOutputRoot = canonicalDirectory(candidateOutputRoot, 'Formal candidate output directory')
const canonicalVerificationOutputRoot = resolvedVerificationOutputRoot
  ? canonicalDirectory(resolvedVerificationOutputRoot, 'SHORTDRAMA_VERIFICATION_OUTPUT_ROOT')
  : undefined
if (canonicalVerificationOutputRoot && isWithinDirectory(canonicalVerificationOutputRoot, canonicalCandidateOutputRoot)) {
  throw new Error('SHORTDRAMA_VERIFICATION_OUTPUT_ROOT cannot point to the formal candidate output directory.')
}
const outputDirectory = verificationOnly
  ? resolve(canonicalVerificationOutputRoot ?? resolve('release', 'verification'), `${releaseId}-visual-unverified`)
  : resolve(canonicalCandidateOutputRoot, releaseId)
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const walk = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const path = join(directory, entry.name)
  return entry.isDirectory() ? walk(path) : [path]
})
const reusableOcrRuntime = () => {
  const current = resolve('tools', 'local-ocr', 'runtime')
  const runner = join(current, 'temporal_ocr_runner.exe')
  if (!existsSync(runner) || statSync(runner).size === 0) return false
  const selfTest = spawnSync(runner, ['--self-test'], { encoding: 'utf8', env: { ...process.env, PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: 'True' } })
  return selfTest.status === 0
}
execFileSync(pnpm, ['run', 'validate:design-contract'], { stdio: 'inherit', shell: process.platform === 'win32' })
const fidelityAudit = spawnSync(pnpm, ['run', 'audit:fidelity'], { stdio: 'inherit', shell: process.platform === 'win32' })
const visualFidelity = fidelityAudit.status === 0 ? 'passed' : 'incomplete'
if (visualFidelity !== 'passed' && !verificationOnly) throw new Error('Visual fidelity audit failed; formal candidates cannot be packaged.')
if (visualFidelity !== 'passed') console.warn('VERIFICATION_PACKAGE_ONLY visual fidelity audit is incomplete; this output is not a formal release candidate.')
if (reusableOcrRuntime()) console.log('LOCAL_OCR_RUNTIME_REUSE=local-self-test')
else execFileSync(pnpm, ['run', 'build:local-ocr'], { stdio: 'inherit', shell: process.platform === 'win32' })
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
const electronRuntime = resolve('node_modules', 'electron', 'dist', 'electron.exe')
const packagedOcrRunner = join(outputDirectory, 'win-unpacked', 'resources', 'tools', 'local-ocr', 'runtime', 'temporal_ocr_runner.exe')
const packagedOcrModelRoot = join(outputDirectory, 'win-unpacked', 'resources', 'tools', 'local-ocr', 'runtime', '_internal', 'model-cache', 'official_models')
const packagedOcrModelFiles = [
  'PP-OCRv5_server_det',
  'PP-OCRv5_server_rec',
].flatMap((model) => ['config.json', 'inference.json', 'inference.pdiparams'].map((file) => join(packagedOcrModelRoot, model, file)))
if (!existsSync(executablePath) || !existsSync(asarPath) || !existsSync(packagedNativeBinding) || !existsSync(packagedOcrRunner) || packagedOcrModelFiles.some((file) => !existsSync(file))) throw new Error(`Packaged candidate is incomplete or misses the SQLite/OCR runtime resources or bundled models: ${outputDirectory}`)
const sensitiveDevelopmentPaths = developmentPathStrings(process.cwd())
const nativeBuildPathRedactions = redactFileDevelopmentPaths(packagedNativeBinding, sensitiveDevelopmentPaths)
let packagedElectronAbi
try {
  packagedElectronAbi = execFileSync(electronRuntime, ['-e', `require(${JSON.stringify(packagedNativeBinding)}); process.stdout.write(process.versions.modules)`], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
  }).trim()
} catch (error) {
  throw new Error(`Packaged better-sqlite3 binding does not load in the Electron runtime: ${error instanceof Error ? error.message : String(error)}`)
}
if (!packagedElectronAbi) throw new Error(`Unable to verify the packaged Electron native ABI: ${outputDirectory}`)

const packageFiles = walk(join(outputDirectory, 'win-unpacked'))
auditPackagePrivacy(packageFiles, sensitiveDevelopmentPaths)
console.log(`PACKAGE_PRIVACY_AUDIT=passed (${packageFiles.length} files)`)
const manifest = {
  releaseId,
  appVersion: packageJson.version,
  scope,
  channel,
  packageKind: verificationOnly ? 'verification-only' : 'formal-candidate',
  visualFidelity,
  notFormalCandidate: verificationOnly,
  nativeBuildPathRedactions,
  executablePath,
  executableSha256: sha256(executablePath),
  appAsarSha256: sha256(asarPath),
  createdAt: new Date().toISOString()
}
writeFileSync(join(outputDirectory, 'candidate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`CURRENT_CANDIDATE=${executablePath}`)
console.log(`CURRENT_CANDIDATE_MANIFEST=${join(outputDirectory, 'candidate-manifest.json')}`)
