import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import type {
  DramaDetail,
  MultiEpisodeConfig,
  MultiEpisodeConfigInput,
  MultiEpisodePreflight,
  MultiEpisodeTaskPlan,
  MultiEpisodeWindow,
  TaskReportItem,
  TaskSummary
} from '../../../shared/contracts.js'
import { ModalDialog } from '../components/ModalDialog.js'
import { MultiEpisodeRunningPanel } from './MultiEpisodeRunningPanel.js'
import { MultiEpisodeTaskReportPanel } from './MultiEpisodeTaskReportPanel.js'

type Props = {
  drama: DramaDetail
  onBack: () => void
  onPreflight: (dramaId: string, config: MultiEpisodeConfigInput) => Promise<MultiEpisodePreflight>
  onCreateTask: (dramaId: string, config: MultiEpisodeConfig) => Promise<MultiEpisodeTaskPlan>
  onRunTask: (taskId: string) => Promise<unknown>
  onChooseOutputDirectory: () => Promise<string | null>
  onOpenResults?: () => void | Promise<void>
  onOpenTaskCenter?: (taskId: string) => void
}

const TERMINAL_TASK_STATUSES = new Set(['completed', 'partial', 'failed', 'cancelled'])
const taskPointerKey = (dramaId: string): string => `shortdrama.multiEpisodeTask.${dramaId}`
const isTerminalTask = (task: TaskSummary | null): boolean => task !== null && TERMINAL_TASK_STATUSES.has(task.status)

