import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, join, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../..')
const esbuild = createRequire(require.resolve('electron-vite'))('esbuild') as typeof import('esbuild')
const contract = JSON.parse(readFileSync(join(root, 'docs/design-contract-v49.json'), 'utf8')) as { authority: { entry: string; sha256: string } }
const pointer = JSON.parse(readFileSync(join(root, 'docs/current-design-baseline.json'), 'utf8')) as { sha256: string }
const sourcePath = resolve(root, contract.authority.entry)
export const staticModuleDesign = { entry: contract.authority.entry, sha256: createHash('sha256').update(readFileSync(sourcePath)).digest('hex').toUpperCase() }
if (staticModuleDesign.sha256 !== contract.authority.sha256 || staticModuleDesign.sha256 !== pointer.sha256) throw new Error('Current design source identity mismatch')
const removeHarnessDirectory = async (directory: string): Promise<void> => {
  const absolute = resolve(directory)
  if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('short-drama-v49-module-fixture-')) throw new Error('Unsafe fixture cleanup path')
  await rm(absolute, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
}
type ModuleScreen = 'clip-pool' | 'clip-report'
export type ModuleState = 'default' | 'filtered' | 'generating' | 'missing' | 'exception'

export const openModuleStaticHarness = async (screen: ModuleScreen, entry: 'static' | 'runtime' = 'static', scale = 1): Promise<{ app: ElectronApplication; page: Page; reference: Page; directory: string; close: () => Promise<void> }> => {
  const directory = await mkdtemp(join(tmpdir(), 'short-drama-v49-module-fixture-'))
  let runningApp: ElectronApplication | undefined
  try {
    await esbuild.build({ entryPoints: [join(root, `tests/fixtures/clip-module-${entry}.tsx`)], bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, outfile: join(directory, 'fixture.js'), plugins: [{ name: 'source-raw', setup(build) {
      build.onResolve({ filter: /\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'source-raw' }))
      build.onLoad({ filter: /.*/, namespace: 'source-raw' }, async args => ({ contents: `export default ${JSON.stringify(await readFile(args.path, 'utf8'))}`, loader: 'js' }))
    } }] })
    await writeFile(join(directory, 'fixture.html'), '<!doctype html><html><head><meta charset="utf-8"><style>html,body,#root{width:100%;height:100%;margin:0;overflow:hidden}iframe{display:block;width:100%;height:100%;border:0}</style></head><body><div id="root"></div><script src="fixture.js"></script></body></html>')
    await writeFile(join(directory, 'reference.html'), await readFile(sourcePath))
    await writeFile(join(directory, 'main.cjs'), `const{app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(directory, 'data'))});app.whenReady().then(()=>{for(const file of ['fixture.html','reference.html']){const win=new BrowserWindow({show:false,width:1440,height:900,useContentSize:true,webPreferences:{offscreen:{deviceScaleFactor:${scale}},backgroundThrottling:false}});win.webContents.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,done)=>done({cancel:true}));win.loadFile(require('node:path').join(__dirname,file),{query:{screen:${JSON.stringify(screen)}}})}});app.on('window-all-closed',()=>app.quit())`)
    const app = await electron.launch({ executablePath: require('electron') as string, args: [join(directory, 'main.cjs'), `--force-device-scale-factor=${scale}`], env: { ...process.env } })
    runningApp = app
    await app.firstWindow()
    if (app.windows().length < 2) await app.waitForEvent('window')
    await Promise.all(app.windows().map(window => window.waitForLoadState('load')))
    const page = app.windows().find(window => window.url().includes('/fixture.html'))
    const reference = app.windows().find(window => window.url().includes('/reference.html'))
    if (!page || !reference) throw new Error('Independent fixture or prototype preview window missing')
    return { app, page, reference, directory, close: async () => { try { await app.close() } finally { await removeHarnessDirectory(directory) } } }
  } catch (error) { await runningApp?.close().catch(() => undefined); await removeHarnessDirectory(directory); throw error }
}

// Independent preview activates the original final DOM; it never imports the application helper.
export const activateReference = async (page: Page, screen: ModuleScreen, state: ModuleState): Promise<void> => {
  await page.waitForSelector('#clip-r5-style', { state: 'attached' })
  await page.evaluate(({ screen, state }) => {
    document.querySelectorAll<HTMLElement>('.screen').forEach(node => node.classList.toggle('active', node.id === `screen-${screen}`))
    const target = document.getElementById(`screen-${screen}`)!
    const selector = state === 'generating' ? '[data-clip-candidate-episode="3"]' : state === 'missing' ? `[data-${screen === 'clip-pool' ? 'clip-candidate' : 'clip-report'}-episode="6"]` : state === 'filtered' ? '[data-clip-filter="exported"]' : state === 'exception' ? '[data-clip-report-filter="exception"]' : null
    if (selector) target.querySelector<HTMLButtonElement>(selector)!.click()
  }, { screen, state })
}

export const compareStaticPixels = async (reference: Buffer, actual: Buffer): Promise<{ changedRatio: number; meanDelta: number }> => {
  const first = await loadImage(reference), second = await loadImage(actual)
  if (first.width !== second.width || first.height !== second.height) throw new Error('Viewport mismatch')
  const pixels = [first, second].map(image => { const canvas = createCanvas(image.width, image.height); const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0); return ctx.getImageData(0, 0, image.width, image.height).data })
  let changed = 0, delta = 0
  for (let offset = 0; offset < pixels[0]!.length; offset += 4) { let total = 0; for (let channel = 0; channel < 3; channel++) total += Math.abs(pixels[0]![offset + channel]! - pixels[1]![offset + channel]!); if (total > 12) changed++; delta += total }
  return { changedRatio: changed / (first.width * first.height), meanDelta: delta / (first.width * first.height * 3) }
}
