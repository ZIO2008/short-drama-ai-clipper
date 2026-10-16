import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

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
let sourcePath: string
let sourceSha256: string

const createFixture = (path: string): Promise<void> => new Promise((resolveFixture, reject) => {
  const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=25:duration=90', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=90', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-y', path], { windowsHide: true })
  child.once('error', reject)
  child.once('exit', (code) => code === 0 ? resolveFixture() : reject(new Error(`fixture ffmpeg exited ${code}`)))
})

const candidateStatus = async (candidateId: string): Promise<string | null> => page.evaluate(async (id) => {
  const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '原剧切片闭环隔离剧目')
  return drama ? (await window.desktopApi.listClipCandidates(drama.id)).find((item) => item.id === id)?.status ?? null : null
}, candidateId)

test.beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'short-drama-current-clip-e2e-data-'))
  mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-current-clip-e2e-media-'))
  outputDirectory = await mkdtemp(join(tmpdir(), 'short-drama-current-clip-e2e-output-'))
  sourcePath = join(mediaDirectory, '01.mp4')
  await createFixture(sourcePath)
  sourceSha256 = createHash('sha256').update(await readFile(sourcePath)).digest('hex')
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(projectRoot, 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      SHORTDRAMA_MATERIAL_E2E: '1',
      SHORTDRAMA_MATERIAL_CHANNEL: 'e2e',
      SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory,
      SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: sourcePath,
      SHORTDRAMA_MATERIAL_E2E_OUTPUT_DIRECTORY: outputDirectory,
      SHORTDRAMA_FFMPEG_PATH: ffmpegPath,
      SHORTDRAMA_FFPROBE_PATH: ffprobePath
    }
  })
  page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
})

test.afterAll(async () => {
  const pid = app?.process()?.pid
  await app?.close()
  if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  await Promise.all([rm(dataDirectory, { recursive: true, force: true }), rm(mediaDirectory, { recursive: true, force: true }), rm(outputDirectory, { recursive: true, force: true })])
})

