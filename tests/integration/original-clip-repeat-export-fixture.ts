import { createHash } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Database from 'better-sqlite3'
import ffmpegModule from 'ffmpeg-static'
import { path as ffprobePath } from 'ffprobe-static'
import { migrateDatabase } from '../../src/main/db/migrate.js'
import { runMediaProcess } from '../../src/main/media/ffmpeg-runner.js'
import { OriginalClipService } from '../../src/main/services/original-clip-service.js'
import type { ClipExportConfig } from '../../src/shared/contracts.js'

export const fileHash = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex')
export async function waitForOutput(path: string, isRunning: () => boolean): Promise<void> {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (!isRunning()) throw new Error('Export stopped before interruption could be tested')
    if (await stat(path).then((file) => file.size > 0, () => false)) return
    await new Promise((done) => setTimeout(done, 10))
  }
  throw new Error(`FFmpeg did not start writing ${path}`)
}

export async function createRepeatFixture() {
  const ffmpegPath = typeof ffmpegModule === 'string' ? ffmpegModule : (ffmpegModule as unknown as { default?: string }).default
  if (!ffmpegPath || !existsSync(ffmpegPath) || !existsSync(ffprobePath)) throw new Error('Static media tools unavailable')
  const folder = await mkdtemp(join(tmpdir(), 'clip-repeat-export-'))
  const databasePath = join(folder, 'test.sqlite')
  let database = new Database(databasePath)
  database.pragma('foreign_keys = ON'); migrateDatabase(database)
  const oldFfmpeg = process.env.SHORTDRAMA_FFMPEG_PATH
  const oldFfprobe = process.env.SHORTDRAMA_FFPROBE_PATH
  process.env.SHORTDRAMA_FFMPEG_PATH = ffmpegPath
  process.env.SHORTDRAMA_FFPROBE_PATH = ffprobePath
  const close = async () => {
    if (database.open) database.close()
    if (oldFfmpeg === undefined) delete process.env.SHORTDRAMA_FFMPEG_PATH; else process.env.SHORTDRAMA_FFMPEG_PATH = oldFfmpeg
    if (oldFfprobe === undefined) delete process.env.SHORTDRAMA_FFPROBE_PATH; else process.env.SHORTDRAMA_FFPROBE_PATH = oldFfprobe
    await rm(folder, { recursive: true, force: true })
  }
  try {
    const sourcePath = join(folder, 'source.mp4')
    const generated = await runMediaProcess(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=25:d=20', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', sourcePath])
    if (generated.exitCode !== 0) throw new Error(generated.stderr)
    const now = new Date().toISOString()
    database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', 'Repeat export integration', now, now)
    database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('episode', 'drama', 1, 0, sourcePath, 20, 'ready', now, now)
    let service = new OriginalClipService(database)
    const candidate = service.createCandidate('drama', 'episode', { startSeconds: 0, endSeconds: 20 })
    service.confirmCandidate(candidate.id)
    const config: ClipExportConfig = { candidateIds: [candidate.id], outputDirectory: join(folder, 'output'), namingPattern: 'same-name', encoding: 'h264-balanced', outputSize: 'source', subtitleStrategy: 'none', conflictStrategy: 'append', qualityMode: 'original' }
    return {
      folder, databasePath, sourcePath, candidateId: candidate.id, config, close,
      get database() { return database }, get service() { return service },
      reopen() { database.close(); database = new Database(databasePath); database.pragma('foreign_keys = ON'); service = new OriginalClipService(database) },
      probe: async (path: string) => {
        const result = await runMediaProcess(ffprobePath, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,duration,nb_frames:format=duration', '-of', 'json', path])
        if (result.exitCode !== 0) throw new Error(result.stderr)
        return JSON.parse(result.stdout) as { streams: Array<{ codec_name: string; width: number; height: number; r_frame_rate: string; duration: string; nb_frames: string }>; format: { duration: string } }
      }
    }
  } catch (error) { await close(); throw error }
}

export async function launchExportProcess(folder: string, databasePath: string, candidateId: string, outputDirectory: string): Promise<ChildProcess> {
  const require = createRequire(import.meta.url)
  const viteRequire = createRequire(require.resolve('electron-vite/package.json'))
  const esbuild = viteRequire('esbuild') as { build: (options: Record<string, unknown>) => Promise<unknown> }
  const outfile = join(folder, 'export-process.cjs')
  await esbuild.build({ entryPoints: [resolve('tests/integration/original-clip-repeat-export-process.ts')], outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent' })
  return spawn(process.execPath, [outfile, databasePath, candidateId, outputDirectory], {
    windowsHide: true, detached: process.platform !== 'win32', stdio: 'pipe',
    env: { ...process.env, NODE_PATH: resolve('node_modules') }
  })
}

export async function killExportProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const closed = new Promise<void>((done) => child.once('close', () => done()))
  if (process.platform === 'win32') {
    const killed = await runMediaProcess('taskkill', ['/PID', String(child.pid), '/T', '/F'])
    if (killed.exitCode !== 0) throw new Error(killed.stderr || killed.stdout)
  } else if (child.pid) process.kill(-child.pid, 'SIGKILL')
  await closed
}
