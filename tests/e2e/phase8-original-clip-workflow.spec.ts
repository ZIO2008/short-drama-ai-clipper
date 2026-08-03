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

test('Version 48 candidate workspace reads, edits and confirms a real local candidate', async () => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '创建剧目' }).first().click()
  const dialog = page.getByRole('dialog', { name: '创建剧目' })
  await dialog.getByLabel('剧名').fill('候选工作区隔离剧目')
  await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click()
  await dialog.getByRole('button', { name: '保存并整理资产' }).click()
  await expect(page.getByRole('dialog', { name: '编辑剧目' })).toBeVisible()
  await page.keyboard.press('Escape')
  const candidateId = await page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    if (!drama) throw new Error('missing fixture drama')
    const episode = (await window.desktopApi.getDrama(drama.id)).episodes[0]
    if (!episode) throw new Error('missing fixture episode')
    return (await window.desktopApi.createClipCandidate(drama.id, episode.id, 10, 25)).id
  })

  await page.getByRole('tab', { name: '素材生产' }).click()
  await page.getByRole('button', { name: '进入工作区' }).click()
  const frame = page.frameLocator('iframe[title="原剧切片工作区"]')
  await expect(frame.locator('#screen-clip')).toBeVisible()
  await expect(frame.locator('.r5-candidate-id')).toContainText(candidateId.slice(0, 8))
  await expect(frame.locator('.r5-frame video')).toHaveCSS('object-fit', 'contain')
  await expect(frame.locator('.r5-episodes [data-clip-episode-id]')).toHaveCount(2)

  const sourceTrack = frame.locator('.r5-timeline').first().locator('.r5-track')
  const sourceTrackBox = await sourceTrack.boundingBox()
  if (!sourceTrackBox) throw new Error('missing source timeline')
  await page.mouse.move(sourceTrackBox.x + sourceTrackBox.width * 0.8, sourceTrackBox.y + sourceTrackBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(sourceTrackBox.x + sourceTrackBox.width * 0.9, sourceTrackBox.y + sourceTrackBox.height / 2)
  await page.mouse.up()
  await expect.poll(() => page.evaluate(async (id) => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    return drama ? (await window.desktopApi.listClipCandidates(drama.id)).find((item) => item.id === id)?.startSeconds : null
  }, candidateId)).toBe(45)

  await frame.locator('.r5-nudge button').nth(1).click()
  await expect.poll(() => page.evaluate(async (id) => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    return drama ? (await window.desktopApi.listClipCandidates(drama.id)).find((item) => item.id === id)?.startSeconds : null
  }, candidateId)).toBe(45.1)

  await frame.locator('[data-r5-confirm]').click()
  await expect.poll(() => page.evaluate(async (id) => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    return drama ? (await window.desktopApi.listClipCandidates(drama.id)).find((item) => item.id === id)?.status : null
  }, candidateId)).toBe('confirmed')
  await expect(frame.locator('.r5-note')).toContainText('confirmed')

  await frame.locator('[data-clip-episode-id]').nth(1).click()
  await frame.locator('[data-r5-open="generate"]').click()
  const readSecondEpisodeCandidate = async (): Promise<string | null> => await page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选工作区隔离剧目')
    if (!drama) return null
    const detail = await window.desktopApi.getDrama(drama.id)
    const secondEpisode = detail.episodes[1]
    return secondEpisode ? (await window.desktopApi.listClipCandidates(drama.id)).find((item) => item.episodeId === secondEpisode.id)?.id ?? null : null
  })
  await expect.poll(readSecondEpisodeCandidate).not.toBeNull()
  const generatedSecondEpisodeCandidate = await readSecondEpisodeCandidate()
  if (!generatedSecondEpisodeCandidate) throw new Error('missing generated candidate for the second episode')
  await expect(frame.locator('.r5-candidate-id')).toContainText(generatedSecondEpisodeCandidate.slice(0, 8))
  await expect(frame.locator('[data-clip-episode-id]').nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true)
})
