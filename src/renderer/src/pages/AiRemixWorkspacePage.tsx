import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import type { AiCapabilityStatus, AiEvidence, AiRemixInput, AiRemixTask, DramaDetail } from '../../../shared/contracts.js'

type Props = { drama: DramaDetail; onBack: () => void; onOpenReview: (draftId: string) => void }

const formatTimecode = (seconds: number | null): string => {
  if (seconds === null) return '未提供时间码'
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`
}

export const AiRemixWorkspacePage = ({ drama, onBack, onOpenReview }: Props): ReactElement => {
  const episodes = useMemo(() => drama.episodes.filter((episode) => episode.episodeNo !== null).sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0)), [drama.episodes])
  const firstEpisodeNo = episodes[0]?.episodeNo ?? 1
  const lastEpisodeNo = episodes.at(-1)?.episodeNo ?? 1
  const [rangeMode, setRangeMode] = useState<'all' | 'custom'>('all')
  const [episodeStart, setEpisodeStart] = useState(firstEpisodeNo)
  const [episodeEnd, setEpisodeEnd] = useState(lastEpisodeNo)
  const [maxDrafts, setMaxDrafts] = useState(3)
  const [durationMinSeconds, setDurationMinSeconds] = useState(30)
  const [durationMaxSeconds, setDurationMaxSeconds] = useState(60)
  const [capabilities, setCapabilities] = useState<AiCapabilityStatus[]>([])
  const [capabilitiesState, setCapabilitiesState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [capabilitiesError, setCapabilitiesError] = useState<string | null>(null)
  const [task, setTask] = useState<AiRemixTask | null>(null)
  const [evidence, setEvidence] = useState<AiEvidence[]>([])
  const [evidenceOpenDraftId, setEvidenceOpenDraftId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const capabilityGeneration = useRef(0)

  const reloadCapabilities = async (): Promise<void> => {
    const requestId = ++capabilityGeneration.current
    setCapabilitiesState('loading'); setCapabilitiesError(null)
    if (!window.desktopApi?.listAiCapabilityStatus) {
      setCapabilities([]); setCapabilitiesState('error'); setCapabilitiesError('当前版本缺少能力状态读取能力。')
      return
    }
    try {
      const next = await window.desktopApi.listAiCapabilityStatus()
      if (requestId !== capabilityGeneration.current) return
      setCapabilities(next); setCapabilitiesState('loaded')
    } catch (cause) {
      if (requestId !== capabilityGeneration.current) return
      setCapabilities([]); setCapabilitiesState('error'); setCapabilitiesError(cause instanceof Error ? cause.message : '能力状态读取失败。')
    }
  }

  useEffect(() => { void reloadCapabilities() }, [])

  const createAndRun = async (): Promise<void> => {
    if (!window.desktopApi || busy) return
    setBusy(true); setError(null)
    try {
      const input: AiRemixInput = { dramaId: drama.id, episodeStart, episodeEnd, maxDrafts, durationMinSeconds, durationMaxSeconds }
      const created = await window.desktopApi.createAiRemixTask(input)
      setTask(await window.desktopApi.runAiRemixTask(created.taskId))
      setEvidence(await window.desktopApi.listAiRemixEvidence(created.taskId))
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法创建 AI 二创任务。') } finally { setBusy(false) }
  }

  const decide = async (action: 'continue' | 'stop'): Promise<void> => {
    if (!window.desktopApi || !task) return
    setBusy(true); setError(null)
    try { setTask(await window.desktopApi.decideAiRemixTaskDuration(task.id, action)) } catch (cause) { setError(cause instanceof Error ? cause.message : '无法保存耗时决策。') } finally { setBusy(false) }
  }

  const recover = async (): Promise<void> => {
    if (!window.desktopApi || !task) return
    setBusy(true); setError(null)
    try { setTask(await window.desktopApi.recoverAiRemixTask(task.id)); setEvidence(await window.desktopApi.listAiRemixEvidence(task.id)) } catch (cause) { setError(cause instanceof Error ? cause.message : '无法从检查点恢复任务。') } finally { setBusy(false) }
  }

  const controlled = capabilities.filter((capability) => capability.mode === 'controlled')
  const controlledGuidance: Record<NonNullable<AiCapabilityStatus['reason']>, string> = {
    'no-profile': '尚未选择供应商方案：到“设置 → 能力供应商”按费用、质量和接入难度挑选。',
    'missing-secret': '已选择云端方案但缺少密钥：保存密钥前会继续使用受控本地实现。',
    'unreadable-secret': '已保存密钥但当前 Windows 安全存储无法读取：请在“设置 → 能力供应商”重新保存该方案的密钥。',
    'local-endpoint-required': '已选择本机方案但缺少本地服务地址：补齐地址前会继续使用受控本地实现。',
    'model-required': '已选择方案但尚未填写实际模型：到“设置 → 能力供应商”填写已开通的模型 ID。'
  }
  const sourceFor = (evidenceId: string): AiEvidence | undefined => evidence.find((item) => item.id === evidenceId)
  const selectedEpisodeCount = episodeEnd - episodeStart + 1
  const clampEpisodeNo = (value: number): number => Math.min(lastEpisodeNo, Math.max(firstEpisodeNo, value))
  const setAllEpisodes = (): void => {
    setRangeMode('all')
    setEpisodeStart(firstEpisodeNo)
    setEpisodeEnd(lastEpisodeNo)
  }
  const updateEpisodeStart = (value: string): void => {
    const parsed = Number(value)
    if (!Number.isInteger(parsed)) return
    const next = clampEpisodeNo(parsed)
    setEpisodeStart(next)
    if (next > episodeEnd) setEpisodeEnd(next)
  }
  const updateEpisodeEnd = (value: string): void => {
    const parsed = Number(value)
    if (!Number.isInteger(parsed)) return
    const next = clampEpisodeNo(parsed)
    setEpisodeEnd(next)
    if (next < episodeStart) setEpisodeStart(next)
  }
  return <section aria-labelledby="ai-remix-title">
    <div className="screen-head"><div><p className="meta">P1 方向 · {drama.name}</p><h1 id="ai-remix-title">爆点前置二创</h1><p>AI 只生成可解释草稿，不会未经人工确认自动导出。</p></div><div className="top-actions"><button className="btn btn-secondary" type="button" onClick={onBack}>返回素材生产</button><button className="btn btn-primary" type="button" disabled={busy || episodes.length === 0 || episodeEnd < episodeStart || durationMaxSeconds < durationMinSeconds} onClick={() => void createAndRun()}>{busy ? '正在分析剧情…' : '开始分析剧情'}</button></div></div>
    <div className="ai-banner" role={capabilitiesState === 'error' ? 'alert' : 'status'}><span className="ai-mark">AI</span><div><strong>{capabilitiesState === 'loading' ? '正在读取能力状态' : capabilitiesState === 'error' ? '能力状态读取失败' : '受控本地验证模式'}</strong><p>{capabilitiesState === 'loading' ? '正在确认文本分析与视频理解能力的配置状态；本次不会据此假定云端可用。' : capabilitiesState === 'error' ? `能力状态读取失败：${capabilitiesError}。无法确认供应商是否配置；本次仍只使用受控本地实现，不上传剧集内容，也不伪称云端分析成功。` : controlled.length > 0 ? '尚未配置全部分析能力。本次仅使用本地证据和受控实现，不上传剧集内容，也不伪称云端分析成功。' : '即使本机已保存供应商配置，本阶段仍只运行受控实现；真实云端适配器尚未启用。'}</p>{capabilitiesState !== 'loaded' && <button className="btn btn-secondary" type="button" onClick={() => void reloadCapabilities()}>重新读取能力状态</button>}{capabilitiesState === 'loaded' && controlled.length > 0 && <ul className="helper-list">{controlled.map((item) => <li key={item.capability}>{controlledGuidance[item.reason ?? 'no-profile']}</li>)}</ul>}</div></div>
    <div className="ai-remix-disclosure" aria-label="任务费用、区域与上传披露"><span>区域：{task?.cost.region ?? 'local'}</span><span>预计费用：{task ? `¥${task.cost.estimated.toFixed(2)}` : '运行后计算'}</span><span>实际费用：{task ? `¥${task.cost.actual.toFixed(2)}` : '—'}</span><span>本次上传：无</span></div>
    <div className="grid-2">
      <div className="card card-pad"><h2>任务配置</h2><div className="form-grid"><div className="field"><span>剧集范围</span><div className="segmented" role="group" aria-label="剧集范围模式"><button type="button" className={rangeMode === 'all' ? 'active' : ''} aria-pressed={rangeMode === 'all'} onClick={setAllEpisodes}>全部 {episodes.length} 集</button><button type="button" className={rangeMode === 'custom' ? 'active' : ''} aria-pressed={rangeMode === 'custom'} onClick={() => setRangeMode('custom')}>自定义范围</button></div>{rangeMode === 'custom' && <div className="form-grid"><label className="field" htmlFor="ai-remix-episode-start">起始集<input className="input" id="ai-remix-episode-start" aria-label="起始集" type="number" inputMode="numeric" min={firstEpisodeNo} max={lastEpisodeNo} step="1" value={episodeStart} onChange={(event) => updateEpisodeStart(event.target.value)} /></label><label className="field" htmlFor="ai-remix-episode-end">结束集<input className="input" id="ai-remix-episode-end" aria-label="结束集" type="number" inputMode="numeric" min={firstEpisodeNo} max={lastEpisodeNo} step="1" value={episodeEnd} onChange={(event) => updateEpisodeEnd(event.target.value)} /></label></div>}<p className="helper">第 {episodeStart}–{episodeEnd} 集 · 共 {selectedEpisodeCount} 集</p></div><label className="field">最多生成<select className="select" value={maxDrafts} onChange={(event) => setMaxDrafts(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} 条草稿</option>)}</select></label><label className="field">时长范围<select className="select" value={`${durationMinSeconds}:${durationMaxSeconds}`} onChange={(event) => { const [min, max] = event.target.value.split(':').map(Number); setDurationMinSeconds(min); setDurationMaxSeconds(max) }}><option value="15:30">15–30 秒</option><option value="30:60">30–60 秒</option><option value="60:90">60–90 秒</option><option value="90:180">90–180 秒</option></select></label><label className="field">剪辑视角<select className="select" value="recommended" disabled><option value="recommended">智能推荐（受控模式固定）</option></select></label></div><div className="package-control"><div><h3>导出设置</h3><p>审核确认后选择输出目录，再导出已确认草稿。</p></div><button className="btn btn-secondary" type="button" onClick={() => setError('导出设置将在审核时间线中配置。')}>设置</button></div></div>
      <aside className={`card${task?.checkpoint.drafts.length ? ' ai-remix-draft-card' : ' card-pad'}`}>{task?.checkpoint.drafts.length ? <div className="ai-remix-candidates">{task.checkpoint.drafts.slice(0, 2).map((draft, index) => { const source = sourceFor(draft.evidenceId); return <article className="draft" key={draft.draftId}><h3>候选草稿 {String(index + 1).padStart(2, '0')}<span className="badge info">{draft.confidence === null ? '置信度未评估' : `置信度 ${Math.round(draft.confidence * 100)}%`}</span></h3><p>{draft.summary}</p><p className="helper">视角：{draft.editingAngle ?? '爆点前置'} · 爆点理由：{draft.hookReason ?? '以可定位的高置信证据作为开场钩子。'} · 剧情范围：{draft.coreStoryRange ?? '当前所选剧集'} · 使用集数：第 {draft.episodeStart ?? episodeStart}–{draft.episodeEnd ?? episodeEnd} 集 · 预计时长：{draft.expectedDurationSeconds ?? durationMinSeconds} 秒</p><div className="source-ranges">{source?.sourceType ?? '本地证据'} · {formatTimecode(draft.startSeconds)}–{formatTimecode(draft.endSeconds)}</div><div className="toolbar"><button className="btn btn-secondary" type="button" onClick={() => onOpenReview(draft.draftId)}>进入审核时间线</button><button className="btn" type="button" onClick={() => setEvidenceOpenDraftId((openId) => openId === draft.draftId ? null : draft.draftId)}>查看分析依据</button></div>{evidenceOpenDraftId === draft.draftId && <CandidateEvidence evidence={source ? [source] : []} />}</article> })}</div> : <>{task?.checkpoint.outcome === 'no-recommendation' && <div className="state-panel state-panel-warning" role="status"><strong>暂无推荐</strong><p>{task.checkpoint.reason ?? '当前范围内没有可信剪法，请检查字幕、剧本或分镜证据后再试。'}</p></div>}<h2>分析依据</h2>{evidence.length === 0 ? <p className="helper">运行后将在这里显示字幕、剧本或分镜证据。没有可信证据时，结果会明确显示“暂无推荐”。</p> : <ul className="compact-list">{evidence.slice(0, 6).map((item) => <li key={item.id}><strong>{item.summary}</strong><span className="meta">{item.sourceType} · {formatTimecode(item.startSeconds)}–{formatTimecode(item.endSeconds)} · 置信度 {item.confidence === null ? '未评估' : `${Math.round(item.confidence * 100)}%`}</span></li>)}</ul>}</>}</aside>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {task?.checkpoint.stage === 'awaiting-decision' && <div className="state-panel state-panel-warning" role="alert"><strong>已达到 40 分钟目标时间</strong><p>任务已暂停并保存检查点。继续后最多再等待 10 分钟；到 50 分钟会自动停止。</p><div className="toolbar"><button className="btn btn-secondary" disabled={busy} type="button" onClick={() => void decide('continue')}>再等 10 分钟</button><button className="btn btn-danger" disabled={busy} type="button" onClick={() => void decide('stop')}>停止并保留检查点</button></div></div>}
    {task?.checkpoint.stage === 'force-stopped' && <div className="state-panel state-panel-warning" role="alert"><strong>已达到 50 分钟上限</strong><p>分析已停止，已有检查点仍可恢复。</p><button className="btn btn-secondary" disabled={busy} type="button" onClick={() => void recover()}>从检查点恢复</button></div>}
    {task && task.checkpoint.drafts.length > 2 && <section className="panel" aria-labelledby="ai-remix-drafts-title"><div className="screen-head"><div><h2 id="ai-remix-drafts-title">审核草稿</h2><p>{task.checkpoint.outcome === 'no-recommendation' ? '暂无可信剪法。请检查字幕、剧本或分镜证据后再试。' : `已生成 ${task.checkpoint.drafts.length} 条可解释草稿。`} · 预计 ¥{task.cost.estimated.toFixed(2)} · 实际 ¥{task.cost.actual.toFixed(2)} · 区域 {task.cost.region}</p></div><span className="badge info">{task.cost.mode === 'controlled' ? '受控实现' : '已配置供应商'}</span></div><div className="grid-3">{task.checkpoint.drafts.slice(2).map((draft, index) => { const source = sourceFor(draft.evidenceId); const episodeNo = source?.episodeId ? drama.episodes.find((episode) => episode.id === source.episodeId)?.episodeNo ?? '—' : '—'; return <article className="card method-card" key={draft.draftId}><div className="meta">草稿 {index + 3} · 置信度 {draft.confidence === null ? '未评估' : `${Math.round(draft.confidence * 100)}%`}</div><h3>{draft.summary}</h3><p>来源：{source?.sourceType ?? '本地证据'} · 第 {episodeNo} 集 · {formatTimecode(draft.startSeconds)}–{formatTimecode(draft.endSeconds)}</p><p className="helper">视角：{draft.editingAngle ?? '爆点前置'} · 爆点理由：{draft.hookReason ?? '以可定位的高置信证据作为开场钩子。'} · 剧情范围：{draft.coreStoryRange ?? '当前所选剧集'} · 使用集数：第 {draft.episodeStart ?? episodeStart}–{draft.episodeEnd ?? episodeEnd} 集 · 预计时长：{draft.expectedDurationSeconds ?? durationMinSeconds} 秒</p><div className="toolbar"><button className="btn btn-secondary" type="button" onClick={() => onOpenReview(draft.draftId)}>进入审核时间线</button><button className="btn" type="button" onClick={() => setEvidenceOpenDraftId((openId) => openId === draft.draftId ? null : draft.draftId)}>查看分析依据</button></div>{evidenceOpenDraftId === draft.draftId && <CandidateEvidence evidence={source ? [source] : []} />}</article> })}</div></section>}
  </section>
}

const CandidateEvidence = ({ evidence }: { evidence: AiEvidence[] }): ReactElement => evidence.length === 0
  ? <p className="helper candidate-evidence">该草稿没有可展开的来源证据。</p>
  : <ul className="compact-list candidate-evidence">{evidence.map((item) => <li key={item.id}><strong>{item.summary}</strong><span className="meta">{item.sourceType} · {formatTimecode(item.startSeconds)}–{formatTimecode(item.endSeconds)}</span></li>)}</ul>
