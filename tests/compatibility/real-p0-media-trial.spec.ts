// Compatibility suite: opt-in real-media P0 trial.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const ffmpegPath = require('ffmpeg-static') as string
const ffprobePath = require('ffprobe-static').path as string
const projectRoot = resolve(import.meta.dirname, '../..')
const mediaRoot = 'E:\\剪辑盘\\20260623_短剧切片投流\\《嗨,被纯情少爷盯上了》\\标准版'
const enabled = process.env.SHORTDRAMA_REAL_MEDIA_TRIAL === '1'
const outputDirectory = process.env.SHORTDRAMA_REAL_MEDIA_OUTPUT ?? ''
const episodeNames = ['01（戏前）.mp4', ...Array.from({ length: 29 }, (_, index) => `${String(index + 2).padStart(2, '0')}.mp4`)]
const MAX_OUTPUT_SIZE_BYTES = 100 * 1024 * 1024
const encodingPreset = process.env.SHORTDRAMA_ENCODING_PRESET === 'balanced' ? 'balanced' : 'fast'

test('uses episodes 1–30 for an isolated real-media P0 trial', async () => {
  test.skip(!enabled, 'Only run when SHORTDRAMA_REAL_MEDIA_TRIAL=1 is explicitly supplied.')
  test.setTimeout(3_600_000)
  if (!outputDirectory.trim()) throw new Error('SHORTDRAMA_REAL_MEDIA_OUTPUT must point to an empty, dedicated trial directory.')

  const episodePaths = episodeNames.map((name) => join(mediaRoot, name))
  for (const path of episodePaths) await expect(stat(path), `missing fixture ${path}`).resolves.toBeTruthy()
  await mkdir(outputDirectory, { recursive: true })
  if ((await readdir(outputDirectory)).length > 0) throw new Error(`trial output directory must be empty: ${outputDirectory}`)
  const dataDirectory = await mkdirTempDataDirectory()
  let app: ElectronApplication | undefined
  let page: Page | undefined
  const launch = async (): Promise<Page> => {
    app = await electron.launch({
      executablePath: electronPath,
      args: [join(projectRoot, 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        SHORTDRAMA_MATERIAL_E2E: '1',
        SHORTDRAMA_MATERIAL_CHANNEL: 'real-p0-trial',
        SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory,
        SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: episodePaths.join('|'),
        SHORTDRAMA_FFMPEG_PATH: ffmpegPath,
        SHORTDRAMA_FFPROBE_PATH: ffprobePath
      }
    })
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '剧目库' })).toBeVisible()
    return window
  }

  try {
    page = await launch()
    await page.getByRole('button', { name: '创建剧目' }).first().click()
    const dialog = page.getByRole('dialog', { name: '创建剧目' })
    await dialog.getByLabel('剧名').fill('真实P0验收剧目')
    await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click()
    await expect(dialog.getByText('已选择 30 个视频文件')).toBeVisible()
    await dialog.getByRole('button', { name: '保存并整理资产' }).click()
    await expect(page.getByRole('tab', { name: '剧目资产' })).toBeVisible({ timeout: 120_000 })
    await expect(page.locator('tbody tr')).toHaveCount(30)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '编辑剧目' })).toBeHidden()

    await page.getByRole('tab', { name: '素材生产' }).click()
    await page.getByRole('button', { name: '创建拼接任务' }).click()
    await page.getByLabel('起始集').fill('1')
    await page.getByLabel('结束集').fill('2')
    await page.getByLabel('每组集数').selectOption('2')
    await page.getByLabel('单条时长上限（分钟）').fill('8')
    await page.getByRole('button', { name: '目标大小' }).first().click()
    await page.getByLabel('单条目标大小（MB）').fill('100')
    await page.getByLabel('输出根目录').fill(outputDirectory)
    await page.getByRole('button', { name: '开始预检' }).click()
    await expect(page.getByRole('heading', { name: '预检已完成' })).toBeVisible({ timeout: 120_000 })
    await expect(page.getByRole('cell', { name: '第 001–002 集' }).first()).toBeVisible()

    const taskId = await page.evaluate(async ({ directory, encodingPreset: preset }) => {
      const api = window.desktopApi
      const drama = (await api.listDramas()).find((item) => item.name === '真实P0验收剧目')
      if (!drama) throw new Error('trial drama was not persisted')
      const config = { startEpisode: 1, endEpisode: 2, groupSize: 2, tailStrategy: 'reduce' as const, maxMinutes: 8, outputDirectory: directory, qualityMode: 'size' as const, targetSizeMb: 100, encodingPreset: preset, fps: 'source' as const, packagingEnabled: false, performanceMode: 'background' as const }
      const preflight = await api.preflightMultiEpisode(drama.id, config)
      const created = await api.createMultiEpisodeTask(drama.id, { ...config, preflightConfirmed: true as const, preflightId: preflight.preflightId })
      return created.taskId
    }, { directory: outputDirectory, encodingPreset })

    const pendingPid = app.process()?.pid
    if (pendingPid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pendingPid), '/T', '/F'], { windowsHide: true })
    await app.close().catch(() => undefined)
    app = undefined
    page = await launch()
    await page.getByRole('button', { name: '任务中心' }).click()
    const taskRow = page.getByRole('row', { name: /真实P0验收剧目多集拼接详情/ })
    await expect(taskRow).toBeVisible()
    await taskRow.click()
    await page.getByRole('button', { name: '继续任务' }).click()
    await expect.poll(async () => (await listMp4Files(outputDirectory)).length, { timeout: 3_000_000 }).toBeGreaterThanOrEqual(1)
    await expect.poll(async () => page!.evaluate(async (id) => (await window.desktopApi.listTasks()).find((task) => task.id === id)?.status ?? '' , taskId), { timeout: 3_000_000 }).toMatch(/completed|partial/)

    await page.getByRole('button', { name: '剧目库' }).click()
    await page.getByRole('button', { name: '打开剧目：真实P0验收剧目' }).click()
    await page.getByRole('tab', { name: '素材生产' }).click()
    await page.getByRole('button', { name: '进入工作区' }).click()
    await page.getByLabel('输出目录').fill(outputDirectory)
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

    const outputs = await listMp4Files(outputDirectory)
    expect(outputs.length).toBeGreaterThanOrEqual(2)
    const outputMetadata = await Promise.all(outputs.map(async (path) => ({ path, sizeBytes: (await stat(path)).size })))
    for (const output of outputMetadata) expect(output.sizeBytes, `${output.path} exceeds the 100 MB task target`).toBeLessThanOrEqual(MAX_OUTPUT_SIZE_BYTES)
    await writeFile(join(outputDirectory, 'real-p0-media-trial.json'), JSON.stringify({
      taskId,
      encodingPreset,
      sourceRoot: mediaRoot,
      selectedEpisodes: episodePaths,
      excludedDuplicate: join(mediaRoot, '01（戏后）.mp4'),
      episode1SelectionReason: '“戏前”是第 1 集正片起点；“戏后”版本不参与连续剧集导入。',
      episode1Sha256: await sha256(episodePaths[0]!),
      outputs: outputMetadata
    }, null, 2), 'utf8')
  } finally {
    await app?.close().catch(() => undefined)
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

const mkdirTempDataDirectory = async (): Promise<string> => {
  const directory = join(tmpdir(), `short-drama-real-p0-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(directory, { recursive: true })
  return directory
}

const listMp4Files = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => entry.isDirectory() ? listMp4Files(join(directory, entry.name)) : entry.isFile() && entry.name.toLowerCase().endsWith('.mp4') ? [join(directory, entry.name)] : []))
  return nested.flat()
}

const sha256 = async (path: string): Promise<string> => new Promise((resolvePromise, reject) => {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  stream.on('error', reject)
  stream.on('data', (chunk) => hash.update(chunk))
  stream.on('end', () => resolvePromise(hash.digest('hex').toUpperCase()))
})
