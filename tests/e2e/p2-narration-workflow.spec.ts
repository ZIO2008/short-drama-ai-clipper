import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { _electron as electron, expect, test, type ElectronApplication, type Page, type TestInfo } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const ffmpegPath = require('ffmpeg-static') as string
const projectRoot = resolve(import.meta.dirname, '../..')

let app: ElectronApplication
let page: Page
let dataDirectory: string
let mediaDirectory: string
let outputDirectory: string
let subtitlePath: string

test.beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'short-drama-p2-data-'))
  mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-p2-media-'))
  outputDirectory = await mkdtemp(join(tmpdir(), 'short-drama-p2-output-'))
  const episodePath = join(mediaDirectory, '1.mp4'); subtitlePath = join(mediaDirectory, '1.srt')
  await createFixture(episodePath)
  await writeFile(subtitlePath, '1\n00:00:00,000 --> 00:00:10,000\n秘密即将被揭开。\n\n2\n00:00:10,000 --> 00:00:20,000\n对手承认了背叛。\n\n3\n00:00:20,000 --> 00:00:30,000\n主角决定复仇。\n', 'utf8')
  app = await electron.launch({ executablePath: electronPath, args: [join(projectRoot, 'out', 'main', 'index.js')], env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'p2-e2e', SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory, SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: episodePath, SHORTDRAMA_MATERIAL_E2E_SUBTITLE_PATH: subtitlePath, SHORTDRAMA_FFMPEG_PATH: ffmpegPath } })
  page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
})

test.afterAll(async () => {
  const pid = app?.process()?.pid
  await app?.close()
  if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  await Promise.all([rm(dataDirectory, { recursive: true, force: true }), rm(mediaDirectory, { recursive: true, force: true }), rm(outputDirectory, { recursive: true, force: true })])
})

