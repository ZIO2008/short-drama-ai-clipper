import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { AiCapabilityStatus, DramaDetail, NarrationInput, NarrationSegment, NarrationTask } from '../../../shared/contracts.js'

type Props = { drama: DramaDetail; onBack: () => void; onOpenReview: (draftId: string) => void }

const timecode = (seconds: number | null): string => seconds === null ? '不插入原片' : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`

export const NarrationWorkspacePage = ({ drama, onBack, onOpenReview }: Props): ReactElement => {
  const episodes = useMemo(() => drama.episodes.filter((episode) => episode.episodeNo !== null).sort((left, right) => (left.episodeNo ?? 0) - (right.episodeNo ?? 0)), [drama.episodes])
  const [episodeStart, setEpisodeStart] = useState(episodes[0]?.episodeNo ?? 1)
  const [episodeEnd, setEpisodeEnd] = useState(episodes.at(-1)?.episodeNo ?? 1)
  const [mode, setMode] = useState<'standard' | 'conflict-insert'>('standard')
  const [duration, setDuration] = useState<'30-60' | '60-90' | '90-180'>('30-60')
  const [maxDrafts, setMaxDrafts] = useState(3)
  const [capabilities, setCapabilities] = useState<AiCapabilityStatus[]>([])
  const [task, setTask] = useState<NarrationTask | null>(null)
  const [segments, setSegments] = useState<NarrationSegment[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { window.desktopApi?.listAiCapabilityStatus().then(setCapabilities).catch(() => setCapabilities([])) }, [])
  const range = duration.split('-').map(Number) as [number, number]
  const tts = capabilities.find((capability) => capability.capability === 'tts')

  const createAndRun = async (): Promise<void> => {
    if (!window.desktopApi || busy) return
    setBusy(true); setError(null)
    try {
      const input: NarrationInput = { dramaId: drama.id, episodeStart, episodeEnd, mode, durationMinSeconds: range[0], durationMaxSeconds: range[1], maxDrafts, voice: 'general-mandarin' }
      const created = await window.desktopApi.createNarrationTask(input)
      await window.desktopApi.runNarrationTask(created.taskId)
      const [nextTask, nextSegments] = await Promise.all([window.desktopApi.getNarrationTask(created.taskId), window.desktopApi.listNarrationSegments(created.taskId)])
      setTask(nextTask); setSegments(nextSegments)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法创建 AI 解说任务。') } finally { setBusy(false) }
  }

  return <section aria-labelledby="narration-title">
    <div className="screen-head"><div><p className="meta">{drama.name} · P2 待审核草稿</p><h1 id="narration-title">AI 短剧解说</h1><p>只使用可定位的剧情证据生成普通话通用音色的受控草稿，确认审核前不会输出成片。</p></div><button className="btn" type="button" onClick={onBack}>返回素材生产</button></div>
    <div className="ai-banner" role="status"><span className="ai-mark">AI</span><div><strong>受控本地验证模式</strong><p>{tts?.mode === 'configured' ? '当前仍只执行受控本地 TTS 验证，不会向已配置服务上传剧集、字幕或剧本。真实云端适配器尚未启用。' : '尚未配置可用 TTS 密钥。本次只生成本地受控旁白占位资产，不发送网络请求，也不伪称云端调用成功。'}</p></div></div>
    <div className="grid-2"><div className="card card-pad"><h2>解说配置</h2><div className="form-grid"><label className="field">起始集<select className="select" value={episodeStart} onChange={(event) => setEpisodeStart(Number(event.target.value))}>{episodes.map((episode) => <option key={episode.id} value={episode.episodeNo ?? 0}>第 {episode.episodeNo} 集</option>)}</select></label><label className="field">结束集<select className="select" value={episodeEnd} onChange={(event) => setEpisodeEnd(Number(event.target.value))}>{episodes.map((episode) => <option key={episode.id} value={episode.episodeNo ?? 0}>第 {episode.episodeNo} 集</option>)}</select></label><div className="field"><span>解说模式</span><div className="segmented" role="group" aria-label="解说模式"><button type="button" className={mode === 'standard' ? 'active' : ''} aria-pressed={mode === 'standard'} onClick={() => setMode('standard')}>普通解说</button><button type="button" className={mode === 'conflict-insert' ? 'active' : ''} aria-pressed={mode === 'conflict-insert'} onClick={() => setMode('conflict-insert')}>冲突插入原片</button></div></div><label className="field">目标时长<select className="select" value={duration} onChange={(event) => setDuration(event.target.value as typeof duration)}><option value="30-60">30–60 秒</option><option value="60-90">60–90 秒</option><option value="90-180">90–180 秒</option></select></label><label className="field">草稿上限<select className="select" value={maxDrafts} onChange={(event) => setMaxDrafts(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((count) => <option value={count} key={count}>{count} 条</option>)}</select></label><div className="field"><span>音色</span><strong>通用普通话</strong><p className="helper">不支持声纹克隆、名人或角色音色。</p></div></div><button className="btn btn-primary" disabled={busy || episodes.length === 0 || episodeEnd < episodeStart} type="button" onClick={() => void createAndRun()}>{busy ? '正在生成受控草稿…' : '生成解说审核草稿'}</button></div><aside className="card card-pad"><h2>本次披露</h2><dl className="compact-list"><div><dt>上传范围</dt><dd>无。仅使用本地已有证据。</dd></div><div><dt>处理区域</dt><dd>{task?.cost.region ?? '本地'}</dd></div><div><dt>供应商</dt><dd>{task?.cost.provider ?? '受控实现'}</dd></div><div><dt>预计费用</dt><dd>¥{(task?.cost.estimated ?? 0).toFixed(2)}；实际 ¥{(task?.cost.actual ?? 0).toFixed(2)}</dd></div></dl></aside></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {task && <section className="panel" aria-labelledby="narration-result-title"><div className="screen-head"><div><h2 id="narration-result-title">解说草稿</h2><p>{segments.length === 0 ? '暂无可信解说。请补充字幕、剧本或可定位的剧情证据后重试。' : `已生成 ${segments.length} 条待审核草稿，均保留来源证据与旁白资产。`}</p></div><span className="badge info">{task.cost.mode === 'controlled' ? '受控实现' : '已配置供应商'}</span></div>{segments.length > 0 && <div className="grid-3">{segments.map((segment, index) => <article className="card method-card" key={segment.id}><div className="meta">草稿 {index + 1} · 目标 {segment.targetDurationSeconds} 秒 · 置信度 {segment.confidence === null ? '未评估' : `${Math.round(segment.confidence * 100)}%`}</div><h3>{segment.mode === 'conflict-insert' ? '关键冲突插入原片' : '普通剧情解说'}</h3><p>{segment.text}</p><p className="helper">来源证据：{segment.evidenceId.slice(0, 8)} · 原片插入：{timecode(segment.insertStartSeconds)}{segment.insertEndSeconds === null ? '' : `–${timecode(segment.insertEndSeconds)}`}</p><button className="btn btn-secondary" type="button" onClick={() => onOpenReview(segment.draftId)}>进入审核时间线</button></article>)}</div>}</section>}
  </section>
}
