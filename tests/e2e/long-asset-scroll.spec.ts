import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test.skip(!process.env.SHORTDRAMA_PACKAGED_EXE, 'Requires SHORTDRAMA_PACKAGED_EXE for an explicit current packaged candidate.')

for (const scale of [1, 1.25, 1.5]) test(`85 episodes reach the last row with End at ${(scale * 100).toFixed(0)}% DPI`, async () => {
  const userData = await mkdtemp(join(tmpdir(), 'short-drama-scroll-data-'))
  const mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-scroll-media-'))
  const episodePaths = await Promise.all(Array.from({ length: 85 }, async (_, index) => {
    const path = join(mediaDirectory, `${String(index + 1).padStart(2, '0')}.mp4`)
    await writeFile(path, '')
    return path
  }))
  const executablePath = resolve(process.env.SHORTDRAMA_PACKAGED_EXE!)
  const app = await electron.launch({
    executablePath,
    args: [`--force-device-scale-factor=${scale}`],
    env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'long-scroll', SHORTDRAMA_MATERIAL_USER_DATA: userData, SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: episodePaths.join('|') }
  })
  try {
    const page = await app.firstWindow()
    await page.getByRole('button', { name: '创建剧目' }).first().click()
    const dialog = page.getByRole('dialog', { name: '创建剧目' })
    await dialog.getByLabel('剧名').fill('85 集滚动验证')
    await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click()
    await expect(dialog.getByText('已选择 85 个视频文件')).toBeVisible()
    await dialog.getByRole('button', { name: '保存并整理资产' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(85, { timeout: 90_000 })
    const content = page.locator('#main-content')
    const table = page.locator('.asset-table-wrap')
    const before = await table.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }))
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight)
    await content.focus()
    await page.keyboard.press('End')
    await expect.poll(() => table.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 2)).toBe(true)
    expect(await content.evaluate((element) => element.scrollTop)).toBe(0)
    const visible = await page.locator('tbody tr').last().evaluate((row) => {
      const table = document.querySelector('.asset-table-wrap')!
      const rowRect = row.getBoundingClientRect(); const tableRect = table.getBoundingClientRect()
      return rowRect.top >= tableRect.top && rowRect.bottom <= tableRect.bottom
    })
    expect(visible).toBe(true)
  } finally {
    const pid = app.process()?.pid
    await app.close()
    if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    await Promise.all([rm(userData, { recursive: true, force: true }), rm(mediaDirectory, { recursive: true, force: true })])
  }
})
