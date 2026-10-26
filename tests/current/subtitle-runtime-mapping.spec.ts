// Current subtitle runtime regression.
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { _electron as electron, expect, test, type ElectronApplication, type Frame, type Page } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const ffmpegPath = require('ffmpeg-static') as string
const projectRoot = resolve(import.meta.dirname, '../..')
let app: ElectronApplication
let page: Page
let dataDirectory: string
let mediaDirectory: string
let sourcePath: string
let subtitlePath: string
const packagedExecutablePath = process.env.SHORTDRAMA_PACKAGED_EXE ? resolve(process.env.SHORTDRAMA_PACKAGED_EXE) : null

const createFixtureVideo = async (path: string): Promise<void> => await new Promise<void>((resolveFixture, rejectFixture) => {
  const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x2d241e:s=320x180:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', path], { windowsHide: true })
  child.once('error', rejectFixture)
  child.once('exit', (code) => code === 0 ? resolveFixture() : rejectFixture(new Error(`fixture ffmpeg exited ${code}`)))
})

const subtitleFrame = async (): Promise<Frame> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    for (const candidate of page.frames()) {
      if (await candidate.locator('#screen-subtitles').count() === 0) continue
      await expect(candidate.locator('#screen-subtitles')).toBeVisible()
      return candidate
    }
    await page.waitForTimeout(100)
  }
  throw new Error('字幕运行时 iframe 未加载')
}

test.beforeAll(async () => {
  dataDirectory = await mkdtemp(join(tmpdir(), 'short-drama-subtitle-runtime-data-'))
  mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-subtitle-runtime-media-'))
  sourcePath = join(mediaDirectory, '01.mp4')
  subtitlePath = join(mediaDirectory, '01.srt')
  await createFixtureVideo(sourcePath)
  const subtitleCues = Array.from({ length: 90 }, (_, index) => {
    const start = index * 2
    const end = start + 2
    const format = (seconds: number): string => `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')},000`
    return `${index + 1}\n${format(start)} --> ${format(end)}\n第 ${index + 1} 条导入字幕必须归类为 ASR。`
  }).join('\n\n')
  await writeFile(subtitlePath, subtitleCues, 'utf8')
  app = await electron.launch({
    executablePath: packagedExecutablePath ?? electronPath,
    args: packagedExecutablePath ? [] : [join(projectRoot, 'out', 'main', 'index.js')],
    env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'e2e', SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory, SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: sourcePath, SHORTDRAMA_MATERIAL_E2E_SUBTITLE_PATHS: subtitlePath, SHORTDRAMA_FFMPEG_PATH: ffmpegPath }
  })
  page = await app.firstWindow()
  await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
})

test.afterAll(async () => {
  await app?.close()
  await Promise.all([rm(dataDirectory, { recursive: true, force: true }), rm(mediaDirectory, { recursive: true, force: true })])
})