export const MultiEpisodeWorkspacePage = ({ drama, onBack, onPreflight, onCreateTask, onRunTask, onChooseOutputDirectory, onOpenResults, onOpenTaskCenter }: Props): ReactElement => {
  const [start, setStart] = useState(1)
  const [end, setEnd] = useState(Math.max(1, drama.episodes.length))
  const [groupSize, setGroupSize] = useState(3)
  const [tailStrategy, setTailStrategy] = useState<'reduce' | 'skip' | 'return'>('reduce')
  const [limitMinutes, setLimitMinutes] = useState(10)
  const [outputDirectory, setOutputDirectory] = useState(() => readPreference('shortdrama.defaultOutputDirectory'))
  const [qualityMode, setQualityMode] = useState<'original' | 'bitrate' | 'size'>(() => { const value = readPreference('shortdrama.qualityMode'); return value === 'bitrate' || value === 'size' ? value : 'original' })
  const [bitrateKbps, setBitrateKbps] = useState(6000)
  const [targetSizeMb, setTargetSizeMb] = useState(100)
  const [encodingPreset, setEncodingPreset] = useState<'fast' | 'balanced' | 'quality'>('balanced')
  const [fps, setFps] = useState<'source' | number>(() => readPreference('shortdrama.fps') === '25' ? 25 : 'source')
  const [packagingEnabled, setPackagingEnabled] = useState(false)
  const [performanceMode, setPerformanceMode] = useState<'background' | 'speed'>(() => readPreference('shortdrama.performanceMode') === 'speed' ? 'speed' : 'background')
  const [packagingTitle, setPackagingTitle] = useState(drama.name)
  const [titlePosition, setTitlePosition] = useState<'top' | 'bottom'>('top')
  const [packagingPrompt, setPackagingPrompt] = useState('')
  const [promptPosition, setPromptPosition] = useState<'left' | 'right'>('left')
  const [packagingBadge, setPackagingBadge] = useState<'热门短剧' | '热播中' | '爆款推荐' | 'none'>('none')
  const [packagingAspect, setPackagingAspect] = useState<'portrait' | 'landscape'>('portrait')
  const [packagingPreset, setPackagingPreset] = useState<'default' | 'conflict' | 'clean'>('default')
  const [titleSize, setTitleSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [titleTone, setTitleTone] = useState<'warm' | 'accent'>('warm')
  const [promptStyle, setPromptStyle] = useState<'solid' | 'outline'>('solid')
  const [overlay, setOverlay] = useState<'subtle' | 'strong' | 'none'>('subtle')
  const [exportSettingsOpen, setExportSettingsOpen] = useState(false)
  const [packagingSettingsOpen, setPackagingSettingsOpen] = useState(false)
  const [stage, setStage] = useState<'config' | 'preflight' | 'running' | 'report'>('config')
  const [preflight, setPreflight] = useState<MultiEpisodePreflight | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preflight' | 'create' | null>(null)
  const [taskControl, setTaskControl] = useState<'pending' | 'running' | 'paused' | 'cancelled'>('pending')
  const [reportItems, setReportItems] = useState<TaskReportItem[]>([])
  const [reportTask, setReportTask] = useState<TaskSummary | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)

  const config = useMemo<MultiEpisodeConfigInput>(() => ({
    startEpisode: start,
    endEpisode: end,
    groupSize,
    tailStrategy,
    maxMinutes: limitMinutes,
    outputDirectory,
    qualityMode,
    bitrateKbps: qualityMode === 'bitrate' ? bitrateKbps : undefined,
    targetSizeMb: qualityMode === 'size' ? targetSizeMb : undefined, encodingPreset,
    fps,
    packagingEnabled, performanceMode,
    packaging: packagingEnabled ? { aspect: packagingAspect, preset: packagingPreset, title: packagingTitle, titlePosition, prompt: packagingPrompt, promptPosition, badge: packagingBadge, titleSize, titleTone, promptStyle, overlay } : undefined
  }), [start, end, groupSize, tailStrategy, limitMinutes, outputDirectory, qualityMode, bitrateKbps, targetSizeMb, encodingPreset, fps, packagingEnabled, performanceMode, packagingTitle, titlePosition, packagingPrompt, promptPosition, packagingBadge, packagingAspect, packagingPreset, titleSize, titleTone, promptStyle, overlay])
  const valid = Number.isInteger(start) && Number.isInteger(end) && end >= start && groupSize >= 2 && limitMinutes > 0 && outputDirectory.trim().length > 0

  useEffect(() => { setPreflight(null); setMessage(null) }, [config])

  const getCurrentTask = useCallback(async (id: string): Promise<TaskSummary | null> => {
    if (!window.desktopApi) throw new Error('当前环境无法读取任务状态。')
    const tasks = await window.desktopApi.listTasks()
    const task = tasks.find((candidate) => candidate.id === id && candidate.dramaId === drama.id && candidate.type === 'multi_episode') ?? null
    if (!task) {
      removeTaskPointer(drama.id)
      setTaskId(null)
      setReportTask(null)
      setStage('config')
    }
    return task
  }, [drama.id])

  const refreshTaskStatus = useCallback(async (id: string, openReportOnTerminal = false): Promise<TaskSummary | null> => {
    try {
      const task = await getCurrentTask(id)
      if (!task) {
        setMessage('当前多集拼接任务不存在、不属于本剧，或已被删除。')
        return null
      }
      setReportTask(task)
      if (task.status === 'paused') setTaskControl('paused')
      else if (task.status === 'cancelled') setTaskControl('cancelled')
      else if (task.status === 'pending') setTaskControl('pending')
      else setTaskControl('running')
      if (isTerminalTask(task) && openReportOnTerminal) { setReportLoading(true); setStage('report') }
      return task
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '无法读取任务状态。')
      return null
    }
  }, [getCurrentTask])

  const loadReport = useCallback(async (id: string): Promise<void> => {
    if (!window.desktopApi) { setReportError('当前环境无法读取任务报告。'); return }
    setReportLoading(true); setReportError(null)
    try {
      const task = await getCurrentTask(id)
      if (!task) throw new Error('当前多集拼接任务不存在或不属于本剧。')
      if (!isTerminalTask(task)) throw new Error('任务仍在运行或暂停中，结束后才会生成本次报告。')
      const items = await window.desktopApi.getTaskReport(id)
      setReportItems(items); setReportTask(task)
    } catch (cause) { setReportError(cause instanceof Error ? cause.message : '读取任务报告失败。') }
    finally { setReportLoading(false) }
  }, [getCurrentTask])

  useEffect(() => { if (stage === 'report' && taskId) void loadReport(taskId) }, [stage, taskId, loadReport])

  useEffect(() => {
    const savedTaskId = readTaskPointer(drama.id)
    if (savedTaskId) void refreshTaskStatus(savedTaskId).then((task) => {
      if (!task) return
      setTaskId(task.id)
      if (!isTerminalTask(task)) setStage('running')
    })
  }, [drama.id, refreshTaskStatus])

  const taskStatus = reportTask?.status ?? null
  useEffect(() => {
    if (!taskId || (taskStatus !== null && TERMINAL_TASK_STATUSES.has(taskStatus))) return
    const openReportOnTerminal = stage === 'running'
    void refreshTaskStatus(taskId, openReportOnTerminal)
    const interval = window.setInterval(() => { void refreshTaskStatus(taskId, openReportOnTerminal) }, 1000)
    return () => window.clearInterval(interval)
  }, [taskId, taskStatus, refreshTaskStatus, stage])

  const runPreflight = async (): Promise<void> => {
    if (!valid) return
    setBusy('preflight'); setMessage(null)
    try {
      const result = await onPreflight(drama.id, config)
      if (result.windows.length === 0) throw new Error('当前范围无法生成连续窗口，请检查集数范围和每组集数。')
      setPreflight(result); setStage('preflight')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '预检失败。')
    } finally {
      setBusy(null)
    }
  }

  const confirmAndRun = async (): Promise<void> => {
    if (!preflight?.windows.some((window) => window.ok)) return
    setBusy('create'); setMessage(null)
    try {
      const created = await onCreateTask(drama.id, { ...config, preflightConfirmed: true, preflightId: preflight.preflightId })
      setReportTask(null)
      setReportItems([])
      setReportError(null)
      setReportLoading(false)
      setTaskId(created.taskId)
      saveTaskPointer(drama.id, created.taskId)
      setTaskControl('pending')
      setPreflight({ preflightId: preflight.preflightId, windows: created.windows })
      setMessage('任务已创建，正在启动后台队列。')
      setStage('running')
      void onRunTask(created.taskId).then(() => {
        setMessage('后台执行请求已返回，正在读取任务实际状态。')
        void refreshTaskStatus(created.taskId, true)
      }).catch((cause: unknown) => {
        setMessage(cause instanceof Error ? cause.message : '后台执行请求失败，正在读取已持久化任务状态。')
        void refreshTaskStatus(created.taskId, true)
      })
    } catch (cause) {
      setPreflight(null); setStage('config'); setMessage(cause instanceof Error ? cause.message : '任务创建失败。')
    } finally {
      setBusy(null)
    }
  }

  const controlTask = async (action: 'pause' | 'resume' | 'cancel'): Promise<void> => {
    if (!taskId || !window.desktopApi) return
    try {
      if (action === 'pause') { await window.desktopApi.pauseProductionTask(taskId); setMessage('暂停请求已提交，正在读取任务实际状态。') }
      if (action === 'resume') { await window.desktopApi.resumeProductionTask(taskId); setMessage('继续请求已提交，正在读取任务实际状态。') }
      if (action === 'cancel') { await window.desktopApi.cancelProductionTask(taskId); setMessage('取消请求已提交，正在读取任务实际状态。') }
      await refreshTaskStatus(taskId, true)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : '任务控制失败，请稍后重试。') }
  }

  return <section className="focused-production-workspace" aria-labelledby="multi-title">
    <div className="screen-head"><div><div className="meta">{drama.name} / 素材生产 / 多集拼接</div><h1 id="multi-title">多集拼接工作区</h1><p>配置会在进入下一阶段时保存；返回修改不会重置输入。</p></div><button className="btn btn-secondary" type="button" onClick={onBack}>返回素材生产</button></div>
    <div className="stagebar"><button className={`stage${stage === 'config' ? ' active' : ''}`} type="button" onClick={() => setStage('config')}>1 配置</button><button className={`stage${stage === 'preflight' ? ' active' : ''}`} type="button" disabled={!preflight || busy !== null} onClick={() => setStage('preflight')}>2 预检</button><button className={`stage${stage === 'running' ? ' active' : ''}`} type="button" disabled={!taskId} onClick={() => setStage('running')}>3 运行</button><button className={`stage${stage === 'report' ? ' active' : ''}`} type="button" disabled={!isTerminalTask(reportTask)} onClick={() => { setReportLoading(true); setStage('report') }}>4 报告</button></div>
    {stage === 'config' && <ConfigPanel config={{ start, end, groupSize, tailStrategy, limitMinutes, outputDirectory, qualityMode, bitrateKbps, targetSizeMb, encodingPreset, fps, packagingEnabled, performanceMode, packagingTitle, titlePosition, packagingPrompt, promptPosition, packagingBadge, packagingAspect, packagingPreset, titleSize, titleTone, promptStyle, overlay }} setters={{ setStart, setEnd, setGroupSize, setTailStrategy, setLimitMinutes, setOutputDirectory, setQualityMode, setBitrateKbps, setTargetSizeMb, setEncodingPreset, setFps, setPackagingEnabled, setPerformanceMode, setPackagingTitle, setTitlePosition, setPackagingPrompt, setPromptPosition, setPackagingBadge, setPackagingAspect, setPackagingPreset, setTitleSize, setTitleTone, setPromptStyle, setOverlay }} chooseOutput={onChooseOutputDirectory} runPreflight={() => void runPreflight()} canPreflight={valid && busy === null} busy={busy === 'preflight'} onOpenExportSettings={() => setExportSettingsOpen(true)} onOpenPackaging={() => setPackagingSettingsOpen(true)} />}
    {stage === 'preflight' && preflight && <PreflightPanel windows={preflight.windows} busy={busy === 'create'} message={message} onBack={() => setStage('config')} onConfirm={() => void confirmAndRun()} />}
    {stage === 'running' && taskId && <MultiEpisodeRunningPanel task={reportTask} taskId={taskId} taskControl={taskControl} message={message} onBack={onBack} onControl={(action) => void controlTask(action)} />}
    {stage === 'report' && taskId && <MultiEpisodeTaskReportPanel task={reportTask} items={reportItems} loading={reportLoading} error={reportError} onRetry={() => void loadReport(taskId)} onOpenResults={onOpenResults} onOpenTaskCenter={() => onOpenTaskCenter?.(taskId)} onBackToPreflight={() => setStage('preflight')} />}
    {stage === 'config' && message && <p className="form-error" role="alert">{message}</p>}
    {exportSettingsOpen && <ExportSettingsDialog config={{ outputDirectory, qualityMode, bitrateKbps, targetSizeMb, encodingPreset, fps, performanceMode, packagingEnabled, packagingTitle, packagingPrompt, packagingBadge }} setters={{ setOutputDirectory, setQualityMode, setBitrateKbps, setTargetSizeMb, setEncodingPreset, setFps, setPerformanceMode, setPackagingEnabled }} chooseOutput={onChooseOutputDirectory} onClose={() => setExportSettingsOpen(false)} onOpenPackaging={() => { setExportSettingsOpen(false); setPackagingSettingsOpen(true) }} />}
    {packagingSettingsOpen && <PackagingSettingsDialog config={{ packagingAspect, packagingPreset, packagingTitle, titlePosition, packagingPrompt, promptPosition, packagingBadge, titleSize, titleTone, promptStyle, overlay }} setters={{ setPackagingAspect, setPackagingPreset, setPackagingTitle, setTitlePosition, setPackagingPrompt, setPromptPosition, setPackagingBadge, setTitleSize, setTitleTone, setPromptStyle, setOverlay }} onClose={() => setPackagingSettingsOpen(false)} />}
  </section>
}

