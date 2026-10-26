import { mkdtemp, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { checkClipModuleDpi } from '../helpers/clip-module-dpi-checks.js'

for (const scale of [1, 1.25, 1.5]) test(`real clip modules operate at ${scale * 100}% DPI before packaging`, async ({}, info) => {
  const directory = await mkdtemp(join(tmpdir(), 'short-drama-module-dpi-'))
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    app = await electron.launch({ executablePath: createRequire(import.meta.url)('electron') as string, args: [resolve('out/main/index.js'), `--force-device-scale-factor=${scale}`], env: { ...process.env, SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_CHANNEL: 'e2e', SHORTDRAMA_MATERIAL_USER_DATA: directory } })
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
    expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(scale, 1)
    await checkClipModuleDpi(page, directory, info)
  } finally { await app?.close(); await rm(directory, { recursive: true, force: true }) }
})
