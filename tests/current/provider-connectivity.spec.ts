import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { _electron as electron, expect, test, type ElectronApplication, type FrameLocator, type Page, type TestInfo } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const projectRoot = resolve(import.meta.dirname, '../..')

const assertOuterScrollLocked = async (frame: FrameLocator): Promise<void> => {
  await expect(frame.locator('html')).toHaveCSS('overflow-y', 'hidden')
  await expect(frame.locator('body')).toHaveCSS('overflow-y', 'hidden')
  await expect(frame.locator('#content')).toHaveCSS('overflow-y', 'hidden')
}

const capture = async (page: Page, testInfo: TestInfo, name: string): Promise<void> => {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: false })
}

const resetDraftScroll = async (frame: FrameLocator): Promise<void> => {
  await frame.locator('.supplier-draft').evaluate((node) => {
    node.scrollTop = 0
    node.querySelector<HTMLElement>('.form-grid')?.scrollTo({ top: 0 })
  })
}

const openTextAnalysis = async (page: Page): Promise<FrameLocator> => {
  await page.getByRole('button', { name: '设置' }).click()
  const settings = page.frameLocator('iframe[title="设置"]')
  await expect(settings.getByRole('heading', { name: '文本语义分析' })).toBeVisible()
  await settings.getByRole('heading', { name: '文本语义分析' }).locator('xpath=ancestor::article').getByRole('button', { name: '进入独立配置' }).click()
  const frame = page.frameLocator('iframe[title="文本语义分析"]')
  await expect(frame.getByRole('heading', { name: '文本语义分析' })).toBeVisible()
  await assertOuterScrollLocked(frame)
  const deepSeekCard = frame.getByRole('heading', { name: 'DeepSeek API', exact: true }).locator('xpath=ancestor::article')
  await deepSeekCard.scrollIntoViewIfNeeded()
  await expect(deepSeekCard).toBeVisible()
  await deepSeekCard.getByRole('button', { name: '预填此方案' }).click()
  await expect(frame.getByRole('textbox', { name: '供应商', exact: true })).toHaveValue('DeepSeek API')
  await expect(frame.getByRole('textbox', { name: '处理区域', exact: true })).toHaveValue('cn')
  await expect(frame.getByRole('textbox', { name: 'API 地址', exact: true })).toHaveValue('https://api.deepseek.com')
  await expect(frame.getByRole('textbox', { name: '模型', exact: true })).toHaveValue('deepseek-v4-flash')
  return frame
}

const openTencentAsr = async (page: Page): Promise<FrameLocator> => {
  await page.getByRole('button', { name: '设置' }).click()
  const settings = page.frameLocator('iframe[title="设置"]')
  await expect(settings.getByRole('heading', { name: 'ASR 字幕识别' })).toBeVisible()
  await settings.getByRole('heading', { name: 'ASR 字幕识别' }).locator('xpath=ancestor::article').getByRole('button', { name: '进入独立配置' }).click()
  const frame = page.frameLocator('iframe[title="ASR 字幕识别"]')
  await expect(frame.getByRole('heading', { name: 'ASR 字幕识别' })).toBeVisible()
  const tencentCard = frame.getByRole('heading', { name: '腾讯云 ASR', exact: true }).locator('xpath=ancestor::article')
  await tencentCard.scrollIntoViewIfNeeded()
  await tencentCard.getByRole('button', { name: '预填此方案' }).click()
  await expect(frame.getByRole('textbox', { name: '供应商', exact: true })).toHaveValue('腾讯云 ASR')
  return frame
}

const openModelStudioAsr = async (page: Page): Promise<FrameLocator> => {
  await page.getByRole('button', { name: '设置' }).click()
  const settings = page.frameLocator('iframe[title="设置"]')
  await expect(settings.getByRole('heading', { name: 'ASR 字幕识别' })).toBeVisible()
  await settings.getByRole('heading', { name: 'ASR 字幕识别' }).locator('xpath=ancestor::article').getByRole('button', { name: '进入独立配置' }).click()
  const frame = page.frameLocator('iframe[title="ASR 字幕识别"]')
  const card = frame.getByRole('heading', { name: '阿里云百炼 / Model Studio', exact: true }).locator('xpath=ancestor::article')
  await card.scrollIntoViewIfNeeded()
  await card.getByRole('button', { name: '预填此方案' }).click()
  await expect(frame.getByRole('textbox', { name: '供应商', exact: true })).toHaveValue('阿里云百炼 / Model Studio')
  return frame
}