type ConfigValues = { start: number; end: number; groupSize: number; tailStrategy: 'reduce' | 'skip' | 'return'; limitMinutes: number; outputDirectory: string; qualityMode: 'original' | 'bitrate' | 'size'; bitrateKbps: number; targetSizeMb: number; encodingPreset: 'fast' | 'balanced' | 'quality'; fps: 'source' | number; packagingEnabled: boolean; performanceMode: 'background' | 'speed'; packagingTitle: string; titlePosition: 'top' | 'bottom'; packagingPrompt: string; promptPosition: 'left' | 'right'; packagingBadge: '热门短剧' | '热播中' | '爆款推荐' | 'none'; packagingAspect: 'portrait' | 'landscape'; packagingPreset: 'default' | 'conflict' | 'clean'; titleSize: 'small' | 'medium' | 'large'; titleTone: 'warm' | 'accent'; promptStyle: 'solid' | 'outline'; overlay: 'subtle' | 'strong' | 'none' }
type ConfigSetters = { setStart: (value: number) => void; setEnd: (value: number) => void; setGroupSize: (value: number) => void; setTailStrategy: (value: 'reduce' | 'skip' | 'return') => void; setLimitMinutes: (value: number) => void; setOutputDirectory: (value: string) => void; setQualityMode: (value: 'original' | 'bitrate' | 'size') => void; setBitrateKbps: (value: number) => void; setTargetSizeMb: (value: number) => void; setEncodingPreset: (value: 'fast' | 'balanced' | 'quality') => void; setFps: (value: 'source' | number) => void; setPackagingEnabled: (value: boolean) => void; setPerformanceMode: (value: 'background' | 'speed') => void; setPackagingTitle: (value: string) => void; setTitlePosition: (value: 'top' | 'bottom') => void; setPackagingPrompt: (value: string) => void; setPromptPosition: (value: 'left' | 'right') => void; setPackagingBadge: (value: '热门短剧' | '热播中' | '爆款推荐' | 'none') => void; setPackagingAspect: (value: 'portrait' | 'landscape') => void; setPackagingPreset: (value: 'default' | 'conflict' | 'clean') => void; setTitleSize: (value: 'small' | 'medium' | 'large') => void; setTitleTone: (value: 'warm' | 'accent') => void; setPromptStyle: (value: 'solid' | 'outline') => void; setOverlay: (value: 'subtle' | 'strong' | 'none') => void }

