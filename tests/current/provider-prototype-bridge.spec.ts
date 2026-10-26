import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { _electron as electron, expect, test, type ElectronApplication, type FrameLocator, type Page } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const projectRoot = resolve(import.meta.dirname, '../..')

let app: ElectronApplication
let page: Page
let dataDirectory: string

const expectProviderOuterScrollLocked = async (frame: FrameLocator): Promise<void> => {
  await expect(frame.locator('html')).toHaveCSS('overflow-y', 'hidden')
  await expect(frame.locator('body')).toHaveCSS('overflow-y', 'hidden')
  await expect(frame.locator('#content')).toHaveCSS('overflow-y', 'hidden')
}

test.beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'short-drama-provider-e2e-'))
  app = await electron.launch({
    executablePath: electronPath,
    args: [join(projectRoot, 'out', 'main', 'index.js')],
    env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'e2e', SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory }
  })
  page = await app.firstWindow()
})

test.afterAll(async () => {
  const pid = app?.process()?.pid
  await app?.close()
  if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  await rm(dataDirectory, { recursive: true, force: true })
})

test('设置→能力供应商以最终原型承载三项真实配置，并可回到其它设置项', async () => {
  await page.getByRole('button', { name: '设置' }).click()
  await expect(page.locator('iframe[title="设置"]')).toBeVisible()
  let frame = page.frameLocator('iframe[title="设置"]')
  await expect(frame.getByRole('heading', { name: '能力供应商' })).toBeVisible()
  await expect(frame.getByRole('button', { name: '进入独立配置' })).toHaveCount(3)
  await expect(page.locator('iframe.static-prototype-surface')).toHaveCount(1)

  await frame.getByRole('heading', { name: 'ASR 字幕识别' }).locator('xpath=ancestor::article').getByRole('button', { name: '进入独立配置' }).click()
  await expect(page.locator('iframe[title="ASR 字幕识别"]')).toBeVisible()
  frame = page.frameLocator('iframe[title="ASR 字幕识别"]')
  await expectProviderOuterScrollLocked(frame)
  await frame.getByRole('button', { name: '本机运行' }).click()
  await frame.getByText('whisper.cpp（本机）').locator('xpath=ancestor::article').getByRole('button', { name: '预填此方案' }).click()
  await expect(frame.getByRole('textbox', { name: '供应商', exact: true })).toHaveValue('whisper.cpp（本机）')
  await frame.getByRole('button', { name: '保存并设为默认' }).click()
  await expect(frame.getByText('ASR 字幕识别默认方案已保存。')).toBeVisible()
  await frame.getByRole('button', { name: '返回设置' }).click()

  await expect(page.locator('iframe[title="设置"]')).toBeVisible()
  frame = page.frameLocator('iframe[title="设置"]')
  await expect(frame.locator('#provider-status-asr')).toHaveText('已配置')
  await frame.getByRole('heading', { name: '文本语义分析' }).locator('xpath=ancestor::article').getByRole('button', { name: '进入独立配置' }).click()
  await expect(page.locator('iframe[title="文本语义分析"]')).toBeVisible()
  frame = page.frameLocator('iframe[title="文本语义分析"]')
  await expectProviderOuterScrollLocked(frame)
  await frame.getByRole('heading', { name: 'DeepSeek API' }).locator('xpath=ancestor::article').getByRole('button', { name: '预填此方案' }).click()
  await expect(frame.getByRole('textbox', { name: '供应商', exact: true })).toHaveValue('DeepSeek API')
  await expect(frame.getByRole('textbox', { name: '处理区域', exact: true })).toHaveValue('cn')
  await expect(frame.getByRole('textbox', { name: 'API 地址', exact: true })).toHaveValue('https://api.deepseek.com')
  await expect(frame.getByRole('textbox', { name: '模型', exact: true })).toHaveValue('deepseek-v4-flash')
  await frame.getByRole('button', { name: '免费/试用' }).click()
  await expect(frame.getByText('Google Gemini API')).toBeVisible()
  await expect(frame.getByText('OpenAI API')).toBeHidden()
  await frame.getByRole('button', { name: '返回设置' }).click()

  await expect(page.locator('iframe[title="设置"]')).toBeVisible()
  frame = page.frameLocator('iframe[title="设置"]')
  await frame.getByRole('heading', { name: '视频理解复核' }).locator('xpath=ancestor::article').getByRole('button', { name: '进入独立配置' }).click()
  await expect(page.locator('iframe[title="视频理解复核"]')).toBeVisible()
  frame = page.frameLocator('iframe[title="视频理解复核"]')
  await expectProviderOuterScrollLocked(frame)
  await frame.getByRole('button', { name: '按量付费' }).click()
  await expect(frame.getByText('OpenAI API')).toBeVisible()
  await expect(frame.getByText('Google Gemini API')).toBeHidden()
  await frame.getByRole('button', { name: '返回设置' }).click()

  await expect(page.locator('iframe[title="设置"]')).toBeVisible()
  frame = page.frameLocator('iframe[title="设置"]')
  await frame.getByRole('tab', { name: '导出默认值' }).click()
  await expect(page.locator('iframe.static-prototype-surface')).toHaveCount(0)
  await expect(page.getByLabel('默认输出目录')).toBeVisible()
})
