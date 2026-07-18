import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type {
  DramaDetail,
  MultiEpisodeConfig,
  MultiEpisodeConfigInput,
  MultiEpisodePreflight,
  MultiEpisodeTaskPlan,
  MultiEpisodeWindow
} from '../../../shared/contracts.js'

type Props = {
  drama: DramaDetail
  onBack: () => void
  onPreflight: (dramaId: string, config: MultiEpisodeConfigInput) => Promise<MultiEpisodePreflight>
  onCreateTask: (dramaId: string, config: MultiEpisodeConfig) => Promise<MultiEpisodeTaskPlan>
  onRunTask: (taskId: string) => Promise<unknown>
  onChooseOutputDirectory: () => Promise<string | null>
}

export const MultiEpisodeWorkspacePage = ({ drama, onBack, onPreflight, onCreateTask, onRunTask, onChooseOutputDirectory }: Props): ReactElement => {
  const [start, setStart] = useState(1)
  const [end, setEnd] = useState(Math.max(1, drama.episodes.length))
  const [groupSize, setGroupSize] = useState(3)
  const [tailStrategy, setTailStrategy] = useState<'reduce' | 'skip'>('reduce')
  const [limitMinutes, setLimitMinutes] = useState(10)
  const [outputDirectory, setOutputDirectory] = useState('')
  const [qualityMode, setQualityMode] = useState<'original' | 'bitrate' | 'size'>('original')
  const [bitrateKbps, setBitrateKbps] = useState(6000)
  const [targetSizeMb, setTargetSizeMb] = useState(100)
  const [fps, setFps] = useState<'source' | number>('source')
  const [packagingEnabled, setPackagingEnabled] = useState(false)
  const [stage, setStage] = useState<'config' | 'preflight' | 'running' | 'report'>('config')
  const [preflight, setPreflight] = useState<MultiEpisodePreflight | null>(null)
  const [taskId, setTaskId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<'preflight' | 'create' | null>(null)

  const config = useMemo<MultiEpisodeConfigInput>(() => ({
    startEpisode: start,
    endEpisode: end,
    groupSize,
    tailStrategy,
    maxMinutes: limitMinutes,
    outputDirectory,
    qualityMode,
    bitrateKbps: qualityMode === 'bitrate' ? bitrateKbps : undefined,
    targetSizeMb: qualityMode === 'size' ? targetSizeMb : undefined,
    fps,
    packagingEnabled
  }), [start, end, groupSize, tailStrategy, limitMinutes, outputDirectory, qualityMode, bitrateKbps, targetSizeMb, fps, packagingEnabled])
  const valid = Number.isInteger(start) && Number.isInteger(end) && end >= start && groupSize >= 2 && limitMinutes > 0 && outputDirectory.trim().length > 0

  useEffect(() => { setPreflight(null); setMessage(null) }, [config])

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
      setTaskId(created.taskId)
      setPreflight({ preflightId: preflight.preflightId, windows: created.windows })
      setMessage('任务已创建，正在启动后台队列。')
      setStage('running')
      void onRunTask(created.taskId).then(() => { setMessage('任务已完成，可在成果库和任务中心查看报告。'); setStage('report') }).catch((cause: unknown) => { setMessage(cause instanceof Error ? cause.message : '后台任务启动失败。'); setStage('report') })
    } catch (cause) {
      setPreflight(null); setStage('config'); setMessage(cause instanceof Error ? cause.message : '任务创建失败。')
    } finally {
      setBusy(null)
    }
  }

  return <section aria-labelledby="multi-title">
    <div className="screen-head"><div><div className="meta">素材生产 / 多集拼接</div><h2 id="multi-title">多集拼接工作区</h2><p>配置 → 预检 → 运行 → 报告；确认前不会创建批量任务。</p></div><button className="btn" type="button" onClick={onBack}>返回素材生产</button></div>
    <div className="stagebar"><button className={`stage${stage === 'config' ? ' active' : ''}`} type="button" onClick={() => setStage('config')}>1 配置</button><button className={`stage${stage === 'preflight' ? ' active' : ''}`} type="button" disabled={!preflight || busy !== null} onClick={() => setStage('preflight')}>2 预检</button><button className={`stage${stage === 'running' ? ' active' : ''}`} type="button" disabled={!taskId} onClick={() => setStage('running')}>3 运行</button><button className={`stage${stage === 'report' ? ' active' : ''}`} type="button" disabled={!taskId} onClick={() => setStage('report')}>4 报告</button></div>
    {stage === 'config' && <ConfigPanel config={{ start, end, groupSize, tailStrategy, limitMinutes, outputDirectory, qualityMode, bitrateKbps, targetSizeMb, fps, packagingEnabled }} setters={{ setStart, setEnd, setGroupSize, setTailStrategy, setLimitMinutes, setOutputDirectory, setQualityMode, setBitrateKbps, setTargetSizeMb, setFps, setPackagingEnabled }} chooseOutput={onChooseOutputDirectory} runPreflight={() => void runPreflight()} canPreflight={valid && busy === null} busy={busy === 'preflight'} />}
    {stage === 'preflight' && preflight && <PreflightPanel windows={preflight.windows} busy={busy === 'create'} message={message} onBack={() => setStage('config')} onConfirm={() => void confirmAndRun()} />}
    {stage === 'running' && taskId && <div className="progress-shell" role="status"><div className="progress-top"><div><div className="meta">多集拼接</div><h3>后台任务运行中</h3></div><span className="badge info">运行中</span></div><div className="progress"><span className="progress-indeterminate" /></div><p>{message} 任务 ID：{taskId.slice(0, 8)}</p></div>}
    {stage === 'report' && <div className="panel" role="status"><span className="badge info">后台任务已创建</span><h3>任务已进入队列</h3><p>{message} {taskId && `任务 ID：${taskId.slice(0, 8)}`}</p><button className="btn" type="button" onClick={() => setStage('preflight')}>查看预检</button></div>}
    {stage === 'config' && message && <p className="form-error" role="alert">{message}</p>}
  </section>
}

