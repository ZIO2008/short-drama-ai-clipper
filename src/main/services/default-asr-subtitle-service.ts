import { createHash, createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { assertSuccessfulProcess, resolveMediaBinary, runMediaProcess } from '../media/ffmpeg-runner.js'
import type { ProcessResult } from '../media/media-types.js'
import type { SecretService } from '../security/secret-service.js'
import type { ProviderProfile, ProviderProfileService } from './provider-profile-service.js'
import { credentialValuesFromStoredValue } from '../../shared/provider-auth-schema.js'
import { SubtitleEvidenceService, type SubtitleTrack } from './subtitle-evidence-service.js'

const host = 'asr.tencentcloudapi.com'
const version = '2019-06-14'
const maxLocalAudioBytes = 5 * 1024 * 1024
const chunkDurationSeconds = 120
const chunkOverlapSeconds = 3
const resultFormat = 3
const sentenceMaxLength = 40
const pollIntervalMilliseconds = 1500
const inputSchema = z.object({ dramaId: z.string().trim().min(1), episodeId: z.string().trim().min(1), language: z.enum(['zh-CN', 'zh-en', 'auto']), mode: z.enum(['audio-first', 'denoise', 'import-only']) })
type Credentials = { secretId: string; secretKey: string }
type Runtime = { resolveFfmpeg: () => string | null; resolveFfprobe: () => string | null; run: (command: string, args: readonly string[]) => Promise<ProcessResult>; createTempDirectory: () => Promise<string>; removeTempDirectory: (path: string) => Promise<void>; readFile: (path: string) => Promise<Buffer>; wait: (milliseconds: number) => Promise<void> }
const defaultRuntime: Runtime = { resolveFfmpeg: () => resolveMediaBinary('ffmpeg'), resolveFfprobe: () => resolveMediaBinary('ffprobe'), run: runMediaProcess, createTempDirectory: () => mkdtemp(join(tmpdir(), 'shortdrama-asr-')), removeTempDirectory: (path) => rm(path, { recursive: true, force: true }), readFile, wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) }
type ResponseDetail = { FinalSentence?: string; StartMs?: number; EndMs?: number }
type ResponseData = { Response?: { Data?: { TaskId?: number; Status?: number; StatusStr?: string; ErrorMsg?: string; ResultDetail?: ResponseDetail[] }; Error?: { Code?: string; Message?: string } } }
type ChunkCue = { startSeconds: number; endSeconds: number; text: string; confidence: null; chunkStartSeconds: number; chunkEndSeconds: number }

export class DefaultAsrSubtitleService {
  constructor(private readonly database: Database.Database, private readonly evidence: SubtitleEvidenceService, private readonly profiles: ProviderProfileService, private readonly secrets: SecretService, private readonly runtime: Runtime = defaultRuntime, private readonly fetchImpl: typeof fetch = fetch, private readonly now: () => number = Date.now) {}

  async extract(input: unknown): Promise<SubtitleTrack> {
    const value = inputSchema.parse(input)
    if (value.mode === 'import-only') throw new Error('“仅导入字幕”不是可执行的音频识别方式；请选择“ASR 实录优先”或“增强降噪后识别”。')
    const profile = this.requireTencentProfile()
    const credentials = this.readCredentials(profile)
    const ffmpeg = this.runtime.resolveFfmpeg(); const ffprobe = this.runtime.resolveFfprobe()
    if (!ffmpeg || !ffprobe) throw new Error('未找到 FFmpeg 或 ffprobe，无法从视频提取音频。')
    const episode = this.database.prepare('SELECT source_path AS sourcePath FROM episodes WHERE id = ? AND drama_id = ?').get(value.episodeId, value.dramaId) as { sourcePath: string } | undefined
    if (!episode) throw new Error('当前分集不存在，无法进行音频识别。')
    const duration = await readDuration(this.runtime, ffprobe, episode.sourcePath)
    const timeoutMs = Math.max(1000, Math.min(profile.timeoutMs ?? 60000, 600000))
    const directory = await this.runtime.createTempDirectory()
    try {
      const chunkCues: ChunkCue[] = []
      let chunkStart = 0
      let chunkCount = 0
      while (chunkStart < duration) {
        const chunkDuration = Math.min(chunkDurationSeconds, duration - chunkStart)
        const chunkPath = join(directory, `audio-${String(Math.floor(chunkStart)).padStart(6, '0')}.wav`)
        assertSuccessfulProcess(await this.runtime.run(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-ss', String(chunkStart), '-t', String(chunkDuration), '-i', episode.sourcePath, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', '-y', chunkPath]))
        const audio = await this.runtime.readFile(chunkPath)
        if (audio.byteLength > maxLocalAudioBytes) throw new Error('提取的本地音频片段超过腾讯云 5 MB 限制，未上传该片段。')
        const taskId = await this.createTask(credentials, this.engineFor(profile, value.language), audio, timeoutMs)
        const details = await this.waitForTask(credentials, taskId, timeoutMs)
        chunkCount += 1
        for (const detail of details) {
          const text = detail.FinalSentence?.trim() ?? ''
          const startMs = detail.StartMs; const endMs = detail.EndMs
          if (!text || typeof startMs !== 'number' || typeof endMs !== 'number' || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
          const startSeconds = chunkStart + startMs / 1000
          const endSeconds = chunkStart + endMs / 1000
          if (startSeconds < 0 || endSeconds <= startSeconds || startSeconds >= duration + 0.25) continue
          chunkCues.push({ startSeconds, endSeconds: Math.min(duration, endSeconds), text, confidence: null, chunkStartSeconds: chunkStart, chunkEndSeconds: chunkStart + chunkDuration })
        }
        if (chunkStart + chunkDuration >= duration) break
        chunkStart += chunkDuration - chunkOverlapSeconds
      }
      const cues = reconcileChunkCues(chunkCues).map((cue, index) => ({ ...cue, index: index + 1 }))
      if (cues.length === 0) throw new Error('腾讯云 ASR 未返回可用于字幕的带时间轴结果。')
      return this.evidence.createTrack({ dramaId: value.dramaId, episodeId: value.episodeId, sourceKind: 'asr', label: `腾讯云 ASR（${this.engineFor(profile, value.language)}）`, language: value.language, cost: { engine: 'tencent-cloud-asr', mode: value.mode, chunkDurationSeconds, chunkOverlapSeconds, chunkCount, resultFormat, sentenceMaxLength, estimatedCost: null, actualCost: null }, cues })
    } finally { await this.runtime.removeTempDirectory(directory) }
  }

