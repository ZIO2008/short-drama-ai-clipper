import { expect, type FrameLocator, type Page } from '@playwright/test'

export const checkClipModuleHeader = async (page: Page, frame: FrameLocator): Promise<void> => {
  const snapshot = await page.evaluate(async () => window.desktopApi.getNotifications())
  const badge = frame.locator('#notifBtn .count')
  if (snapshot.unreadCount === 0) await expect(badge).toBeHidden()
  else await expect(badge).toHaveText(snapshot.unreadCount > 99 ? '99+' : String(snapshot.unreadCount))
  await frame.locator('#notifBtn').click()
  await expect(page.getByRole('dialog', { name: '通知中心' })).toBeVisible()
  await page.getByRole('button', { name: '关闭通知中心' }).click()
  await expect(frame.locator('#notifBtn')).toBeFocused()
  await frame.locator('#screen-clip-pool .screen-head [data-r5-open="production"]').click()
  await expect(page.getByRole('button', { name: '进入工作区' })).toBeVisible()
  await page.getByRole('button', { name: '进入工作区' }).click()
  const workspace = page.frameLocator('iframe[title="原剧切片工作区"]')
  await expect(workspace.locator('#screen-clip')).toBeVisible()
  await workspace.locator('[data-r5-open="clip-pool"]').first().click()
  await expect(frame.locator('#screen-clip-pool')).toBeVisible()
}
