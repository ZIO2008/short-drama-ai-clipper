import { expect, type FrameLocator, type Page, type TestInfo } from '@playwright/test'

const views = [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]
export const captureClipNumberingSurface = async (page: Page, info: TestInfo, surface: string): Promise<void> => {
  for (const viewport of views) {
    await page.setViewportSize(viewport)
    await page.screenshot({ path: info.outputPath(`number-${surface}-${viewport.width}.png`) })
  }
  await page.setViewportSize(views[0]!)
}
export const checkDefaultClipNamingViews = async (page: Page, frame: FrameLocator, info: TestInfo): Promise<void> => {
  const namingMode = frame.locator('#exportNamingMode')
  for (const viewport of views) {
    await page.setViewportSize(viewport)
    await namingMode.scrollIntoViewIfNeeded()
    await expect(namingMode).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: info.outputPath(`naming-${viewport.width}.png`) })
    await frame.locator('#saveExport').scrollIntoViewIfNeeded()
    await expect(frame.locator('#saveExport')).toBeInViewport({ ratio: 0.99 })
  }
  await page.setViewportSize(views[0]!)
}
export const checkPrefixClipNamingViews = async (page: Page, frame: FrameLocator, info: TestInfo, prefix: string): Promise<void> => {
  const naming = frame.locator('#exportNamingPrefix')
  for (const viewport of views) {
    await page.setViewportSize(viewport)
    await naming.scrollIntoViewIfNeeded()
    await expect(naming).toBeInViewport({ ratio: 1 })
    await page.screenshot({ path: info.outputPath(`naming-${viewport.width}-prefix.png`) })
    await naming.fill('长'.repeat(120))
    expect(await frame.locator('#exportNamingHint').evaluate(hint => hint.getBoundingClientRect().right <= hint.ownerDocument.defaultView!.innerWidth + 1)).toBe(true)
    await page.screenshot({ path: info.outputPath(`naming-${viewport.width}-long.png`) })
    await frame.locator('#saveExport').scrollIntoViewIfNeeded()
    await expect(frame.locator('#saveExport')).toBeInViewport({ ratio: 0.99 })
    expect(await frame.locator('#saveExport').evaluate(button => button.getBoundingClientRect().bottom <= button.ownerDocument.defaultView!.innerHeight + 1)).toBe(true)
    await page.screenshot({ path: info.outputPath(`naming-${viewport.width}-footer.png`) })
    await naming.fill(prefix)
  }
  await page.setViewportSize(views[0]!)
}
