import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test.skip(!process.env.SHORTDRAMA_PACKAGED_EXE, 'Requires SHORTDRAMA_PACKAGED_EXE for an explicit packaged candidate.')

test('packaged semantic selection repairs an unfinished proposal once without subtitle recovery', async () => {
  test.setTimeout(120_000)
  let calls = 0
  let mode: 'repair' | 'reject' = 'repair'
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => { body += chunk })
    request.on('end', () => {
      try {
        calls += 1
        const payload = JSON.parse(body) as { messages: Array<{ content: string }> }
        const input = JSON.parse(payload.messages[0]!.content) as { proposals: Array<{ windowId: string; coreEvidenceIds: string[] }> }
        const closed = mode === 'repair' && calls === 2
        const window = input.proposals[closed ? 1 : 0]!
        const ids = window.coreEvidenceIds
        const selection = { proposalId: window.windowId, startEvidenceId: ids[0], endEvidenceId: ids.at(-1), evidenceIds: ids, beat: closed ? 'climax' : 'escalation', purpose: 'hook', context: 'standalone', narrative: { state: closed ? 'completion' : 'escalation', characters: [], relationship: 'fixture', conflict: 'fixture', continuity: 'continuous' }, seamStatus: 'closed' }
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ selections: [selection] }) } }] }))
      } catch { response.statusCode = 500; response.end('fixture request invalid') }
    })
  })
  const root = await mkdtemp(join(tmpdir(), 'short-drama-semantic-repair-'))
  const source = join(root, '01.mp4')
  const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string
  expect(spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=128x72:r=2:d=90', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source], { windowsHide: true }).status).toBe(0)
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined
  try {
    server.listen(0, '127.0.0.1'); await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Local fixture did not listen')
    app = await electron.launch({ executablePath: resolve(process.env.SHORTDRAMA_PACKAGED_EXE!), args: ['--packaged-smoke', '--packaged-smoke-user-data', root], env: { ...process.env, SHORTDRAMA_MATERIAL_CHANNEL: 'packaged-smoke' } })
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
    const prepared = await page.evaluate(async ({ path, endpoint }) => {
      const drama = await window.desktopApi.createDrama('自动重选候选')
      await window.desktopApi.saveProviderProfile({ capability: 'text-analysis', region: 'local', provider: 'Local semantic fixture', endpoint, model: 'fixture', secretRef: null, timeoutMs: 10000 })
      await window.desktopApi.importEpisodes(drama.id, [path])
      const episode = (await window.desktopApi.getDrama(drama.id)).episodes[0]!
      await window.desktopApi.createSubtitleEvidenceTrack({ dramaId: drama.id, episodeId: episode.id, sourceKind: 'ocr', label: '局部OCR', cues: [0, 5, 60, 65].map((startSeconds, index) => ({ index: index + 1, startSeconds, endSeconds: startSeconds + 3, text: `句子${index}` })) })
      return { dramaId: drama.id, episodeId: episode.id }
    }, { path: source, endpoint: `http://127.0.0.1:${address.port}` })
    const generate = (allowRepeat: boolean) => page.evaluate(async ({ dramaId, episodeId, repeat }) => window.desktopApi.generateClipCandidates(dramaId, { episodeIds: [episodeId], candidatesPerEpisode: 1, targetDurationSeconds: 8, maxOverlapRatio: 0.08, allowRepeat: repeat }), { ...prepared, repeat: allowRepeat })
    const first = await generate(false)
    await expect.poll(async () => page.evaluate(async (id) => (await window.desktopApi.listTasks()).find(t => t.id === id)?.status, first.taskId), { timeout: 60000 }).toBe('completed')
    expect(calls).toBe(2)
    const candidates = await page.evaluate(async id => window.desktopApi.listClipCandidates(id), prepared.dramaId)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.startSeconds).toBeGreaterThanOrEqual(60)
    calls = 0; mode = 'reject'
    const second = await generate(true)
    await expect.poll(async () => page.evaluate(async (id) => (await window.desktopApi.listTasks()).find(t => t.id === id)?.status, second.taskId), { timeout: 60000 }).toBe('failed')
    expect(calls).toBe(2)
    const reason = await page.evaluate(async (id) => (await window.desktopApi.listTasks()).find(t => t.id === id)?.checkpointReason, second.taskId)
    expect(reason).toContain('未收束')
    expect(reason).not.toContain('字幕资产')
    expect(await page.evaluate(async id => (await window.desktopApi.listClipCandidates(id)).length, prepared.dramaId)).toBe(1)
    await page.getByRole('button', { name: '剧目库', exact: true }).click()
    await page.getByRole('button', { name: '打开剧目：自动重选候选' }).click()
    await page.getByRole('tab', { name: '素材生产' }).click()
    await page.getByRole('button', { name: '进入工作区' }).click()
    const frame = page.frameLocator('iframe[title="原剧切片工作区"]')
    await expect(frame.locator('#screen-clip')).toContainText('未收束')
    await expect(frame.locator('[data-clip-recovery="subtitles"]')).toHaveCount(0)
  } finally {
    await app?.close().catch(() => undefined)
    server.closeAllConnections(); await new Promise<void>(resolveClose => server.close(() => resolveClose()))
    await rm(root, { recursive: true, force: true })
  }
})