type ConfigValues = { start: number; end: number; groupSize: number; tailStrategy: 'reduce' | 'skip'; limitMinutes: number; outputDirectory: string; qualityMode: 'original' | 'bitrate' | 'size'; bitrateKbps: number; targetSizeMb: number; fps: 'source' | number; packagingEnabled: boolean }
type ConfigSetters = { setStart: (value: number) => void; setEnd: (value: number) => void; setGroupSize: (value: number) => void; setTailStrategy: (value: 'reduce' | 'skip') => void; setLimitMinutes: (value: number) => void; setOutputDirectory: (value: string) => void; setQualityMode: (value: 'original' | 'bitrate' | 'size') => void; setBitrateKbps: (value: number) => void; setTargetSizeMb: (value: number) => void; setFps: (value: 'source' | number) => void; setPackagingEnabled: (value: boolean) => void }

const ConfigPanel = ({ config, setters, chooseOutput, runPreflight, canPreflight, busy }: { config: ConfigValues; setters: ConfigSetters; chooseOutput: () => Promise<string | null>; runPreflight: () => void; canPreflight: boolean; busy: boolean }): ReactElement => <div className="grid-2">
  <div className="card card-pad"><h3>组合规则</h3><div className="form-grid"><NumberField label="起始集" value={config.start} onChange={setters.setStart} /><NumberField label="结束集" value={config.end} onChange={setters.setEnd} /><label className="field">每组集数<select className="select" value={config.groupSize} onChange={(event) => setters.setGroupSize(Number(event.target.value))}><option value={2}>2 集</option><option value={3}>3 集</option><option value={4}>4 集</option></select></label><NumberField label="时长上限（分钟）" value={config.limitMinutes} onChange={setters.setLimitMinutes} /><label className="field">超时策略<select className="select" value={config.tailStrategy} onChange={(event) => setters.setTailStrategy(event.target.value as 'reduce' | 'skip')}><option value="reduce">尾部减集（至少保留 2 集）</option><option value="skip">跳过组合</option></select></label></div><p className="helper">步长固定为 1；窗口不能跨缺集或失联文件。</p></div>
  <div className="card card-pad"><h3>输出质量、帧率与包装</h3><label className="field">质量模式<select className="select" value={config.qualityMode} onChange={(event) => setters.setQualityMode(event.target.value as ConfigValues['qualityMode'])}><option value="original">原质量</option><option value="bitrate">固定码率</option><option value="size">目标文件大小</option></select></label>{config.qualityMode === 'bitrate' && <NumberField label="视频码率（kbps）" value={config.bitrateKbps} onChange={setters.setBitrateKbps} />}{config.qualityMode === 'size' && <NumberField label="目标大小（MB）" value={config.targetSizeMb} onChange={setters.setTargetSizeMb} />}<label className="field">帧率<select className="select" value={config.fps} onChange={(event) => setters.setFps(event.target.value === 'source' ? 'source' : Number(event.target.value))}><option value="source">跟随原片</option>{[23.976, 24, 25, 29.97, 30, 50, 59.94, 60, 120].map((value) => <option key={value} value={value}>{value} FPS</option>)}</select></label><label><input type="checkbox" checked={config.packagingEnabled} onChange={(event) => setters.setPackagingEnabled(event.target.checked)} /> 开启安全区标题包装</label><label className="field">输出根目录<div className="inline-form"><input className="input path" value={config.outputDirectory} onChange={(event) => setters.setOutputDirectory(event.target.value)} placeholder="选择输出目录" /><button className="btn" type="button" onClick={() => void chooseOutput().then((path) => { if (path) setters.setOutputDirectory(path) })}>选择</button></div></label><button className="btn btn-primary" type="button" disabled={!canPreflight} onClick={runPreflight}>{busy ? '正在预检…' : '开始预检'}</button></div>
