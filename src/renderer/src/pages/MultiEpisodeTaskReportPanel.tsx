import type { ReactElement } from 'react'
import type { TaskReportItem, TaskSummary } from '../../../shared/contracts.js'

type Props = {
  task: TaskSummary | null
  items: TaskReportItem[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpenResults?: () => void | Promise<void>
  onOpenTaskCenter?: () => void
  onBackToPreflight: () => void
}

export const MultiEpisodeTaskReportPanel = ({ task, items, loading, error, onRetry, onOpenResults, onOpenTaskCenter, onBackToPreflight }: Props): ReactElement => {
  if (loading || (!task && !error)) return <div className="panel" role="status"><h2>正在读取本次任务结果</h2><p className="helper">将只显示当前多集拼接任务的持久化任务项和成果。</p></div>
  if (error) return <div className="panel" role="alert"><h2>无法读取本次任务结果</h2><p className="form-error">{error}</p><div className="toolbar"><button className="btn btn-secondary" type="button" onClick={onRetry}>重试读取</button><button className="btn" type="button" onClick={onBackToPreflight}>查看预检</button></div></div>

  const counts = countItems(items)
  const hasOutput = items.some((item) => item.outputPath !== null)
  const tone = task?.status === 'cancelled' ? 'warning' : counts.failed > 0 ? 'danger' : counts.skipped > 0 || counts.reduced > 0 ? 'warning' : 'success'
  const label = task?.status === 'cancelled' ? '任务已取消' : counts.failed > 0 ? '部分完成' : counts.skipped > 0 || counts.reduced > 0 ? '已完成（含缩减或跳过）' : '任务已完成'

  return <div className="multi-task-report" role="status">
    <div className="panel multi-task-report-head"><div><span className={`badge ${tone}`}>{label}</span><h2>本次任务结果已登记</h2><p>{task ? `已处理 ${task.progressCurrent} / ${task.progressTotal} 个可运行窗口。` : '当前任务汇总不可用。'}</p></div><button className="btn btn-primary" type="button" disabled={!hasOutput || !onOpenResults} title={hasOutput ? undefined : '本次任务没有可打开的输出成果。'} onClick={() => { void onOpenResults?.() }}>打开成果库</button></div>
    <div className="stats-row multi-task-report-stats"><Stat value={counts.succeeded} label="成功" /><Stat value={counts.reduced} label="缩减" /><Stat value={counts.skipped} label="跳过" /><Stat value={counts.failed} label="失败" /></div>
    {counts.cancelled > 0 && <p className="helper">已取消 {counts.cancelled} 项；已完成成果会继续保留。</p>}
    <section className="table-wrap multi-task-report-table" aria-labelledby="multi-task-report-items-title"><h3 id="multi-task-report-items-title">本次输出明细</h3><table><thead><tr><th>计划范围</th><th>实际输出</th><th>输出文件</th><th>状态</th><th>原因</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="num">{formatRange(item.plannedRange)}</td><td className="num">{formatRange(item.actualRange)}</td><td className="path" title={item.outputPath ?? undefined}>{item.outputPath ? fileName(item.outputPath) : '尚未生成输出文件'}</td><td><span className={`badge ${itemTone(item.status)}`}>{itemLabel(item.status)}</span></td><td>{item.reason ?? '—'}</td></tr>)}</tbody></table></section>
    <div className="toolbar multi-task-report-actions"><button className="btn btn-secondary" type="button" onClick={onBackToPreflight}>查看预检</button>{counts.failed > 0 && onOpenTaskCenter && <button className="btn btn-secondary" type="button" onClick={onOpenTaskCenter}>前往任务中心处理</button>}</div>
  </div>
}

const Stat = ({ value, label }: { value: number; label: string }): ReactElement => <div className="stat"><strong>{value}</strong><span>{label}</span></div>

const countItems = (items: readonly TaskReportItem[]): Record<'succeeded' | 'reduced' | 'skipped' | 'failed' | 'cancelled', number> => items.reduce((counts, item) => {
  if (item.status === 'reduced') counts.reduced += 1
  else if (item.status === 'skipped') counts.skipped += 1
  else if (item.status === 'failed') counts.failed += 1
  else if (item.status === 'cancelled') counts.cancelled += 1
  else if (item.status === 'succeeded' || item.status === 'exported') counts.succeeded += 1
  return counts
}, { succeeded: 0, reduced: 0, skipped: 0, failed: 0, cancelled: 0 })

const itemTone = (status: string): 'success' | 'warning' | 'danger' | 'neutral' => status === 'succeeded' || status === 'exported' ? 'success' : status === 'reduced' || status === 'skipped' || status === 'cancelled' ? 'warning' : status === 'failed' ? 'danger' : 'neutral'
const itemLabel = (status: string): string => status === 'succeeded' ? '成功' : status === 'exported' ? '已导出' : status === 'reduced' ? '已缩减' : status === 'skipped' ? '已跳过' : status === 'failed' ? '失败' : status === 'cancelled' ? '已取消' : status
const fileName = (path: string): string => path.split(/[\\/]/).at(-1) ?? path

const formatRange = (serialized: string | null): string => {
  if (!serialized) return '—'
  try {
    const value: unknown = JSON.parse(serialized)
    const numbers = Array.isArray(value) ? value : value !== null && typeof value === 'object' && 'actualRange' in value && Array.isArray(value.actualRange) ? value.actualRange : value !== null && typeof value === 'object' && 'episodeNumbers' in value && Array.isArray(value.episodeNumbers) ? value.episodeNumbers : null
    if (numbers?.every((number) => typeof number === 'number') && numbers.length > 0) return `第 ${String(numbers[0]).padStart(3, '0')}–${String(numbers.at(-1)).padStart(3, '0')} 集`
  } catch { /* Historical task rows can retain malformed range snapshots. */ }
  return '未记录范围'
}