test('CLIP-REAL-005 to CLIP-REAL-008 closes sparse local evidence, pool, export, and report path', async () => {
  test.setTimeout(120_000)
  await page.getByRole('button', { name: '创建剧目' }).first().click()
  const dialog = page.getByRole('dialog', { name: '创建剧目' })
  await dialog.getByLabel('剧名').fill('原剧切片闭环隔离剧目')
  await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click()
  await expect(dialog.getByText('已选择 1 个视频文件')).toBeVisible()
  await dialog.getByRole('button', { name: '保存并整理资产' }).click()
  await expect(page.getByRole('dialog', { name: '编辑剧目' })).toBeVisible()
  await page.keyboard.press('Escape')

  const candidateId = await page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '原剧切片闭环隔离剧目')
    if (!drama) throw new Error('missing isolated drama')
    const episode = (await window.desktopApi.getDrama(drama.id)).episodes[0]
    if (!episode) throw new Error('missing isolated episode')
    await window.desktopApi.createSubtitleEvidenceTrack({
      dramaId: drama.id,
      episodeId: episode.id,
      sourceKind: 'asr',
      label: '原剧切片闭环 ASR 夹具',
      cost: { resultFormat: 3, sentenceMaxLength: 40 },
      cues: [
        { index: 1, startSeconds: 1.1, endSeconds: 2.1, text: '闭环候选起点', confidence: 0.9 },
        { index: 2, startSeconds: 3.1, endSeconds: 4.28, text: '闭环候选终点', confidence: 0.9 },
        { index: 3, startSeconds: 60.1, endSeconds: 61.1, text: '第二段起点', confidence: 0.9 },
        { index: 4, startSeconds: 62.1, endSeconds: 63.28, text: '第二段终点', confidence: 0.9 }
      ]
    })
    await window.desktopApi.generateClipCandidates(drama.id, { episodeIds: [episode.id], candidatesPerEpisode: 1, targetDurationSeconds: 3, maxOverlapRatio: 0.25, allowRepeat: false })
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const candidate = (await window.desktopApi.listClipCandidates(drama.id))[0]
      if (candidate) return candidate.id
      await new Promise((resolvePromise) => window.setTimeout(resolvePromise, 250))
    }
    throw new Error('isolated candidate was not generated')
  })

  // Seed only the isolated fixture in dev; all confirmation/export/report actions below
  // run against the real packaged IPC and bundled FFmpeg when a candidate is supplied.
  if (process.env.SHORTDRAMA_PACKAGED_EXE) {
    await app.close()
    app = await electron.launch({
      executablePath: resolve(process.env.SHORTDRAMA_PACKAGED_EXE),
      args: ['--packaged-smoke', '--packaged-smoke-user-data', dataDirectory],
      env: { ...process.env, SHORTDRAMA_MATERIAL_CHANNEL: 'packaged-smoke' }
    })
    expect(await app.evaluate(({ app: runtime }) => runtime.isPackaged)).toBe(true)
    page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
    await page.getByRole('button', { name: '打开剧目：原剧切片闭环隔离剧目' }).click()
  }
  await page.getByRole('tab', { name: '素材生产' }).click()
  await page.getByRole('button', { name: '进入工作区' }).click()
  let frame = page.frameLocator('iframe[title="原剧切片工作区"]')
  await expect(frame.locator('#screen-clip')).toBeVisible()
  await frame.locator('[data-r5-confirm]').click()
  await expect.poll(() => candidateStatus(candidateId)).toBe('confirmed')

  await frame.locator('[data-r5-open="clip-pool"]').first().click()
  frame = page.frameLocator('iframe[title="原剧切片候选池"]')
  await expect(frame.locator('#screen-clip-pool')).toBeVisible()
  await expect(frame.locator('body')).toHaveAttribute('data-clip-pool-report-runtime-bound', 'true')
  await expect(frame.locator('#clipCandidateRows')).toContainText(candidateId.slice(0, 8))
  await expect(frame.locator('.clip-inspector-stat > div > b')).toHaveText(['1', '0', '1', '0'])

  await frame.locator('#screen-clip-pool [data-r5-open="clip-report"]').first().click()
  frame = page.frameLocator('iframe[title="原剧切片完成报告"]')
  await expect(frame.locator('#screen-clip-report')).toBeVisible()
  await expect(frame.locator('#clipReportRows')).toContainText('尚无可查看的真实完成报告')
  await expect(frame.locator('.clip-task-summary > div:not(.clip-task-summary-label) > b')).toHaveText(['0', '0', '0', '0'])

  await frame.locator('#screen-clip-report [data-r5-open="clip-pool"]').first().click()
  frame = page.frameLocator('iframe[title="原剧切片候选池"]')
  await expect(frame.locator('#screen-clip-pool')).toBeVisible()
  const exportChoice = frame.locator(`[data-clip-export-candidate="${candidateId}"]`)
  await expect(exportChoice).toBeVisible()
  await expect(exportChoice).not.toBeChecked()
  await page.setViewportSize({ width: 1280, height: 720 })
  expect(await frame.locator('body').evaluate((body) => body.ownerDocument.documentElement.scrollWidth <= body.ownerDocument.defaultView!.innerWidth)).toBe(true)
  await page.setViewportSize({ width: 1440, height: 900 })
  await exportChoice.check()
  await frame.locator('[data-clip-export-open]').first().click()
  await expect(frame.locator('#exportModal')).toHaveAttribute('aria-hidden', 'false')
  await frame.locator('#exportDirectory').fill(outputDirectory)
  await frame.locator('#saveExport').click()
  await expect.poll(() => candidateStatus(candidateId), { timeout: 60_000 }).toBe('exported')
  await expect(frame.locator('#exportModal')).toHaveAttribute('aria-hidden', 'true')
  const materialPath = await page.evaluate(async (id) => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '原剧切片闭环隔离剧目')
    if (!drama) return null
    return (await window.desktopApi.listMaterials(drama.id)).find((item) => item.taskItemId === id)?.path ?? null
  }, candidateId)
  expect(materialPath).toContain(outputDirectory)
  expect(materialPath).not.toBeNull()
  const firstOutputHash = createHash('sha256').update(await readFile(materialPath!)).digest('hex')
  const firstBatch = await page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '原剧切片闭环隔离剧目')!
    return window.desktopApi.getLatestClipExportBatch(drama.id)
  })
  expect(firstBatch?.candidateIds).toEqual([candidateId])
  expect(createHash('sha256').update(await readFile(sourcePath)).digest('hex')).toBe(sourceSha256)
  await expect(exportChoice).not.toBeChecked()
  await exportChoice.check()
  await frame.locator('[data-clip-export-open]').first().click()
  await frame.locator('#exportModal [data-quality-mode="bitrate"]').click()
  await frame.locator('#exportBitrate').fill('1500')
  await frame.locator('#saveExport').click()
  await expect.poll(async () => page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '原剧切片闭环隔离剧目')!
    return (await window.desktopApi.listMaterials(drama.id)).length
  }), { timeout: 60_000 }).toBe(2)
  await expect(frame.locator('#exportModal')).toHaveAttribute('aria-hidden', 'true')
  await expect(exportChoice).not.toBeChecked()
  const secondBatch = await page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '原剧切片闭环隔离剧目')!
    return window.desktopApi.getLatestClipExportBatch(drama.id)
  })
  expect(secondBatch?.id).not.toBe(firstBatch?.id)
  expect(secondBatch?.candidateIds).toEqual([candidateId])
  expect(secondBatch?.config?.qualityMode).toBe('bitrate')
  expect(createHash('sha256').update(await readFile(materialPath!)).digest('hex')).toBe(firstOutputHash)
  await frame.locator('#screen-clip-pool [data-r5-open="clip-report"]').first().click()
  frame = page.frameLocator('iframe[title="原剧切片完成报告"]')
  await expect(frame.locator('#screen-clip-report')).toBeVisible()
  await expect(frame.locator('#clipReportMeta')).toContainText('真实批次')
  await expect(frame.locator('#clipReportRows')).toContainText(candidateId.slice(0, 8))
  await expect(frame.locator('#clipReportRows')).toContainText(outputDirectory)
  await expect(frame.locator('.clip-task-summary > div:not(.clip-task-summary-label) > b')).toHaveText(['1', '1', '0', '0'])
})
