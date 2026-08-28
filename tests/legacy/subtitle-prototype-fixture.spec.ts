// Legacy suite: Version 48 prototype fixture compatibility.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { _electron as electron, expect, test, type ElectronApplication, type Frame, type Page } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const ffmpegPath = require('ffmpeg-static') as string
const projectRoot = resolve(import.meta.dirname, '../..')
let app: ElectronApplication
let page: Page
let dataDirectory: string
let mediaDirectory: string
let sourcePath: string

const createFixtureVideo = async (path: string): Promise<void> => await new Promise<void>((resolveFixture, rejectFixture) => {
  const child = spawn(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=180x320:d=2:r=25',
    '-vf', 'drawbox=x=12:y=210:w=156:h=64:color=white@0.85:t=fill,drawtext=text=SUBTITLE\ REGION:x=(w-text_w)/2:y=230:fontcolor=black:fontsize=14',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', path
  ], { windowsHide: true })
  child.once('error', rejectFixture)
  child.once('exit', (code) => code === 0 ? resolveFixture() : rejectFixture(new Error(`fixture ffmpeg exited ${code}`)))
})

const subtitleFrame = async (): Promise<Frame> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    for (const candidate of page.frames()) {
      if (await candidate.locator('#screen-subtitles').count() === 0) continue
      await expect(candidate.locator('#screen-subtitles')).toBeVisible()
      return candidate
    }
    await page.waitForTimeout(100)
  }
  throw new Error('字幕原型 iframe 未加载')
}

const expectSubtitleScrollBoundary = async (frame: Frame): Promise<void> => {
  await expect.poll(() => frame.locator('.subtitle-list-scroll').evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto')
}

test.beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'short-drama-subtitle-prototype-data-'))
  mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-subtitle-prototype-media-'))
  sourcePath = join(mediaDirectory, '01.mp4')
  await createFixtureVideo(sourcePath)
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(projectRoot, 'out', 'main', 'index.js')],
    env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'e2e', SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory, SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: sourcePath, SHORTDRAMA_FFMPEG_PATH: ffmpegPath }
  })
  page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  await Promise.all([rm(dataDirectory, { recursive: true, force: true }), rm(mediaDirectory, { recursive: true, force: true })])
})

