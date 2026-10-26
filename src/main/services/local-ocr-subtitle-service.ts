import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { resolveMediaBinary, runMediaProcess } from '../media/ffmpeg-runner.js'
import type { ProcessResult } from '../media/media-types.js'
import { SubtitleEvidenceService, type SubtitleTrack } from './subtitle-evidence-service.js'

export type LocalOcrAvailability = { available: boolean; executablePath: string | null; reason: string | null }
export type LocalOcrRuntimeIdentity = { buildId: string; sha256: string }
export type LocalOcrRuntimeInfo = LocalOcrRuntimeIdentity & { available: boolean; runnerPath: string | null; selfTest: boolean; reason: string | null }

type TemporalOcrCue = { startSeconds: number; endSeconds: number; text: string; confidence: number | null }
type TemporalOcrResult = { ok: true; cues: TemporalOcrCue[]; stats: Record<string, number> } | { ok: false; error: { message: string } }
type OcrSelfTestResult = { ok: boolean; runnerBuildId?: string; detector?: boolean; recognizer?: boolean; error?: { message?: string } }
type OcrRuntime = {
  resolveFfmpeg: () => string | null
  resolvePythonRunner: () => string | null
  run: (command: string, args: readonly string[]) => Promise<ProcessResult>
  createTempDirectory: () => Promise<string>
  removeTempDirectory: (path: string) => Promise<void>
  writeJson: (path: string, value: unknown) => Promise<void>
  readJson: (path: string) => Promise<unknown>
}

const defaultRuntime: OcrRuntime = {
  resolveFfmpeg: () => resolveMediaBinary('ffmpeg'),
  resolvePythonRunner: resolveTemporalOcrRunner,
  run: runMediaProcess,
  createTempDirectory: () => mkdtemp(join(tmpdir(), 'shortdrama-ocr-')),
  removeTempDirectory: (path) => rm(path, { recursive: true, force: true }),
  writeJson: (path, value) => writeFile(path, `${JSON.stringify(value)}\n`, 'utf8'),
  readJson: async (path) => JSON.parse(await readFile(path, 'utf8')) as unknown
}

const extractionSchema = z.object({ asrTrackId: z.string().trim().min(1), language: z.string().trim().min(1).max(40).default('chi_sim') })
const independentExtractionSchema = z.object({ dramaId: z.string().trim().min(1), episodeId: z.string().trim().min(1), language: z.string().trim().min(1).max(40).default('chi_sim'), regionMode: z.enum(['auto-region', 'fixed-region']).default('fixed-region') })
const temporalResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), cues: z.array(z.object({ startSeconds: z.number().finite().min(0), endSeconds: z.number().finite().positive(), text: z.string().trim().min(1), confidence: z.number().finite().min(0).max(1).nullable() })), stats: z.record(z.string(), z.number().finite()) }),
  z.object({ ok: z.literal(false), error: z.object({ message: z.string().trim().min(1) }) })
])

export class LocalOcrSubtitleService {
  constructor(private readonly database: Database.Database, private readonly evidence: SubtitleEvidenceService, private readonly findPython: () => string | null = resolveLocalOcrPython, private readonly runtime: OcrRuntime = defaultRuntime) {}

  getAvailability(): LocalOcrAvailability {
    const packagedRunner = resolvePackagedOcrRunner()
    if (packagedRunner) return { available: true, executablePath: packagedRunner, reason: null }
    const executablePath = this.findPython()
    if (!executablePath) return { available: false, executablePath: null, reason: '未找到本地 Paddle OCR 运行时；开发环境请运行 tools/local-ocr 的安装步骤，或设置 SHORTDRAMA_LOCAL_OCR_PYTHON。不会回退到付费云端 API 或 Tesseract。' }
    if (!this.runtime.resolvePythonRunner()) return { available: false, executablePath: null, reason: '未找到本地 Paddle OCR 时序执行脚本；请检查 tools/local-ocr/temporal_ocr_runner.py。不会回退到付费云端 API 或 Tesseract。' }
    return { available: true, executablePath, reason: null }
  }

  async getRuntimeInfo(): Promise<LocalOcrRuntimeInfo> {
    const packagedRunner = resolvePackagedOcrRunner()
    const scriptRunner = packagedRunner ? null : this.runtime.resolvePythonRunner()
    const python = packagedRunner ? null : this.findPython()
    const runnerPath = packagedRunner ?? scriptRunner
    if (!runnerPath || (!packagedRunner && !python)) return { available: false, runnerPath, buildId: '', sha256: '', selfTest: false, reason: this.getAvailability().reason }
    const process = await this.runtime.run(packagedRunner ?? python as string, packagedRunner ? ['--self-test'] : [scriptRunner as string, '--self-test'])
    const selfTest = parseSelfTestResult(process.stdout)
    const buildId = typeof selfTest?.runnerBuildId === 'string' ? selfTest.runnerBuildId : ''
    const sha256 = await hashFile(runnerPath)
    const reason = selfTest?.error?.message || (process.stderr.trim() || `OCR runner 自检退出码 ${process.exitCode ?? '未知'}`)
    return { available: process.exitCode === 0 && selfTest?.ok === true && selfTest.detector === true && selfTest.recognizer === true, runnerPath, buildId, sha256, selfTest: selfTest?.ok === true, reason: process.exitCode === 0 && selfTest?.ok === true ? null : reason }
  }

  async extractFixedRegionFromAsr(input: unknown): Promise<SubtitleTrack> {
    const value = extractionSchema.parse(input)
    const asrTrack = this.evidence.getTrack(value.asrTrackId)
    if (asrTrack.sourceKind !== 'asr' || !asrTrack.episodeId) throw new Error('当前 ASR 轨道未关联有效分集，无法读取该集固定 OCR 区域')
    return this.extractTemporalFixedRegion({ dramaId: asrTrack.dramaId, episodeId: asrTrack.episodeId, language: value.language, regionMode: 'fixed-region' })
  }

