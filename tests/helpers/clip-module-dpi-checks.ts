import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { expect, type Page, type TestInfo } from '@playwright/test'

export const checkClipModuleDpi = async (page: Page, directory: string, info: TestInfo): Promise<void> => {
  const source = join(directory, '01.mp4'), ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string
  expect(spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source], { windowsHide: true }).status).toBe(0)
  await page.evaluate(async source => { const drama = await window.desktopApi.createDrama('两页缩放隔离测试'); await window.desktopApi.importEpisodes(drama.id, [source]) }, source)
  await page.reload()
  await page.getByRole('button', { name: '打开剧目：两页缩放隔离测试' }).click()
  await page.getByRole('tab', { name: '素材生产' }).click()
  await page.getByRole('button', { name: '进入工作区' }).click()
  let frame = page.frameLocator('iframe[title="原剧切片工作区"]')
  await frame.locator('[data-r5-open="clip-pool"]').first().click()
  frame = page.frameLocator('iframe[title="原剧切片候选池"]')
  await expect(frame.locator('#clipCandidateRows')).toContainText('本集尚未生成真实候选')
  await expect(frame.locator('#screen-clip-pool .clip-board-episodes-head > span')).toHaveText('1 集')
  expect(await frame.locator('html').evaluate(node => node.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('installed-pool-dpi.png') })
  await frame.locator('#screen-clip-pool [data-r5-open="clip-report"]').first().click()
  frame = page.frameLocator('iframe[title="原剧切片完成报告"]')
  await expect(frame.locator('#clipReportRows')).toContainText('尚无可查看的真实完成报告')
  await expect(frame.locator('.clip-task-summary > div:not(.clip-task-summary-label) > b')).toHaveText(['0', '0', '0', '0'])
  expect(await frame.locator('html').evaluate(node => node.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('installed-report-dpi.png') })
  await frame.locator('.nav-btn[data-screen="library"]').click()
  await expect(page.getByRole('button', { name: '打开剧目：两页缩放隔离测试' })).toBeVisible()
}