  private requireTencentProfile(): ProviderProfile {
    const profile = this.profiles.list().find((item) => item.capability === 'asr')
    if (!profile) throw new Error('请先在“ASR 字幕识别”中保存并设定默认供应商。')
    if (profile.provider !== '腾讯云 ASR') throw new Error(`当前默认 ASR 为“${profile.provider}”，该供应商的字幕执行器尚未接入。请切换到已配置的腾讯云 ASR 后重试。`)
    try {
      const endpoint = new URL(profile.endpoint ?? '')
      if (endpoint.protocol !== 'https:' || endpoint.hostname.toLowerCase() !== host || endpoint.port || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error('invalid')
    } catch { throw new Error('腾讯云 ASR 地址无效；请恢复为 https://asr.tencentcloudapi.com。') }
    return profile
  }

  private readCredentials(profile: ProviderProfile): Credentials {
    if (!profile.secretRef) throw new Error('腾讯云 ASR 尚未保存 SecretId 和 SecretKey。')
    try {
      const values = credentialValuesFromStoredValue(this.secrets.readPlaintextForMainProcess(profile.secretRef), 'tencent-cloud-secret-pair')
      if (values?.secretId && values.secretKey) return { secretId: values.secretId, secretKey: values.secretKey }
    } catch { /* keep credential details out of renderer errors */ }
    throw new Error('腾讯云 ASR 凭据不可用；请在设置中重新填写 SecretId 和 SecretKey。')
  }

  private engineFor(profile: ProviderProfile, language: 'zh-CN' | 'zh-en' | 'auto'): string {
    if (language === 'zh-en') return '16k_zh_en'
    if (language === 'auto') return '16k_zh_en_2.0'
    return profile.model?.trim() || '16k_zh'
  }

  private async createTask(credentials: Credentials, engine: string, audio: Buffer, timeoutMs: number): Promise<number> {
    const response = await this.request(credentials, 'CreateRecTask', { EngineModelType: engine, ChannelNum: 1, ResTextFormat: resultFormat, SentenceMaxLength: sentenceMaxLength, SourceType: 1, Data: audio.toString('base64'), DataLen: audio.byteLength }, timeoutMs)
    const taskId = response.Response?.Data?.TaskId
    if (typeof taskId !== 'number' || !Number.isSafeInteger(taskId) || taskId <= 0) throw asrError(response, '腾讯云 ASR 未返回可查询的任务标识。')
    return taskId
  }

  private async waitForTask(credentials: Credentials, taskId: number, timeoutMs: number): Promise<Array<{ FinalSentence?: string; StartMs?: number; EndMs?: number }>> {
    const deadline = this.now() + timeoutMs
    while (this.now() < deadline) {
      const response = await this.request(credentials, 'DescribeTaskStatus', { TaskId: taskId }, Math.max(1000, deadline - this.now()))
      const data = response.Response?.Data
      if (data?.Status === 2) return data.ResultDetail ?? []
      if (data?.Status === 3) throw new Error('腾讯云 ASR 识别失败。')
      if (response.Response?.Error) throw asrError(response, '腾讯云 ASR 查询失败。')
      await this.runtime.wait(pollIntervalMilliseconds)
    }
    throw new Error('腾讯云 ASR 等待结果超时。')
  }

  private async request(credentials: Credentials, action: 'CreateRecTask' | 'DescribeTaskStatus', body: object, timeoutMs: number): Promise<ResponseData> {
    const timestamp = Math.floor(this.now() / 1000); const serialized = JSON.stringify(body)
    try {
      const response = await this.fetchImpl(`https://${host}`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { Authorization: authorizationFor(credentials, timestamp, action, serialized), 'Content-Type': 'application/json', Accept: 'application/json', 'X-TC-Action': action, 'X-TC-Version': version, 'X-TC-Timestamp': String(timestamp) }, body: serialized })
      let payload: ResponseData = {}
      try { payload = await response.json() as ResponseData } catch { /* raw cloud responses never leave main process */ }
      if (!response.ok && !payload.Response?.Error) throw new Error('腾讯云 ASR 服务请求失败。')
      return payload
    } catch (error) {
      if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) throw new Error('腾讯云 ASR 请求超时。')
      if (error instanceof Error && error.message.startsWith('腾讯云 ASR')) throw error
      throw new Error('无法连接腾讯云 ASR，请检查网络或稍后重试。')
    }
  }
}

