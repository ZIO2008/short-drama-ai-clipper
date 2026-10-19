import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import { compareStaticPixels } from '../helpers/clip-module-static-harness.js'

type Sample = { time: number; hasFrame: boolean; visible: boolean; ready: boolean; loading: boolean; initialData: string | undefined; active: string | undefined; transition: boolean }
declare global { interface Window { prototypeTransitionSamples: Sample[] } }
const require = createRequire(import.meta.url)
const captureNative = async (app: ElectronApplication): Promise<Buffer> => Buffer.from(await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0]!.webContents.capturePage()).toPNG().toString('base64')), 'base64')
const fault = async (app: ElectronApplication, delay: number, fail: boolean): Promise<void> => {
  await app.evaluate(({ ipcMain }, { delay, fail }) => {
    for (const channel of ['clips:list-candidates', 'subtitles:list']) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, async () => { await new Promise(resolve => setTimeout(resolve, delay)); if (fail) throw new Error('隔离过渡测试读取失败'); return [] })
    }
  }, { delay, fail })
}

for (const mode of ['fast', 'slow', 'error'] as const) test(`four prototype entries keep a stable handoff with ${mode} reads`, async ({}, info) => {
  const directory = await mkdtemp(join(tmpdir(), 'short-drama-navigation-transition-')), media = join(directory, '01.mp4')
  let app: ElectronApplication | undefined
  try {
    expect(spawnSync(require('ffmpeg-static') as string, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=4', '-c:v', 'libx264', media], { windowsHide: true }).status).toBe(0)
    const installed = process.env.SHORTDRAMA_PACKAGED_EXE
    app = await electron.launch({ executablePath: installed ? resolve(installed) : require('electron') as string, args: installed ? ['--packaged-smoke', '--packaged-smoke-user-data', directory] : [resolve('out/main/index.js')], env: { ...process.env, SHORTDRAMA_MATERIAL_CHANNEL: installed ? 'packaged-smoke' : 'e2e', SHORTDRAMA_MATERIAL_E2E: '1', SHORTDRAMA_MATERIAL_USER_DATA: directory } })
    const page = await app.firstWindow(); await page.bringToFront()
    await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
    expect(await page.evaluate(() => typeof document.startViewTransition)).toBe('function')
    await page.evaluate(async media => { const drama = await window.desktopApi.createDrama('页面切换隔离测试'); await window.desktopApi.importEpisodes(drama.id, [media]) }, media)
    await page.addInitScript(() => {
      window.prototypeTransitionSamples = []
      const sample = (): void => {
        const frame = document.querySelector<HTMLIFrameElement>('iframe.static-prototype-surface'), visible = frame ? getComputedStyle(frame).visibility === 'visible' : false
        const initialData = frame?.contentDocument?.body?.dataset.prototypeInitialData
        const active = frame?.contentDocument?.querySelector<HTMLElement>('.screen.active')
        window.prototypeTransitionSamples.push({ time: performance.now(), hasFrame: !!frame, visible, ready: frame?.dataset.prototypeReady === 'true', loading: visible && (initialData === 'loading' || /正在读取真实候选|正在读取真实完成批次|读取中/.test(active?.innerText ?? '')), initialData, active: active?.id, transition: document.documentElement.dataset.prototypeTransition === 'true' })
        if (window.prototypeTransitionSamples.length > 500) window.prototypeTransitionSamples.shift()
        requestAnimationFrame(sample)
      }; requestAnimationFrame(sample)
    })
    for (const target of ['subtitles', 'clip', 'clip-pool', 'clip-report'] as const) {
      await fault(app, 0, false); await page.reload()
      await page.getByRole('button', { name: '打开剧目：页面切换隔离测试' }).click()
      if (target !== 'subtitles') await page.getByRole('tab', { name: '素材生产' }).click()
      if (target === 'clip-pool' || target === 'clip-report') {
        await page.getByRole('button', { name: '进入工作区' }).click()
        await expect(page.locator('iframe')).toHaveAttribute('data-prototype-ready', 'true')
        await page.waitForTimeout(100)
      }
      await fault(app, mode === 'slow' ? 700 : 80, mode === 'error')
      await page.waitForTimeout(200)
      const before = mode === 'slow' ? await captureNative(app) : null
      if (before) await writeFile(info.outputPath(`${target}-before.png`), before)
      await page.evaluate(() => { window.prototypeTransitionSamples = [] })
      const trigger = target === 'subtitles' ? page.getByRole('tab', { name: '字幕资产' }) : target === 'clip' ? page.getByRole('button', { name: '进入工作区' }) : page.frameLocator('iframe').locator(`#screen-clip [data-r5-open="${target}"]`).first()
      if (mode === 'slow') await trigger.evaluate(node => (node as HTMLElement).click())
      else await trigger.click()
      if (before) {
        await page.waitForTimeout(50)
        const heldState = await page.evaluate(() => { const frame = document.querySelector<HTMLIFrameElement>('iframe.static-prototype-surface'); return { title: frame?.title, ready: frame?.dataset.prototypeReady, transition: document.documentElement.dataset.prototypeTransition } })
        expect(heldState.title).toBe(({ subtitles: '字幕资产', clip: '原剧切片工作区', 'clip-pool': '原剧切片候选池', 'clip-report': '原剧切片完成报告' })[target])
        expect(heldState.ready).toBe('false'); expect(heldState.transition).toBe('true')
        const held = await captureNative(app)
        await writeFile(info.outputPath(`${target}-held.png`), held)
        const pixels = await compareStaticPixels(before, held)
        await writeFile(info.outputPath(`${target}-held-comparison.json`), JSON.stringify({ kind: 'same-app-old-view-vs-native-held-snapshot', target, input: 'programmatic-click-for-mid-transition-capture', capture: 'Electron.webContents.capturePage', heldState, pixels }, null, 2))
        expect(pixels.changedRatio).toBeLessThan(0.015)
      }
      const frame = page.frameLocator('iframe')
      await expect(page.locator('iframe')).toHaveAttribute('data-prototype-ready', 'true')
      await expect(page.locator('html')).not.toHaveAttribute('data-prototype-transition', 'true')
      await page.waitForTimeout(mode === 'slow' ? 1000 : 400)
      const samples = await page.evaluate(() => window.prototypeTransitionSamples)
      await writeFile(info.outputPath(`${target}-${mode}.json`), JSON.stringify({ kind: 'real-electron-isolated-ipc-delay-fault-injection', target, mode, input: mode === 'slow' ? 'programmatic-click-for-mid-transition-capture' : 'real-pointer-click', installed: !!installed, samples }, null, 2))
      const visible = samples.filter(sample => sample.hasFrame)
      expect(visible.length).toBeGreaterThan(0)
      expect(visible.filter(sample => !sample.visible || !sample.ready)).toEqual([])
      if (mode === 'slow') expect(samples.some(sample => sample.loading)).toBe(true)
      else expect(samples.filter(sample => sample.loading)).toEqual([])
      if (mode === 'error') await expect(frame.locator(`#screen-${target}`)).toContainText('读取失败')
      expect(samples.at(-1)?.active).toBe(`screen-${target}`)
      await page.screenshot({ path: info.outputPath(`${target}-${mode}.png`) })
    }
  } finally { await app?.close(); await rm(directory, { recursive: true, force: true }) }
})