test('字幕资产保留 Version 48 列表结构且隔离真实工具边界', async ({}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '创建剧目' }).first().click()
  const dialog = page.getByRole('dialog', { name: '创建剧目' })
  await dialog.getByLabel('剧名').fill('字幕静态夹具剧目')
  await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click()
  await dialog.getByRole('button', { name: '保存并整理资产' }).click()
  await expect(page.getByRole('dialog', { name: '编辑剧目' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: '素材生产' }).click()
  await page.getByRole('button', { name: '进入工作区' }).click()
  const clipFrame = page.frames().find((candidate) => candidate.url().startsWith('about:srcdoc'))
  if (!clipFrame) throw new Error('原剧切片 iframe 未加载')
  await clipFrame.getByRole('button', { name: '返回素材生产', exact: true }).click()
  await page.getByRole('tab', { name: '字幕资产', exact: true }).click()
  await expect(page.locator('iframe.static-prototype-surface[data-prototype-ready="true"]')).toBeVisible()

  let frame = await subtitleFrame()
  await expect(frame.locator('.app')).toHaveCount(0)
  await expect(frame.locator('.sidebar')).toHaveCount(0)
  await expect(frame.locator('.screen')).toHaveCount(1)
  await expect(frame.locator('#screen-subtitles')).toHaveCount(1)
  await expectSubtitleScrollBoundary(frame)
  await expect(frame.locator('#subtitleListPanel .helper')).toContainText('共 1 集')
  await expect(frame.locator('[data-subtitle-episode-id]')).toHaveCount(1)
  await expect(frame.getByRole('button', { name: '查看状态', exact: true })).toBeVisible()
  await expect(frame.locator('[data-subtitle-open-pressure-sample]')).toHaveCount(0)
  await frame.getByRole('button', { name: '字幕识别设置', exact: true }).first().click()
  await expect(frame.locator('#subtitleRecognitionSettingsModal.open')).toBeVisible()
  await expect(frame.locator('[data-subtitle-method]')).toHaveCount(3)
  await expect(frame.locator('[data-subtitle-region-setting]')).toBeVisible()
  await frame.locator('[data-subtitle-start-calibration]').click()
  await expect(frame.locator('#subtitleRecognitionSettingsModal.is-calibrating')).toBeVisible()
  await expect(frame.locator('video[data-subtitle-calibration-preview]')).toHaveAttribute('data-episode-id')
  await expect(frame.locator('[data-od-id="subtitle-region-smart-generated"]')).toBeHidden()
  await expect(frame.locator('.subtitle-calibration-timeline-head .helper')).toContainText('暂无已检测字幕画面')
  await expect(frame.locator('[data-subtitle-adjusted-box]')).toBeVisible()
  await expect(frame.locator('.adjust-label')).toHaveCount(0)
  const monitorBounds = await frame.locator('[data-subtitle-calibration-video]').boundingBox()
  if (!monitorBounds) throw new Error('字幕区域校准监视器未显示')
  expect(monitorBounds.width / monitorBounds.height).toBeCloseTo(16 / 9, 1)
  await expect(frame.locator('[data-subtitle-calibration-video]')).toHaveCSS('background-color', 'rgb(0, 0, 0)')
  const previewVideo = frame.locator('video[data-subtitle-calibration-preview]')
  await expect.poll(() => previewVideo.evaluate((node) => (node as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(3)
  await expect.poll(() => previewVideo.evaluate((node) => ({ width: (node as HTMLVideoElement).videoWidth, height: (node as HTMLVideoElement).videoHeight }))).toEqual({ width: 180, height: 320 })
  const sourceSurface = frame.locator('[data-subtitle-calibration-surface]')
  const sourceBounds = await sourceSurface.boundingBox()
  if (!sourceBounds) throw new Error('字幕区域校准源画面未显示')
  expect(sourceBounds.width / sourceBounds.height).toBeCloseTo(9 / 16, 1)
  expect(sourceBounds.width).toBeLessThan(monitorBounds.width)
  await frame.locator('[data-subtitle-calibration-video]').click({ position: { x: 30, y: 30 } })
  await expect.poll(() => previewVideo.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(false)
  await frame.locator('[data-subtitle-calibration-video]').click({ position: { x: 30, y: 30 } })
  await expect.poll(() => previewVideo.evaluate((node) => (node as HTMLVideoElement).paused)).toBe(true)
  await frame.getByRole('button', { name: '前进 5 秒', exact: true }).click()
  await expect.poll(() => previewVideo.evaluate((node) => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(0)
  await frame.getByRole('button', { name: '后退 5 秒', exact: true }).click()
  await expect.poll(() => previewVideo.evaluate((node) => (node as HTMLVideoElement).currentTime)).toBe(0)
  const calibrationTrack = frame.locator('[data-subtitle-calibration-track]')
  await calibrationTrack.click({ position: { x: 50, y: 8 } })
  await expect.poll(() => previewVideo.evaluate((node) => (node as HTMLVideoElement).currentTime)).toBeGreaterThan(0)
  await page.screenshot({ path: testInfo.outputPath('subtitle-region-candidate-1440x900.png'), fullPage: false })
  await frame.locator('[data-subtitle-manual]').click()
  await expect(frame.locator('[data-subtitle-calibration-view][data-state="adjust"]')).toBeVisible()
  const adjustment = frame.locator('[data-subtitle-adjusted-box]')
  const beforeAdjustment = await adjustment.evaluate((node) => (node as HTMLElement).style.left)
  const adjustmentBounds = await adjustment.boundingBox()
  if (!adjustmentBounds) throw new Error('字幕区域框未显示')
  await page.mouse.move(adjustmentBounds.x + adjustmentBounds.width / 2, adjustmentBounds.y + adjustmentBounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(adjustmentBounds.x + adjustmentBounds.width / 2 + 20, adjustmentBounds.y + adjustmentBounds.height / 2)
  await page.mouse.up()
  await expect.poll(() => adjustment.evaluate((node) => (node as HTMLElement).style.left)).not.toBe(beforeAdjustment)
  const savedAdjustment = await adjustment.evaluate((node) => ({ left: (node as HTMLElement).style.left, top: (node as HTMLElement).style.top, width: (node as HTMLElement).style.width, height: (node as HTMLElement).style.height }))
  await page.screenshot({ path: testInfo.outputPath('subtitle-region-manual-adjustment-1440x900.png'), fullPage: false })
  await frame.locator('[data-subtitle-confirm]').click()
  await expect(frame.locator('#subtitleRecognitionSettingsModal.is-calibrating')).toBeVisible()
  await expect(frame.locator('[data-subtitle-calibration-confirmed]')).toBeVisible()
  await expect(frame.locator('[data-subtitle-calibration-confirmed]')).toContainText('已校准')
  await expect(frame.locator('[data-subtitle-region-badge]')).toContainText('已校准')
  await page.screenshot({ path: testInfo.outputPath('subtitle-region-calibration-1440x900.png'), fullPage: false })
  await frame.locator('#subtitleRecognitionSettingsModal [data-subtitle-close-settings]').first().click()
  await expect(frame.locator('#subtitleRecognitionSettingsModal.open:not(.is-calibrating)')).toBeVisible()
  await expect(frame.locator('[data-subtitle-region-setting]')).toBeVisible()
  await frame.locator('#subtitleRecognitionSettingsModal [data-subtitle-close-settings]').first().click()
  await expect(frame.locator('#subtitleRecognitionSettingsModal.open')).toHaveCount(0)
  await frame.locator('[data-r5-open="assets"], [data-drama-screen="assets"]').first().click()
  await expect(page.locator('iframe.static-prototype-surface')).toHaveCount(0)
  await page.getByRole('tab', { name: '字幕资产', exact: true }).click()
  await expect(page.locator('iframe.static-prototype-surface[data-prototype-ready="true"]')).toBeVisible()
  frame = await subtitleFrame()
  await frame.getByRole('button', { name: '字幕识别设置', exact: true }).first().click()
  await expect(frame.locator('[data-subtitle-region-badge]')).toContainText('已校准')
  await expect(frame.locator('[data-subtitle-region-summary] .num')).toContainText(`X ${Math.round(Number.parseFloat(savedAdjustment.left))}% · Y ${Math.round(Number.parseFloat(savedAdjustment.top))}% · W ${Math.round(Number.parseFloat(savedAdjustment.width))}% · H ${Math.round(Number.parseFloat(savedAdjustment.height))}%`)
  await frame.locator('#subtitleRecognitionSettingsModal [data-subtitle-close-settings]').first().click()
  await expect(frame.locator('#subtitleAssetModal:not(.open)')).toHaveCount(1)
  await frame.getByRole('button', { name: '查看状态', exact: true }).click()
  await expect(frame.locator('#subtitleAssetModal.open')).toBeVisible()
  await expect(frame.locator('#subtitleAssetModal.open #subtitleDetailEmpty')).toBeVisible()
  await expect(frame.locator('#subtitleAssetModal[data-subtitle-stress="true"]')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('subtitle-static-status-1440x900.png'), fullPage: false })
  await frame.locator('#subtitleAssetModal.open [data-subtitle-close-asset]').click()
  await expect(frame.locator('#subtitleAssetModal:not(.open)')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('subtitle-static-fixture-overview-1440x900.png'), fullPage: false })

  await page.setViewportSize({ width: 1280, height: 720 })
  await expectSubtitleScrollBoundary(frame)
  await frame.locator('[data-r5-open="assets"], [data-drama-screen="assets"]').first().click()
  await expect(page.locator('iframe.static-prototype-surface')).toHaveCount(0)
  await expect(page.locator('.drama-module-screen')).toBeVisible()
})
