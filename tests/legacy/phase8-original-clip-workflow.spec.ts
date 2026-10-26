// Legacy suite: retained for historical comparison only.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const ffmpegPath = require('ffmpeg-static') as string
const projectRoot = resolve(import.meta.dirname, '../..')
let app: ElectronApplication
let page: Page
let dataDirectory: string
let mediaDirectory: string

const createFixture = async (path: string): Promise<void> => await new Promise<void>((resolveFixture, rejectFixture) => {
  const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x191310:s=320x180:d=60', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', path], { windowsHide: true })
  child.once('error', rejectFixture)
  child.once('exit', (code) => code === 0 ? resolveFixture() : rejectFixture(new Error(`fixture ffmpeg exited ${code}`)))
})

test.beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'short-drama-clip-workspace-data-'))
  mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-clip-workspace-media-'))
  const source = join(mediaDirectory, '01.mp4')
  const secondSource = join(mediaDirectory, '02.mp4')
  await Promise.all([createFixture(source), createFixture(secondSource)])
  app = await electron.launch({ executablePath: electronPath, args: [join(projectRoot, 'out', 'main', 'index.js')], env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'e2e', SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory, SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: `${source}|${secondSource}` } })
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
  await Promise.all([rm(dataDirectory, { recursive: true, force: true }), rm(mediaDirectory, { recursive: true, force: true })])
})