const ConfigPanel = ({ config, setters, chooseOutput, runPreflight, canPreflight, busy, onOpenExportSettings, onOpenPackaging }: { config: ConfigValues; setters: ConfigSetters; chooseOutput: () => Promise<string | null>; runPreflight: () => void; canPreflight: boolean; busy: boolean; onOpenExportSettings: () => void; onOpenPackaging: () => void }): ReactElement => <div>
  <div className="grid-2 stitch-config-grid">
    <div className="card"><section className="setting-group"><h2>组合规则</h2><div className="form-grid"><NumberField label="起始集" value={config.start} onChange={setters.setStart} /><NumberField label="结束集" value={config.end} onChange={setters.setEnd} /><label className="field">每组集数<select className="select" value={config.groupSize} onChange={(event) => setters.setGroupSize(Number(event.target.value))}>{Array.from({ length: 19 }, (_, index) => index + 2).map((value) => <option key={value} value={value}>{value} 集</option>)}</select></label><label className="field">步长<input className="input" value="1（P0 固定）" disabled /></label></div></section><section className="setting-group"><h2>时长策略</h2><div className="form-grid"><NumberField label="单条时长上限（分钟）" value={config.limitMinutes} onChange={setters.setLimitMinutes} /><label className="field">超时处理<select className="select" value={config.tailStrategy} onChange={(event) => setters.setTailStrategy(event.target.value as ConfigValues['tailStrategy'])}><option value="reduce">尾部减集</option><option value="skip">跳过组合</option><option value="return">返回修改上限</option></select></label></div></section></div>
    <div className="card card-pad"><section className="setting-group"><div className="card-title"><h3>输出质量</h3><button className="btn" type="button" onClick={onOpenExportSettings}>完整导出设置</button></div><fieldset className="field"><legend>质量模式</legend><div className="segmented" role="group" aria-label="质量模式"><button className={config.qualityMode === 'original' ? 'active' : ''} type="button" onClick={() => setters.setQualityMode('original')}>原质量</button><button className={config.qualityMode === 'bitrate' ? 'active' : ''} type="button" onClick={() => setters.setQualityMode('bitrate')}>固定码率</button><button className={config.qualityMode === 'size' ? 'active' : ''} type="button" onClick={() => setters.setQualityMode('size')}>目标大小</button></div></fieldset>{config.qualityMode === 'original' && <p className="helper">兼容且无包装时优先无损拼接；需要重编码时会在预检中说明。</p>}{config.qualityMode === 'bitrate' && <NumberField label="视频码率（kbps）" value={config.bitrateKbps} onChange={setters.setBitrateKbps} />}{config.qualityMode === 'size' && <NumberField label="单条目标大小（MB）" value={config.targetSizeMb} onChange={setters.setTargetSizeMb} />}<label className="field">帧率策略<select className="select" value={config.fps} onChange={(event) => setters.setFps(event.target.value === 'source' ? 'source' : Number(event.target.value))}><option value="source">跟随原片</option>{[23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 120].map((value) => <option key={value} value={value}>{value} FPS</option>)}</select></label></section><section className="setting-group"><div className="card-title"><div><h3>包装</h3><p>整批素材共用同一套标题、提示语与角标。</p></div><div className="package-actions"><button className={`switch${config.packagingEnabled ? ' on' : ''}`} type="button" aria-label="多集拼接包装" aria-pressed={config.packagingEnabled} onClick={() => setters.setPackagingEnabled(!config.packagingEnabled)}>包装</button><button className="btn btn-secondary" type="button" disabled={!config.packagingEnabled} onClick={onOpenPackaging}>配置包装</button></div></div><p className="package-summary">{config.packagingEnabled ? `${config.packagingPreset === 'default' ? '剧目默认方案' : config.packagingPreset === 'conflict' ? '冲突前置方案' : '纯净画面方案'} · ${config.packagingTitle || '无标题'} / ${config.packagingPrompt || '无提示语'} / ${config.packagingBadge === 'none' ? '无角标' : config.packagingBadge}` : '关闭后不会向视频画面写入文字或角标。'}</p></section><section className="setting-group"><h3>输出位置</h3><label className="field">输出根目录<div className="inline-form"><input className="input path" value={config.outputDirectory} onChange={(event) => setters.setOutputDirectory(event.target.value)} placeholder="选择输出目录" /><button className="btn btn-secondary" type="button" onClick={() => void chooseOutput().then((path) => { if (path) setters.setOutputDirectory(path) })}>选择</button></div></label><p className="helper">将创建剧目和任务专用子目录，不覆盖同名文件。</p></section></div>
  </div>
  <div className="stitch-start-actions"><button className="btn btn-primary" type="button" disabled={!canPreflight} onClick={runPreflight}>{busy ? '正在预检…' : '开始预检'}</button>{!canPreflight && <p className="form-error" role="status">{!config.outputDirectory.trim() ? '请先选择输出根目录，才能开始预检。' : '请检查起止集、每组集数和时长上限后再开始预检。'}</p>}</div>