  async extractFixedRegionIndependently(input: unknown): Promise<SubtitleTrack> {
    return this.extractTemporalFixedRegion(independentExtractionSchema.parse(input))
  }

  private async extractTemporalFixedRegion(value: z.infer<typeof independentExtractionSchema>): Promise<SubtitleTrack> {
    const availability = this.getAvailability()
    if (!availability.available || !availability.executablePath) throw new Error(availability.reason ?? '本地 Paddle OCR 引擎不可用')
    const ffmpeg = this.runtime.resolveFfmpeg()
    const runner = this.runtime.resolvePythonRunner()
    const packagedRunner = resolvePackagedOcrRunner()
    if (!ffmpeg) throw new Error('未找到 FFmpeg，无法从视频建立 OCR 时间轴')
    if (!packagedRunner && !runner) throw new Error('未找到本地 Paddle OCR 时序执行器')
    const episode = this.database.prepare('SELECT source_path AS sourcePath FROM episodes WHERE id = ? AND drama_id = ?').get(value.episodeId, value.dramaId) as { sourcePath: string } | undefined
    if (!episode) throw new Error('当前分集不存在')
    const savedRegion = this.evidence.getEffectiveOcrRegion(value.dramaId, value.episodeId)
    if (value.regionMode === 'fixed-region' && !savedRegion) throw new Error('请先为该剧或该集设置固定字幕 OCR 区域')
    const workDirectory = await this.runtime.createTempDirectory()
    try {
      const inputPath = join(workDirectory, 'request.json')
      const resultPath = join(workDirectory, 'result.json')
    const cropRegion = value.regionMode === 'fixed-region' && savedRegion ? { x: savedRegion.x, y: savedRegion.y, width: savedRegion.width, height: savedRegion.height } : null
      await this.runtime.writeJson(inputPath, { ffmpegPath: ffmpeg, videoPath: episode.sourcePath, language: value.language, region: cropRegion })
      const command = packagedRunner ?? availability.executablePath
      const args = packagedRunner ? [] : [runner as string]
      const process = await this.runtime.run(command, [...args, '--input', inputPath, '--output', resultPath])
      if (process.exitCode !== 0) throw new Error(`本地 Paddle OCR 执行失败：${process.stderr.trim() || `退出码 ${process.exitCode ?? '未知'}`}`)
      const result = temporalResultSchema.parse(await this.runtime.readJson(resultPath)) as TemporalOcrResult
      if (!result.ok) throw new Error(result.error.message)
      const cues = result.cues.filter((cue) => cue.endSeconds > cue.startSeconds).map((cue, index) => ({ index: index + 1, ...cue }))
      if (cues.length === 0) throw new Error(value.regionMode === 'auto-region' ? '机器选区 OCR 没有识别到字幕；请检查视频清晰度或改用当前集人工校准。' : '固定区域 OCR 没有识别到字幕；请检查已校准区域和视频清晰度')
      return this.evidence.replaceOcrTrack({
        dramaId: value.dramaId,
        episodeId: value.episodeId,
        sourceKind: 'ocr',
        label: value.regionMode === 'auto-region' ? `本地机器选区 OCR（${value.language}）` : `本地固定区域 OCR（${value.language}）`,
        language: value.language,
        cost: { engine: 'paddleocr', mode: 'local-temporal', estimatedCost: 0, actualCost: 0, ...result.stats },
        cues
      })
    } finally {
      await this.runtime.removeTempDirectory(workDirectory)
    }
  }
}

export function resolveLocalOcrPython(): string | null {
  const candidates = [
    process.env.SHORTDRAMA_LOCAL_OCR_PYTHON,
    join(process.cwd(), 'tools', 'local-ocr', '.venv', 'Scripts', 'python.exe'),
    join(process.resourcesPath ?? '', 'tools', 'local-ocr', '.venv', 'Scripts', 'python.exe')
  ].filter((candidate): candidate is string => Boolean(candidate))
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

export function resolveTemporalOcrRunner(): string | null {
  const candidates = [
    process.env.SHORTDRAMA_LOCAL_OCR_RUNNER,
    join(process.cwd(), 'tools', 'local-ocr', 'temporal_ocr_runner.py'),
    join(process.resourcesPath ?? '', 'tools', 'local-ocr', 'temporal_ocr_runner.py')
  ].filter((candidate): candidate is string => Boolean(candidate))
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

export function resolvePackagedOcrRunner(): string | null {
  const candidates = [
    process.env.SHORTDRAMA_LOCAL_OCR_RUNNER_BINARY,
    process.resourcesPath ? join(process.resourcesPath, 'tools', 'local-ocr', 'runtime', process.platform === 'win32' ? 'temporal_ocr_runner.exe' : 'temporal_ocr_runner') : undefined
  ].filter((candidate): candidate is string => Boolean(candidate))
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

const parseSelfTestResult = (stdout: string): OcrSelfTestResult | null => {
  const lines = stdout.trim().split(/\r?\n/).reverse()
  for (const line of lines) {
    try {
      const value = JSON.parse(line) as unknown
      if (typeof value === 'object' && value !== null && 'ok' in value) return value as OcrSelfTestResult
    } catch {
      // Paddle may write informational lines before the JSON result.
    }
  }
  return null
}

const hashFile = async (path: string): Promise<string> => {
  try {
    return createHash('sha256').update(await readFile(path)).digest('hex')
  } catch {
    return ''
  }
}
