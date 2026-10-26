import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { boundedReviewFramePts, ClipMultimodalReviewService } from './clip-multimodal-review-service.js'
import { buildClipGenerationProviderChain, buildClipGenerationRequestKey, snapshotClipGenerationProvider } from './clip-generation-request-key.js'

describe('boundedReviewFramePts', () => {
  it('limits visual review to boundary-adjacent, actual PTS frames', () => {
    expect(boundedReviewFramePts([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8], 0.25, 0.65)).toEqual([0.2, 0.3, 0.4, 0.6, 0.7, 0.8])
  })

  it('deduplicates close boundary windows and never invents a requested timestamp', () => {
    expect(boundedReviewFramePts([0, 0.04, 0.08, 0.12], 0.041, 0.079)).toEqual([0.04, 0.08, 0.12])
  })

  it('rejects a changed or newly added multimodal provider before calling the adapter', async () => {
    const evidenceId = randomUUID()
    const frozen = { id: 'vision', capability: 'multimodal-review', region: 'local', provider: 'fixture', endpoint: 'http://127.0.0.1:3000', model: 'vision-v1', modelSelectionSource: null, secretRef: null, timeoutMs: 1_000, pricing: null }
    const current = { ...frozen, model: 'vision-v2' }
    const adapter = { review: vi.fn(async () => ({ factCode: 'fact-1', conclusion: 'supported', evidenceIds: [evidenceId], claimKinds: ['core-event'], reason: 'fixture' })) }
    const service = new ClipMultimodalReviewService({ list: () => [current] }, () => true, adapter)
    const input = { package: { id: 'package', dramaId: 'd', episodeId: 'e', version: 1, sourceMediaFingerprint: 'media', ruleVersion: 'test', status: 'ready' as const, reason: null }, factCode: 'fact-1', evidenceIds: [evidenceId], claimKinds: ['core-event'] as const, reviewQuestion: '这些帧是否证明核心视觉事件成立？', frames: [{ ptsSeconds: 1, dataUrl: 'data:image/jpeg;base64,ZmFrZQ==', sha256: 'fixture', byteLength: 4 }] }

    await expect(service.review(input, snapshotClipGenerationProvider(frozen))).rejects.toThrow('排队期间变化')
    await expect(service.review(input, null)).rejects.toThrow('未冻结视频复核供应商')
    expect(adapter.review).not.toHaveBeenCalled()
  })

  it('includes the multimodal provider in request identity and blocks mandatory review without one', () => {
    const text = { id: 'text', capability: 'text-analysis', region: 'local', provider: 'fixture', endpoint: 'http://127.0.0.1:3000', model: 'text-v1', modelSelectionSource: null, secretRef: null, timeoutMs: 1_000, pricing: null }
    const vision = { ...text, id: 'vision', capability: 'multimodal-review', model: 'vision-v1' }
    const input = { episodeIds: ['e'], candidatesPerEpisode: 1, targetDurationSeconds: 12, maxOverlapRatio: 0.25, allowRepeat: false }
    const packageIdentity = { id: 'package', episodeId: 'e', version: 1, sourceMediaFingerprint: 'media', ruleVersion: 'test' }
    const withoutVision = buildClipGenerationProviderChain(text, [text], () => true, false)
    const withVision = buildClipGenerationProviderChain(text, [text, vision], () => true, true)
    expect(buildClipGenerationRequestKey('d', input, withoutVision, [packageIdentity])).not.toBe(buildClipGenerationRequestKey('d', input, withVision, [packageIdentity]))
    expect(() => buildClipGenerationProviderChain(text, [text], () => true, true)).toThrow('缺少可用且可冻结的视频复核能力')
  })

  it('rejects provider claim kinds outside the locally requested visual fact', async () => {
    const evidenceId = randomUUID()
    const profile = { id: 'vision', capability: 'multimodal-review', region: 'local', provider: 'fixture', endpoint: 'http://127.0.0.1:3000', model: 'vision-v1', secretRef: null, timeoutMs: 1_000, pricing: null }
    const adapter = { review: vi.fn(async () => ({ factCode: 'fact-1', conclusion: 'supported', evidenceIds: [evidenceId], claimKinds: ['end-boundary'], reason: 'fixture' })) }
    const service = new ClipMultimodalReviewService({ list: () => [profile] }, () => true, adapter)
    await expect(service.review({ package: { id: 'package', dramaId: 'd', episodeId: 'e', version: 1, sourceMediaFingerprint: 'media', ruleVersion: 'test', status: 'ready', reason: null }, factCode: 'fact-1', evidenceIds: [evidenceId], claimKinds: ['core-event'], reviewQuestion: '这些帧是否证明核心视觉事件成立？', frames: [{ ptsSeconds: 1, dataUrl: 'data:image/jpeg;base64,ZmFrZQ==', sha256: 'fixture', byteLength: 4 }] })).rejects.toThrow('视频复核返回无效')
    expect(adapter.review).toHaveBeenCalledTimes(2)
  })

  it('requires supported results to name claims and unclear results to name none', async () => {
    const evidenceId = randomUUID()
    const profile = { id: 'vision', capability: 'multimodal-review', region: 'local', provider: 'fixture', endpoint: 'http://127.0.0.1:3000', model: 'vision-v1', secretRef: null, timeoutMs: 1_000, pricing: null }
    const base = { package: { id: 'package', dramaId: 'd', episodeId: 'e', version: 1, sourceMediaFingerprint: 'media', ruleVersion: 'test', status: 'ready' as const, reason: null }, factCode: 'fact-1', evidenceIds: [evidenceId], claimKinds: ['core-event'] as const, reviewQuestion: '这些帧是否证明核心视觉事件成立？', frames: [{ ptsSeconds: 1, dataUrl: 'data:image/jpeg;base64,ZmFrZQ==', sha256: 'fixture', byteLength: 4 }] }
    const unclear = new ClipMultimodalReviewService({ list: () => [profile] }, () => true, { review: async () => ({ factCode: 'fact-1', conclusion: 'unclear', evidenceIds: [evidenceId], claimKinds: [], reason: '证据不足' }) })
    await expect(unclear.review(base)).resolves.toMatchObject({ result: { conclusion: 'unclear', claimKinds: [] } })
    const falseSupport = new ClipMultimodalReviewService({ list: () => [profile] }, () => true, { review: async () => ({ factCode: 'fact-1', conclusion: 'supported', evidenceIds: [evidenceId], claimKinds: [], reason: '未声明支持项' }) })
    await expect(falseSupport.review(base)).rejects.toThrow('视频复核返回无效')
  })
})