</div>

type ExportConfig = Pick<ConfigValues, 'outputDirectory' | 'qualityMode' | 'bitrateKbps' | 'targetSizeMb' | 'encodingPreset' | 'fps' | 'performanceMode' | 'packagingEnabled' | 'packagingTitle' | 'packagingPrompt' | 'packagingBadge'>
type ExportSetters = Pick<ConfigSetters, 'setOutputDirectory' | 'setQualityMode' | 'setBitrateKbps' | 'setTargetSizeMb' | 'setEncodingPreset' | 'setFps' | 'setPerformanceMode' | 'setPackagingEnabled'>

const ExportSettingsDialog = ({ config, setters, chooseOutput, onClose, onOpenPackaging }: { config: ExportConfig; setters: ExportSetters; chooseOutput: () => Promise<string | null>; onClose: () => void; onOpenPackaging: () => void }): ReactElement => <ModalDialog labelledBy="export-settings-title" className="export-settings-modal" initialFocusSelector=".segmented button.active" onClose={onClose}>
  <div className="modal-head"><div><h2 id="export-settings-title">导出设置</h2><p className="meta">质量、帧率、输出位置与包装</p></div><button className="btn icon-btn" type="button" aria-label="关闭导出设置" onClick={onClose}>×</button></div>
  <div className="modal-body">
    <fieldset className="field"><legend>质量模式</legend><div className="segmented" role="group" aria-label="质量模式"><button className={config.qualityMode === 'original' ? 'active' : ''} type="button" onClick={() => setters.setQualityMode('original')}>原质量</button><button className={config.qualityMode === 'bitrate' ? 'active' : ''} type="button" onClick={() => setters.setQualityMode('bitrate')}>固定码率</button><button className={config.qualityMode === 'size' ? 'active' : ''} type="button" onClick={() => setters.setQualityMode('size')}>目标大小</button></div></fieldset>
    {config.qualityMode === 'original' && <p className="helper">兼容且未添加包装时优先无损处理；需要重新编码会在预检中说明。</p>}
    {config.qualityMode === 'bitrate' && <NumberField label="视频码率（kbps）" value={config.bitrateKbps} onChange={setters.setBitrateKbps} />}
    {config.qualityMode === 'size' && <NumberField label="单条目标大小（MB）" value={config.targetSizeMb} onChange={setters.setTargetSizeMb} />}
    {config.qualityMode === 'size' && <p className="helper">成功文件会严格不超过你填写的大小，例如 100 即为 100 MB。</p>}
    <label className="field">编码速度<select className="select" value={config.encodingPreset} onChange={(event) => setters.setEncodingPreset(event.target.value as ConfigValues['encodingPreset'])}><option value="fast">极速（更快）</option><option value="balanced">均衡（默认）</option><option value="quality">高质量（更慢）</option></select></label>
    <p className="helper">编码速度只影响需要转码的任务；“速度优先”则控制同批窗口并发。</p>
    <div className="form-grid"><label className="field">帧率策略<select className="select" value={config.fps} onChange={(event) => setters.setFps(event.target.value === 'source' ? 'source' : Number(event.target.value))}><option value="source">跟随原片</option>{[23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 120].map((value) => <option key={value} value={value}>{value} FPS</option>)}</select></label><label className="field">性能模式<select className="select" value={config.performanceMode} onChange={(event) => setters.setPerformanceMode(event.target.value as 'background' | 'speed')}><option value="background">后台优先（串行，默认）</option><option value="speed">速度优先（并发处理）</option></select></label><label className="field">输出根目录<div className="inline-form"><input className="input path" value={config.outputDirectory} onChange={(event) => setters.setOutputDirectory(event.target.value)} placeholder="选择输出目录" /><button className="btn" type="button" onClick={() => void chooseOutput().then((path) => { if (path) setters.setOutputDirectory(path) })}>选择</button></div></label></div>
    <div className="package-control"><div><h3>包装</h3><p>{config.packagingEnabled ? `${config.packagingTitle || '未设置标题'} / ${config.packagingPrompt || '无提示语'} / ${config.packagingBadge === 'none' ? '无角标' : config.packagingBadge}` : '关闭后不会向视频画面写入文字或角标。'}</p></div><div className="package-actions"><button className={`switch${config.packagingEnabled ? ' on' : ''}`} type="button" aria-label="导出包装" aria-pressed={config.packagingEnabled} onClick={() => setters.setPackagingEnabled(!config.packagingEnabled)}>包装</button><button className="btn btn-secondary" type="button" disabled={!config.packagingEnabled} onClick={onOpenPackaging}>配置包装</button></div></div>
  </div>
  <div className="modal-foot"><button className="btn btn-secondary" type="button" onClick={onClose}>取消</button><button className="btn btn-primary" type="button" onClick={onClose}>保存导出设置</button></div>
