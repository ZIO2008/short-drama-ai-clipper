import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { activateReference, compareStaticPixels, openModuleStaticHarness, staticModuleDesign, type ModuleState } from '../helpers/clip-module-static-harness.js'

for (const state of ['default', 'exception'] satisfies ModuleState[]) {
  test(`V49 report static ${state} keeps task summary, columns and complete shell`, async ({}, info) => {
    const harness = await openModuleStaticHarness('clip-report')
    try {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
        await harness.page.setViewportSize(viewport); await harness.reference.setViewportSize(viewport)
        await harness.page.goto(`file:///${harness.directory.replaceAll('\\', '/')}/fixture.html?screen=clip-report&state=${state}`)
        await harness.reference.reload(); await activateReference(harness.reference, 'clip-report', state)
        const frame = harness.page.frameLocator('iframe')
        await expect(frame.locator('body')).toHaveAttribute('data-static-prototype-fixture', 'v49-screen-clip-report')
        await expect(frame.locator('.app .sidebar')).toHaveCount(1)
        await expect(frame.locator('.clip-report-columns')).toHaveText(/候选.*源片区间.*时长.*状态.*操作/)
        await expect(frame.locator('.clip-report-list-row')).toHaveCount(state === 'default' ? 5 : 1)
        await expect(frame.locator('#static-prototype-clip-isolation-layout')).toHaveCount(0)
        const preview = await harness.reference.screenshot({ path: info.outputPath(`${viewport.width}-prototype.png`), animations: 'disabled' })
        const actual = await harness.page.screenshot({ path: info.outputPath(`${viewport.width}-electron-fixture.png`), animations: 'disabled' })
        const pixels = await compareStaticPixels(preview, actual)
        const metadataPath = info.outputPath(`${viewport.width}-comparison.json`)
        await writeFile(metadataPath, JSON.stringify({ kind: 'static-fixture', state, viewport, design: staticModuleDesign, pixels, command: 'playwright current V49 static visual', environment: { node: process.version, os: process.platform }, createdAt: new Date().toISOString() }, null, 2))
        await info.attach('comparison-' + viewport.width, { path: metadataPath, contentType: 'application/json' })
        expect(pixels.changedRatio).toBeLessThan(0.001); expect(pixels.meanDelta).toBeLessThan(0.1)
      }
    } finally { await harness.close() }
  })
}
