// Current packaged-candidate regression.
import { mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { checkClipModuleDpi } from '../helpers/clip-module-dpi-checks.js'

test.skip(!process.env.SHORTDRAMA_PACKAGED_EXE, 'Requires SHORTDRAMA_PACKAGED_EXE for an explicit current packaged candidate.')

for (const scale of [1, 1.25, 1.5]) test(`packaged app starts at ${(scale * 100).toFixed(0)}% DPI without clipping`, async ({}, info) => {
  const userData = await mkdtemp(join(tmpdir(), 'short-drama-real-dpi-'))
  const executablePath = resolve(process.env.SHORTDRAMA_PACKAGED_EXE!)
  const app = await electron.launch({
    executablePath,
    args: ['--packaged-smoke', '--packaged-smoke-user-data', userData, `--force-device-scale-factor=${scale}`],
    env: { ...process.env, SHORTDRAMA_MATERIAL_CHANNEL: 'packaged-smoke' }
  })
  try {
    expect(await app.evaluate(({ app: runtime }) => runtime.isPackaged)).toBe(true)
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
    const evidence = await page.evaluate(() => ({ devicePixelRatio: window.devicePixelRatio, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }))
    console.log('PACKAGED_REAL_DPI', evidence)
    expect(evidence.devicePixelRatio).toBeCloseTo(scale, 1)
    expect(evidence.scrollWidth).toBeLessThanOrEqual(evidence.innerWidth)
    await checkClipModuleDpi(page, userData, info)
  } finally {
    const pid = app.process()?.pid
    await app.close()
    if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    await rm(userData, { recursive: true, force: true })
  }
})
