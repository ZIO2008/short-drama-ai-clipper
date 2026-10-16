import type { TaskSummary } from '../../../shared/contracts.js'

export type ClipWorkspaceTaskNotice = { message: string; recovery?: 'assets' | 'subtitles'; deadlineTaskId?: string }

const recoveryFromReason = (reason: string): 'assets' | 'subtitles' | undefined =>
  /素材|视频|视觉|PTS|帧|媒体/.test(reason) ? 'assets' : /字幕|OCR|ASR|时间轴|时间码/.test(reason) ? 'subtitles' : undefined

const terminalFallback = (status: string): string => status === 'cancelled'
  ? '候选生成已取消；此前稳定候选未被覆盖。'
  : status === 'interrupted'
    ? '应用关闭或重启中断了候选生成；供应商请求没有自动重放，请重新生成。'
    : '候选生成失败；未发布不完整结果。'

export const latestClipWorkspaceTaskNotice = (tasks: readonly TaskSummary[], episodeId: string, locallyGenerating: boolean): ClipWorkspaceTaskNotice | null => {
  if (locallyGenerating) return null
  const newest = tasks
    .filter((task) => task.type === 'original_clip' && task.episodeIds?.includes(episodeId))
    .sort((left, right) => (right.taskRound ?? 0) - (left.taskRound ?? 0) || (right.updatedAt ?? right.createdAt ?? '').localeCompare(left.updatedAt ?? left.createdAt ?? '') || right.id.localeCompare(left.id))[0]
  if (!newest) return null
  if (newest.checkpointStage === 'awaiting-decision') return { message: newest.checkpointReason ?? '候选生成已达到阶段目标时间；请在有限期限内继续或停止。', deadlineTaskId: newest.id }
  const reason = newest.checkpointReason ?? ''
  if (/未纳入|blocked|证据门禁|视觉复核/.test(reason)) return { message: reason, recovery: recoveryFromReason(reason) }
  if (['cancelled', 'interrupted', 'failed'].includes(newest.status)) { const message = reason || terminalFallback(newest.status); return { message, recovery: recoveryFromReason(message) } }
  return null
}
