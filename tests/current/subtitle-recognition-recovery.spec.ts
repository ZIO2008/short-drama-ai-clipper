// Current subtitle recovery regression.
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
const packagedExecutablePath = process.env.SHORTDRAMA_PACKAGED_EXE ? resolve(process.env.SHORTDRAMA_PACKAGED_EXE) : null

let application: ElectronApplication | undefined
let page: Page | undefined
let dataDirectory: string
let mediaDirectory: string
let sourcePath: string

const createFixtureVideo = async (path: string): Promise<void> => await new Promise<void>((resolveFixture, rejectFixture) => {
  const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x2d241e:s=320x180:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', path], { windowsHide: true })
  child.once('error', rejectFixture)
  child.once('exit', (code) => code === 0 ? resolveFixture() : rejectFixture(new Error(`fixture ffmpeg exited ${code}`)))
})

const launch = async (): Promise<Page> => {
  application = await electron.launch({
    executablePath: packagedExecutablePath ?? electronPath,
    args: packagedExecutablePath ? [] : [join(projectRoot, 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      SHORTDRAMA_MATERIAL_E2E: '1',
      SHORTDRAMA_MATERIAL_CHANNEL: 'e2e',
      SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory,
      SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: sourcePath,
      SHORTDRAMA_FFMPEG_PATH: ffmpegPath
    }
  })
  const next = await application.firstWindow()
  await expect(next.getByRole('heading', { name: '剧目库' })).toBeVisible()
  return next
}

const subtitleFrame = async (target: Page): Promise<Frame> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    for (const candidate of target.frames()) {
      if (await candidate.locator('#screen-subtitles').count() === 0) continue
      await expect(candidate.locator('#screen-subtitles')).toBeVisible()
      return candidate
    }
    await target.waitForTimeout(100)
  }
  throw new Error('字幕运行时 iframe 未加载')
}

test.beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'short-drama-subtitle-recovery-data-'))
  mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-subtitle-recovery-media-'))
  sourcePath = join(mediaDirectory, '01.mp4')
  await createFixtureVideo(sourcePath)
  page = await launch()
})

test.afterAll(async () => {
  await application?.close().catch(() => undefined)
  await Promise.all([rm(dataDirectory, { recursive: true, force: true }), rm(mediaDirectory, { recursive: true, force: true })])
})

test('打包 EXE 重启后保留字幕批次的中断状态和原因', async () => {
  const firstPage = page!
  await firstPage.getByRole('button', { name: '创建剧目' }).first().click()
  const dialog = firstPage.getByRole('dialog', { name: '创建剧目' })
  await dialog.getByLabel('剧名').fill('字幕重启恢复剧目')
  await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click()
  await dialog.getByRole('button', { name: '保存并整理资产' }).click()
  await expect(firstPage.getByRole('dialog', { name: '编辑剧目' })).toBeVisible()
  await firstPage.keyboard.press('Escape')

  await firstPage.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '字幕重启恢复剧目')
    if (!drama) throw new Error('missing fixture drama')
    const episode = (await window.desktopApi.getDrama(drama.id)).episodes[0]
    if (!episode) throw new Error('missing fixture episode')
    const settings = {
      recognitionMode: 'asr-only' as const,
      scope: 'current' as const,
      language: 'zh-CN' as const,
      asrMode: 'audio-first' as const,
      ocrMode: 'auto-region' as const,
      differenceThreshold: 'standard' as const,
      importStrategy: 'parallel' as const
    }
    const run = await window.desktopApi.startSubtitleRecognitionRun({ dramaId: drama.id, settings, episodeIds: [episode.id] })
    await window.desktopApi.markSubtitleRecognitionRunItemRunning(run.id, episode.id)
  })

  await application?.close()
  page = await launch()
  const restartedPage = page
  await restartedPage.getByRole('button', { name: '打开剧目：字幕重启恢复剧目' }).click()
  await restartedPage.getByRole('tab', { name: '字幕资产', exact: true }).click()
  const frame = await subtitleFrame(restartedPage)
  await expect(frame.locator('#subtitleListPanel .helper')).toContainText('已中断')
  await expect(frame.locator('#subtitleListPanel .helper')).toContainText('工具已关闭或重启')
  await expect(frame.locator('#subtitleListPanel tbody [data-subtitle-episode-id]')).toContainText('已中断')

  await frame.getByRole('button', { name: '返回剧目库', exact: true }).click()
  await restartedPage.getByRole('button', { name: '打开剧目：字幕重启恢复剧目' }).click()
  await restartedPage.getByRole('tab', { name: '字幕资产', exact: true }).click()
  const reopenedFrame = await subtitleFrame(restartedPage)
  await expect(reopenedFrame.locator('#subtitleListPanel .helper')).toContainText('已中断')
  await expect(reopenedFrame.locator('#subtitleListPanel .helper')).toContainText('工具已关闭或重启')
})
