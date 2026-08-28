import type { ClipCandidate } from '../../../shared/contracts.js'

const beatLabel: Record<NonNullable<ClipCandidate['evidence']>['beat'], string> = { setup: '铺垫', entry: '进入事件', escalation: '冲突升级', reversal: '反转', climax: '高点', reaction: '反应', aftermath: '余波' }
const purposeLabel: Record<NonNullable<ClipCandidate['evidence']>['purpose'], string> = { hook: '开场钩子', conflict: '冲突', reveal: '揭示', emotion: '情绪', transition: '转场' }
const contextLabel: Record<NonNullable<ClipCandidate['evidence']>['context'], string> = { standalone: '可独立审阅', limited: '前后文受限' }
const reviewLabel: Record<NonNullable<ClipCandidate['evidence']>['reviewStatus'], string> = { 'not-required': '无需视频复核', supported: '局部视频复核已支持', failed: '视频复核未完成' }

export const clipInspectorEvidenceText = (candidate: ClipCandidate): string => {
  const evidence = candidate.evidence
  if (!evidence) return '暂无完整自动证据快照；当前仅显示候选范围和状态。'
  const claims = evidence.claims.length ? `已回链 ${evidence.claims.length} 项证据结论` : '已回链事件与锚点'
  const deviation = evidence.durationDeviationReason
  return [
    `节拍：${beatLabel[evidence.beat]} · 用途：${purposeLabel[evidence.purpose]} · ${contextLabel[evidence.context]}`,
    `事件 ${candidate.semanticEventIds?.length ?? 0} 个 · 场景锚 ${candidate.sceneAnchorIds?.length ?? 0} 个 · ${claims}`,
    `叙事${evidence.narrativeState === 'completion' ? '已收束' : '状态已记录'} · ${reviewLabel[evidence.reviewStatus]}${deviation ? ` · ${deviation}` : ''}`
  ].join('；')
}
