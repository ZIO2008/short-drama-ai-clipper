import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

const tempRoot = realpathSync(tmpdir())
const repoRoot = resolve(import.meta.dirname, '..', '..', '..')
const candidateRoot = join(repoRoot, 'release', 'candidates', 'v0.1.95-p1-internal-trial')
const manifest = JSON.parse(readFileSync(join(candidateRoot, 'candidate-manifest.json'), 'utf8'))
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
if (manifest.releaseId !== 'v0.1.95-p1-internal-trial' || !existsSync(manifest.executablePath) || sha256(manifest.executablePath) !== manifest.executableSha256) throw new Error('Current candidate executable does not match its manifest')
const liveDatabase = join(process.env.APPDATA, 'ShortDramaMaterialStudio', 'data', 'material-studio.sqlite')
const sourceFingerprint = () => ({ main: sha256(liveDatabase), wal: existsSync(`${liveDatabase}-wal`) ? sha256(`${liveDatabase}-wal`) : null })
const sourceBefore = sourceFingerprint()
const root = mkdtempSync(join(tempRoot, 'shortdrama-cutover-'))

const python = (mode) => JSON.parse(execFileSync('py', ['-3', join(import.meta.dirname, 'release-readiness-snapshot.py'), mode, root], { cwd: repoRoot, encoding: 'utf8' }))
const observe = async (userData) => {
  const app = await electron.launch({
    executablePath: manifest.executablePath,
    args: ['--packaged-smoke', '--packaged-smoke-user-data', userData],
    env: { ...process.env, SHORTDRAMA_MATERIAL_CHANNEL: 'packaged-smoke' },
  })
  try {
    const page = await app.firstWindow()
    await page.getByRole('heading', { name: '剧目库' }).waitFor({ timeout: 60_000 })
    return await page.evaluate(async () => {
      const dramas = await window.desktopApi.listDramas()
      let episodes = 0
      for (const drama of dramas) episodes += (await window.desktopApi.getDrama(drama.id)).episodes.length
      return { dramas: dramas.length, episodes }
    })
  } finally {
    await app.close()
  }
}

try {
  const prepared = python('prepare')
  if (prepared.snapshot.integrity !== 'ok' || JSON.stringify(prepared.snapshot) !== JSON.stringify(prepared.isolatedCopy)) throw new Error('Isolated source snapshot differs from WAL-consistent live backup')
  const upgradeObserved = await observe(join(root, 'upgrade-user-data'))
  const restored = python('restore')
  if (restored.restored.integrity !== 'ok' || JSON.stringify(restored.snapshot) !== JSON.stringify(restored.restored) || restored.snapshotSha256 !== restored.restoredSha256) throw new Error('Rollback database differs from the frozen snapshot')
  const rollbackObserved = await observe(join(root, 'rollback-user-data'))
  if (upgradeObserved.dramas !== prepared.snapshot.dramas || upgradeObserved.episodes !== prepared.snapshot.episodes || JSON.stringify(upgradeObserved) !== JSON.stringify(rollbackObserved)) throw new Error('Packaged application did not preserve the isolated drama and episode counts')
  const sourceAfter = sourceFingerprint()
  const sourceFingerprintsMatch = sourceBefore.main === sourceAfter.main && sourceBefore.wal === sourceAfter.wal
  if (!sourceFingerprintsMatch) throw new Error('Source database or WAL changed during rehearsal; the result is inconclusive and must be reviewed before cutover')
  console.log(JSON.stringify({ candidate: manifest.releaseId, sourceCommit: manifest.sourceCommit, mode: 'isolated packaged smoke from a live WAL-consistent SQLite backup', preflight: prepared.snapshot, afterUpgradeApp: upgradeObserved, restored: restored.restored, afterRollbackApp: rollbackObserved, rollbackSha256Matches: true, sourceDatabaseFingerprintBefore: sourceBefore, sourceDatabaseFingerprintAfter: sourceAfter, sourceFingerprintsMatch }))
} finally {
  const resolvedRoot = realpathSync(root)
  const inside = relative(tempRoot, resolvedRoot)
  if (!inside || inside.startsWith('..') || basename(resolvedRoot).startsWith('shortdrama-cutover-') === false) throw new Error('Refusing cleanup outside the isolated rehearsal directory')
  rmSync(resolvedRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
}