test('P2 generates, reviews, confirms and exports a traceable conflict-insert controlled draft', async ({}, testInfo: TestInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '创建剧目' }).first().click()
  const createDialog = page.getByRole('dialog', { name: '创建剧目' })
  await createDialog.getByLabel('剧名').fill('P2验收剧目')
  await createDialog.getByRole('button', { name: '选择文件' }).click()
  await expect(createDialog.getByText('已选择 1 个视频文件')).toBeVisible()
  await createDialog.getByRole('button', { name: '保存并整理资产' }).click()
  await expect(page.getByRole('heading', { name: '编辑剧目' })).toBeVisible()
  await expect(page.getByRole('button', { name: '取消', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '编辑剧目' })).toBeHidden()
  await page.getByRole('tab', { name: '素材生产' }).click()
  await page.getByRole('button', { name: '进入工作区' }).first().click()
  await page.getByRole('button', { name: '导入字幕' }).click()
  await expect(page.getByText('字幕已导入并登记到当前剧目。').first()).toBeVisible()
  await page.getByRole('button', { name: '返回素材生产' }).click()
  await page.getByRole('button', { name: '配置分析任务' }).click()
  expect(Math.round(await page.locator('section[aria-labelledby="ai-remix-title"] > .grid-2 > .card').first().evaluate((element) => element.getBoundingClientRect().y))).toBe(254)
  expect(Math.round(await page.locator('section[aria-labelledby="ai-remix-title"] > .grid-2 > .card').first().evaluate((element) => element.getBoundingClientRect().height))).toBe(312)
  await page.screenshot({ path: testInfo.outputPath('p2-ai-remix-1440x900.png'), fullPage: false })
  await page.getByRole('button', { name: '开始分析剧情' }).click()
  await expect(page.getByRole('button', { name: '进入审核时间线' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('p2-ai-remix-drafts-1440x900.png'), fullPage: false })
  await page.getByRole('button', { name: '进入审核时间线' }).click()
  await expect(page.getByRole('heading', { name: '候选草稿 01' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('p1-review-timeline-1440x900.png'), fullPage: false })
  await page.getByRole('button', { name: '返回二创配置' }).click()
  await expect(page.getByRole('heading', { name: '爆点前置二创' })).toBeVisible()
  await page.getByRole('button', { name: '返回素材生产' }).click()
  await page.getByRole('button', { name: '配置解说任务' }).click()
  await expect(page.getByRole('heading', { name: 'AI 短剧解说' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('p2-narration-1440x900.png'), fullPage: false })
  await expect(page.getByText('受控本地验证模式')).toBeVisible()
  await expect(page.getByText('无。仅使用本地已有证据。')).toBeVisible()
  await page.getByRole('button', { name: '冲突插入原片' }).click()
  await page.getByLabel('目标时长').selectOption('60-90')
  await page.getByRole('button', { name: '生成解说审核草稿' }).click()
  await expect(page.getByText(/目标 60 秒/)).toBeVisible()
  await page.getByRole('button', { name: '进入审核时间线' }).click()
  await expect(page.getByRole('heading', { name: '固定轨道时间线' })).toBeVisible()
  expect(Math.round(await page.locator('.ai-review-top .monitor').evaluate((element) => element.getBoundingClientRect().width))).toBe(680)
  expect(Math.round(await page.locator('.ai-review-top .monitor').evaluate((element) => element.getBoundingClientRect().x))).toBe(340)
  expect(Math.round(await page.locator('.ai-review-top .timeline-inspector').evaluate((element) => element.getBoundingClientRect().width))).toBe(280)
  expect(Math.round(await page.locator('.ai-review-top .timeline-inspector').evaluate((element) => element.getBoundingClientRect().x))).toBe(1030)
  expect(Math.round(await page.locator('.ai-review-top .monitor').evaluate((element) => element.getBoundingClientRect().y))).toBe(148)
  expect(Math.round(await page.locator('section[aria-labelledby="timeline-tracks-title"]').evaluate((element) => element.getBoundingClientRect().y))).toBe(635)
  await page.screenshot({ path: testInfo.outputPath('p2-timeline-1440x900.png'), fullPage: false })
  await expect(page.getByRole('button', { name: /冲突原片/ })).toBeVisible()
  await page.getByRole('button', { name: /旁白 0\.0–15\.0s/ }).click()
  await expect(page.getByRole('heading', { name: '旁白资产' })).toBeVisible()
  await page.getByRole('button', { name: '导出设置' }).click()
  const exportSettings = page.getByRole('dialog', { name: '导出设置' })
  await expect(exportSettings).toBeVisible()
  await exportSettings.getByLabel('输出目录').fill(outputDirectory)
  await exportSettings.getByRole('button', { name: '保存导出设置' }).click()
  await expect(exportSettings).toBeHidden()
  await page.getByRole('button', { name: '确认并导出' }).click()
  await expect(page.getByText(/已导出到/)).toBeVisible({ timeout: 90_000 })
  await page.setViewportSize({ width: 1280, height: 720 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('p2-1280x720.png'), fullPage: false })
  await page.getByRole('button', { name: '返回草稿' }).click()
  await page.getByRole('button', { name: '返回素材生产' }).click()
  await page.getByRole('button', { name: '返回剧目库' }).click()
  await page.getByRole('button', { name: '任务中心' }).click()
  await expect(page.getByRole('cell', { name: 'AI 短剧解说' })).toBeVisible()
  await page.getByRole('row', { name: /P2验收剧目.*AI 短剧解说/ }).click()
  await expect(page.getByRole('heading', { name: '聚合完成报告' })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开文件位置' }).first()).toBeVisible()
})

const createFixture = (path: string): Promise<void> => new Promise((resolvePromise, reject) => {
  const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=purple:s=320x180:d=40', '-f', 'lavfi', '-i', 'sine=frequency=600:duration=40', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-y', path], { windowsHide: true })
  let stderr = ''
  child.stderr.setEncoding('utf8'); child.stderr.on('data', (chunk: string) => { stderr += chunk })
  child.on('error', reject); child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`FFmpeg fixture failed: ${stderr}`)))
})
