import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { assertSuccessfulProcess, resolveMediaBinary, runMediaProcess } from '../media/ffmpeg-runner.js'
import type { ProcessResult } from '../media/media-types.js'
import { SubtitleEvidenceService, type SubtitleTrack } from './subtitle-evidence-service.js'

export type LocalOcrAvailability = { available: boolean; executablePath: string | null; reason: string | null }
type OcrRuntime = { resolveFfmpeg: () => string | null; run: (command: string, args: readonly string[]) => Promise<ProcessResult>; createTempDirectory: () => Promise<string>; removeTempDirectory: (path: string) => Promise<void> }
const defaultRuntime: OcrRuntime = { resolveFfmpeg: () => resolveMediaBinary('ffmpeg'), run: runMediaProcess, createTempDirectory: () => mkdtemp(join(tmpdir(), 'shortdrama-ocr-')), removeTempDirectory: (path) => rm(path, { recursive: true, force: true }) }

const extractionSchema = z.object({ asrTrackId: z.string().trim().min(1), language: z.string().trim().min(1).max(40).default('chi_sim'), pageSegmentationMode: z.number().int().min(3).max(13).default(7) })

export class LocalOcrSubtitleService {
  constructor(private readonly database: Database.Database, private readonly evidence: SubtitleEvidenceService, private readonly findBinary: () => string | null = resolveTesseractBinary, private readonly runtime: OcrRuntime = defaultRuntime) {}

  getAvailability(): LocalOcrAvailability {
    const executablePath = this.findBinary()
    return executablePath ? { available: true, executablePath, reason: null } : { available: false, executablePath: null, reason: '未找到本地 Tesseract；安装后将其加入 PATH，或设置 SHORTDRAMA_TESSERACT_PATH。不会回退到付费云端 API。' }
  }

  async extractFixedRegionFromAsr(input: unknown): Promise<SubtitleTrack> {
    const value = extractionSchema.parse(input); const asrTrack = this.evidence.getTrack(value.asrTrackId)
    if (asrTrack.sourceKind !== 'asr') throw new Error('固定区域 OCR 需要 ASR 轨道作为时间锚点')
    if (!asrTrack.episodeId) throw new Error('固定区域 OCR 只能用于已关联分集的 ASR 轨道')
    const availability = this.getAvailability(); const tesseract = availability.executablePath; if (!availability.available || !tesseract) throw new Error(availability.reason ?? '本地 OCR 引擎不可用')
    const ffmpeg = this.runtime.resolveFfmpeg(); if (!ffmpeg) throw new Error('未找到 FFmpeg，无法从视频提取字幕区域帧')
    const episode = this.database.prepare('SELECT source_path AS sourcePath FROM episodes WHERE id = ? AND drama_id = ?').get(asrTrack.episodeId, asrTrack.dramaId) as { sourcePath: string } | undefined
    if (!episode) throw new Error('ASR 轨道关联的分集不存在')
    const region = this.evidence.getEffectiveOcrRegion(asrTrack.dramaId, asrTrack.episodeId); if (!region) throw new Error('请先为该剧或该集设置固定字幕 OCR 区域')
    const cues = this.evidence.listCues(asrTrack.id); const workDirectory = await this.runtime.createTempDirectory()
    try {
      const extracted = [] as Array<{ index: number; startSeconds: number; endSeconds: number; text: string; confidence: number | null }>
      for (const cue of cues) {
        const framePath = join(workDirectory, `${String(cue.index).padStart(5, '0')}.png`); const midpoint = (cue.startSeconds + cue.endSeconds) / 2
        assertSuccessfulProcess(await this.runtime.run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(midpoint), '-i', episode.sourcePath, '-frames:v', '1', '-vf', cropFilter(region), '-y', framePath]))
        const ocr = await this.runtime.run(tesseract, [framePath, 'stdout', '-l', value.language, '--psm', String(value.pageSegmentationMode)])
        if (ocr.exitCode !== 0) throw new Error(`Tesseract 识别失败：${ocr.stderr.trim() || `退出码 ${ocr.exitCode ?? '未知'}`}`)
        const text = normalizeOcrText(ocr.stdout)
        if (text) extracted.push({ index: cue.index, startSeconds: cue.startSeconds, endSeconds: cue.endSeconds, text, confidence: null })
      }
      if (extracted.length === 0) throw new Error('固定区域 OCR 没有识别到文本；请检查区域、语言包和视频清晰度')
      return this.evidence.createTrack({ dramaId: asrTrack.dramaId, episodeId: asrTrack.episodeId, sourceKind: 'ocr', label: `本地固定区域 OCR（${value.language}）`, language: value.language, cost: { engine: 'tesseract', mode: 'local', estimatedCost: 0, actualCost: 0 }, cues: extracted })
    } finally { await this.runtime.removeTempDirectory(workDirectory) }
  }
}

export const resolveTesseractBinary = (): string | null => {
  const candidates = [process.env.SHORTDRAMA_TESSERACT_PATH, 'C:\\Program Files\\Tesseract-OCR\\tesseract.exe', 'D:\\Program Files\\Tesseract-OCR\\tesseract.exe', ...pathCandidates('tesseract')].filter((candidate): candidate is string => Boolean(candidate))
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

const pathCandidates = (binary: string): string[] => (process.env.PATH ?? '').split(delimiter).filter(Boolean).map((directory) => join(directory, process.platform === 'win32' ? `${binary}.exe` : binary))
const cropFilter = (region: { x: number; y: number; width: number; height: number }): string => `crop=iw*${region.width.toFixed(6)}:ih*${region.height.toFixed(6)}:iw*${region.x.toFixed(6)}:ih*${region.y.toFixed(6)}`
const normalizeOcrText = (text: string): string => text.replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean).join('\n')
