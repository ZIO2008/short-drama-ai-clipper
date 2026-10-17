# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: current\packaged-business-smoke.spec.ts >> packaged semantic selection repairs an unfinished proposal once without subtitle recovery
- Location: tests\current\packaged-business-smoke.spec.ts:12:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  1   | import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
  2   | import { spawnSync } from 'node:child_process'
  3   | import { createRequire } from 'node:module'
  4   | import { createServer } from 'node:http'
  5   | import { once } from 'node:events'
  6   | import { tmpdir } from 'node:os'
  7   | import { join, resolve } from 'node:path'
  8   | import { _electron as electron, expect, test } from '@playwright/test'
  9   | 
  10  | test.skip(!process.env.SHORTDRAMA_PACKAGED_EXE, 'Requires SHORTDRAMA_PACKAGED_EXE for an explicit packaged candidate.')
  11  | 
  12  | test('packaged semantic selection repairs an unfinished proposal once without subtitle recovery', async () => {
  13  |   test.setTimeout(120_000)
  14  |   let calls = 0
  15  |   let mode: 'repair' | 'reject' = 'repair'
  16  |   const server = createServer((request, response) => {
  17  |     let body = ''
  18  |     request.on('data', (chunk) => { body += chunk })
  19  |     request.on('end', () => {
  20  |       try {
  21  |         calls += 1
  22  |         const payload = JSON.parse(body) as { messages: Array<{ content: string }> }
  23  |         const input = JSON.parse(payload.messages[0]!.content) as { proposals: Array<{ windowId: string; coreEvidenceIds: string[] }> }
  24  |         const closed = mode === 'repair' && calls === 2
  25  |         const window = input.proposals[closed ? 1 : 0]!
  26  |         const ids = window.coreEvidenceIds
  27  |         const selection = { proposalId: window.windowId, startEvidenceId: ids[0], endEvidenceId: ids.at(-1), evidenceIds: ids, beat: closed ? 'climax' : 'escalation', purpose: 'hook', context: 'standalone', narrative: { state: closed ? 'completion' : 'escalation', characters: [], relationship: 'fixture', conflict: 'fixture', continuity: 'continuous' }, seamStatus: 'closed' }
  28  |         response.setHeader('Content-Type', 'application/json')
  29  |         const result = JSON.stringify({ choices: [{ message: { content: JSON.stringify({ selections: [selection] }) } }] })
  30  |         if (mode === 'reject') setTimeout(() => response.end(result), 3000)
  31  |         else response.end(result)
  32  |       } catch { response.statusCode = 500; response.end('fixture request invalid') }
  33  |     })
  34  |   })
  35  |   const root = await mkdtemp(join(tmpdir(), 'short-drama-semantic-repair-'))
  36  |   const source = join(root, '01.mp4')
  37  |   const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string
  38  |   expect(spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=128x72:r=2:d=90', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source], { windowsHide: true }).status).toBe(0)
  39  |   let app: Awaited<ReturnType<typeof electron.launch>> | undefined
  40  |   try {
  41  |     server.listen(0, '127.0.0.1'); await once(server, 'listening')
  42  |     const address = server.address()
  43  |     if (!address || typeof address === 'string') throw new Error('Local fixture did not listen')
  44  |     app = await electron.launch({ executablePath: resolve(process.env.SHORTDRAMA_PACKAGED_EXE!), args: ['--packaged-smoke', '--packaged-smoke-user-data', root], env: { ...process.env, SHORTDRAMA_MATERIAL_CHANNEL: 'packaged-smoke' } })
  45  |     const page = await app.firstWindow()
  46  |     await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
  47  |     const prepared = await page.evaluate(async ({ path, endpoint }) => {
  48  |       const drama = await window.desktopApi.createDrama('自动重选候选')
  49  |       await window.desktopApi.saveProviderProfile({ capability: 'text-analysis', region: 'local', provider: 'Local semantic fixture', endpoint, model: 'fixture', secretRef: null, timeoutMs: 10000 })
  50  |       await window.desktopApi.importEpisodes(drama.id, [path])
  51  |       const episode = (await window.desktopApi.getDrama(drama.id)).episodes[0]!
  52  |       await window.desktopApi.createSubtitleEvidenceTrack({ dramaId: drama.id, episodeId: episode.id, sourceKind: 'ocr', label: '局部OCR', cues: [0, 5, 60, 65].map((startSeconds, index) => ({ index: index + 1, startSeconds, endSeconds: startSeconds + 3, text: `句子${index}` })) })
  53  |       return { dramaId: drama.id, episodeId: episode.id }
  54  |     }, { path: source, endpoint: `http://127.0.0.1:${address.port}` })
  55  |     const generate = (allowRepeat: boolean) => page.evaluate(async ({ dramaId, episodeId, repeat }) => window.desktopApi.generateClipCandidates(dramaId, { episodeIds: [episodeId], candidatesPerEpisode: 1, targetDurationSeconds: 8, maxOverlapRatio: 0.08, allowRepeat: repeat }), { ...prepared, repeat: allowRepeat })
  56  |     const first = await generate(false)
  57  |     await expect.poll(async () => page.evaluate(async (id) => (await window.desktopApi.listTasks()).find(t => t.id === id)?.status, first.taskId), { timeout: 60000 }).toBe('reviewing')
  58  |     expect(calls).toBe(2)
  59  |     const candidates = await page.evaluate(async id => window.desktopApi.listClipCandidates(id), prepared.dramaId)
  60  |     expect(candidates).toHaveLength(1)
  61  |     expect(candidates[0]!.startSeconds).toBeGreaterThanOrEqual(60)
  62  |     await page.getByRole('button', { name: '剧目库', exact: true }).click()
  63  |     await page.getByRole('button', { name: '打开剧目：自动重选候选' }).click()
  64  |     await page.getByRole('tab', { name: '素材生产' }).click()
  65  |     await page.getByRole('button', { name: '进入工作区' }).click()
  66  |     const frame = page.frameLocator('iframe[title="原剧切片工作区"]')
  67  |     await expect(frame.locator('.r5-candidate-id')).toContainText(candidates[0]!.id.slice(0, 8))
  68  |     calls = 0; mode = 'reject'
  69  |     await frame.locator('[data-r5-open="generate"]').click()
  70  |     await expect(frame.locator('#screen-clip .r5-inspector .r5-note')).toContainText('正在生成候选')
  71  |     const samples = await frame.locator('#screen-clip').evaluate(async (screen) => {
  72  |       const samples: string[] = []
  73  |       for (let index = 0; index < 20; index += 1) {
  74  |         if (index % 4 === 0) screen.ownerDocument.dispatchEvent(new Event('shortdrama:refresh-original-clip-workspace'))
  75  |         samples.push(screen.querySelector('.r5-candidate-id')?.textContent ?? '')
  76  |         await new Promise<void>((done) => setTimeout(done, 100))
  77  |       }
  78  |       return samples
  79  |     })
> 80  |     expect(samples.every(text => text.includes(candidates[0]!.id.slice(0, 8)) && !text.includes('暂无可编辑候选'))).toBe(true)
      |                                                                                                              ^ Error: expect(received).toBe(expected) // Object.is equality
  81  |     const second = await page.evaluate(async (firstId) => (await window.desktopApi.listTasks()).find(t => t.type === 'original_clip' && t.id !== firstId), first.taskId)
  82  |     expect(second).toBeTruthy()
  83  |     await expect.poll(async () => page.evaluate(async (id) => (await window.desktopApi.listTasks()).find(t => t.id === id)?.status, second!.id), { timeout: 60000 }).toBe('failed')
  84  |     expect(calls).toBe(2)
  85  |     const reason = await page.evaluate(async (id) => (await window.desktopApi.listTasks()).find(t => t.id === id)?.checkpointReason, second!.id)
  86  |     expect(reason).toContain('未收束')
  87  |     expect(reason).not.toContain('字幕资产')
  88  |     expect(await page.evaluate(async id => (await window.desktopApi.listClipCandidates(id)).length, prepared.dramaId)).toBe(1)
  89  |     await expect(frame.locator('.r5-candidate-id')).toContainText(candidates[0]!.id.slice(0, 8))
  90  |     await expect(frame.locator('#screen-clip')).toContainText('未收束')
  91  |     await expect(frame.locator('[data-clip-recovery="subtitles"]')).toHaveCount(0)
  92  |   } finally {
  93  |     const pid = app?.process()?.pid
  94  |     await Promise.race([app?.close().catch(() => undefined), new Promise<void>((done) => setTimeout(done, 5000))])
  95  |     if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  96  |     server.closeAllConnections(); await new Promise<void>(resolveClose => server.close(() => resolveClose()))
  97  |     await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
  98  |   }
  99  | })
  100 | 
  101 | test('packaged preflight automatically accepts local OCR islands without changing subtitles', async () => {
  102 |   const root = await mkdtemp(join(tmpdir(), 'short-drama-local-windows-'))
  103 |   const source = join(root, '01.mp4')
  104 |   const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string
  105 |   expect(spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=128x72:r=2:d=90', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source], { windowsHide: true }).status).toBe(0)
  106 |   const app = await electron.launch({ executablePath: resolve(process.env.SHORTDRAMA_PACKAGED_EXE!), args: ['--packaged-smoke', '--packaged-smoke-user-data', root], env: { ...process.env, SHORTDRAMA_MATERIAL_CHANNEL: 'packaged-smoke' } })
  107 |   try {
  108 |     const page = await app.firstWindow()
  109 |     await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
  110 |     const result = await page.evaluate(async (path) => {
  111 |       const drama = await window.desktopApi.createDrama('局部字幕预检')
  112 |       // Preflight checks capability configuration before inspecting subtitles.
  113 |       // A local profile requires no secret and preflight must not call its endpoint.
  114 |       await window.desktopApi.saveProviderProfile({ capability: 'text-analysis', region: 'local', provider: 'Isolated preflight fixture', endpoint: 'http://127.0.0.1:1', model: 'fixture', secretRef: null, timeoutMs: 1000 })
  115 |       await window.desktopApi.importEpisodes(drama.id, [path])
  116 |       const episode = (await window.desktopApi.getDrama(drama.id)).episodes[0]!
  117 |       const track = await window.desktopApi.createSubtitleEvidenceTrack({ dramaId: drama.id, episodeId: episode.id, sourceKind: 'ocr', label: '局部OCR', cues: [0, 5, 60, 65].map((startSeconds, index) => ({ index: index + 1, startSeconds, endSeconds: startSeconds + 3, text: `句子${index}` })) })
  118 |       const before = await window.desktopApi.listSubtitleEvidenceCues(track.id)
  119 |       const preflight = await window.desktopApi.preflightClipGeneration(drama.id, { episodeIds: [episode.id], candidatesPerEpisode: 2, targetDurationSeconds: 8, maxOverlapRatio: 0.08, allowRepeat: false })
  120 |       const after = await window.desktopApi.listSubtitleEvidenceCues(track.id)
  121 |       return { estimated: preflight.estimatedCandidates, skipped: preflight.skipped.length, unchanged: JSON.stringify(before) === JSON.stringify(after) }
  122 |     }, source)
  123 |     expect(result).toEqual({ estimated: 2, skipped: 0, unchanged: true })
  124 |   } finally {
  125 |     const pid = app.process()?.pid
  126 |     await app.close().catch(() => undefined)
  127 |     if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  128 |     await rm(root, { recursive: true, force: true })
  129 |   }
  130 | })
  131 | 
  132 | test('packaged clip subtitle preflight failure returns to real global pages instead of prototype demos', async () => {
  133 |   test.setTimeout(120_000)
  134 |   const root = await mkdtemp(join(tmpdir(), 'short-drama-packaged-navigation-'))
  135 |   const source = join(root, '01.mp4')
  136 |   const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string
  137 |   const fixture = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source], { windowsHide: true })
  138 |   expect(fixture.status).toBe(0)
  139 |   await mkdir(join(root, 'data'))
  140 |   const app = await electron.launch({ timeout: 30_000, executablePath: resolve(process.env.SHORTDRAMA_PACKAGED_EXE!), args: ['--packaged-smoke', '--packaged-smoke-user-data', join(root, 'data')], env: { ...process.env, SHORTDRAMA_MATERIAL_CHANNEL: 'packaged-smoke' } })
  141 |   try {
  142 |     const page = await app.firstWindow()
  143 |     await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
  144 |     await page.evaluate(async (sourcePath) => {
  145 |       const drama = await window.desktopApi.createDrama('导航回归真实剧目')
  146 |       await window.desktopApi.importEpisodes(drama.id, [sourcePath])
  147 |     }, source)
  148 |     await page.reload()
  149 |     for (const target of ['library', 'tasks', 'tags', 'settings']) {
  150 |       if (target !== 'library') await page.getByRole('button', { name: '剧目库', exact: true }).click()
  151 |       await page.getByRole('button', { name: '打开剧目：导航回归真实剧目' }).click()
  152 |       await page.getByRole('tab', { name: '素材生产' }).click()
  153 |       await page.getByRole('button', { name: '进入工作区' }).click()
  154 |       const frame = page.frameLocator('iframe[title="原剧切片工作区"]')
  155 |       await expect(frame.locator('[data-r5-open="generate"]')).toBeEnabled()
  156 |       await frame.locator('[data-r5-open="generate"]').click()
  157 |       await expect(frame.locator('#screen-clip')).toContainText(/没有.*字幕|字幕.*锚点/)
  158 |       await frame.locator(`.nav-btn[data-screen="${target}"]`).click()
  159 |       await expect(page.locator('iframe[title="原剧切片工作区"]')).toHaveCount(0)
  160 |       await expect(page).toHaveURL(new RegExp(`#/${target}$`))
  161 |       await expect(page.locator('body')).not.toContainText('春江未眠')
  162 |       await expect(page.locator('body')).not.toContainText('破茧之后 · 暑期投流')
  163 |       if (target === 'library') await expect(page.getByRole('button', { name: '打开剧目：导航回归真实剧目' })).toBeVisible()
  164 |     }
  165 |   } finally {
  166 |     const pid = app.process()?.pid
  167 |     await app.close().catch(() => undefined)
  168 |     if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
  169 |     await rm(root, { recursive: true, force: true })
  170 |   }
  171 | })
  172 | 
  173 | test('packaged app persists 85 real IPC imports and subtitle mapping in isolated temporary userData', async () => {
  174 |   const userData = await mkdtemp(join(tmpdir(), 'short-drama-packaged-business-data-'))
  175 |   const mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-packaged-business-media-'))
  176 |   const episodePaths = await Promise.all(Array.from({ length: 85 }, async (_, index) => {
  177 |     const path = join(mediaDirectory, `${String(index + 1).padStart(2, '0')}.mp4`)
  178 |     await writeFile(path, '')
  179 |     return path
  180 |   }))
```