import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import type { TaskReportItem, TaskSummary } from '../../../shared/contracts.js'

type Props = { tasks: TaskSummary[]; loading: boolean; error: string | null; focusTaskId?: string | null; onReload: () => void; onRetry: (id: string) => Promise<void> }
const RETRYABLE = new Set(['failed', 'partial', 'partially_completed', 'partial_completed'])
const RECOVERABLE = new Set(['pending', 'paused', 'running'])
const labels: Record<string, string> = { running: '运行中', pending: '可继续', paused: '已暂停', partial: '部分完成', partially_completed: '部分完成', failed: '连续失败', completed: '已完成', cancelled: '已取消', succeeded: '成功', exported: '成功', reduced: '已缩减', skipped: '已跳过', exporting: '导出中', reviewing: '待确认' }
const typeLabels: Record<string, string> = { multi_episode: '多集拼接', original_clip: '原剧切片', ai_remix: 'AI 爆点前置二创' }

export const TaskCenterPage = ({ tasks, loading, error, focusTaskId = null, onReload, onRetry }: Props): ReactElement => {
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dramaFilter, setDramaFilter] = useState('all')
  const [selected, setSelected] = useState<TaskSummary | null>(null)
  const [dismissedFocusId, setDismissedFocusId] = useState<string | null>(null)
  const [report, setReport] = useState<TaskReportItem[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const statuses = useMemo(() => [...new Set(tasks.map(({ status }) => status))].sort(), [tasks])
  const types = useMemo(() => [...new Set(tasks.map(({ type }) => type))].sort(), [tasks])
  const dramas = useMemo(() => [...new Set(tasks.map(({ dramaName }) => dramaName))].sort((a, b) => a.localeCompare(b, 'zh-CN')), [tasks])
  const visible = useMemo(() => tasks.filter((task) =>
    (statusFilter === 'all' || task.status === statusFilter) &&
    (typeFilter === 'all' || task.type === typeFilter) &&
    (dramaFilter === 'all' || task.dramaName === dramaFilter)
  ), [dramaFilter, statusFilter, tasks, typeFilter])
  const totals = useMemo(() => ({
    succeeded: report.filter(({ status }) => status === 'succeeded' || status === 'exported').length,
    reduced: report.filter(({ status }) => status === 'reduced').length,
    skipped: report.filter(({ status }) => status === 'skipped' || status === 'cancelled').length,
    failed: report.filter(({ status }) => status === 'failed').length
  }), [report])

  useEffect(() => {
    if (selected) closeRef.current?.focus()
    else if (triggerRef.current?.isConnected) triggerRef.current.focus()
  }, [selected])

  const open = async (task: TaskSummary, trigger?: HTMLElement): Promise<void> => {
    if (trigger) triggerRef.current = trigger
    setSelected(task)
    setReport([])
    setReportError(null)
    setReportLoading(true)
    try {
      const taskReport = await window.desktopApi.getTaskReport(task.id)
      setReport(Array.isArray(taskReport) ? taskReport : [])
    }
    catch (reportFailure) { setReportError(reportFailure instanceof Error ? reportFailure.message : '无法读取任务报告。') }
    finally { setReportLoading(false) }
  }
  useEffect(() => {
    if (!focusTaskId || focusTaskId === dismissedFocusId || selected || loading) return
    const target = tasks.find((task) => task.id === focusTaskId)
    if (target) void open(target)
  }, [dismissedFocusId, focusTaskId, loading, selected, tasks])
  const close = (): void => { setDismissedFocusId(focusTaskId); setSelected(null) }
  const recover = async (task: TaskSummary): Promise<void> => {
    setActionError(null)
    try {
      if (task.type === 'ai_remix') await window.desktopApi.recoverAiRemixTask(task.id)
      else await window.desktopApi.recoverProductionTask(task.id)
      setSelected((current) => current?.id === task.id ? { ...current, status: 'pending' } : current)
      onReload()
    }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : '任务恢复失败，请重试。') }
  }

  const retryFailedItems = async (taskId: string): Promise<void> => {
    setActionError(null)
    try {
      await onRetry(taskId)
      const latestTasks = await window.desktopApi.listTasks()
      const refreshed = latestTasks.find((task) => task.id === taskId)
      if (!refreshed) throw new Error('任务重试后未能重新读取任务状态。')
      await open(refreshed)
      onReload()
    }
    catch (reason) { setActionError(reason instanceof Error ? reason.message : '失败项重试未能启动，请检查任务状态后重试。') }
  }
  const control = async (id: string, action: 'pause' | 'resume' | 'cancel'): Promise<void> => {
    setActionError(null)
    try {
      if (action === 'pause') await window.desktopApi.pauseProductionTask(id)
      if (action === 'resume') await window.desktopApi.resumeProductionTask(id)
      if (action === 'cancel') await window.desktopApi.cancelProductionTask(id)
      const status = action === 'pause' ? 'paused' : action === 'resume' ? 'running' : 'cancelled'
      setSelected((current) => current?.id === id ? { ...current, status } : current)
      onReload()
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : '任务控制失败，请重试。') }
  }
  const openFromKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, task: TaskSummary): void => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); void open(task, event.currentTarget) }
  }
  const trapDrawerFocus = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'Tab') return
    const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]!; const last = focusable.at(-1)!
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  const clearFilters = (): void => { setStatusFilter('all'); setTypeFilter('all'); setDramaFilter('all') }

  return <section aria-labelledby="tasks-title">
    <div className="screen-head"><div><h1 id="tasks-title">任务中心</h1><p>监控所有剧目的任务状态、阶段与恢复操作。</p></div><span className="badge info">默认后台优先</span></div>
    <div className="toolbar task-filters" aria-label="任务筛选">
      <label className="field">状态<select className="select" aria-label="按状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">全部状态</option>{statuses.map((status) => <option key={status} value={status}>{labels[status] ?? status}</option>)}</select></label>
      <label className="field">类型<select className="select" aria-label="按类型筛选" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">全部类型</option>{types.map((type) => <option key={type} value={type}>{typeLabels[type] ?? type}</option>)}</select></label>
      <label className="field">剧目<select className="select" aria-label="按剧目筛选" value={dramaFilter} onChange={(event) => setDramaFilter(event.target.value)}><option value="all">全部剧目</option>{dramas.map((drama) => <option key={drama} value={drama}>{drama}</option>)}</select></label>
      <button className="btn" type="button" onClick={clearFilters}>清除筛选</button>
    </div>
    {error && <div className="state-panel state-panel-error" role="alert"><p>{error}</p><button className="btn" type="button" onClick={onReload}>重试读取</button></div>}
    {actionError && !selected && <div className="state-panel state-panel-error" role="alert"><strong>任务操作未完成</strong><p>{actionError}</p></div>}
    <div className="card table-wrap task-table-wrap" aria-busy={loading}><table><thead><tr><th>剧目 / 任务</th><th>类型</th><th>状态</th><th>进度</th><th>已用时间</th><th>当前阶段</th><th>最近更新</th></tr></thead><tbody>{loading && <tr><td colSpan={7}><div className="state-copy" role="status">正在读取任务…</div></td></tr>}{visible.map((task) => <tr key={task.id} className="task-row" tabIndex={0} aria-label={`查看${task.dramaName}${typeLabels[task.type] ?? task.type}详情`} onClick={(event) => void open(task, event.currentTarget)} onKeyDown={(event) => openFromKeyboard(event, task)}><td><strong>{task.dramaName}</strong><div className="meta">任务 {task.id.slice(0, 8)}</div></td><td>{typeLabels[task.type] ?? task.type}</td><td><span className="badge">{labels[task.status] ?? task.status}</span></td><td className="num">{task.progressCurrent} / {task.progressTotal}</td><td className="num">{formatElapsed(task.startedAt, task.updatedAt, task.status)}</td><td>{phaseLabel(task)}{task.decisionDeadlineAt && <div className="meta">决策截止 {new Date(task.decisionDeadlineAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>}{task.checkpointReason && <div className="meta">{task.checkpointReason}</div>}</td><td className="num">{formatUpdated(task.updatedAt)}</td></tr>)}</tbody></table>
      {!loading && tasks.length === 0 && <div className="empty" role="status"><div><strong>还没有生产任务</strong><p>从剧目的素材生产页创建原剧切片或多集拼接任务。</p></div></div>}
      {!loading && tasks.length > 0 && visible.length === 0 && <div className="empty" role="status"><div><strong>筛选后没有任务</strong><p>调整筛选条件，或清除筛选查看全部任务。</p></div></div>}
    </div>
    {selected && <aside ref={drawerRef} className="drawer open task-detail-drawer" role="dialog" aria-modal="false" aria-labelledby="task-detail-title" onKeyDown={trapDrawerFocus}><div className="drawer-head"><div><div className="meta">任务详情</div><h2 id="task-detail-title">{selected.dramaName}</h2></div><button ref={closeRef} className="btn" type="button" onClick={close}>关闭</button></div><div className="drawer-body"><section className="task-snapshot"><div className="meta">任务快照</div><h2>{selected.dramaName}</h2><p className="helper">配置快照随任务保存；修改全局设置不会改变已开始任务的参数。</p><div className="task-snapshot-stats"><div><strong>{selected.progressCurrent} / {selected.progressTotal}</strong><span>完成量</span></div><div><strong>{formatElapsed(selected.startedAt, selected.updatedAt, selected.status)}</strong><span>已用时间</span></div></div><div className="task-snapshot-meta">当前阶段：{phaseLabel(selected)} · {labels[selected.status] ?? selected.status}</div></section>{hasTaskControls(selected) && <section className="task-control-panel" aria-labelledby="task-controls-title"><h3 id="task-controls-title">任务控制</h3><div className="task-control-actions">{selected.type === 'ai_remix' ? <>{selected.checkpointStage === 'awaiting-decision' && <><button className="btn" type="button" onClick={() => void window.desktopApi.decideAiRemixTaskDuration(selected.id, 'continue').then(onReload)}>再等 10 分钟</button><button className="btn btn-danger" type="button" onClick={() => void window.desktopApi.decideAiRemixTaskDuration(selected.id, 'stop').then(onReload)}>停止并保留检查点</button></>}{selected.checkpointStage === 'force-stopped' && <button className="btn" type="button" onClick={() => void recover(selected)}>从检查点恢复</button>}</> : <>{selected.type === 'original_clip' && selected.checkpointStage === 'awaiting-decision' && <p className="helper">请回到原剧切片工作区完成本次继续或停止决策。</p>}{selected.status === 'running' && <>{selected.type !== 'original_clip' && <button className="btn" type="button" onClick={() => void control(selected.id, 'pause')}>暂停</button>}<button className="btn btn-danger" type="button" onClick={() => void control(selected.id, 'cancel')}>取消</button></>}{selected.type !== 'original_clip' && selected.status === 'paused' && <><button className="btn" type="button" onClick={() => void control(selected.id, 'resume')}>继续任务</button><button className="btn btn-danger" type="button" onClick={() => void control(selected.id, 'cancel')}>取消</button></>}{selected.type !== 'original_clip' && RECOVERABLE.has(selected.status) && selected.status !== 'running' && selected.status !== 'paused' && <button className="btn" type="button" onClick={() => void recover(selected)}>继续任务</button>}{RETRYABLE.has(selected.status) && <button className="btn" type="button" onClick={() => void retryFailedItems(selected.id)}>重试失败项</button>}</>}</div>{actionError && <div className="state-panel state-panel-error" role="alert"><p>{actionError}</p></div>}</section>}<h3>聚合完成报告</h3><div className="task-report-summary" aria-label="任务结果汇总">{reportLoading || reportError ? <><span>总计 —</span><span>成功 —</span><span>缩减 —</span><span>跳过 —</span><span>失败 —</span></> : <><span>总计 {report.length}</span><span>成功 {totals.succeeded}</span><span>缩减 {totals.reduced}</span><span>跳过 {totals.skipped}</span><span>失败 {totals.failed}</span></>}</div><h3>逐窗口报告</h3>{reportLoading && <div className="state-panel" role="status">正在读取逐窗口报告…</div>}{reportError && <div className="state-panel state-panel-error" role="alert"><p>{reportError}</p><button className="btn" type="button" onClick={() => void open(selected)}>重试读取报告</button></div>}{!reportLoading && !reportError && report.length === 0 && <div className="empty compact-empty" role="status"><div><strong>暂无任务项报告</strong><p>任务创建后会在这里记录每个窗口。</p></div></div>}{!reportLoading && !reportError && report.length > 0 && <div className="table-wrap"><table><thead><tr><th>计划</th><th>实际</th><th>状态</th><th>原因</th><th>成果</th></tr></thead><tbody>{report.map((item) => <tr key={item.id}><td>{formatRange(item.plannedRange)}</td><td>{formatRange(item.actualRange)}</td><td>{labels[item.status] ?? item.status}</td><td>{item.reason ?? '—'}</td><td>{item.outputPath ? <button className="btn" type="button" onClick={() => void window.desktopApi.openPath(item.outputPath!)}>打开文件位置</button> : '—'}</td></tr>)}</tbody></table></div>}</div></aside>}
  </section>
}

const hasTaskControls = (task: TaskSummary): boolean => task.status === 'running' || task.status === 'paused' || RECOVERABLE.has(task.status) || RETRYABLE.has(task.status)

export const formatRange = (raw: string | null): string => {
  if (!raw) return '—'
  try {
    const value: unknown = JSON.parse(raw)
    if (Array.isArray(value) && value.every((part) => typeof part === 'number')) return formatEpisodeNumbers(value)
    if (isRecord(value)) {
      const actual = value.actualRange
      const numbers = Array.isArray(actual) ? actual : value.episodeNumbers
      if (Array.isArray(numbers) && numbers.every((part) => typeof part === 'number')) return formatEpisodeNumbers(numbers)
      if (typeof value.startEpisode === 'number' && typeof value.endEpisode === 'number') return `第 ${padEpisode(value.startEpisode)}–${padEpisode(value.endEpisode)} 集`
      if (typeof value.startSeconds === 'number' && typeof value.endSeconds === 'number') return `${value.startSeconds.toFixed(3)}–${value.endSeconds.toFixed(3)} 秒`
    }
  } catch { return raw }
  return raw
}

const formatEpisodeNumbers = (numbers: number[]): string => numbers.length === 0 ? '—' : `第 ${padEpisode(numbers[0]!)}–${padEpisode(numbers.at(-1)!)} 集`
const padEpisode = (value: number): string => String(value).padStart(3, '0')
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const phaseLabel = (task: TaskSummary): string => task.checkpointStage ?? (task.status === 'running' ? '处理中' : task.status === 'pending' ? '等待开始' : task.status === 'paused' ? '已暂停' : task.status === 'completed' ? '已完成' : labels[task.status] ?? task.status)
export const formatElapsed = (startedAt?: string | null, updatedAt?: string, status?: string, elapsedMs?: number, activeSince?: string | null): string => {
  if (!startedAt) return '—'
  if (typeof elapsedMs === 'number') {
    const runningMs = activeSince && status === 'running' ? Math.max(0, Date.now() - new Date(activeSince).getTime()) : 0
    const seconds = Math.max(0, Math.round((elapsedMs + runningMs) / 1000))
    return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分钟`
  }
  const started = new Date(startedAt).getTime()
  const terminal = status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'paused' || status === 'partial' || status === 'partially_completed' || status === 'partial_completed'
  const ended = terminal && updatedAt ? new Date(updatedAt).getTime() : Date.now()
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return '—'
  const seconds = Math.max(0, Math.round((ended - started) / 1000))
  return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分钟`
}
const formatUpdated = (updatedAt?: string): string => updatedAt ? new Date(updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
