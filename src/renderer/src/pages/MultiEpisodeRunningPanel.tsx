import type { ReactElement } from 'react'
import type { TaskSummary } from '../../../shared/contracts.js'

type Props = {
  task: TaskSummary | null
  taskId: string
  taskControl: 'pending' | 'running' | 'paused' | 'cancelled'
  message: string | null
  onBack: () => void
  onControl: (action: 'pause' | 'resume' | 'cancel') => void
}

export const MultiEpisodeRunningPanel = ({ task, taskId, taskControl, message, onBack, onControl }: Props): ReactElement => {
  const total = task?.progressTotal ?? 0
  const current = task?.progressCurrent ?? 0
  const hasProgress = total > 0
  const progress = hasProgress ? Math.min(100, Math.max(0, (current / total) * 100)) : null
  const status = taskControl === 'paused' ? '已暂停' : taskControl === 'pending' ? '等待队列执行' : '运行中'

  return <div className="card progress-shell multi-episode-running" role="status">
    <div className="progress-top"><div><div className="meta">当前阶段 · {task?.checkpointStage ?? '未记录'}</div><h2>后台任务{status}</h2></div><span className={`badge ${taskControl === 'paused' ? 'warning' : 'info'}`}>{taskControl === 'paused' ? '已暂停' : taskControl === 'pending' ? '等待执行' : '运行中'}</span></div>
    <div className="progress" aria-label={hasProgress ? `任务进度 ${Math.round(progress ?? 0)}%` : '任务进度读取中'}><span className={progress === null && taskControl !== 'paused' ? 'progress-indeterminate' : ''} style={progress === null ? undefined : { width: `${progress}%` }} /></div>
    <p className="helper">{message ?? (hasProgress ? `已完成 ${current} / ${total} 个组合，正在读取当前任务状态。` : '正在读取已持久化任务进度。')}</p>
    <div className="stats-row"><Stat value={hasProgress ? String(current) : '—'} label="已完成组合" /><Stat value={hasProgress ? String(total) : '—'} label="计划组合" /><Stat value={formatElapsed(task?.elapsedMs)} label="已用时间" /><Stat value={taskId.slice(0, 8)} label="任务 ID" /></div>
    <div className="toolbar"><button className="btn btn-secondary" type="button" onClick={onBack}>转到后台</button>{taskControl === 'paused' ? <button className="btn btn-secondary" type="button" onClick={() => onControl('resume')}>继续任务</button> : <button className="btn btn-secondary" type="button" disabled={taskControl === 'pending'} onClick={() => onControl('pause')}>暂停任务</button>}<span className="spacer" /><button className="btn btn-danger" type="button" onClick={() => onControl('cancel')}>取消任务</button></div>
  </div>
}

const Stat = ({ value, label }: { value: string; label: string }): ReactElement => <div className="stat"><strong>{value}</strong><span>{label}</span></div>

const formatElapsed = (elapsedMs: number | undefined): string => {
  if (elapsedMs === undefined || elapsedMs < 0) return '—'
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