const launch = async (result?: 'success' | 'authentication'): Promise<{ app: ElectronApplication; page: Page; userData: string }> => {
  const userData = await mkdtemp(join(tmpdir(), `short-drama-provider-${result ?? 'blocked'}-`))
  const app = await electron.launch({
    executablePath: electronPath,
    args: [join(projectRoot, 'out', 'main', 'index.js')],
    env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'e2e', SHORTDRAMA_MATERIAL_USER_DATA: userData, ...(result ? { SHORTDRAMA_MATERIAL_E2E_DEEPSEEK_RESULT: result } : {}) }
  })
  return { app, page: await app.firstWindow(), userData }
}

const close = async (app: ElectronApplication, userData: string): Promise<void> => {
  const pid = app.process()?.pid
  await app.close()
  if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  await rm(userData, { recursive: true, force: true })
}

const seedOtherCapabilityDefaults = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await window.desktopApi.saveProviderProfile({ capability: 'asr', region: 'local', provider: 'ASR default', endpoint: 'http://127.0.0.1:8080', model: 'asr-model', secretRef: 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321', timeoutMs: 45_000, pricing: null })
    await window.desktopApi.saveProviderProfile({ capability: 'multimodal-review', region: 'global', provider: 'Video default', endpoint: 'https://video.example.test/v1', model: 'vision-model', secretRef: 'af4e8d3f-f853-4f72-912d-531aa33319f0', timeoutMs: 90_000, pricing: null })
  })
}

const seedHistoricalModelGuidanceProfile = (userData: string): void => {
  const database = new DatabaseSync(join(userData, 'data', 'material-studio.sqlite'))
  try {
    database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    const now = new Date().toISOString()
    const secretRef = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    database.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(secretRef, new Uint8Array([0]), now, now)
    database.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('legacy-model-guidance', 'multimodal-review', 'cn', '阿里云百炼 / Model Studio', 'https://dashscope.aliyuncs.com/compatible-mode/v1', '请按开通模型填写', secretRef, null, 60_000, now, now)
  } finally {
    database.close()
  }
}

const seedUnreadableModelStudioProfile = (userData: string): void => {
  const database = new DatabaseSync(join(userData, 'data', 'material-studio.sqlite'))
  try {
    database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    const now = new Date().toISOString()
    const secretRef = 'e2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    database.prepare('INSERT INTO secret_records (id, encrypted_value, created_at, updated_at) VALUES (?, ?, ?, ?)').run(secretRef, new Uint8Array([0]), now, now)
    database.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, model_selection_source, secret_ref, pricing_json, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('unreadable-model-studio', 'multimodal-review', 'cn', '阿里云百炼 / Model Studio', 'https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen3.7-flash', 'model-studio-automatic', secretRef, null, 60_000, now, now)
  } finally {
    database.close()
  }
}

test('文本语义分析的未验证、测试中与成功状态在两个视口使用 E2E mock，不保存测试草稿', async ({}, testInfo) => {
  const { app, page, userData } = await launch('success')
  try {
    await seedOtherCapabilityDefaults(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    const frame = await openTextAnalysis(page)
    const deepSeekCard = frame.getByRole('heading', { name: 'DeepSeek API', exact: true }).locator('xpath=ancestor::article')
    await deepSeekCard.scrollIntoViewIfNeeded()
    await capture(page, testInfo, 'provider-connectivity-deepseek-candidate-1440x900')
    await page.setViewportSize({ width: 1280, height: 720 })
    await deepSeekCard.scrollIntoViewIfNeeded()
    await capture(page, testInfo, 'provider-connectivity-deepseek-candidate-1280x720')
    await frame.getByRole('button', { name: '保存并设为默认' }).click()
    await expect(frame.getByText('文本语义分析默认方案已保存；尚未验证。')).toBeVisible()
    await page.waitForTimeout(2300)
    const before = await page.evaluate(() => window.desktopApi.listProviderProfiles())
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(frame.getByText('配置已保存，尚未验证')).toBeVisible()
    const testButtonBox = await frame.getByRole('button', { name: '测试当前配置' }).boundingBox()
    const vendorBox = await frame.getByRole('textbox', { name: '供应商', exact: true }).boundingBox()
    expect(testButtonBox).not.toBeNull()
    expect(vendorBox).not.toBeNull()
    expect(testButtonBox!.y).toBeLessThan(vendorBox!.y)
    await resetDraftScroll(frame)
    await capture(page, testInfo, 'provider-connectivity-default-1440x900')
    await page.setViewportSize({ width: 1280, height: 720 })
    await resetDraftScroll(frame)
    await capture(page, testInfo, 'provider-connectivity-default-1280x720')

    await frame.getByRole('textbox', { name: '密钥', exact: true }).fill('e2e-transient-key')
    await page.setViewportSize({ width: 1440, height: 900 })
    await frame.getByRole('button', { name: '测试当前配置' }).click()
    await expect(frame.getByRole('button', { name: '正在测试当前配置' })).toBeVisible()
    await resetDraftScroll(frame)
    await capture(page, testInfo, 'provider-connectivity-testing-1440x900')
    await page.setViewportSize({ width: 1280, height: 720 })
    await expect(frame.getByRole('button', { name: '正在测试当前配置' })).toBeVisible()
    await resetDraftScroll(frame)
    await capture(page, testInfo, 'provider-connectivity-testing-1280x720')
    await expect(frame.getByText(/连接成功 ·/)).toBeVisible()
    await resetDraftScroll(frame)
    await capture(page, testInfo, 'provider-connectivity-success-1280x720')
    await page.setViewportSize({ width: 1440, height: 900 })
    await resetDraftScroll(frame)
    await capture(page, testInfo, 'provider-connectivity-success-1440x900')
    expect(await page.evaluate(() => window.desktopApi.listProviderProfiles())).toEqual(before)
    expect(await page.evaluate(() => window.desktopApi.listProviderProfiles())).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'asr', provider: 'ASR default', endpoint: 'http://127.0.0.1:8080', model: 'asr-model', secretRef: 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321', timeoutMs: 45_000 }),
      expect.objectContaining({ capability: 'multimodal-review', provider: 'Video default', endpoint: 'https://video.example.test/v1', model: 'vision-model', secretRef: 'af4e8d3f-f853-4f72-912d-531aa33319f0', timeoutMs: 90_000 })
    ]))
  } finally { await close(app, userData) }
})

