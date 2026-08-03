import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
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
let sourcePath: string
let portraitPath: string

const makeFixture = async (path: string, width: number, height: number): Promise<void> => await new Promise<void>((resolveFixture, rejectFixture) => {
  const scene = 'drawbox=x=iw*0.18:y=ih*0.18:w=iw*0.28:h=ih*0.32:color=0xd7b48a@0.78:t=3,drawbox=x=iw*0.54:y=ih*0.52:w=iw*0.08:h=ih*0.32:color=0x17110e:t=fill,drawbox=x=iw*0.71:y=ih*0.58:w=iw*0.08:h=ih*0.26:color=0x2b1d15:t=fill,drawbox=x=0:y=ih*0.83:w=iw:h=ih*0.02:color=0xd69754@0.86:t=fill'
  const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=0x2d241e:s=${width}x${height}:d=60`, '-vf', scene, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', path], { windowsHide: true })
  child.once('error', rejectFixture)
  child.once('exit', (code) => code === 0 ? resolveFixture() : rejectFixture(new Error(`fixture ffmpeg exited ${code}`)))
})

const expectNoOverflow = async (): Promise<void> => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
const expectClipCanvasFitsViewport = async (): Promise<void> => expect(await page.locator('.clip-editor-canvas').evaluate((canvas) => {
  const viewportHeight = window.innerHeight
  return [...canvas.querySelectorAll<HTMLElement>('.media-monitor, .clip-timeline-card')]
    .every((element) => { const bounds = element.getBoundingClientRect(); return bounds.top >= 0 && bounds.bottom <= viewportHeight })
})).toBe(true)
const expectMonitorOverlayPlacement = async (): Promise<void> => expect(await page.locator('.media-monitor .viewport').evaluate((viewport) => {
  const frame = viewport.getBoundingClientRect()
  const timecode = viewport.querySelector<HTMLElement>('.monitor-timecode')?.getBoundingClientRect()
  const context = viewport.querySelector<HTMLElement>('.monitor-context')?.getBoundingClientRect()
  if (!timecode || !context) return false
  return timecode.top >= frame.top && timecode.bottom <= frame.top + 40
    && context.top >= frame.bottom - 40 && context.bottom <= frame.bottom
})).toBe(true)

test.beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'short-drama-v48-fixture-data-'))
  mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-v48-fixture-media-'))
  sourcePath = join(mediaDirectory, '01.mp4')
  portraitPath = join(mediaDirectory, '02.mp4')
  await makeFixture(sourcePath, 320, 180)
  await makeFixture(portraitPath, 180, 320)
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(projectRoot, 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      SHORTDRAMA_MATERIAL_E2E: '1',
      SHORTDRAMA_MATERIAL_CHANNEL: 'e2e',
      SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory,
      SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: `${sourcePath}|${portraitPath}`,
      SHORTDRAMA_FFMPEG_PATH: ffmpegPath,
      SHORTDRAMA_FFPROBE_PATH: ffprobePath
    }
  })
  page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  await Promise.all([rm(dataDirectory, { recursive: true, force: true }), rm(mediaDirectory, { recursive: true, force: true })])
})

test('Phase 10 captures fixture states without using an empty workbench as the selected-candidate baseline', async ({}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '创建剧目' }).first().click()
  const dialog = page.getByRole('dialog', { name: '创建剧目' })
  await dialog.getByLabel('剧名').fill('V48状态映射隔离剧目')
  await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click()
  await dialog.getByRole('button', { name: '保存并整理资产' }).click()
  await expect(page.getByRole('dialog', { name: '编辑剧目' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: '素材生产' }).click()
  await page.getByRole('button', { name: '进入工作区' }).click()
  await expect(page.getByRole('heading', { name: '原剧切片工作区' })).toBeVisible()
  await expect(page.getByText('生成候选后可在当前源分集内编辑。')).toBeVisible()
  await page.locator('#main-content').evaluate((element) => element.scrollTo({ top: 0 }))
  await expect(page.locator('#main-content')).toHaveJSProperty('scrollTop', 0)
  await expectNoOverflow()
  await expectClipCanvasFitsViewport()
  await expectMonitorOverlayPlacement()
  await page.screenshot({ path: testInfo.outputPath('v48-clip-default-1440x900.png'), fullPage: false })
  await page.setViewportSize({ width: 1280, height: 720 })
  await expectNoOverflow()
  await expectClipCanvasFitsViewport()
  await expectMonitorOverlayPlacement()
  await page.screenshot({ path: testInfo.outputPath('v48-clip-default-1280x720.png'), fullPage: false })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '生成候选切片' }).click()
  await page.getByRole('button', { name: /确认生成 .* 个候选/ }).click()
  await page.getByRole('button', { name: '确认候选' }).click()
  await expect(page.getByRole('button', { name: '确认候选' })).toBeVisible()
  await page.locator('#main-content').evaluate((element) => element.scrollTo({ top: 0 }))
  await expect(page.locator('#main-content')).toHaveJSProperty('scrollTop', 0)
  await expectNoOverflow()
  await expectClipCanvasFitsViewport()
  await page.screenshot({ path: testInfo.outputPath('v48-clip-candidate-selected-1440x900.png'), fullPage: false })
  await page.setViewportSize({ width: 1280, height: 720 })
  await expectNoOverflow()
  await expectClipCanvasFitsViewport()
  await page.screenshot({ path: testInfo.outputPath('v48-clip-candidate-selected-1280x720.png'), fullPage: false })
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.getByText('字幕与证据', { exact: true }).click()
  await page.getByRole('button', { name: '打开字幕资产', exact: true }).click()
  await expect(page.getByRole('heading', { name: '字幕资产', exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('v48-subtitles-empty-overview-1440x900.png'), fullPage: false })
  await page.getByRole('button', { name: '查看状态' }).first().click()
  await expect(page.getByRole('dialog', { name: /第 01 集字幕资产/ })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('v48-subtitles-empty-detail-1440x900.png'), fullPage: false })
  await page.getByRole('button', { name: '关闭字幕资产详情' }).click()

  await page.evaluate(async ({ availableSource, missingSource }) => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === 'V48状态映射隔离剧目')
    if (!drama) throw new Error('missing fixture drama')
    const episode = (await window.desktopApi.getDrama(drama.id)).episodes.find((item) => item.sourcePath === availableSource)
    if (!episode) throw new Error('missing portrait episode')
    await window.desktopApi.updateEpisode(drama.id, episode.id, { episodeNo: episode.episodeNo, sortOrder: episode.sortOrder, sourcePath: missingSource })
  }, { availableSource: portraitPath, missingSource: `${portraitPath}.missing.mp4` })
  await page.getByRole('button', { name: '剧目库', exact: true }).click()
  await page.getByRole('button', { name: /V48状态映射隔离剧目/ }).first().click()
  await page.getByRole('tab', { name: '素材生产', exact: true }).click()
  await page.getByRole('button', { name: '进入工作区' }).click()
  await page.locator('.clip-source-rail .clip-episode-row').filter({ hasText: '第 02 集' }).click()
  await expect(page.getByText('源媒体需要重新定位')).toBeVisible()
  await page.locator('#main-content').evaluate((element) => element.scrollTo({ top: 0 }))
  await expect(page.locator('#main-content')).toHaveJSProperty('scrollTop', 0)
  await expectNoOverflow()
  await expectClipCanvasFitsViewport()
  await page.screenshot({ path: testInfo.outputPath('v48-clip-missing-media-1440x900.png'), fullPage: false })
  await page.setViewportSize({ width: 1280, height: 720 })
  await expectNoOverflow()
  await expectClipCanvasFitsViewport()
  await page.screenshot({ path: testInfo.outputPath('v48-clip-missing-media-1280x720.png'), fullPage: false })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '返回素材生产', exact: true }).click()
  await page.getByRole('tab', { name: '字幕资产', exact: true }).click()
  await page.getByRole('button', { name: '查看状态' }).nth(1).click()
  const relinkAction = page.getByRole('button', { name: '前往剧目资产重新关联' })
  await expect(relinkAction).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('v48-subtitles-missing-media-1440x900.png'), fullPage: false })
  await relinkAction.click()
  await expect(page.getByRole('tab', { name: '剧目资产', exact: true })).toHaveAttribute('aria-selected', 'true')

  await page.getByRole('button', { name: '剧目库', exact: true }).click()
  const librarySearch = page.getByRole('textbox', { name: '搜索剧目' })
  await librarySearch.fill('V48状态映射隔离剧目')
  await page.getByRole('button', { name: '列表', exact: true }).click()
  await page.getByRole('button', { name: /V48状态映射隔离剧目/ }).first().click()
  await expect(page.getByRole('tablist', { name: '剧目工作区' })).toBeVisible()
  await page.getByRole('button', { name: '剧目库', exact: true }).click()
  await expect(page.getByRole('heading', { name: '剧目库', exact: true })).toBeVisible()
  await expect(librarySearch).toHaveValue('V48状态映射隔离剧目')
  await expect(page.getByRole('button', { name: '列表', exact: true })).toHaveAttribute('aria-pressed', 'true')
})
