import type { ClipCandidate, ClipEpisodeStatus, EpisodeAsset } from '../../src/shared/contracts.js'

export const poolRuntimeStates = ['default', 'loading', 'empty', 'search', 'generating', 'missing', 'exported', 'multi', 'high-volume', 'error'] as const
export type PoolRuntimeState = typeof poolRuntimeStates[number]
export type PoolScenario = { state: PoolRuntimeState; dramaName: string; episodes: EpisodeAsset[]; candidates: ClipCandidate[]; statuses: ClipEpisodeStatus[]; selectedEpisode: string; selectedIds: string[] }
export const poolEmptyCopy: Partial<Record<PoolRuntimeState, [string, string]>> = {
  loading: ['正在读取真实候选', '读取完成后会显示本集候选。'],
  empty: ['本集尚未生成真实候选', '生成完成后可在这里查看和确认候选。'],
  search: ['没有匹配当前筛选或搜索的候选', '请调整筛选或搜索条件。'],
  generating: ['本集正在生成候选', '生成完成后会显示本集真实候选。'],
  missing: ['源媒体缺失', '请返回剧目资产重新关联本集原片。'],
  error: ['候选读取失败', '真实候选、状态或完成批次读取失败。']
}

export const createPoolScenario = (state: PoolRuntimeState): PoolScenario => {
  const volume = state === 'high-volume'
  const episodes: EpisodeAsset[] = Array.from({ length: volume ? 100 : 2 }, (_, index) => ({ id: `e${index + 1}`, episodeNo: index + 1, sortOrder: index, sourcePath: state === 'missing' && index === 0 ? '' : `D:\isolated-fixture\${index + 1}.mp4`, durationSeconds: state === 'missing' && index === 0 ? null : 600, fps: 25, videoWidth: 1920, videoHeight: 1080, status: state === 'missing' && index === 0 ? 'missing' : 'ready' }))
  const noCandidates = ['loading', 'empty', 'generating', 'missing', 'error'].includes(state)
  const candidates: ClipCandidate[] = noCandidates ? [] : episodes.flatMap(episode => Array.from({ length: volume ? 50 : 4 }, (_, index) => ({ id: `${episode.id}-c${String(index + 1).padStart(2, '0')}`, sequenceNumber: index + 1, episodeId: episode.id, startSeconds: index * 10 + 1, endSeconds: index * 10 + 9, status: volume ? index < 5 ? 'confirmed' : 'pending_review' : (['confirmed', 'pending_review', 'exported', 'failed'] as const)[index]!, reason: null })))
  const statuses: ClipEpisodeStatus[] = episodes.map(episode => {
    const owned = candidates.filter(candidate => candidate.episodeId === episode.id)
    return { episodeId: episode.id, episodeNo: episode.episodeNo, sourceStatus: episode.status, candidateCount: owned.length, pendingCount: owned.filter(candidate => candidate.status === 'pending_review').length, confirmedCount: owned.filter(candidate => candidate.status === 'confirmed').length, exportedCount: owned.filter(candidate => candidate.status === 'exported').length, failedCount: owned.filter(candidate => candidate.status === 'failed').length, productionStatus: episode.id === 'e1' && state === 'generating' ? 'generating' : episode.id === 'e1' && state === 'missing' ? 'missing_media' : owned.length ? 'pending_confirmation' : 'ready_to_generate' }
  })
  return { state, dramaName: '隔离迁移测试剧目', episodes, candidates, statuses, selectedEpisode: 'e1', selectedIds: state === 'multi' ? ['e1-c01', 'e2-c01'] : [] }
}