const normalizedCueText = (text: string): string => text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')

const isBoundaryDuplicate = (left: ChunkCue, right: ChunkCue): boolean => {
  if (left.chunkStartSeconds === right.chunkStartSeconds || normalizedCueText(left.text) !== normalizedCueText(right.text)) return false
  const overlapsOrTouches = left.startSeconds <= right.endSeconds + 0.5 && right.startSeconds <= left.endSeconds + 0.5
  if (!overlapsOrTouches) return false
  const rightNearChunkStart = right.startSeconds - right.chunkStartSeconds <= chunkOverlapSeconds + 0.5
  const leftNearChunkEnd = left.chunkEndSeconds - left.endSeconds <= chunkOverlapSeconds + 0.5
  return rightNearChunkStart || leftNearChunkEnd
}

export const reconcileChunkCues = (input: readonly ChunkCue[]): Array<Omit<ChunkCue, 'chunkStartSeconds' | 'chunkEndSeconds'>> => {
  const ordered = [...input].sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
  const reconciled: ChunkCue[] = []
  for (const cue of ordered) {
    let duplicateIndex = -1
    for (let index = reconciled.length - 1; index >= 0; index -= 1) {
      const previous = reconciled[index]
      if (cue.startSeconds - previous.endSeconds > 0.5) break
      if (isBoundaryDuplicate(previous, cue)) { duplicateIndex = index; break }
    }
    if (duplicateIndex < 0) {
      reconciled.push(cue)
      continue
    }
    const previous = reconciled[duplicateIndex]
    reconciled[duplicateIndex] = {
      ...previous,
      startSeconds: Math.min(previous.startSeconds, cue.startSeconds),
      endSeconds: Math.max(previous.endSeconds, cue.endSeconds),
      text: cue.text.length > previous.text.length ? cue.text : previous.text
    }
  }
  return reconciled.map(({ chunkStartSeconds: _chunkStartSeconds, chunkEndSeconds: _chunkEndSeconds, ...cue }) => cue)
}

const readDuration = async (runtime: Runtime, ffprobe: string, sourcePath: string): Promise<number> => {
  const result = assertSuccessfulProcess(await runtime.run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nokey=1:noprint_wrappers=1', sourcePath]))
  const duration = Number.parseFloat(result.stdout.trim())
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法读取视频时长，不能进行音频识别。')
  return duration
}

const asrError = (response: ResponseData, fallback: string): Error => {
  const code = response.Response?.Error?.Code ?? ''
  if (/^(AuthFailure|SignatureFailure|UnauthorizedOperation)/.test(code)) return new Error('腾讯云 ASR 鉴权失败，请检查 SecretId、SecretKey 与服务开通状态。')
  if (/^(RequestLimitExceeded|LimitExceeded|Throttling)/.test(code)) return new Error('腾讯云 ASR 当前限流，请稍后重试。')
  if (/UserHasNo|ServiceIsolate|UserNotRegistered/.test(code)) return new Error('腾讯云 ASR 服务不可用，请检查开通状态、余额或资源包。')
  return new Error(fallback)
}

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex')
const hmac = (key: string | Buffer, value: string): Buffer => createHmac('sha256', key).update(value).digest()
const authorizationFor = (credentials: Credentials, timestamp: number, action: string, body: string): string => {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10); const canonicalHeaders = `content-type:application/json\nhost:${host}\n`; const signedHeaders = 'content-type;host'
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${sha256(body)}`; const credentialScope = `${date}/asr/tc3_request`; const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${sha256(canonicalRequest)}`
  const secretDate = hmac(`TC3${credentials.secretKey}`, date); const secretService = hmac(secretDate, 'asr'); const signing = hmac(hmac(secretService, 'tc3_request'), stringToSign).toString('hex')
  return `TC3-HMAC-SHA256 Credential=${credentials.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signing}`
}
