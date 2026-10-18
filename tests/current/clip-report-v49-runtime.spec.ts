import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createReportScenario, reportRuntimeStates } from '../fixtures/clip-report-scenarios.js'
import { renderReportReference } from '../helpers/clip-report-reference.js'
import { activateReference, compareStaticPixels, openModuleStaticHarness, staticModuleDesign } from '../helpers/clip-module-static-harness.js'

for (const state of reportRuntimeStates) {
  test(`V49 real report renderer ${state} preserves complete report structure and facts`, async ({}, info) => {
    const scene = createReportScenario(state), harness = await openModuleStaticHarness('clip-report', 'runtime')
    try {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
        await harness.page.setViewportSize(viewport); await harness.reference.setViewportSize(viewport)
        await harness.page.goto(`file:///${harness.directory.replaceAll('\\', '/')}/fixture.html?screen=clip-report&state=${state}`)
        await harness.reference.reload(); await activateReference(harness.reference, 'clip-report', 'default')
        const frame = harness.page.frameLocator('iframe'), blocked = ['loading', 'error', 'no-batch'].includes(state)
        await expect(frame.locator('body')).toHaveAttribute('data-clip-pool-report-runtime-bound', 'true')
        await expect(frame.locator('#clipReportRows .clip-report-list-row')).toHaveCount(blocked ? 0 : state === 'long-results' ? 60 : state === 'cancelled' ? 3 : 2)
        if (!blocked) {
          await expect(frame.locator('.clip-report-columns')).toHaveText(/候选.*源片区间.*时长.*状态.*操作/)
          await expect(frame.locator('.clip-report-source').first()).toContainText('1.0 — 9.0')
          await expect(frame.locator('#screen-clip-report .clip-board-episodes-head > span')).toHaveText(state === 'legacy' ? '归属待核' : '1 集')
        }
        await renderReportReference(harness.reference, scene)
        await harness.page.mouse.move(0, 0); await harness.reference.mouse.move(0, 0)
        const reference = await harness.reference.screenshot({ path: info.outputPath(`${viewport.width}-prototype.png`), animations: 'disabled' })
        const actual = await harness.page.screenshot({ path: info.outputPath(`${viewport.width}-renderer.png`), animations: 'disabled' })
        const pixels = await compareStaticPixels(reference, actual)
        await writeFile(info.outputPath(`${viewport.width}-comparison.json`), JSON.stringify({ kind: 'real-renderer-mocked-ipc', state, viewport, design: staticModuleDesign, pixels, source: 'independent-original-prototype-node-templates', externalCalls: 0 }, null, 2))
        expect(pixels.changedRatio).toBeLessThan(0.002); expect(pixels.meanDelta).toBeLessThan(0.2)
        expect(await frame.locator('html').evaluate(node => node.scrollWidth <= innerWidth)).toBe(true)
      }
      const frame = harness.page.frameLocator('iframe')
      if (state === 'partial') {
        const before = await frame.locator('.clip-task-summary > div:not(.clip-task-summary-label) > b').allTextContents()
        await frame.locator('[data-clip-report-filter="exception"]').click()
        await expect(frame.locator('.clip-report-list-row')).toHaveCount(1)
        await expect(frame.locator('.clip-task-summary > div:not(.clip-task-summary-label) > b')).toHaveText(before)
        await frame.locator('#clipReportRows [data-clip-open-candidate]').click()
        expect(await harness.page.evaluate(() => (window as unknown as { fixtureProbe: { openedIds: string[] } }).fixtureProbe.openedIds)).toEqual(['report-c2'])
      }
      if (state === 'deleted') {
        await frame.locator('[data-clip-open-material]').first().click()
        expect(await harness.page.evaluate(() => (window as unknown as { fixtureProbe: { openedPaths: string[] } }).fixtureProbe.openedPaths)).toEqual([scene.materials[0]!.path])
      }
      if (state === 'legacy') {
        await frame.locator('[data-clip-report-episode="__clip_report_unknown__"]').click()
        await expect(frame.locator('.clip-report-list-row')).toHaveCount(1)
        await expect(frame.locator('#clipReportRows')).toContainText('历史时码未记录')
        await expect(frame.locator('#clipReportRows')).toContainText('历史输出记录不可用')
        await expect(frame.locator('.clip-report-list-row button')).toBeDisabled()
        await expect(frame.locator('.clip-task-summary > div:not(.clip-task-summary-label) > b')).toHaveText(['—', '3', '3', '0'])
      }
      if (state === 'long-results') {
        await frame.locator('#clipReportRows').focus(); await harness.page.keyboard.press('End')
        await expect.poll(() => frame.locator('#clipReportRows').evaluate(node => node.scrollTop)).toBeGreaterThan(0)
        await harness.page.keyboard.press('Home')
        await expect.poll(() => frame.locator('#clipReportRows').evaluate(node => node.scrollTop)).toBe(0)
        expect(await frame.locator('.clip-report-source small').first().getAttribute('title')).toBe(scene.materials[0]!.path)
      }
    } finally { await harness.close() }
  })
}
