import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { _electron as electron } from '@playwright/test'

const projectRoot = resolve(import.meta.dirname, '..', '..', '..', '..', '..')
const installRoot = join(projectRoot, '04_material_studio_stable', 'v0.1.95')
const backupRoot = join(projectRoot, '05_material_studio_backups', 'v0.1.95-before-parallel-20261014-165119-5b69c98c')
const manifest = JSON.parse(readFileSync(join(installRoot, 'install-manifest.json'), 'utf8'))
const backup = JSON.parse(readFileSync(join(backupRoot, 'backup-manifest.json'), 'utf8'))
const sha = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
const exe = join(installRoot, manifest.executableRelativePath)
const asar = join(installRoot, manifest.appAsarRelativePath)
const sourceDb = join(backupRoot, backup.databaseFilename)
if (!existsSync(exe) || sha(exe) !== manifest.executableSha256 || sha(asar) !== manifest.appAsarSha256) throw new Error('Installed package identity mismatch')
if (sha(sourceDb) !== backup.databaseSha256) throw new Error('Controlled backup identity mismatch')
const tempRoot = realpathSync(tmpdir())
const temp = mkdtempSync(join(tempRoot, 'shortdrama-parallel-install-'))
try {
  const userData = join(temp, 'user-data')
  const data = join(userData, 'data')
  mkdirSync(data, { recursive: true })
  const db = join(data, backup.databaseFilename)
  const python = 'import sqlite3,sys; a=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); b=sqlite3.connect(sys.argv[2]); a.backup(b); print(b.execute("pragma integrity_check").fetchone()[0]); b.close(); a.close()'
  if (execFileSync('py', ['-3', '-c', python, sourceDb, db], { encoding: 'utf8' }).trim() !== 'ok') throw new Error('Restored database integrity failed')
  if (sha(db) !== backup.databaseSha256) throw new Error('Restored database bytes differ from controlled backup')
  const app = await electron.launch({ executablePath: exe, args: ['--packaged-smoke', '--packaged-smoke-user-data', userData], env: { ...process.env, SHORTDRAMA_MATERIAL_CHANNEL: 'packaged-smoke' } })
  let observed
  try {
    const page = await app.firstWindow()
    await page.getByRole('heading', { name: '剧目库' }).waitFor({ timeout: 60_000 })
    observed = await page.evaluate(async () => {
      const dramas = await window.desktopApi.listDramas()
      let episodes = 0
      for (const drama of dramas) episodes += (await window.desktopApi.getDrama(drama.id)).episodes.length
      return { dramas: dramas.length, episodes }
    })
  } finally { await app.close() }
  if (observed.dramas !== backup.counts.dramas || observed.episodes !== backup.counts.episodes) throw new Error('Installed application data counts differ from backup')
  console.log(JSON.stringify({ releaseId: manifest.releaseId, installedExecutableSha256: manifest.executableSha256, backupDatabaseSha256: backup.databaseSha256, restoredBytesMatch: true, installedAppObserved: observed }))
} finally {
  const resolved = realpathSync(temp)
  const inside = relative(tempRoot, resolved)
  if (!inside || inside.startsWith('..') || !basename(resolved).startsWith('shortdrama-parallel-install-')) throw new Error('Refusing temp cleanup outside isolated rehearsal')
  rmSync(resolved, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
}
