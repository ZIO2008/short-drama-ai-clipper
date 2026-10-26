import { describe, expect, it } from 'vitest'
import { latestClipWorkspaceTaskNotice } from './clip-workspace-task-notice.js'
import type { TaskSummary } from '../../../shared/contracts.js'

const task = (reason: string): TaskSummary => ({ id: 'task', dramaName: 'fixture', type: 'original_clip', status: 'failed', progressCurrent: 0, progressTotal: 1, episodeIds: ['episode'], checkpointReason: reason })

describe('failed clip task recovery destination', () => {
  it.each(['一次自动修正后仍没有已收束候选。', '文本语义分析返回的结构化结果无效。'])('does not misroute a semantic failure to subtitle assets: %s', (reason) => {
    expect(latestClipWorkspaceTaskNotice([task(reason)], 'episode', false)).toEqual({ message: reason, recovery: undefined })
  })

  it('keeps real subtitle evidence failures linked to subtitle recovery', () => {
    const reason = 'ASR 时间锚点不足，字幕时间轴无法使用。'
    expect(latestClipWorkspaceTaskNotice([task(reason)], 'episode', false)).toEqual({ message: reason, recovery: 'subtitles' })
  })
})
