import { writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { createPoolScenario, poolEmptyCopy, poolRuntimeStates } from '../fixtures/clip-module-scenarios.js'
import { activateReference, compareStaticPixels, openModuleStaticHarness, staticModuleDesign } from '../helpers/clip-module-static-harness.js'
import { renderPoolReference } from '../helpers/clip-pool-reference.js'

for (const state of poolRuntimeStates) {
  test(`V49 real pool renderer ${state} stays on the complete prototype`, async ({}, info) => {
    const scene = createPoolScenario(state), harness = await openModuleStaticHarness('clip-pool', 'runtime')
    try {
      for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
        await harness.page.setViewportSize(viewport); await harness.reference.setViewportSize(viewport)
        await harness.page.goto(`file:///${harness.directory.replaceAll('\\', '/')}/fixture.html?screen=clip-pool&state=${state}`)
        await harness.reference.reload(); await activateReference(harness.reference, 'clip-pool', 'default')
        const frame = harness.page.frameLocator('iframe')
        await expect(frame.locator('body')).toHaveAttribute('data-static-prototype-runtime', 'v49-screen-clip-pool')
        await expect(frame.locator('body')).toHaveAttribute('data-clip-pool-report-runtime-bound', 'true')
        if (state === 'exported') await frame.locator('[data-clip-filter="exported"]').click()
        if (state === 'search') await frame.locator('#clipCandidateSearch').fill('不存在的候选')
        if (state === 'multi') {
          await frame.locator('[data-clip-export-candidate="e1-c01"]').check()
          await frame.locator('[data-clip-candidate-episode="e2"]').click()
          await frame.locator('[data-clip-export-candidate="e2-c01"]').check()
          await frame.locator('[data-clip-candidate-episode="e1"]').click()
        }
        const empty = poolEmptyCopy[state]
        const expectedRows = empty ? 0 : state === 'high-volume' ? 20 : state === 'exported' ? 1 : 4
        await expect(frame.locator('#clipCandidateRows .clip-candidate-list-row')).toHaveCount(expectedRows)
        if (empty) await expect(frame.locator('#clipCandidateRows .clip-board-empty')).toContainText(empty[0])
        await expect(frame.locator('#screen-clip-pool .clip-board-episodes-head > span')).toHaveText(`${scene.episodes.length} 集`)
        await expect(frame.locator('script')).toHaveCount(0)
        await expect(frame.locator('#screen-clip-pool .screen-head .meta')).toContainText(scene.dramaName)
        await renderPoolReference(harness.reference, scene)
        await harness.page.mouse.move(0, 0); await harness.reference.mouse.move(0, 0)
        const preview = await harness.reference.screenshot({ path: info.outputPath(`${viewport.width}-prototype.png`), animations: 'disabled' })
        const actual = await harness.page.screenshot({ path: info.outputPath(`${viewport.width}-renderer.png`), animations: 'disabled' })
        const pixels = await compareStaticPixels(preview, actual)
        await writeFile(info.outputPath(`${viewport.width}-comparison.json`), JSON.stringify({ kind: 'real-renderer-mocked-ipc', state, viewport, design: staticModuleDesign, pixels, source: 'independent-original-prototype-nodes-with-approved-data-slots', externalModelCalls: 0 }, null, 2))
        expect(pixels.changedRatio).toBeLessThan(0.002); expect(pixels.meanDelta).toBeLessThan(0.2)
        expect(await frame.locator('html').evaluate(node => node.scrollWidth <= innerWidth)).toBe(true)
      }
      const frame = harness.page.frameLocator('iframe')
      if (state === 'default') {
        await frame.locator('[data-clip-export-open]').first().click()
        await expect(frame.locator('#saveExport')).toBeDisabled()
        await frame.locator('#closeExport').click()
        await frame.locator('#clipCandidateSearch').fill('切片03')
        await expect(frame.locator('.clip-candidate-list-row')).toHaveCount(1)
        await expect(frame.locator('[data-clip-delete-candidate="e1-c03"]')).toBeDisabled()
        await frame.locator('#clipCandidateSearch').fill('')
        await frame.locator('[data-clip-open-candidate="e1-c01"]').click()
        await expect.poll(() => harness.page.evaluate(() => (window as unknown as { fixtureProbe: { openedIds: string[] } }).fixtureProbe.openedIds)).toEqual(['e1-c01'])
        await frame.locator('body').evaluate(body => { body.ownerDocument.defaultView!.confirm = () => true })
        await frame.locator('[data-clip-delete-candidate="e1-c02"]').click()
        await expect(frame.locator('.clip-candidate-list-row')).toHaveCount(3)
        await expect(frame.locator('#screen-clip-pool .clip-inspector-stat b')).toHaveText(['4', '2', '2', '3'])
        await expect.poll(() => harness.page.evaluate(() => (window as unknown as { fixtureProbe: { deletedIds: string[] } }).fixtureProbe.deletedIds)).toEqual(['e1-c02'])
      }
      if (state === 'multi') {
        await frame.locator('[data-clip-export-open]').first().click(); await frame.locator('#saveExport').click()
        await expect.poll(() => harness.page.evaluate(() => (window as unknown as { fixtureProbe: { preflightIds: string[] } }).fixtureProbe.preflightIds)).toEqual(['e1-c01', 'e2-c01'])
      }
      if (state === 'high-volume') {
        await frame.locator('#clipCandidateRows').focus(); await harness.page.keyboard.press('End')
        await expect.poll(() => frame.locator('#clipCandidateRows').evaluate(node => node.scrollTop)).toBeGreaterThan(0)
        await harness.page.keyboard.press('Home')
        await expect.poll(() => frame.locator('#clipCandidateRows').evaluate(node => node.scrollTop)).toBe(0)
        await harness.page.keyboard.press('PageDown')
        await expect.poll(() => frame.locator('#clipCandidateRows').evaluate(node => node.scrollTop)).toBeGreaterThan(0)
        await harness.page.keyboard.press('PageUp')
        await expect.poll(() => frame.locator('#clipCandidateRows').evaluate(node => node.scrollTop)).toBe(0)
        await frame.locator('[data-clip-window="next"]').click()
        await expect(frame.locator('#clipPoolWindowMeta')).toContainText('2 / 3')
        await expect(frame.locator('.clip-candidate-list-row')).toHaveCount(20)
      }
    } finally { await harness.close() }
  })
}
