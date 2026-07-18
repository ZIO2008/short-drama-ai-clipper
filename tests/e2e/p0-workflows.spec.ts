import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { _electron as electron, expect, test, type ElectronApplication, type Page, type TestInfo } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const ffmpegPath = require('ffmpeg-static') as string
const ffprobePath = require('ffprobe-static').path as string
const projectRoot = resolve(import.meta.dirname, '../..')

let app: ElectronApplication
let page: Page
let dataDirectory: string
let mediaDirectory: string
let outputDirectory: string
let episodePaths: string[]

test.beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'short-drama-e2e-data-'))
  mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-e2e-media-'))
  outputDirectory = await mkdtemp(join(tmpdir(), 'short-drama-e2e-output-'))
  episodePaths = []
  for (const color of ['red', 'green', 'blue', 'yellow']) {
    const path = join(mediaDirectory, `${episodePaths.length + 1}.mp4`)
    await createFixture(path, color)
    episodePaths.push(path)
  }
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(projectRoot, 'out', 'main', 'index.js')],
    env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'e2e', SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory, SHORTDRAMA_FFMPEG_PATH: ffmpegPath, SHORTDRAMA_FFPROBE_PATH: ffprobePath }
  })
  page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  await Promise.all([rm(dataDirectory, { recursive: true, force: true }), rm(mediaDirectory, { recursive: true, force: true }), rm(outputDirectory, { recursive: true, force: true })])
})

test('FLOW-001 to FLOW-004 complete through the isolated desktop app', async ({}, testInfo: TestInfo) => {
  await page.getByRole('textbox', { name: '新剧名' }).fill('E2E验收剧目')
  await page.getByRole('button', { name: '创建剧目' }).click()
  await expect(page.getByRole('heading', { name: 'E2E验收剧目' })).toBeVisible()
  const drama = await invoke<{ id: string; episodes: Array<{ id: string; episodeNo: number | null }>; tasks: unknown[] }>(page, async (paths) => {
    const created = await window.desktopApi.listDramas()
    const current = created.find((item) => item.name === 'E2E验收剧目')
    if (!current) throw new Error('E2E 剧目创建后未在本地库出现。')
    await window.desktopApi.importEpisodes(current.id, paths)
    const detail = await window.desktopApi.getDrama(current.id)
    return { id: detail.id, episodes: detail.episodes, tasks: await window.desktopApi.listTasks() }
  }, episodePaths)
  expect(drama.episodes).toHaveLength(4)
  expect(drama.tasks).toEqual([])

  await page.getByRole('button', { name: '编辑与导入' }).click()
  await expect(page.getByRole('dialog', { name: '编辑剧目' }).getByRole('heading', { name: 'E2E验收剧目' })).toBeVisible()
  await page.getByRole('tab', { name: '素材生产' }).click()
  await page.getByRole('button', { name: '创建拼接任务' }).click()
  await page.getByLabel('输出根目录').fill(outputDirectory)
  const preflight = await invoke<{ preflightId: string; windows: Array<{ ok: boolean; startEpisode: number; endEpisode: number }> }>(page, async ({ dramaId, output }) => window.desktopApi.preflightMultiEpisode(dramaId, { startEpisode: 1, endEpisode: 4, groupSize: 2, tailStrategy: 'reduce', maxMinutes: 10, outputDirectory: output, qualityMode: 'original', fps: 'source', packagingEnabled: false }), { dramaId: drama.id, output: outputDirectory })
  expect(preflight.windows.map((window) => [window.startEpisode, window.endEpisode])).toEqual([[1, 2], [2, 3], [3, 4]])
  expect(preflight.windows.every((window) => window.ok)).toBe(true)
  const plan = await invoke<{ taskId: string }>(page, async ({ dramaId, output, preflightId }) => window.desktopApi.createMultiEpisodeTask(dramaId, { startEpisode: 1, endEpisode: 4, groupSize: 2, tailStrategy: 'reduce', maxMinutes: 10, outputDirectory: output, qualityMode: 'original', fps: 'source', packagingEnabled: false, preflightConfirmed: true, preflightId }), { dramaId: drama.id, output: outputDirectory, preflightId: preflight.preflightId })
  await invoke(page, async (taskId) => window.desktopApi.runProductionTask(taskId), plan.taskId)
  const materials = await invoke<Array<{ path: string; taskId: string }>>(page, (dramaId) => window.desktopApi.listMaterials(dramaId), drama.id)
  expect(materials.length).toBe(3)
  expect(materials.every((material) => material.taskId === plan.taskId)).toBe(true)

  const candidate = await invoke<{ id: string }>(page, async (dramaId) => {
    const detail = await window.desktopApi.getDrama(dramaId)
    const episode = detail.episodes.find((item) => item.episodeNo === 1)
    if (!episode) throw new Error('E2E 第 1 集不存在。')
    const created = await window.desktopApi.createClipCandidate(dramaId, episode.id, 0, 0.8)
    await window.desktopApi.confirmClipCandidate(created.id)
    return created
  }, drama.id)
  const clipExport = await invoke<{ outputPath: string }>(page, async ({ candidateId, output }) => window.desktopApi.exportClipCandidate(candidateId, output), { candidateId: candidate.id, output: outputDirectory })
  expect(clipExport.outputPath).toContain(outputDirectory)

  for (const viewport of [{ width: 1280, height: 720 }, { width: 1366, height: 768 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`p0-${viewport.width}x${viewport.height}.png`), fullPage: false })
  }
  await page.keyboard.press('Tab')
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBeTruthy()
})

const invoke = async <T, A>(target: Page, callback: (argument: A) => Promise<T>, argument: A): Promise<T> => target.evaluate(callback, argument)

const createFixture = (path: string, color: string): Promise<void> => new Promise((resolvePromise, reject) => {
  const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=320x180:d=1`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', path], { windowsHide: true })
  let stderr = ''
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk: string) => { stderr += chunk })
  child.on('error', reject); child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`FFmpeg fixture failed: ${stderr}`)))
})
