import type { ClipCandidate, ClipExportBatch, ClipExportBatchItem, EpisodeAsset, MaterialSummary } from '../../src/shared/contracts.js'
import { createPoolScenario } from './clip-module-scenarios.js'

export const reportRuntimeStates = ['success', 'partial', 'cancelled', 'no-batch', 'loading', 'error', 'deleted', 'long-results', 'legacy'] as const
export type ReportRuntimeState = typeof reportRuntimeStates[number]
export type ReportScenario = { state: ReportRuntimeState; dramaName: string; episodes: EpisodeAsset[]; candidates: ClipCandidate[]; batch: ClipExportBatch | null; materials: MaterialSummary[] }
export const createReportScenario = (state: ReportRuntimeState): ReportScenario => {
  const base = createPoolScenario('default')
  const statuses: ClipExportBatchItem['status'][] = state === 'partial' ? ['exported', 'failed'] : state === 'cancelled' ? ['exported', 'cancelled', 'not_output'] : Array.from({ length: state === 'long-results' ? 60 : 2 }, () => 'exported')
  const items = statuses.map((status, index): ClipExportBatchItem => ({ candidateId: `report-c${index + 1}`, sequenceNumber: index + 1, episodeId: 'e1', startSeconds: index * 10 + 1, endSeconds: index * 10 + 9, status, materialId: status === 'exported' ? `material-${index + 1}` : null, reason: status === 'failed' ? '隔离验证：源文件不可读取' : status === 'cancelled' ? '用户取消本次导出' : status === 'not_output' ? '取消后未开始输出' : null }))
  if (state === 'legacy') items.push({ candidateId: 'unknown', sequenceNumber: 3, status: 'exported', materialId: null, reason: null })
  const materials = items.filter(item => item.materialId).map((item, index): MaterialSummary => ({ id: item.materialId!, taskId: 'report-batch', taskItemId: null, path: `D:\\isolated-fixture\\${state === 'long-results' ? '长目录'.repeat(30) + '\\' : ''}第01集_切片${String(index + 1).padStart(2, '0')}.mp4`, durationSeconds: 8, fps: 25, sizeBytes: 4096, createdAt: '2026-10-19' }))
  const candidates = state === 'deleted' ? [] : items.filter(item => item.episodeId).map((item): ClipCandidate => ({ id: item.candidateId, sequenceNumber: item.sequenceNumber, episodeId: item.episodeId!, startSeconds: 200, endSeconds: 260, status: item.status === 'exported' ? 'exported' : 'confirmed', reason: null }))
  const batch: ClipExportBatch | null = state === 'no-batch' ? null : { id: 'report-batch', dramaId: 'fixture-drama', candidateIds: items.map(item => item.candidateId), items, status: state === 'partial' ? 'failed' : state === 'cancelled' ? 'cancelled' : 'completed', reason: null, config: { namingPattern: 'default', encoding: 'copy', precisionMode: 'final', outputSize: 'source', subtitleStrategy: 'none', conflictStrategy: 'append', qualityMode: 'original', bitrateKbps: null, targetSizeMb: null, fps: 'source', packagingEnabled: false }, createdAt: '2026-10-19', updatedAt: '2026-10-19' }
  return { state, dramaName: base.dramaName, episodes: base.episodes, candidates, batch, materials }
}
