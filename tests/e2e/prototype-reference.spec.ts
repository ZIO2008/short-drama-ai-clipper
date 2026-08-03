import { chromium, expect, test, type Page, type TestInfo } from '@playwright/test'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const chromePath = resolve(process.env.LOCALAPPDATA ?? '', 'ms-playwright/chromium-1228/chrome-win64/chrome.exe')
const prototypeUrl = pathToFileURL(resolve(import.meta.dirname, '../../../../../Web-Prototype/short-drama-material-studio.html')).href

const capture = async (page: Page, testInfo: TestInfo, name: string): Promise<void> => {
  await expect(page.locator('.screen.active')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath(`prototype-${name}-1440x900.png`), fullPage: false })
}

test('captures read-only default-desktop prototype references', async ({}, testInfo) => {
  test.skip(!existsSync(chromePath), 'Local Playwright Chrome is unavailable')
  const browser = await chromium.launch({ executablePath: chromePath })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  try {
    await page.goto(prototypeUrl)
    await capture(page, testInfo, 'library')
    await page.locator('#createDrama').click()
    await expect(page.locator('#dramaModal.open')).toBeVisible()
    await expect(page.locator('#dramaModal .modal')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: testInfo.outputPath('prototype-create-dialog-1440x900.png'), fullPage: false })
    await page.locator('#closeModal').click()
    await page.locator('#notifBtn').click()
    await expect(page.locator('#noticeDrawer.open')).toBeVisible()
    await page.waitForTimeout(250)
    await expect(page.locator('#noticeDrawer')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)')
    await page.screenshot({ path: testInfo.outputPath('prototype-notification-drawer-1440x900.png'), fullPage: false })
    await page.locator('#closeDrawer').click()
    for (const [screen, name] of [['tasks', 'tasks'], ['tags', 'tags'], ['settings', 'settings']] as const) {
      await page.locator(`[data-screen="${screen}"]`).click()
      await capture(page, testInfo, name)
    }
    await page.locator('[data-screen="library"]').click()
    await page.locator('[data-open="assets"]').click()
    await capture(page, testInfo, 'assets')
    await page.locator('#screen-assets [data-drama-screen="production"]').click()
    await capture(page, testInfo, 'production')
    await page.locator('#screen-production [data-open="stitch"]').click()
    await capture(page, testInfo, 'stitch')
    await page.locator('#screen-stitch [data-open-export]').click()
    await expect(page.locator('#exportModal.open')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('prototype-export-dialog-1440x900.png'), fullPage: false })
    await page.locator('#closeExport').click()
    await page.locator('#screen-stitch [data-open-packaging]').click()
    await expect(page.locator('#packagingModal.open')).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('prototype-packaging-dialog-1440x900.png'), fullPage: false })
    await page.locator('#closePackaging').click()
    await page.locator('#screen-stitch [data-open="production"]').click()
    await page.locator('#screen-production [data-open="ai"]').click()
    await capture(page, testInfo, 'ai-remix')
    await page.locator('#screen-ai [data-open="timeline"]').click()
    await capture(page, testInfo, 'review-timeline')
    await page.locator('#screen-timeline [data-open="ai"]').click()
    await page.locator('#screen-ai [data-open="production"]').click()
    await page.locator('#screen-production [data-drama-screen="assets"]').click()
    await page.locator('#editDrama').click()
    await expect(page.locator('#dramaModal.open')).toBeVisible()
    await expect(page.locator('#dramaModal .modal')).toBeVisible()
    await expect(page.locator('#dramaModal .modal')).toHaveCSS('opacity', '1')
    await page.screenshot({ path: testInfo.outputPath('prototype-edit-dialog-1440x900.png'), fullPage: false })
    await page.locator('#closeModal').click()
    await page.locator('#screen-assets [data-drama-screen="production"]').click()
    await page.locator('#screen-production [data-open="clip"]').click()
    await capture(page, testInfo, 'clip')
    await page.locator('#screen-clip [data-open="production"]').click()
    await page.locator('#screen-production [data-drama-screen="results"]').click()
    await capture(page, testInfo, 'results')
  } finally { await browser.close() }
})
