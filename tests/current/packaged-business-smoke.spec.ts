import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

test.skip(!process.env.SHORTDRAMA_PACKAGED_EXE, 'Requires SHORTDRAMA_PACKAGED_EXE for an explicit packaged candidate.')

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