</div>

const PreflightPanel = ({ windows, busy, message, onBack, onConfirm }: { windows: MultiEpisodeWindow[]; busy: boolean; message: string | null; onBack: () => void; onConfirm: () => void }): ReactElement => <div>
  <div className="panel"><h3>真实预检结果</h3><p className="helper">共 {windows.length} 个窗口；以下结果已检查连续集数、媒体状态、磁盘、时长策略和输出参数。</p></div>
  <div className="card table-wrap"><table><thead><tr><th>计划范围</th><th>实际输出</th><th>预计时长</th><th>状态</th><th>预计大小</th><th>反算码率</th><th>原因</th></tr></thead><tbody>{windows.map((window) => <tr key={`${window.startEpisode}-${window.endEpisode}`}><td className="num">{formatRange(window.episodeNumbers)}</td><td className="num">{formatRange(window.actualRange ?? window.episodeNumbers)}</td><td>{window.durationSeconds === null ? '无法估算' : `${(window.durationSeconds / 60).toFixed(2)} 分钟`}</td><td><StatusBadge window={window} /></td><td>{window.estimatedSizeMb === null ? '—' : `${window.estimatedSizeMb.toFixed(1)} MB`}</td><td>{window.estimatedBitrateKbps === null ? '—' : `${window.estimatedBitrateKbps} kbps`}</td><td>{window.reason ?? '连续且可用'}</td></tr>)}</tbody></table></div>
  {message && <p className="form-error" role="alert">{message}</p>}
  <div className="toolbar"><button className="btn" type="button" disabled={busy} onClick={onBack}>返回修改</button><button className="btn btn-primary" type="button" disabled={busy || !windows.some((window) => window.ok)} onClick={onConfirm}>{busy ? '正在创建…' : '确认预检并运行'}</button></div>
</div>

const StatusBadge = ({ window }: { window: MultiEpisodeWindow }): ReactElement => {
  const label = window.status === 'reduced' ? '将缩减' : window.status === 'skipped' ? '将跳过' : window.ok ? '可运行' : '阻塞'
  const tone = window.status === 'reduced' ? 'warning' : window.ok ? 'success' : 'danger'
  return <span className={`badge ${tone}`}>{label}</span>
}

const formatRange = (numbers: number[]): string => numbers.length === 0 ? '—' : `第 ${String(numbers[0]).padStart(3, '0')}–${String(numbers.at(-1)).padStart(3, '0')} 集`
const NumberField = ({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }): ReactElement => <label className="field">{label}<input className="input num" type="number" min="1" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>
