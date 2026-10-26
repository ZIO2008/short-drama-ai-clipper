import { createHash } from 'node:crypto'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import type { ClipEvidencePackage } from './clip-evidence-package-service.js'
import type { ProviderProfile } from './provider-profile-service.js'
import { resolveMediaBinary, runMediaProcess } from '../media/ffmpeg-runner.js'
import { readSourceVideoFramePts } from '../media/scene-anchor-pts-verifier.js'
import { clipGenerationProviderMatches, type ClipGenerationProviderSnapshot } from './clip-generation-request-key.js'

export type ClipMultimodalReviewResult = {
  factCode: string
  conclusion: 'supported' | 'not-supported' | 'unclear'
  evidenceIds: string[]
  claimKinds: ClipReviewClaimKind[]
  reason: string
}
export type ClipReviewClaimKind = 'start-boundary' | 'end-boundary' | 'core-event' | 'narrative-closure'
export type ClipReviewFrame = { ptsSeconds: number; dataUrl: string; sha256: string; byteLength: number }
const CLAIM_LABELS: Record<ClipReviewClaimKind, string> = { 'start-boundary': '起始边界', 'end-boundary': '结束边界', 'core-event': '核心视觉事件', 'narrative-closure': '叙事收束' }
export const buildClipReviewQuestion = (factStatement: string, claimKinds: readonly ClipReviewClaimKind[]): string => `这些连续帧是否清楚证明以下本地命题：“${factStatement}”，并支持${claimKinds.map((kind) => CLAIM_LABELS[kind]).join('、')}？证据不足时必须回答 unclear。`

export type ClipMultimodalReviewAdapter = {
  review(input: {
    package: ClipEvidencePackage
    profile: ProviderProfile
    factCode: string
    evidenceIds: readonly string[]
    claimKinds: readonly ClipReviewClaimKind[]
    reviewQuestion: string
    frames: ReadonlyArray<ClipReviewFrame>
    repair?: { invalidResult: string }
    signal?: AbortSignal
  }): Promise<unknown>
}

export class ClipMultimodalReviewService {
  constructor(private readonly profiles: { list: () => ProviderProfile[] }, private readonly hasValidSecret: (secretRef: string) => boolean, private readonly adapter: ClipMultimodalReviewAdapter) {}

  async review(input: Omit<Parameters<ClipMultimodalReviewAdapter['review']>[0], 'profile' | 'repair'>, expectedProvider?: ClipGenerationProviderSnapshot | null): Promise<{ result: ClipMultimodalReviewResult; profile: ProviderProfile; retried: boolean }> {
    const profile = this.profiles.list().find((item) => item.capability === 'multimodal-review')
    if (!profile || !profile.endpoint || !profile.model || (profile.region !== 'local' && (!profile.secretRef || !this.hasValidSecret(profile.secretRef)))) throw new Error('必须复核的视觉事实缺少可用视频复核能力，系统未纳入候选。')
    if (expectedProvider === null) throw new Error('当前任务未冻结视频复核供应商，不能在排队后临时启用。')
    if (expectedProvider && !clipGenerationProviderMatches(profile, expectedProvider)) throw new Error('视频复核供应商配置已在排队期间变化；冻结任务不会静默切换供应商，请重新生成。')
    let repair: { invalidResult: string } | undefined
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const raw = await this.adapter.review({ ...input, profile, repair })
      const parsed = reviewResultSchema.safeParse(raw)
      const valid = parsed.success
        && parsed.data.factCode === input.factCode
        && parsed.data.evidenceIds.every((id) => input.evidenceIds.includes(id))
        && parsed.data.claimKinds.every((kind) => input.claimKinds.includes(kind))
        && (parsed.data.conclusion === 'supported' ? parsed.data.claimKinds.length > 0 : parsed.data.claimKinds.length === 0)
      if (valid) return { result: parsed.data, profile, retried: attempt === 1 }
      repair = { invalidResult: parsed.success ? '返回了不匹配的事实代码、复核范围之外的证据 ID 或结论类型。' : '返回结构不符合受限视频复核合同。' }
    }
    throw new Error('视频复核返回无效，系统未纳入候选。')
  }
}

const reviewResultSchema = z.object({ factCode: z.string().trim().min(1).max(100), conclusion: z.enum(['supported', 'not-supported', 'unclear']), evidenceIds: z.array(z.string().uuid()).min(1).max(50), claimKinds: z.array(z.enum(['start-boundary', 'end-boundary', 'core-event', 'narrative-closure'])).max(4), reason: z.string().trim().min(1).max(500) }).strict()

export const boundedReviewFramePts = (framePts: readonly number[], startSeconds: number, endSeconds: number, additionalBoundaries: readonly number[] = []): number[] => {
  const around = (target: number): number[] => {
    const right = framePts.findIndex((point) => point >= target)
    const after = right < 0 ? framePts.length - 1 : right
    return [after - 1, after, after + 1].filter((index) => index >= 0 && index < framePts.length).map((index) => framePts[index]!)
  }
  return [...new Set([startSeconds, endSeconds, ...additionalBoundaries].flatMap(around))].sort((left, right) => left - right).slice(0, 12)
}

export const extractBoundedReviewFrames = async (sourcePath: string, startSeconds: number, endSeconds: number, signal?: AbortSignal, unitBoundaries: readonly number[] = []): Promise<ClipReviewFrame[]> => {
  const binary = resolveMediaBinary('ffmpeg')
  if (!binary) throw new Error('本机 FFmpeg 不可用，无法验证必须复核的视觉事实。')
  const pts = readSourceVideoFramePts(sourcePath)
  if (!pts) throw new Error('无法读取候选边界附近的实际 PTS 帧，系统未猜测视觉结论。')
  const points = boundedReviewFramePts(pts.timestamps, startSeconds, endSeconds, unitBoundaries)
  if (!points.length) throw new Error('候选边界附近没有可复核的实际 PTS 帧，系统未纳入候选。')
  const folder = await mkdtemp(join(tmpdir(), 'shortdrama-clip-review-'))
  try {
    const frames: ClipReviewFrame[] = []
    for (const [index, point] of points.entries()) {
      const path = join(folder, `frame-${index}.jpg`)
      const result = await runMediaProcess(binary, ['-v', 'error', '-ss', String(point), '-i', sourcePath, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', '-y', path], { signal })
      if (result.exitCode !== 0) throw new Error('无法提取候选边界的实际 PTS 帧，系统未猜测视觉结论。')
      const bytes = await readFile(path)
      frames.push({ ptsSeconds: point, dataUrl: `data:image/jpeg;base64,${bytes.toString('base64')}`, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength })
    }
    return frames
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}