test('文本语义分析的失败状态在两个视口使用鉴权 mock，不影响默认方案', async ({}, testInfo) => {
  const { app, page, userData } = await launch('authentication')
  try {
    const frame = await openTextAnalysis(page)
    await frame.getByRole('button', { name: '保存并设为默认' }).click()
    await page.waitForTimeout(2300)
    const before = await page.evaluate(() => window.desktopApi.listProviderProfiles())
    await frame.getByRole('textbox', { name: '密钥', exact: true }).fill('e2e-transient-key')
    await frame.getByRole('button', { name: '测试当前配置' }).click()
    await expect(frame.getByText('鉴权未通过')).toBeVisible()
    await page.setViewportSize({ width: 1440, height: 900 })
    await resetDraftScroll(frame)
    await capture(page, testInfo, 'provider-connectivity-failure-1440x900')
    await page.setViewportSize({ width: 1280, height: 720 })
    await resetDraftScroll(frame)
    await capture(page, testInfo, 'provider-connectivity-failure-1280x720')
    expect(await page.evaluate(() => window.desktopApi.listProviderProfiles())).toEqual(before)
  } finally { await close(app, userData) }
})

test('E2E 标记未明确选择 mock 时拒绝出网', async () => {
  const { app, page, userData } = await launch()
  try {
    const frame = await openTextAnalysis(page)
    await frame.getByRole('textbox', { name: '密钥', exact: true }).fill('e2e-transient-key')
    await frame.getByRole('button', { name: '测试当前配置' }).click()
    await expect(frame.getByText('网络或 TLS 连接失败')).toBeVisible()
  } finally { await close(app, userData) }
})

test('腾讯云 ASR 使用静态原型的双凭据测试按钮，缺凭据时不出网也不保存', async ({}, testInfo) => {
  const { app, page, userData } = await launch()
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    const frame = await openTencentAsr(page)
    await expect(frame.getByRole('textbox', { name: 'SecretId', exact: true })).toBeVisible()
    await expect(frame.getByLabel('SecretKey', { exact: true })).toBeVisible()
    await expect(frame.getByRole('textbox', { name: '密钥', exact: true })).toBeHidden()
    await expect(frame.getByText('当前默认', { exact: true })).toBeVisible()
    await expect(frame.getByText('尚未设置', { exact: true })).toBeVisible()
    await expect(frame.getByRole('button', { name: '保存并设为默认' })).toBeVisible()
    await expect(frame.getByRole('button', { name: '测试当前配置' })).toBeVisible()
    await expect(frame.getByText('测试 SecretId、SecretKey 和签名')).toBeVisible()
    await expect(frame.getByText('仅向腾讯云 ASR 发起固定签名校验；不上传音频、视频、字幕、剧本或提示词，也不创建任务。')).toBeVisible()
    await frame.getByRole('textbox', { name: 'SecretId', exact: true }).scrollIntoViewIfNeeded()
    await capture(page, testInfo, 'provider-connectivity-tencent-asr-unverified-1440x900')
    await page.setViewportSize({ width: 1280, height: 720 }); await expect(frame.getByRole('textbox', { name: 'SecretId', exact: true })).toBeVisible()
    await expect(frame.getByLabel('SecretKey', { exact: true })).toBeVisible()
    await frame.getByRole('textbox', { name: 'SecretId', exact: true }).scrollIntoViewIfNeeded(); await capture(page, testInfo, 'provider-connectivity-tencent-asr-unverified-1280x720')

    const before = await page.evaluate(() => window.desktopApi.listProviderProfiles())
    await frame.getByRole('button', { name: '测试当前配置' }).click()
    await expect(frame.getByText('缺少可用的 SecretId 或 SecretKey')).toBeVisible()
    expect(await page.evaluate(() => window.desktopApi.listProviderProfiles())).toEqual(before)
  } finally { await close(app, userData) }
})