test('真实导入字幕在独立来源列展示，删除不影响其他证据', async ({}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: '创建剧目' }).first().click()
  const dialog = page.getByRole('dialog', { name: '创建剧目' })
  await dialog.getByLabel('剧名').fill('字幕真实映射剧目')
  await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click()
  await dialog.getByRole('button', { name: '保存并整理资产' }).click()
  await expect(page.getByRole('dialog', { name: '编辑剧目' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('tab', { name: '字幕资产', exact: true }).click()
  const frame = await subtitleFrame()
  await expect(frame.getByRole('button', { name: '导入字幕', exact: true })).toBeVisible()
  await expect(frame.locator('#subtitleListPanel .helper')).toContainText('共 1 集')
  page.once('dialog', (confirmation) => confirmation.accept())
  await frame.getByRole('button', { name: '导入字幕', exact: true }).click()
  await expect(frame.locator('#subtitleListPanel tbody [data-subtitle-episode-id]').getByText('ASR（导入）', { exact: true })).toBeVisible()
  await expect(frame.locator('#subtitleListPanel tbody [data-subtitle-episode-id]')).toHaveCount(1)
  await expect(frame.locator('[data-subtitle-delete-episode] .ui-icon')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('subtitle-runtime-imported-1440x900.png'), fullPage: false })
  await page.setViewportSize({ width: 1280, height: 720 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('subtitle-runtime-imported-1280x720.png'), fullPage: false })
  await page.setViewportSize({ width: 1440, height: 900 })

  const importedEpisode = frame.locator('#subtitleListPanel tbody [data-subtitle-episode-id]').first()
  const importedEpisodeId = await importedEpisode.getAttribute('data-subtitle-episode-id')
  expect(importedEpisodeId).toBeTruthy()
  await page.evaluate(async (episodeId) => {
    const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '字幕真实映射剧目')
    if (!drama || !episodeId) throw new Error('missing subtitle fixture context')
    await window.desktopApi.createSubtitleEvidenceTrack({
      dramaId: drama.id,
      episodeId,
      sourceKind: 'asr',
      label: 'E2E 在线 ASR',
      language: 'zh-CN',
      cost: { resultFormat: 3, sentenceMaxLength: 40 },
      cues: [{ index: 1, startSeconds: 0.4, endSeconds: 1.1, text: '在线 ASR 真实时间轴。', confidence: null }]
    })
    await window.desktopApi.createSubtitleEvidenceTrack({
      dramaId: drama.id,
      episodeId,
      sourceKind: 'ocr',
      label: 'E2E 本地 OCR',
      language: 'chi_sim',
      cues: [{ index: 1, startSeconds: 1.2, endSeconds: 1.8, text: 'OCR 真实时间轴。', confidence: 0.94 }]
    })
  }, importedEpisodeId)
  const viewAction = importedEpisode.locator(`[data-subtitle-open-static="view"][data-subtitle-static-episode-id="${importedEpisodeId}"]`)
  await expect(viewAction).toBeVisible()
  await viewAction.click()
  await expect(frame.locator('#subtitleAssetModal.open')).toBeVisible()
  await expect(frame.locator('#subtitleAssetModal #subtitleDetailAsset')).toBeVisible()
  await expect(frame.locator('#subtitleAssetModal.open .three-source-head')).toContainText('在线 ASR')
  await expect(frame.locator('#subtitleAssetModal.open .three-source-head')).toContainText('导入字幕')
  await expect(frame.locator('#subtitleAssetModal.open .three-source-head')).toContainText('OCR 字幕')
  await expect(frame.locator('#subtitleAssetModal.open .subtitle-evidence-window')).toHaveCount(1)
  await expect(frame.locator('#subtitleAssetModal.open [data-source="asr"]')).toHaveCount(1)
  await expect(frame.locator('#subtitleAssetModal.open [data-source="import"]')).toHaveCount(90)
  await expect(frame.locator('#subtitleAssetModal.open [data-source="ocr"]')).toHaveCount(1)
  await expect(frame.locator('#subtitleAssetModal.open [data-subtitle-transport]')).toBeVisible()
  await expect(frame.locator('#subtitleAssetModal.open [data-subtitle-step="-5"]')).toBeVisible()
  await expect(frame.locator('#subtitleAssetModal.open [data-subtitle-step="5"]')).toBeVisible()
  await expect(frame.locator('#subtitleAssetModal.open .subtitle-playback-bar')).toHaveCount(0)
  const detailGeometry = await frame.locator('#subtitleAssetModal.open').evaluate((modal) => {
    const card = modal.querySelector<HTMLElement>('.r5-modal-card')!
    const preview = modal.querySelector<HTMLElement>('#subtitleDetailAsset .r5-frame')!
    const modalBounds = modal.getBoundingClientRect()
    const cardBounds = card.getBoundingClientRect()
    const previewBounds = preview.getBoundingClientRect()
    return { cardWidth: cardBounds.width, previewRatio: previewBounds.width / previewBounds.height }
  })
  expect(detailGeometry.cardWidth).toBeGreaterThanOrEqual(1080)
  expect(detailGeometry.previewRatio).toBeCloseTo(16 / 9, 2)
  await expect(frame.locator('#subtitleAssetModal video[data-subtitle-preview]')).toBeVisible()
  await expect(frame.locator('#subtitleAssetModal [data-subtitle-timeline-playhead]')).toBeVisible()
  await expect(frame.locator('#subtitleAssetModal .r5-timeline .r5-range')).toHaveCount(0)
  await expect(frame.locator('#subtitleAssetModal .r5-timeline .r5-anchor')).toHaveCount(0)
  await expect.poll(() => frame.locator('#subtitleAssetModal video[data-subtitle-preview]').evaluate((video) => Number.isFinite(video.duration) && video.duration > 0)).toBe(true)
  const playbackPosition = await frame.locator('#subtitleAssetModal .r5-timeline .r5-track').evaluate((track) => {
    const video = track.closest('#subtitleDetailAsset')?.querySelector<HTMLVideoElement>('video[data-subtitle-preview]')!
    video.currentTime = Math.min(1, video.duration)
    video.dispatchEvent(new Event('timeupdate'))
    return track.querySelector<HTMLElement>('[data-subtitle-timeline-playhead]')?.style.left
  })
  expect(playbackPosition).not.toBe('0%')
  const previewVideo = frame.locator('#subtitleAssetModal video[data-subtitle-preview]')
  await frame.locator('#subtitleAssetModal [data-source="asr"]').click()
  await expect.poll(() => previewVideo.evaluate((video) => video.currentTime)).toBeCloseTo(0.4, 1)
  await frame.locator('#subtitleAssetModal [data-source="import"]').nth(1).click()
  await expect.poll(() => previewVideo.evaluate((video) => video.currentTime)).toBeCloseTo(2, 1)
  await frame.locator('#subtitleAssetModal [data-source="ocr"]').click()
  await expect.poll(() => previewVideo.evaluate((video) => video.currentTime)).toBeCloseTo(1.2, 1)
  await previewVideo.evaluate((video) => {
    video.pause()
    video.currentTime = Math.min(1, video.duration)
    video.dispatchEvent(new Event('timeupdate'))
  })
  await expect(frame.locator('#subtitleAssetModal .subtitle-cue.is-current')).toHaveCount(2)
  await expect(frame.locator('#subtitleAssetModal .subtitle-evidence-window.is-current')).toHaveCount(1)
  await expect(frame.locator('#subtitleAssetModal .subtitle-position-note')).toContainText('当前命中 2 条证据')
  await frame.locator('#subtitleAssetModal [data-subtitle-step="-5"]').click()
  await expect.poll(() => previewVideo.evaluate((video) => video.currentTime)).toBe(0)
  await frame.locator('#subtitleAssetModal [data-subtitle-step="5"]').click()
  await expect.poll(() => previewVideo.evaluate((video) => video.currentTime)).toBeCloseTo(2, 1)
  await frame.locator('#subtitleAssetModal [data-subtitle-play]').click()
  await expect.poll(() => previewVideo.evaluate((video) => video.paused)).toBe(false)
  await frame.locator('#subtitleAssetModal [data-subtitle-play]').click()
  await expect.poll(() => previewVideo.evaluate((video) => video.paused)).toBe(true)
  await expect(frame.locator('#subtitleAssetModal [data-subtitle-transport-status]')).toHaveText('已暂停')
  const scrollBoundary = await frame.locator('#subtitleAssetModal').evaluate((modal) => {
    const body = modal.querySelector<HTMLElement>('.r5-modal-body')!
    const evidence = modal.querySelector<HTMLElement>('.subtitle-evidence-scroll')!
    const head = modal.querySelector<HTMLElement>('.r5-modal-head')!
    const preview = modal.querySelector<HTMLElement>('.r5-sub-preview')!
    const before = { headTop: head.getBoundingClientRect().top, previewTop: preview.getBoundingClientRect().top }
    body.scrollTop = 240
    evidence.scrollTop = 240
    return {
      bodyScrollTop: body.scrollTop,
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      evidenceScrollTop: evidence.scrollTop,
      evidenceClientHeight: evidence.clientHeight,
      evidenceScrollHeight: evidence.scrollHeight,
      beforeHeadTop: before.headTop,
      beforePreviewTop: before.previewTop,
      headTop: head.getBoundingClientRect().top,
      previewTop: preview.getBoundingClientRect().top
    }
  })
  expect(scrollBoundary.bodyScrollTop).toBe(0)
  expect(scrollBoundary.bodyScrollHeight).toBe(scrollBoundary.bodyClientHeight)
  expect(scrollBoundary.evidenceScrollTop).toBeGreaterThan(0)
  expect(scrollBoundary.evidenceScrollHeight).toBeGreaterThan(scrollBoundary.evidenceClientHeight)
  expect(scrollBoundary.headTop).toBe(scrollBoundary.beforeHeadTop)
  expect(scrollBoundary.previewTop).toBe(scrollBoundary.beforePreviewTop)
  const settingsEpisodeIds = await frame.locator('#subtitleAssetModal [data-subtitle-open-settings]').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('data-subtitle-episode-id')))
  expect(settingsEpisodeIds.length).toBeGreaterThan(0)
  expect(settingsEpisodeIds.every((episodeId) => episodeId === importedEpisodeId)).toBe(true)
  await frame.locator('#subtitleAssetModal [data-subtitle-open-settings]').click()
  await expect(frame.locator('#subtitleRecognitionSettingsModal.open')).toBeVisible()
  await expect(frame.locator('#subtitleRecognitionSettingsModal #subtitleRecognitionScope')).toBeVisible()
  await frame.getByRole('button', { name: '开始校准', exact: true }).click()
  await expect(frame.locator('#subtitleRecognitionSettingsModal.is-calibrating')).toBeVisible()
  await frame.getByRole('button', { name: '确认区域', exact: true }).click()
  await expect(frame.locator('[data-subtitle-clear-episode-override]')).toBeVisible()
  await expect(frame.locator('[data-subtitle-region-summary] .num')).not.toContainText('机器自动选择')
  await frame.getByRole('button', { name: '清除本集覆盖', exact: true }).click()
  await expect(frame.locator('[data-subtitle-clear-episode-override]')).toBeHidden()
  await expect(frame.locator('[data-subtitle-region-summary] .num')).toContainText('机器自动选择')
  await frame.locator('#subtitleRecognitionSettingsModal [data-subtitle-close-settings]').first().click()
  await expect(frame.locator('#subtitleRecognitionSettingsModal.open')).toBeVisible()
  await expect(frame.locator('#subtitleRecognitionSettingsModal.is-calibrating')).toHaveCount(0)
  await frame.locator('#subtitleRecognitionSettingsModal [data-subtitle-close-settings]').first().click()
  await expect(frame.locator('#subtitleRecognitionSettingsModal.open')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('subtitle-runtime-static-view-1440x900.png'), fullPage: false })
  await frame.locator('#subtitleAssetModal.open [data-subtitle-close-asset]').click()
  await expect(frame.locator('#subtitleAssetModal:not(.open)')).toHaveCount(1)
  await expect(frame.locator('[data-subtitle-open-pressure-sample]')).toHaveCount(0)

  page.once('dialog', (confirmation) => confirmation.accept())
  await frame.locator('[data-subtitle-delete-episode]').click()
  await expect(frame.locator('#subtitleListPanel tbody [data-subtitle-episode-id]')).not.toContainText('ASR（导入）')
  await expect(frame.locator('#subtitleListPanel tbody [data-subtitle-episode-id]')).toContainText('ASR')
  await expect(frame.locator('#subtitleListPanel tbody [data-subtitle-episode-id]')).toContainText('OCR')
  await expect(frame.locator('#subtitleListPanel tbody [data-subtitle-episode-id]')).toContainText('待校验')
  await expect(frame.locator('#toast')).toContainText('导入字幕已删除')

  await expect(frame.locator('[data-subtitle-open-pressure-sample]')).toHaveCount(0)
})
