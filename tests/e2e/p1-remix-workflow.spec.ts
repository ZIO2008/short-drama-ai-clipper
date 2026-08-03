import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { _electron as electron, expect, test, type ElectronApplication, type Page, type TestInfo } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const ffmpegPath = require('ffmpeg-static') as string
const projectRoot = resolve(import.meta.dirname, '../..')

let application: ElectronApplication
let page: Page
let dataDirectory: string
let mediaDirectory: string
let outputDirectory: string

test.beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'short-drama-p1-data-'))
  mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-p1-media-'))
  outputDirectory = await mkdtemp(join(tmpdir(), 'short-drama-p1-output-'))
  const episodePath = join(mediaDirectory, '1.mp4')
  const subtitlePath = join(mediaDirectory, '1.srt')
  await createFixture(episodePath)
  await writeFile(subtitlePath, '1\n00:00:00,000 --> 00:00:10,000\n秘密即将被揭开。\n\n2\n00:00:10,000 --> 00:00:20,000\n对手承认了背叛。\n\n3\n00:00:20,000 --> 00:00:30,000\n主角决定复仇。\n', 'utf8')
  application = await electron.launch({ executablePath: electronPath, args: [join(projectRoot, 'out', 'main', 'index.js')], env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'p1-e2e', SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory, SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: episodePath, SHORTDRAMA_MATERIAL_E2E_SUBTITLE_PATH: subtitlePath, SHORTDRAMA_FFMPEG_PATH: ffmpegPath } })
  page = await application.firstWindow()
  await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
})

test.afterAll(async () => {
  const pid = application?.process()?.pid
  await application?.close()
  if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  await Promise.all([rm(dataDirectory, { recursive: true, force: true }), rm(mediaDirectory, { recursive: true, force: true }), rm(outputDirectory, { recursive: true, force: true })])
})

test('P1 produces a controlled local draft and exports only after human confirmation', async ({}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '创建剧目' }).first().click()
  const dialog = page.getByRole('dialog', { name: '创建剧目' })
  await dialog.getByLabel('剧名').fill('P1验收剧目')
  await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click()
  await dialog.getByRole('button', { name: '保存并整理资产' }).click()
  await expect(page.getByRole('heading', { name: '编辑剧目' })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('tab', { name: '素材生产' }).click()
  await expect(page.getByRole('heading', { name: 'AI 短剧解说' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '查看工作台方向' })).toBeEnabled()
  await page.getByRole('tab', { name: '字幕资产' }).click()
  await page.getByRole('button', { name: '导入字幕' }).click()
  await expect(page.getByText('已导入画面字幕证据；它不会替代 ASR 音频实录。').first()).toBeVisible()
  await page.getByRole('button', { name: '返回素材生产' }).click()
  await page.getByRole('button', { name: '查看工作台方向' }).click()
  await expect(page.getByRole('heading', { name: '爆点前置二创' })).toBeVisible()
  await expect(page.getByText('受控本地验证模式')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('p1-ai-remix-1440x900.png'), fullPage: false })
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(page.getByRole('button', { name: '开始分析剧情' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('p1-ai-remix-1280x720.png'), fullPage: false })
  await page.setViewportSize({ width: 1440, height: 900 })
  const capabilities = await page.evaluate(() => window.desktopApi.listAiCapabilityStatus())
  expect(capabilities).toEqual(expect.arrayContaining([expect.objectContaining({ capability: 'text-analysis', mode: 'controlled' })]))
  expect(capabilities).not.toEqual(expect.arrayContaining([expect.objectContaining({ capability: 'tts' })]))
  expect(await page.evaluate(() => Object.hasOwn(window.desktopApi, 'createNarrationTask'))).toBe(false)
  await page.getByRole('button', { name: '开始分析剧情' }).click()
  await expect(page.getByRole('button', { name: '进入审核时间线' })).toBeVisible()
  await page.getByRole('button', { name: '进入审核时间线' }).first().click()
  await expect(page.getByRole('heading', { name: '候选草稿 01' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('p1-review-timeline-1440x900.png'), fullPage: false })
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(page.getByRole('button', { name: '导出设置' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('p1-review-timeline-1280x720.png'), fullPage: false })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '导出设置' }).click()
  const exportSettings = page.getByRole('dialog', { name: '导出设置' })
  await exportSettings.getByLabel('输出目录').fill(outputDirectory)
  await exportSettings.getByRole('button', { name: '保存导出设置' }).click()
  await page.getByRole('button', { name: '确认并导出' }).click()
  await expect(page.getByText(/已导出到/)).toBeVisible({ timeout: 90_000 })
  const outputText = await page.getByText(/已导出到/).textContent()
  const outputPath = outputText?.replace('已导出到 ', '') ?? ''
  expect((await stat(outputPath)).size).toBeGreaterThan(0)
})

const createFixture = (path: string): Promise<void> => new Promise((resolvePromise, reject) => {
  const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=purple:s=320x180:d=40', '-f', 'lavfi', '-i', 'sine=frequency=600:duration=40', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-y', path], { windowsHide: true })
  let stderr = ''
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk: string) => { stderr += chunk })
  child.on('error', reject); child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`FFmpeg fixture failed: ${stderr}`)))
})