test('packaged preflight automatically accepts local OCR islands without changing subtitles', async () => {
  const root = await mkdtemp(join(tmpdir(), 'short-drama-local-windows-'))
  const source = join(root, '01.mp4')
  const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string
  expect(spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=128x72:r=2:d=90', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source], { windowsHide: true }).status).toBe(0)
  const app = await electron.launch({ executablePath: resolve(process.env.SHORTDRAMA_PACKAGED_EXE!), args: ['--packaged-smoke', '--packaged-smoke-user-data', root], env: { ...process.env, SHORTDRAMA_MATERIAL_CHANNEL: 'packaged-smoke' } })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
    const result = await page.evaluate(async (path) => {
      const drama = await window.desktopApi.createDrama('局部字幕预检')
      // Preflight checks capability configuration before inspecting subtitles.
      // A local profile requires no secret and preflight must not call its endpoint.
      await window.desktopApi.saveProviderProfile({ capability: 'text-analysis', region: 'local', provider: 'Isolated preflight fixture', endpoint: 'http://127.0.0.1:1', model: 'fixture', secretRef: null, timeoutMs: 1000 })
      await window.desktopApi.importEpisodes(drama.id, [path])
      const episode = (await window.desktopApi.getDrama(drama.id)).episodes[0]!
      const track = await window.desktopApi.createSubtitleEvidenceTrack({ dramaId: drama.id, episodeId: episode.id, sourceKind: 'ocr', label: '局部OCR', cues: [0, 5, 60, 65].map((startSeconds, index) => ({ index: index + 1, startSeconds, endSeconds: startSeconds + 3, text: `句子${index}` })) })
      const before = await window.desktopApi.listSubtitleEvidenceCues(track.id)
      const preflight = await window.desktopApi.preflightClipGeneration(drama.id, { episodeIds: [episode.id], candidatesPerEpisode: 2, targetDurationSeconds: 8, maxOverlapRatio: 0.08, allowRepeat: false })
      const after = await window.desktopApi.listSubtitleEvidenceCues(track.id)
      return { estimated: preflight.estimatedCandidates, skipped: preflight.skipped.length, unchanged: JSON.stringify(before) === JSON.stringify(after) }
    }, source)
    expect(result).toEqual({ estimated: 2, skipped: 0, unchanged: true })
  } finally {
    const pid = app.process()?.pid
    await app.close().catch(() => undefined)
    if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    await rm(root, { recursive: true, force: true })
  }
})

