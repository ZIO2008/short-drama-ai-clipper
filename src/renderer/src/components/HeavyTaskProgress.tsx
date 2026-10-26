import type { ReactElement } from 'react'
import type { TaskSummary } from '../../../shared/contracts.js'

export const HeavyTaskProgress = ({ task }: { task: TaskSummary }): ReactElement => {
  const percent = task.progressTotal > 0 ? Math.min(100, Math.round((task.progressCurrent / task.progressTotal) * 100)) : 0
  const stage = task.checkpointStage ?? (task.status === 'running' ? '处理中' : task.status === 'paused' ? '已暂停，等待继续' : task.status === 'pending' ? '等待开始' : task.status === 'completed' ? '已完成' : task.status)
  const deadline = task.decisionDeadlineAt ? ` · 决策截止 ${new Date(task.decisionDeadlineAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''
  return <div className="progress-shell" aria-label={`${task.dramaName}任务进度`}><div className="progress-top"><div><div className="meta">{task.type}</div><h3>{task.dramaName}</h3></div><span className="badge info">{task.status}</span></div><div className="progress"><span style={{ width: `${percent}%` }} /></div><div className="meta">当前阶段：{stage} · 已完成 {task.progressCurrent} / {task.progressTotal} 项 · {percent}%{deadline}{task.updatedAt ? ` · 最近更新 ${new Date(task.updatedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}</div>{task.checkpointReason && <p className="helper">{task.checkpointReason}</p>}</div>
}