test('Version 49 monitor workspace reads, reviews, edits and confirms a real local candidate', async ({}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '创建剧目' }).first().click()
  const dialog = page.getByRole('dialog', { name: '创建剧目' })
  await dialog.getByLabel('剧名').fill('候选工作区隔离剧目')
  await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click()
  await dialog.getByRole('button', { name: '保存并整理资产' }).click()
  await expect(page.getByRole('dialog', { name: '编辑剧目' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    if (!drama) throw new Error('missing fixture drama')
    const episode = (await window.desktopApi.getDrama(drama.id)).episodes[0]
    if (!episode) throw new Error('missing fixture episode')
    await window.desktopApi.createSubtitleEvidenceTrack({ dramaId: drama.id, episodeId: episode.id, sourceKind: 'asr', label: '候选一 ASR', cost: { resultFormat: 3, sentenceMaxLength: 40 }, cues: [{ index: 1, startSeconds: 10, endSeconds: 15, text: '第一段', confidence: 0.9 }, { index: 2, startSeconds: 20, endSeconds: 25, text: '第二段', confidence: 0.9 }, { index: 3, startSeconds: 40, endSeconds: 45, text: '第三段', confidence: 0.9 }] })
  })

  await page.getByRole('tab', { name: '素材生产' }).click()
  await page.getByRole('button', { name: '进入工作区' }).click()
  const frame = page.frameLocator('iframe[title="原剧切片工作区"]')
  await expect(frame.locator('#screen-clip')).toBeVisible()
  await frame.locator('[data-r5-open="generate"]').click()
  await expect.poll(async () => page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    return drama ? (await window.desktopApi.listClipCandidates(drama.id))[0]?.id ?? null : null
  })).not.toBeNull()
  const candidateId = await page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    return drama ? (await window.desktopApi.listClipCandidates(drama.id))[0]?.id ?? null : null
  })
  if (candidateId === null) throw new Error('workspace UI did not create a candidate')
  await expect(frame.locator('.r5-candidate-id')).toContainText(candidateId.slice(0, 8))
  await expect(frame.locator('.r5-frame video')).toHaveCSS('object-fit', 'contain')
  await expect(frame.locator('.r5-episodes [data-clip-episode-id]')).toHaveCount(2)
  await expect(frame.locator('[data-od-id="clip-monitor-transport"]')).toBeVisible()
  await expect(frame.locator('[data-clip-play]')).toHaveAttribute('aria-pressed', 'false')
  await expect(frame.locator('[data-clip-review="candidate"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(frame.locator('[data-clip-source-time]')).toContainText('00:00:10')
  await expect(frame.locator('[data-clip-relative-time]')).toContainText('00:00:00')
  await frame.locator('#screen-clip').screenshot({ path: testInfo.outputPath('v49-clip-workspace-1440x900.png') })

  await frame.locator('[data-clip-review="context"]').click()
  await expect(frame.locator('[data-clip-review="context"]')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(async (id) => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    const current = drama ? (await window.desktopApi.listClipCandidates(drama.id)).find((item) => item.id === id) : null
    return current ? [current.startSeconds, current.endSeconds] : null
  }, candidateId)).toEqual([10, 25])

  const sourceTrack = frame.locator('.r5-timeline').first().locator('.r5-track')
  const sourceTrackBox = await sourceTrack.boundingBox()
  if (!sourceTrackBox) throw new Error('missing source timeline')
  await page.mouse.move(sourceTrackBox.x + sourceTrackBox.width * 0.8, sourceTrackBox.y + sourceTrackBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sourceTrackBox.x + sourceTrackBox.width * 0.9, sourceTrackBox.y + sourceTrackBox.height / 2)
  await page.mouse.up()
  await expect(frame.locator('[data-clip-source-time]')).toContainText('00:00:54')
  await expect.poll(() => page.evaluate(async (id) => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    const current = drama ? (await window.desktopApi.listClipCandidates(drama.id)).find((item) => item.id === id) : null
    return current ? [current.startSeconds, current.endSeconds] : null
  }, candidateId)).toEqual([10, 25])

  await frame.locator('[data-clip-nudge="in-forward"]').click()
  await expect.poll(() => page.evaluate(async (id) => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    return drama ? (await window.desktopApi.listClipCandidates(drama.id)).find((item) => item.id === id)?.startSeconds : null
  }, candidateId)).toBe(10.1)

  await frame.locator('[data-r5-confirm]').click()
  await expect.poll(() => page.evaluate(async (id) => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    return drama ? (await window.desktopApi.listClipCandidates(drama.id)).find((item) => item.id === id)?.status : null
  }, candidateId)).toBe('confirmed')
  await expect(frame.locator('.r5-note')).toContainText('confirmed')

  await frame.locator('[data-clip-episode-id]').nth(1).click()
  await frame.locator('[data-r5-open="generate"]').click()
  await expect(frame.locator('.r5-note')).toContainText('没有导入、OCR 或已验证 ASR 字幕时间轴')
  await page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    if (!drama) throw new Error('missing fixture drama')
    const detail = await window.desktopApi.getDrama(drama.id)
    const secondEpisode = detail.episodes[1]
    if (!secondEpisode) throw new Error('missing fixture episode')
    await window.desktopApi.createSubtitleEvidenceTrack({ dramaId: drama.id, episodeId: secondEpisode.id, sourceKind: 'asr', label: '候选二 ASR', cost: { resultFormat: 3, sentenceMaxLength: 40 }, cues: [{ index: 1, startSeconds: 10, endSeconds: 15, text: '第一段', confidence: 0.9 }, { index: 2, startSeconds: 30, endSeconds: 35, text: '第二段', confidence: 0.9 }, { index: 3, startSeconds: 40, endSeconds: 45, text: '第三段', confidence: 0.9 }] })
  })
  await frame.locator('[data-r5-open="generate"]').click()
  await expect.poll(async () => page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    if (!drama) return null
    const secondEpisode = (await window.desktopApi.getDrama(drama.id)).episodes[1]
    return secondEpisode ? (await window.desktopApi.listClipCandidates(drama.id)).find((item) => item.episodeId === secondEpisode.id)?.id ?? null : null
  })).not.toBeNull()
  const generatedSecondEpisodeCandidate = await page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    if (!drama) return null
    const secondEpisode = (await window.desktopApi.getDrama(drama.id)).episodes[1]
    return secondEpisode ? (await window.desktopApi.listClipCandidates(drama.id)).find((item) => item.episodeId === secondEpisode.id)?.id ?? null : null
  })
  if (generatedSecondEpisodeCandidate === null) throw new Error('workspace UI did not create second-episode candidate')
  await expect(frame.locator('.r5-candidate-id')).toContainText(generatedSecondEpisodeCandidate.slice(0, 8))
  await expect(frame.locator('[data-clip-episode-id]').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true)
  await expect(frame.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth)).resolves.toBe(true)
  await page.setViewportSize({ width: 1280, height: 720 })
  await expect(frame.locator('[data-od-id="clip-monitor-transport"]')).toBeVisible()
  await frame.locator('#screen-clip').screenshot({ path: testInfo.outputPath('v49-clip-workspace-1280x720.png') })
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true)
  await expect(frame.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth)).resolves.toBe(true)
})
