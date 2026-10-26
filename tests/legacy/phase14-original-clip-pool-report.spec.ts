// Legacy suite: historical Phase 14 report behavior.
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
let outputDirectory: string

const createFixture = async (path: string): Promise<void> => await new Promise<void>((resolveFixture, rejectFixture) => {
  const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x191310:s=320x180:d=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', path], { windowsHide: true })
  child.once('error', rejectFixture); child.once('exit', (code) => code === 0 ? resolveFixture() : rejectFixture(new Error(`fixture ffmpeg exited ${code}`)))
})

test.beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'short-drama-pool-report-data-')); mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-pool-report-media-')); outputDirectory = await mkdtemp(join(tmpdir(), 'short-drama-pool-report-output-'))
  const first = join(mediaDirectory, '01.mp4'); const second = join(mediaDirectory, '02.mp4'); await Promise.all([createFixture(first), createFixture(second)])
  app = await electron.launch({ executablePath: electronPath, args: [join(projectRoot, 'out', 'main', 'index.js')], env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'e2e', SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory, SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: `${first}|${second}`, SHORTDRAMA_MATERIAL_E2E_OUTPUT_DIRECTORY: outputDirectory } })
  page = await app.firstWindow()
})

test.afterAll(async () => { await app?.close(); await Promise.all([rm(dataDirectory, { recursive: true, force: true }), rm(mediaDirectory, { recursive: true, force: true }), rm(outputDirectory, { recursive: true, force: true })]) })

test('Phase 14 renders only real candidates and the completed export batch in pool and report', async () => {
  await page.getByRole('button', { name: '创建剧目' }).first().click(); const dialog = page.getByRole('dialog', { name: '创建剧目' })
  await dialog.getByLabel('剧名').fill('候选池报告隔离剧目'); await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click(); await dialog.getByRole('button', { name: '保存并整理资产' }).click(); await expect(page.getByRole('dialog', { name: '编辑剧目' })).toBeVisible(); await page.keyboard.press('Escape')
  const candidateId = await page.evaluate(async () => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选池报告隔离剧目'); if (!drama) throw new Error('missing fixture drama')
    const detail = await window.desktopApi.getDrama(drama.id); const first = detail.episodes[0]; if (!first) throw new Error('missing fixture episode')
    await window.desktopApi.createSubtitleEvidenceTrack({ dramaId: drama.id, episodeId: first.id, sourceKind: 'asr', label: '候选池 ASR', cost: { resultFormat: 3, sentenceMaxLength: 40 }, cues: [{ index: 1, startSeconds: 1, endSeconds: 2, text: '候选池起点', confidence: 0.9 }, { index: 2, startSeconds: 3, endSeconds: 4, text: '候选池终点', confidence: 0.9 }] }); const task = await window.desktopApi.generateClipCandidates(drama.id, { episodeIds: [first.id], candidatesPerEpisode: 1, targetDurationSeconds: 3, maxOverlapRatio: 0.25, allowRepeat: false }); for (let attempt = 0; attempt < 40; attempt += 1) { const candidate = (await window.desktopApi.listClipCandidates(drama.id))[0]; if (candidate) { await window.desktopApi.confirmClipCandidate(candidate.id); return candidate.id }; await new Promise((resolve) => setTimeout(resolve, 250)) } throw new Error(`candidate generation did not complete: ${task.taskId}`)
  })
  await page.getByRole('tab', { name: '素材生产' }).click(); await page.getByRole('button', { name: '进入工作区' }).click()
  let frame = page.frameLocator('iframe.static-prototype-surface'); await expect(page.locator('iframe.static-prototype-surface')).toHaveAttribute('data-prototype-ready', 'true'); await expect(page.locator('iframe.static-prototype-surface')).toHaveCSS('visibility', 'visible'); await expect(frame.locator('#screen-clip')).toBeVisible(); await frame.locator('#screen-clip [data-r5-open="clip-pool"]').first().click()
  frame = page.frameLocator('iframe.static-prototype-surface'); await expect(page.locator('iframe.static-prototype-surface')).toHaveAttribute('data-prototype-ready', 'true'); await expect(page.locator('iframe.static-prototype-surface')).toHaveCSS('visibility', 'visible'); await expect(frame.locator('#screen-clip-pool')).toBeVisible(); await expect(frame.locator('body')).toHaveAttribute('data-clip-pool-report-runtime-bound', 'true'); await expect(frame.locator('#clipCandidateRows')).toContainText(candidateId.slice(0, 8)); await frame.locator('#clipCandidateSearch').fill(candidateId.slice(0, 8)); await expect(frame.locator('#clipCandidateRows')).toContainText(candidateId.slice(0, 8)); await frame.locator('#screen-clip-pool [data-clip-export-open]').first().click(); await expect(frame.locator('#exportModal')).toHaveAttribute('aria-hidden', 'false'); await frame.locator('#saveExport').click()
  await expect.poll(() => page.evaluate(async (id) => { const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '候选池报告隔离剧目'); return drama ? (await window.desktopApi.listClipCandidates(drama.id)).find((item) => item.id === id)?.status : null }, candidateId)).toBe('exported'); await frame.locator('#closeExport').click(); await frame.locator('#screen-clip-pool [data-r5-open="clip-report"]').first().click()
  frame = page.frameLocator('iframe.static-prototype-surface'); await expect(page.locator('iframe.static-prototype-surface')).toHaveAttribute('data-prototype-ready', 'true'); await expect(page.locator('iframe.static-prototype-surface')).toHaveCSS('visibility', 'visible'); await expect(frame.locator('#screen-clip-report')).toBeVisible(); await expect(frame.locator('#clipReportRows')).toContainText(candidateId.slice(0, 8)); await expect(frame.locator('#clipReportRows')).toContainText(outputDirectory)
  await frame.locator('#screen-clip-report [data-r5-open="production"]').click(); await page.getByRole('tab', { name: '字幕资产' }).click()
  frame = page.frameLocator('iframe.static-prototype-surface'); await expect(page.locator('iframe.static-prototype-surface')).toHaveAttribute('data-prototype-ready', 'true'); await expect(page.locator('iframe.static-prototype-surface')).toHaveCSS('visibility', 'visible'); await expect(frame.locator('#screen-subtitles')).toBeVisible()
})
