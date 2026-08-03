import { mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test.skip(!process.env.SHORTDRAMA_PACKAGED_EXE, 'Requires SHORTDRAMA_PACKAGED_EXE for an explicit current packaged candidate.')

for (const scale of [1, 1.25, 1.5]) test(`packaged app starts at ${(scale * 100).toFixed(0)}% DPI without clipping`, async () => {
  const userData = await mkdtemp(join(tmpdir(), 'short-drama-real-dpi-'))
  const executablePath = resolve(process.env.SHORTDRAMA_PACKAGED_EXE!)
  const app = await electron.launch({
    executablePath,
    args: [`--force-device-scale-factor=${scale}`],
    env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'real-dpi', SHORTDRAMA_MATERIAL_USER_DATA: userData }
  })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
    const evidence = await page.evaluate(() => ({ devicePixelRatio: window.devicePixelRatio, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
    console.log('PACKAGED_REAL_DPI', evidence)
    expect(evidence.devicePixelRatio).toBeCloseTo(scale, 1)
    expect(evidence.scrollWidth).toBeLessThanOrEqual(evidence.innerWidth)
  } finally {
    const pid = app.process()?.pid
    await app.close()
    if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    await rm(userData, { recursive: true, force: true })
  }
})