test('Model Studio ASR 在两个视口提供自动选择检测，缺密钥不保存也不创建识别任务', async ({}, testInfo) => {
  const { app, page, userData } = await launch()
  try {
    const frame = await openModelStudioAsr(page)
    const before = await page.evaluate(() => window.desktopApi.listProviderProfiles())
    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(frame.getByRole('button', { name: '检测并自动选择' })).toBeVisible()
    await capture(page, testInfo, 'provider-connectivity-model-studio-asr-1440x900')
    await page.setViewportSize({ width: 1280, height: 720 })
    await expect(frame.getByRole('button', { name: '检测并自动选择' })).toBeVisible()
    await capture(page, testInfo, 'provider-connectivity-model-studio-asr-1280x720')

    await frame.getByRole('button', { name: '检测并自动选择' }).click()
    await expect(frame.getByText('缺少可用密钥')).toBeVisible()
    expect(await page.evaluate(() => window.desktopApi.listProviderProfiles())).toEqual(before)

    const tencentCard = frame.getByRole('heading', { name: '腾讯云 ASR', exact: true }).locator('xpath=ancestor::article')
    await tencentCard.scrollIntoViewIfNeeded()
    await tencentCard.getByRole('button', { name: '预填此方案' }).click()
    await expect(frame.getByRole('textbox', { name: '供应商', exact: true })).toHaveValue('腾讯云 ASR')
    await expect(frame.getByRole('button', { name: '检测并自动选择' })).toBeHidden()
    await expect(frame.getByRole('button', { name: '测试当前配置' })).toBeVisible()

    const modelStudioCard = frame.getByRole('heading', { name: '阿里云百炼 / Model Studio', exact: true }).locator('xpath=ancestor::article')
    await modelStudioCard.scrollIntoViewIfNeeded()
    await modelStudioCard.getByRole('button', { name: '预填此方案' }).click()
    await expect(frame.getByRole('textbox', { name: '供应商', exact: true })).toHaveValue('阿里云百炼 / Model Studio')
    await expect(frame.getByRole('button', { name: '检测并自动选择' })).toBeVisible()
    await expect(frame.getByRole('button', { name: '测试当前配置' })).toBeHidden()
  } finally { await close(app, userData) }
})

test('历史 Model Studio 模型引导值与不可解密密钥经真实 IPC 进入重存密钥受控状态', async ({}, testInfo) => {
  const { app, page, userData } = await launch()
  try {
    seedHistoricalModelGuidanceProfile(userData)
    await expect.poll(() => page.evaluate(() => window.desktopApi.listAiCapabilityStatus())).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'multimodal-review', mode: 'controlled', reason: 'unreadable-secret' })
    ]))

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.getByRole('button', { name: '设置' }).click()
    const settings = page.frameLocator('iframe[title="设置"]')
    await expect(settings.locator('#provider-status-multimodalReview')).toHaveText('需要重新保存密钥')
    await settings.getByRole('heading', { name: '视频理解复核' }).locator('xpath=ancestor::article').getByRole('button', { name: '进入独立配置' }).click()
    const frame = page.frameLocator('iframe[title="视频理解复核"]')
    await expect(frame.locator('[data-model-studio-default-saved]')).toHaveText('需要重新保存密钥')
    await expect(frame.getByText(/已保存密钥但当前 Windows 安全存储无法读取/)).toBeVisible()
    await capture(page, testInfo, 'provider-model-guidance-required-1440x900')

    await page.setViewportSize({ width: 1280, height: 720 })
    await expect(frame.locator('[data-model-studio-default-saved]')).toHaveText('需要重新保存密钥')
    await capture(page, testInfo, 'provider-model-guidance-required-1280x720')
  } finally { await close(app, userData) }
})

test('无法解密的 Model Studio 密钥不会经真实 IPC 冒充已配置', async () => {
  const { app, page, userData } = await launch()
  try {
    seedUnreadableModelStudioProfile(userData)
    await expect.poll(() => page.evaluate(() => window.desktopApi.listAiCapabilityStatus())).toEqual(expect.arrayContaining([
      expect.objectContaining({ capability: 'multimodal-review', mode: 'controlled', reason: 'unreadable-secret' })
    ]))
  } finally { await close(app, userData) }
})
