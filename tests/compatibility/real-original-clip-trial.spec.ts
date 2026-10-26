// Compatibility suite: opt-in real-media trial.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string
const ffmpegPath = require('ffmpeg-static') as string
const ffprobePath = require('ffprobe-static').path as string
const projectRoot = resolve(import.meta.dirname, '../..')
const mediaRoot = 'E:\\剪辑盘\\20260623_短剧切片投流\\《嗨,被纯情少爷盯上了》\\标准版'
const subtitleRoot = join(mediaRoot, '字幕')
const episodeNames = ['01（戏前）.mp4', ...Array.from({ length: 29 }, (_, index) => `${String(index + 2).padStart(2, '0')}.mp4`)]
const subtitleNames = ['01（戏前）.srt', ...Array.from({ length: 29 }, (_, index) => `${String(index + 2).padStart(2, '0')}.srt`)]
const packagedExecutablePath = process.env.SHORTDRAMA_PACKAGED_EXE ? resolve(process.env.SHORTDRAMA_PACKAGED_EXE) : null

type TrialTrack = { episodeId: string | null; sourceKind: string; acquisition?: string; evidenceNature?: string }

test('real imported subtitles remain reference-only and block automatic clip generation', async () => {
  test.skip(process.env.SHORTDRAMA_REAL_ORIGINAL_CLIP_TRIAL !== '1', 'Only run when explicitly requested.')
  test.setTimeout(900_000)
  const output = process.env.SHORTDRAMA_REAL_ORIGINAL_CLIP_OUTPUT ?? ''
  if (!output) throw new Error('SHORTDRAMA_REAL_ORIGINAL_CLIP_OUTPUT is required.')
  await mkdir(output, { recursive: true })
  if ((await readdir(output)).length > 0) throw new Error(`trial output directory must be empty: ${output}`)

  const episodes = episodeNames.map((name) => join(mediaRoot, name))
  const subtitles = subtitleNames.map((name) => join(subtitleRoot, name))
  await Promise.all([...episodes, ...subtitles].map((path) => stat(path)))
  const dataDirectory = join(tmpdir(), `short-drama-real-import-blocked-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  await mkdir(dataDirectory, { recursive: true })
  let app: ElectronApplication | undefined
  try {
    app = await electron.launch({
      executablePath: packagedExecutablePath ?? electronPath,
      args: packagedExecutablePath ? [] : [join(projectRoot, 'out', 'main', 'index.js')],
      env: {
        ...process.env,
        SHORTDRAMA_MATERIAL_E2E: '1',
        SHORTDRAMA_MATERIAL_CHANNEL: 'real-original-import-blocked',
        SHORTDRAMA_MATERIAL_USER_DATA: dataDirectory,
        SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS: episodes.join('|'),
        SHORTDRAMA_FFMPEG_PATH: ffmpegPath,
        SHORTDRAMA_FFPROBE_PATH: ffprobePath,
      },
    })
    const page = await app.firstWindow()
    await expect(page.getByRole('heading', { name: '剧目库' })).toBeVisible()
    await page.getByRole('button', { name: '创建剧目' }).first().click()
    const dialog = page.getByRole('dialog', { name: '创建剧目' })
    await dialog.getByLabel('剧名').fill('真实源片导入字幕阻断验收剧目')
    await dialog.getByRole('button', { name: '选择视频文件', exact: true }).click()
    await expect(dialog.getByText('已选择 30 个视频文件')).toBeVisible()
    await dialog.getByRole('button', { name: '保存并整理资产' }).click()
    await expect(page.locator('tbody tr')).toHaveCount(30, { timeout: 120_000 })
    await page.keyboard.press('Escape')

    const result = await page.evaluate(async ({ subtitlePaths }) => {
      const drama = (await window.desktopApi.listDramas()).find((item) => item.name === '真实源片导入字幕阻断验收剧目')
      if (!drama) throw new Error('missing isolated trial drama')
      const detail = await window.desktopApi.getDrama(drama.id)
      const episodeIds = detail.episodes.map((episode) => episode.id)
      const preview = await window.desktopApi.previewSubtitlesByEpisode(drama.id, subtitlePaths)
      const imported = await window.desktopApi.importSubtitlesByEpisode(drama.id, subtitlePaths)
      const tracks = await Promise.all(episodeIds.map(async (episodeId) => ({
        episodeId,
        tracks: await window.desktopApi.listSubtitleEvidenceTracks(drama.id, episodeId),
      })))
      const input = { episodeIds, candidatesPerEpisode: 1, targetDurationSeconds: 15, maxOverlapRatio: 0.08, allowRepeat: false }
      const preflight = await window.desktopApi.preflightClipGeneration(drama.id, input)
      let generationError: string | null = null
      try {
        await window.desktopApi.generateClipCandidates(drama.id, input)
      } catch (error) {
        generationError = error instanceof Error ? error.message : String(error)
      }
      const candidates = await window.desktopApi.listClipCandidates(drama.id)
      return { episodeIds, preview, imported, tracks, preflight, generationError, candidateCount: candidates.length }
    }, { subtitlePaths: subtitles })

    expect(result.preview.matches).toHaveLength(30)
    expect(result.preview.skipped).toEqual([])
    expect(result.imported.assets).toHaveLength(30)
    expect(result.imported.skipped).toEqual([])
    expect(result.tracks).toHaveLength(30)
    for (const episode of result.tracks) {
      const importedTrack = (episode.tracks as TrialTrack[]).find((track) => track.sourceKind === 'import')
      expect(importedTrack).toMatchObject({ episodeId: episode.episodeId, sourceKind: 'import', acquisition: 'imported', evidenceNature: 'reference_unknown' })
    }
    expect(result.preflight.eligibleEpisodeIds).toEqual([])
    expect(result.preflight.estimatedCandidates).toBe(0)
    expect(result.preflight.skipped).toHaveLength(30)
    expect(result.preflight.skipped.every((item) => item.reason.includes('导入字幕尚未完成可追溯的画面对齐或声音对齐核验'))).toBe(true)
    expect(result.generationError).toContain('导入字幕尚未完成可追溯的画面对齐或声音对齐核验')
    expect(result.candidateCount).toBe(0)
    const outputFiles = (await readdir(output)).filter((name) => name.toLowerCase().endsWith('.mp4'))
    expect(outputFiles).toEqual([])
    await writeFile(join(output, 'real-original-import-blocked-trial.json'), JSON.stringify({
      trial: 'real-original-import-blocked-v1',
      packagedExecutable: packagedExecutablePath ? await sha256(packagedExecutablePath) : null,
      episodeCount: episodes.length,
      subtitleCount: subtitles.length,
      episodeSha256: await hashesByEpisode(episodes),
      subtitleSha256: await hashesByEpisode(subtitles),
      preview: { matches: result.preview.matches.length, skipped: result.preview.skipped.length },
      imported: { assets: result.imported.assets.length, skipped: result.imported.skipped.length },
      evidence: { importTracks: result.tracks.length, acquisition: 'imported', evidenceNature: 'reference_unknown' },
      automaticGeneration: { eligibleEpisodes: result.preflight.eligibleEpisodeIds.length, estimatedCandidates: result.preflight.estimatedCandidates, blockedEpisodes: result.preflight.skipped.length, generationRejected: Boolean(result.generationError), candidateCount: result.candidateCount, outputMp4Count: outputFiles.length },
    }, null, 2), 'utf8')
  } finally {
    await app?.close().catch(() => undefined)
    await rm(dataDirectory, { recursive: true, force: true })
  }
})

const hashesByEpisode = async (paths: readonly string[]): Promise<Record<string, string>> => Object.fromEntries(await Promise.all(paths.map(async (path, index) => [String(index + 1), await sha256(path)])))

const sha256 = async (path: string): Promise<string> => new Promise((resolveHash, reject) => {
  const hash = createHash('sha256')
  const stream = createReadStream(path)
  stream.on('error', reject)
  stream.on('data', (chunk) => hash.update(chunk))
  stream.on('end', () => resolveHash(hash.digest('hex').toUpperCase()))
})