</ModalDialog>

type PackagingDialogConfig = Pick<ConfigValues, 'packagingAspect' | 'packagingPreset' | 'packagingTitle' | 'titlePosition' | 'packagingPrompt' | 'promptPosition' | 'packagingBadge' | 'titleSize' | 'titleTone' | 'promptStyle' | 'overlay'>
type PackagingDialogSetters = Pick<ConfigSetters, 'setPackagingAspect' | 'setPackagingPreset' | 'setPackagingTitle' | 'setTitlePosition' | 'setPackagingPrompt' | 'setPromptPosition' | 'setPackagingBadge' | 'setTitleSize' | 'setTitleTone' | 'setPromptStyle' | 'setOverlay'>

const PackagingSettingsDialog = ({ config, setters, onClose }: { config: PackagingDialogConfig; setters: PackagingDialogSetters; onClose: () => void }): ReactElement => <ModalDialog labelledBy="packaging-settings-title" className="packaging-settings-modal" initialFocusSelector="#packagePreset" onClose={onClose}>
  <div className="modal-head"><div><h2 id="packaging-settings-title">包装设置</h2><p className="meta">应用到当前素材任务，保存后与导出配置一并预检。</p></div><button className="btn icon-btn" type="button" aria-label="关闭包装设置" onClick={onClose}>×</button></div>
  <div className="modal-body packaging-layout"><div className="packaging-config">
    <div className="form-grid"><fieldset className="field"><legend>包装比例</legend><div className="segmented" role="group" aria-label="包装比例"><button className={config.packagingAspect === 'portrait' ? 'active' : ''} type="button" onClick={() => setters.setPackagingAspect('portrait')}>竖屏 9:16</button><button className={config.packagingAspect === 'landscape' ? 'active' : ''} type="button" onClick={() => setters.setPackagingAspect('landscape')}>横屏 16:9</button></div></fieldset><label className="field">包装方案<select className="select" value={config.packagingPreset} onChange={(event) => setters.setPackagingPreset(event.target.value as PackagingDialogConfig['packagingPreset'])}><option value="default">剧目默认方案</option><option value="conflict">冲突前置方案</option><option value="clean">纯净画面方案</option></select></label><label className="field">右上角角标<select className="select" value={config.packagingBadge} onChange={(event) => setters.setPackagingBadge(event.target.value as PackagingDialogConfig['packagingBadge'])}><option value="none">不显示</option><option value="热门短剧">热门短剧</option><option value="热播中">热播中</option><option value="爆款推荐">爆款推荐</option></select></label><label className="field">标题<input className="input" value={config.packagingTitle} onChange={(event) => setters.setPackagingTitle(event.target.value)} /></label><label className="field">标题位置<select className="select" value={config.titlePosition} onChange={(event) => setters.setTitlePosition(event.target.value as PackagingDialogConfig['titlePosition'])}><option value="top">顶部居中</option><option value="bottom">底部居中</option></select></label><label className="field">提示语<input className="input" value={config.packagingPrompt} onChange={(event) => setters.setPackagingPrompt(event.target.value)} /></label><label className="field">提示语位置<select className="select" value={config.promptPosition} onChange={(event) => setters.setPromptPosition(event.target.value as PackagingDialogConfig['promptPosition'])}><option value="left">左侧竖排</option><option value="right">右侧竖排</option></select></label></div>
    <div className="form-grid package-style-grid"><label className="field">标题字号<select className="select" value={config.titleSize} onChange={(event) => setters.setTitleSize(event.target.value as PackagingDialogConfig['titleSize'])}><option value="small">紧凑 · 28 px</option><option value="medium">标准 · 32 px</option><option value="large">强调 · 38 px</option></select></label><label className="field">标题颜色<select className="select" value={config.titleTone} onChange={(event) => setters.setTitleTone(event.target.value as PackagingDialogConfig['titleTone'])}><option value="warm">暖白</option><option value="accent">铜橙</option></select></label><label className="field">提示语样式<select className="select" value={config.promptStyle} onChange={(event) => setters.setPromptStyle(event.target.value as PackagingDialogConfig['promptStyle'])}><option value="solid">深色实底</option><option value="outline">细描边</option></select></label><label className="field">画面底衬<select className="select" value={config.overlay} onChange={(event) => setters.setOverlay(event.target.value as PackagingDialogConfig['overlay'])}><option value="subtle">轻度 · 保留画面</option><option value="strong">增强 · 提升可读性</option><option value="none">无 · 仅文字阴影</option></select></label></div><p className="helper">所有文字与角标均限制在安全区内；每次调整即时预览，导出使用同一份配置。</p>
  </div><PackagingPreview config={config} /></div>
  <div className="modal-foot"><button className="btn btn-secondary" type="button" onClick={onClose}>取消</button><button className="btn btn-primary" type="button" onClick={onClose}>保存包装配置</button></div>
