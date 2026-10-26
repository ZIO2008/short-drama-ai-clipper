// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { ClipCandidate } from '../../../shared/contracts.js'
import { clipInspectorEvidenceText } from './clip-inspector-evidence.js'

const base: ClipCandidate = { id: 'candidate-1', episodeId: 'e1', startSeconds: 10, endSeconds: 25, status: 'pending_review', reason: null }

describe('clipInspectorEvidenceText', () => {
  it('renders frozen editorial and evidence facts without technical grades or provider details', () => {
    const text = clipInspectorEvidenceText({ ...base, semanticEventIds: ['event-1', 'event-2'], sceneAnchorIds: ['anchor-1'], evidence: { beat: 'climax', purpose: 'hook', context: 'limited', narrativeState: 'completion', seamStatus: 'closed', claims: [{ kind: 'core-event', evidenceCount: 2, reason: '核心事件已回链' }], reviewStatus: 'supported', reviewReason: '局部复核支持', durationDeviationSeconds: 2.2, durationDeviationReason: '与目标 12.0 秒偏离 2.2 秒。' } })
    expect(text).toContain('节拍：高点'); expect(text).toContain('用途：开场钩子'); expect(text).toContain('前后文受限'); expect(text).toContain('事件 2 个'); expect(text).toContain('局部视频复核已支持'); expect(text).toContain('偏离 2.2 秒'); expect(text).not.toContain('A')
  })

  it('does not invent evidence facts for historical or manual candidates', () => {
    expect(clipInspectorEvidenceText(base)).toContain('暂无完整自动证据快照')
  })

  it.each([0, 0.1, 0.499])('does not call a threshold-safe %.3f second difference a duration deviation', (durationDeviationSeconds) => {
    const text = clipInspectorEvidenceText({ ...base, evidence: { beat: 'climax', purpose: 'hook', context: 'standalone', narrativeState: 'completion', seamStatus: 'closed', claims: [], reviewStatus: 'not-required', reviewReason: null, durationDeviationSeconds, durationDeviationReason: null } })
    expect(text).not.toContain('时长偏离')
  })

  it('shows a duration deviation only when the frozen threshold reason exists', () => {
    const text = clipInspectorEvidenceText({ ...base, evidence: { beat: 'climax', purpose: 'hook', context: 'standalone', narrativeState: 'completion', seamStatus: 'closed', claims: [], reviewStatus: 'not-required', reviewReason: null, durationDeviationSeconds: 0.5, durationDeviationReason: '与目标 12.0 秒偏离 0.5 秒。' } })
    expect(text).toContain('偏离 0.5 秒')
  })
})
