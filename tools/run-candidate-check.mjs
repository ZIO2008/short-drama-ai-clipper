import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { captureProvenance, assertPackSource, fileSha256 } from './candidate-provenance.mjs'

// Execute the check and preserve its actual exit status/output; never synthesize passed flags.
const [check, mode, ...args] = process.argv.slice(2)
if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(check ?? '') || !['--node', '--script'].includes(mode) || !args.length) throw new Error('Usage: run-candidate-check.mjs <check> <--node file args...|--script package-script>')
const root = process.cwd()
if (mode === '--script' && (args.length !== 1 || !Object.hasOwn(JSON.parse(readFileSync('package.json', 'utf8')).scripts, args[0]))) throw new Error('Unknown package script')
const directory = resolve('test-results', 'candidate-checks', `${check}-${Date.now()}`)
mkdirSync(resolve('test-results', 'candidate-checks'), { recursive: true })
mkdirSync(directory, { recursive: false })
const output = join(directory, `${check}.log`)
writeFileSync(output, '', 'utf8')
const before = captureProvenance(root)
const metadata = readFileSync('src/shared/release-metadata.ts', 'utf8')
const scope = /scope: '(P\d+)'/.exec(metadata)?.[1]?.toLowerCase()
const channel = /channel: '([a-z-]+)'/.exec(metadata)?.[1]
if (!scope || !channel) throw new Error('Release scope/channel metadata is required')
const candidateManifest = check === 'packagedE2E'
  ? resolve('release', 'candidates', `v${JSON.parse(readFileSync('package.json', 'utf8')).version}-${scope}-${channel}`, 'candidate-manifest.json')
  : null
const candidateManifestSha256 = candidateManifest ? fileSha256(candidateManifest) : undefined
const startedAt = new Date().toISOString()
const executable = mode === '--node' ? process.execPath : process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'pnpm'
const commandArgs = mode === '--node' ? args : process.platform === 'win32' ? ['/d', '/s', '/c', `pnpm run ${args[0]}`] : ['run', args[0]]
const command = mode === '--node' ? ['node', ...args].join(' ') : `pnpm run ${args[0]}`
const child = spawn(executable, commandArgs, { cwd: root, env: process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
  appendFileSync(output, chunk)
  process.stdout.write(chunk)
})
child.on('error', (error) => appendFileSync(output, `${error.message}\n`))
child.on('close', (code, signal) => {
  let exitCode = code ?? 1
  try { assertPackSource(before, captureProvenance(root), true) }
  catch (error) { exitCode = 1; appendFileSync(output, `\n${error.message}\n`) }
  if (candidateManifest && candidateManifestSha256 !== fileSha256(candidateManifest)) { exitCode = 1; appendFileSync(output, '\nCandidate manifest changed during packaged tests.\n') }
  const record = { ...before, candidateManifestSha256, check, command, exitCode, signal, startedAt, completedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform, arch: process.arch }, outputPath: `checks/${check}.log`, outputSha256: fileSha256(output) }
  writeFileSync(join(directory, `${check}.json`), `${JSON.stringify(record, null, 2)}\n`, 'utf8')
  console.log(`CANDIDATE_CHECK_RECORD=${join(directory, `${check}.json`)}`)
  process.exitCode = exitCode
})