</ModalDialog>

const PackagingPreview = ({ config }: { config: PackagingDialogConfig }): ReactElement => <aside className="package-preview-side"><span className="meta">画面预览 · {config.packagingAspect === 'portrait' ? '竖屏 9:16' : '横屏 16:9'} 安全区</span><figure className={`package-preview ${config.packagingAspect} ${config.titleTone} ${config.overlay} ${config.promptStyle}`}><div className="package-safe-guide" aria-hidden="true" /><strong className={`package-preview-title ${config.titlePosition} ${config.titleSize}`}>{config.packagingTitle || '剧目标题'}</strong>{config.packagingPrompt && <span className={`package-preview-prompt ${config.promptPosition}`}>{config.packagingPrompt}</span>}{config.packagingBadge !== 'none' && <span className="package-preview-badge">{config.packagingBadge}</span>}</figure><div className="package-preview-caption"><span>安全区内写入画面</span><span>与导出一致</span></div></aside>

const PreflightPanel = ({ windows, busy, message, onBack, onConfirm }: { windows: MultiEpisodeWindow[]; busy: boolean; message: string | null; onBack: () => void; onConfirm: () => void }): ReactElement => {
  const attentionCount = windows.filter((window) => window.status === 'reduced' || !window.ok).length
  const summary = attentionCount > 0 ? `预检发现 ${attentionCount} 项需要确认` : '预检已完成'
  return <div>
  <div className="panel multi-preflight-summary"><div className="card-title"><div><h2>{summary}</h2><p className="helper">共 {windows.length} 个窗口；以下结果已检查连续集数、媒体状态、磁盘、时长策略和输出参数。</p></div><span className={`badge ${attentionCount > 0 ? 'warning' : 'success'}`}>{attentionCount > 0 ? '待确认' : '可运行'}</span></div></div>
  <div className="table-wrap multi-preflight-table"><table><thead><tr><th>计划范围</th><th>预计时长</th><th>真实输出</th><th>处理策略</th><th>预计体积</th><th>状态</th></tr></thead><tbody>{windows.map((window) => <tr key={`${window.startEpisode}-${window.endEpisode}`}><td className="num">{formatRange(window.episodeNumbers)}</td><td><span>{formatDuration(window.durationSeconds)}</span>{window.estimatedBitrateKbps !== null && <small>{window.estimatedBitrateKbps} kbps</small>}</td><td className="num">{formatRange(window.actualRange ?? window.episodeNumbers)}</td><td title={window.reason ?? undefined}>{window.reason ?? strategyLabel(window)}</td><td>{window.estimatedSizeMb === null ? '—' : `${window.estimatedSizeMb.toFixed(1)} MB`}</td><td><StatusBadge window={window} /></td></tr>)}</tbody></table></div>
  {message && <p className="form-error" role="alert">{message}</p>}
  <div className="toolbar"><button className="btn" type="button" disabled={busy} onClick={onBack}>返回修改</button><button className="btn btn-primary" type="button" disabled={busy || !windows.some((window) => window.ok)} onClick={onConfirm}>{busy ? '正在创建…' : '确认预检并运行'}</button></div>
</div>
}