test('packaged clip subtitle preflight failure returns to real global pages instead of prototype demos', async () => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'short-drama-packaged-navigation-'))
  const source = join(root, '01.mp4')
  const ffmpeg = createRequire(import.meta.url)('ffmpeg-static') as string
  const fixture = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=320x180:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source], { windowsHide: true })
  expect(fixture.status).toBe(0)
  await mkdir(join(root, 'data'))
  const app = await electron.launch({ timeout: 30_000, executablePath: resolve(process.env.SHORTDRAMA_PACKAGED_EXE!), args: ['--packaged-smoke', '--packaged-smoke-user-data', join(root, 'data')], env: { ...process.env, SHORTDRAMA_MATERIAL_CHANNEL: 'packaged-smoke' } })
  try {
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
    await page.evaluate(async (sourcePath) => {
      const drama = await window.desktopApi.createDrama('导航回归真实剧目')
      await window.desktopApi.importEpisodes(drama.id, [sourcePath])
    }, source)
    await page.reload()
    for (const target of ['library', 'tasks', 'tags', 'settings']) {
      if (target !== 'library') await page.getByRole('button', { name: '剧目库', exact: true }).click()
      await page.getByRole('button', { name: '打开剧目：导航回归真实剧目' }).click()
      await page.getByRole('tab', { name: '素材生产' }).click()
      await page.getByRole('button', { name: '进入工作区' }).click()
      const frame = page.frameLocator('iframe[title="原剧切片工作区"]')
      await expect(frame.locator('[data-r5-open="generate"]')).toBeEnabled()
      await frame.locator('[data-r5-open="generate"]').click()
      await expect(frame.locator('#screen-clip')).toContainText(/没有.*字幕|字幕.*锚点/)
      await frame.locator(`.nav-btn[data-screen="${target}"]`).click()
      await expect(page.locator('iframe[title="原剧切片工作区"]')).toHaveCount(0)
      await expect(page).toHaveURL(new RegExp(`#/${target}$`))
      await expect(page.locator('body')).not.toContainText('春江未眠')
      await expect(page.locator('body')).not.toContainText('破茧之后 · 暑期投流')
      if (target === 'library') await expect(page.getByRole('button', { name: '打开剧目：导航回归真实剧目' })).toBeVisible()
    }
  } finally {
    const pid = app.process()?.pid
    await app.close().catch(() => undefined)
    if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    await rm(root, { recursive: true, force: true })
  }
})

test('packaged app persists 85 real IPC imports and subtitle mapping in isolated temporary userData', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'short-drama-packaged-business-data-'))
  const mediaDirectory = await mkdtemp(join(tmpdir(), 'short-drama-packaged-business-media-'))
  const episodePaths = await Promise.all(Array.from({ length: 85 }, async (_, index) => {
    const path = join(mediaDirectory, `${String(index + 1).padStart(2, '0')}.mp4`)
    await writeFile(path, '')
    return path
  }))
  const subtitlePath = join(mediaDirectory, '01.srt')
  await writeFile(subtitlePath, '1\n00:00:00,000 --> 00:00:01,000\n打包业务冒烟字幕。\n', 'utf8')
  const executablePath = resolve(process.env.SHORTDRAMA_PACKAGED_EXE!)
  const launch = () => electron.launch({ executablePath, args: ['--packaged-smoke', '--packaged-smoke-user-data', userData], env: { ...process.env, SHORTDRAMA_MATERIAL_CHANNEL: 'packaged-smoke' } })
  let app = await launch()
  try {
    let page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
    const result = await page.evaluate(async ({ paths, subtitle }) => {
      const drama = await window.desktopApi.createDrama('打包业务冒烟')
      const imported = await window.desktopApi.importEpisodes(drama.id, paths)
      const subtitles = await window.desktopApi.importSubtitlesByEpisode(drama.id, [subtitle])
      const detail = await window.desktopApi.getDrama(drama.id)
      return { dramaId: drama.id, episodeCount: detail.episodes.length, importedCount: imported.summary.imported, subtitleCount: subtitles.assets.length, subtitleEpisodeId: subtitles.assets[0]?.episodeId ?? null }
    }, { paths: episodePaths, subtitle: subtitlePath })
    expect(result).toEqual(expect.objectContaining({ episodeCount: 85, importedCount: 85, subtitleCount: 1 }))
    expect(result.subtitleEpisodeId).toBeTruthy()
    await page.reload()
    await page.getByRole('button', { name: '打开剧目：打包业务冒烟' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(85, { timeout: 90_000 })
    const table = page.locator('.asset-table-wrap')
    await expect.poll(() => table.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    await table.evaluate((element) => { element.scrollTop = element.scrollHeight })
    await expect.poll(() => table.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 2)).toBe(true)
    await app.close()
    app = await launch()
    page = await app.firstWindow()
    const restored = await page.evaluate(async (dramaId) => ({ detail: await window.desktopApi.getDrama(dramaId), subtitles: await window.desktopApi.listSubtitles(dramaId) }), result.dramaId)
    expect(restored.detail.episodes).toHaveLength(85)
    expect(restored.subtitles).toHaveLength(1)
    expect(restored.subtitles[0]?.episodeId).toBe(result.subtitleEpisodeId)
  } finally {
    const pid = app.process()?.pid
    await app.close().catch(() => undefined)
    if (pid && process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true })
    await Promise.all([rm(userData, { recursive: true, force: true }), rm(mediaDirectory, { recursive: true, force: true })])
  }
})
