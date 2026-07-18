import type { ReactElement } from 'react'
import type { TaskSummary } from '../../../shared/contracts.js'

export const HeavyTaskProgress = ({ task }: { task: TaskSummary }): ReactElement => {
  const percent = task.progressTotal > 0 ? Math.min(100, Math.round((task.progressCurrent / task.progressTotal) * 100)) : 0
  return <div className="progress-shell" aria-label={`${task.dramaName}任务进度`}><div className="progress-top"><div><div className="meta">{task.type}</div><h3>{task.dramaName}</h3></div><span className="badge info">{task.status}</span></div><div className="progress"><span style={{ width: `${percent}%` }} /></div><div className="meta">已完成 {task.progressCurrent} / {task.progressTotal} 项 · {percent}%</div></div>
}