const StatusBadge = ({ window }: { window: MultiEpisodeWindow }): ReactElement => {
  const label = window.status === 'reduced' ? '将缩减' : window.status === 'skipped' ? '将跳过' : window.ok ? '可运行' : '阻塞'
  const tone = window.status === 'reduced' ? 'warning' : window.ok ? 'success' : 'danger'
  return <span className={`badge ${tone}`}>{label}</span>
}

const formatRange = (numbers: number[]): string => numbers.length === 0 ? '—' : `第 ${String(numbers[0]).padStart(3, '0')}–${String(numbers.at(-1)).padStart(3, '0')} 集`
const formatDuration = (durationSeconds: number | null): string => durationSeconds === null ? '无法估算' : `${Math.floor(durationSeconds / 60)}:${String(Math.round(durationSeconds % 60)).padStart(2, '0')}`
const strategyLabel = (window: MultiEpisodeWindow): string => window.status === 'reduced' ? '尾部减集' : window.status === 'skipped' ? '跳过组合' : window.ok ? '可直接运行' : '阻止创建'
const NumberField = ({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }): ReactElement => <label className="field">{label}<input className="input num" type="number" min="1" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>
const readPreference = (key: string): string => { try { return window.localStorage.getItem(key) ?? '' } catch { return '' } }
const readTaskPointer = (dramaId: string): string | null => { try { return window.sessionStorage.getItem(taskPointerKey(dramaId)) } catch { return null } }
const saveTaskPointer = (dramaId: string, taskId: string): void => { try { window.sessionStorage.setItem(taskPointerKey(dramaId), taskId) } catch { /* Storage may be unavailable in a restricted renderer. */ } }
const removeTaskPointer = (dramaId: string): void => { try { window.sessionStorage.removeItem(taskPointerKey(dramaId)) } catch { /* Storage may be unavailable in a restricted renderer. */ } }
