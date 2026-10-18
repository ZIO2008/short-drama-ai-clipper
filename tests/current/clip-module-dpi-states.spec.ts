import { expect, test } from '@playwright/test'
import { openModuleStaticHarness } from '../helpers/clip-module-static-harness.js'

for (const scale of [1, 1.25, 1.5]) test(`complex clip renderer states retain inner scrolling at ${scale * 100}% DPI`, async ({}, info) => {
  const harness = await openModuleStaticHarness('clip-pool', 'runtime', scale)
  try {
    for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
      // Resize the native window without adding a browser viewport emulation layer.
      await harness.app.evaluate(({ BrowserWindow }, viewport) => { for (const window of BrowserWindow.getAllWindows()) window.setContentSize(viewport.width, viewport.height) }, viewport)
      for (const [screen, state] of [['clip-pool', 'high-volume'], ['clip-report', 'long-results'], ['clip-report', 'partial']] as const) {
        await harness.page.goto(`file:///${harness.directory.replaceAll('\\', '/')}/fixture.html?screen=${screen}&state=${state}`)
        const frame = harness.page.frameLocator('iframe')
        await expect(frame.locator('body')).toHaveAttribute('data-clip-pool-report-runtime-bound', 'true')
        expect(await frame.locator('html').evaluate(() => devicePixelRatio)).toBeCloseTo(scale, 1)
        if (screen === 'clip-pool') {
          await expect(frame.locator('#clipCandidateEpisodes > button')).toHaveCount(100)
          await expect(frame.locator('.clip-candidate-list-row')).toHaveCount(20)
          await frame.locator('[data-clip-candidate-episode="e100"]').click()
          await expect(frame.locator('#clipPoolTitle')).toHaveText('第 100 集候选')
          expect(await frame.locator('#screen-clip-pool .clip-board-episodes').evaluate(node => node.scrollTop)).toBeGreaterThan(0)
          await frame.locator('#clipCandidateRows').focus(); await harness.page.keyboard.press('End')
          await expect.poll(() => frame.locator('#clipCandidateRows').evaluate(node => node.scrollTop)).toBeGreaterThan(0)
        } else if (state === 'long-results') {
          await expect(frame.locator('.clip-report-list-row')).toHaveCount(60)
          await expect(frame.locator('.clip-report-source small').first()).toHaveAttribute('title', /长目录/)
          await frame.locator('#clipReportRows').focus(); await harness.page.keyboard.press('End')
          await expect.poll(() => frame.locator('#clipReportRows').evaluate(node => node.scrollTop)).toBeGreaterThan(0)
        } else {
          await expect(frame.locator('.clip-report-list-row')).toHaveCount(2)
          await frame.locator('#screen-clip-report [data-clip-report-filter="exception"]').click()
          await expect(frame.locator('.clip-report-list-row')).toHaveCount(1)
          await expect(frame.locator('#clipReportRows')).toContainText('源文件不可读取')
          await expect(frame.locator('.clip-task-summary > div:not(.clip-task-summary-label) > b')).toHaveText(['1', '2', '1', '1'])
        }
        expect(await frame.locator('html').evaluate(node => node.scrollWidth <= innerWidth && node.scrollTop === 0)).toBe(true)
        await harness.page.screenshot({ path: info.outputPath(`${viewport.width}-${state}.png`) })
      }
    }
  } finally { await harness.close() }
})
