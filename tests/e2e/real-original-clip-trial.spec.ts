import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const ffmpegPath = require('ffmpeg-static') as string
const ffprobePath = require('ffprobe-static').path as string
const projectRoot = resolve(import.meta.dirname, '../..')
const mediaRoot = 'E:\\剪辑盘\\20260623_短剧切片投流\\《嗨,被纯情少爷盯上了》\\标准版'
const episodeNames = ['01（戏前）.mp4', ...Array.from({ length: 29 }, (_, index) => `${String(index + 2).padStart(2, '0')}.mp4`)]
const maxBytes = 200 * 1024 * 1024

test('uses episodes 1–30 for a real original-clip P0 trial', async () => {
  test.skip(process.env.SHORTDRAMA_REAL_ORIGINAL_CLIP_TRIAL !== '1', 'Only run when explicitly requested.')
  test.setTimeout(900_000)
  const output = process.env.SHORTDRAMA_REAL_ORIGINAL_CLIP_OUTPUT ?? ''
  if (!output) throw new Error('SHORTDRAMA_REAL_ORIGINAL_CLIP_OUTPUT is required.')
  await mkdir(output, { recursive: true })
  if ((await readdir(output)).length > 0) throw new Error(`trial output directory must be empty: ${output}`)
  const episodes = episodeNames.map((name) => join(mediaRoot, name))
  for (const path of episodes) await stat(path)
  const dataDirectory = join(tmpdir(), `short-drama-real-clip-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(dataDirectory, { recursive: true })
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({ executablePath: electronPath, args: [join(projectRoot, 'out', 'main', 'index.js')], env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'real-original-clip', SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory, SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: episodes.join('|'), SHORTDRAMA_FFMPEG_PATH: ffmpegPath, SHORTDRAMA_FFPROBE_PATH: ffprobePath } })
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
    await page.getByRole('button', { name: '创建剧目' }).first().click()
    const dialog = page.getByRole('dialog', { name: '创建剧目' })
    await dialog.getByLabel('剧名').fill('真实原剧切片验收剧目')
    await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click()
    await expect(dialog.getByText('已选择 30 个视频文件')).toBeVisible()
    await dialog.getByRole('button', { name: '保存并整理资产' }).click()
    await expect(page.getByRole('tab', { name: '剧目资产' })).toBeVisible({ timeout: 120_000 })
    await expect(page.locator('tbody tr')).toHaveCount(30)
    await page.keyboard.press('Escape')
    await page.getByRole('tab', { name: '素材生产' }).click()
    await page.getByRole('button', { name: '进入工作区' }).click()
    await page.getByLabel('输出目录').fill(output)
    await page.getByLabel('入点（秒）').fill('0.5')
    await page.getByLabel('出点（秒）').fill('10')
    await page.getByRole('button', { name: '生成候选' }).click()
    await expect(page.getByText('候选已生成，等待人工审片。')).toBeVisible()
    await page.getByLabel('入点（秒）').fill('1')
    await page.getByLabel('出点（秒）').fill('9')
    await page.getByRole('button', { name: '保存微调' }).click()
    await expect(page.getByText('微调已保存，请人工确认后导出。')).toBeVisible()
    await page.getByRole('button', { name: '人工确认' }).click()
    await page.getByRole('button', { name: '确认候选并导出' }).click()
    await expect(page.getByText(/已导出：/)).toBeVisible({ timeout: 120_000 })
    const files = (await readdir(output)).filter((name) => name.endsWith('.mp4')).map((name) => join(output, name))
    expect(files).toHaveLength(1)
    const metadata = await Promise.all(files.map(async (path) => ({ path, sizeBytes: (await stat(path)).size })))
    for (const file of metadata) expect(file.sizeBytes).toBeLessThanOrEqual(maxBytes)
    await writeFile(join(output, 'real-original-clip-trial.json'), JSON.stringify({ sourceRoot: mediaRoot, selectedEpisodes: episodes, excludedDuplicate: join(mediaRoot, '01（戏后）.mp4'), episode1Sha256: await sha256(episodes[0]!), manualAdjustment: { startSeconds: 1, endSeconds: 9 }, outputs: metadata }, null, 2), 'utf8')
  } finally {
    await app?.close().catch(() => undefined)
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

const sha256 = async (path: string): Promise<string> => new Promise((resolvePromise, reject) => {
  const hash = createHash('sha256'); const stream = createReadStream(path)
  stream.on('error', reject); stream.on('data', (chunk) => hash.update(chunk)); stream.on('end', () => resolvePromise(hash.digest('hex').toUpperCase()))
})
