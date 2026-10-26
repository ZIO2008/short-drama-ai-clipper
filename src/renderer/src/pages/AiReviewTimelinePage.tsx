import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { FixedTimeline, TimelineClip, TimelineProject } from '../../../shared/contracts.js'
import { MediaMonitor } from '../components/MediaMonitor.js'
import { ModalDialog } from '../components/ModalDialog.js'

type Props = { draftId: string; origin?: 'P1' | 'P2'; onBack: () => void }

const clipDuration = (clip: TimelineClip): number => clip.sourceEndSeconds - clip.sourceStartSeconds
const toDecibels = (volume: number): number => volume <= 0 ? -60 : Math.max(-60, Math.min(12, Math.round(20 * Math.log10(volume) * 2) / 2))
const fromDecibels = (decibels: number): number => Math.pow(10, Math.max(-60, Math.min(12, decibels)) / 20)

const updateClip = (timeline: FixedTimeline, clipId: string, update: Partial<TimelineClip>): FixedTimeline => ({
  ...timeline,
  video: timeline.video.map((clip) => clip.id === clipId ? { ...clip, ...update } : clip),
  music: timeline.music.map((track) => track.map((clip) => clip.id === clipId ? { ...clip, ...update } : clip)) as FixedTimeline['music'],
  sfx: timeline.sfx.map((track) => track.map((clip) => clip.id === clipId ? { ...clip, ...update } : clip)) as FixedTimeline['sfx']
})

const removeClip = (timeline: FixedTimeline, clipId: string): FixedTimeline => ({
  ...timeline,
  video: timeline.video.filter((clip) => clip.id !== clipId),
  music: timeline.music.map((track) => track.filter((clip) => clip.id !== clipId)) as FixedTimeline['music'],
  sfx: timeline.sfx.map((track) => track.filter((clip) => clip.id !== clipId)) as FixedTimeline['sfx']
})

const reorderVideo = (timeline: FixedTimeline, clipId: string, direction: -1 | 1): FixedTimeline => {
  const ordered = [...timeline.video].sort((left, right) => left.positionSeconds - right.positionSeconds)
  const index = ordered.findIndex((clip) => clip.id === clipId); const target = index + direction
  if (index < 0 || target < 0 || target >= ordered.length) return timeline
  const current = ordered[index]; const adjacent = ordered[target]
  if (!current || !adjacent) return timeline
  return updateClip(updateClip(timeline, current.id, { positionSeconds: adjacent.positionSeconds }), adjacent.id, { positionSeconds: current.positionSeconds })
}

const snappedPosition = (timeline: FixedTimeline, clipId: string, positionSeconds: number): number => {
  if (!timeline.snapEnabled) return positionSeconds
  const points = timeline.video.filter((clip) => clip.id !== clipId).flatMap((clip) => [clip.positionSeconds, clip.positionSeconds + clipDuration(clip) - clip.transitionDurationSeconds])
  const closest = points.reduce<number | null>((match, point) => match === null || Math.abs(point - positionSeconds) < Math.abs(match - positionSeconds) ? point : match, null)
  return closest !== null && Math.abs(closest - positionSeconds) <= 0.5 ? closest : positionSeconds
}

export const AiReviewTimelinePage = ({ draftId, origin = 'P1', onBack }: Props): ReactElement => {
  const [project, setProject] = useState<TimelineProject | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [outputDirectory, setOutputDirectory] = useState('')
  const [exportSettingsOpen, setExportSettingsOpen] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    window.desktopApi?.getTimelineProject(draftId).then((next) => { setProject(next); setConfirmed(Boolean(next.confirmed)); setSelectedId(next.timeline.video[0]?.id ?? null) }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : '无法创建审核时间线。'))
  }, [draftId])

  const selected = useMemo(() => project ? [project.timeline.video, ...project.timeline.music, ...project.timeline.sfx].flat().find((clip) => clip.id === selectedId) ?? null : null, [project, selectedId])
  const save = async (timeline: FixedTimeline): Promise<void> => {
    if (!window.desktopApi || !project) return
    setBusy(true); setMessage(null)
    try { const next = await window.desktopApi.saveTimelineProject(draftId, timeline); setProject(next); setConfirmed(Boolean(next.confirmed)); setMessage('审核草稿已保存。') } catch (error) { setMessage(error instanceof Error ? error.message : '保存审核草稿失败。') } finally { setBusy(false) }
  }
  const updateSelected = (update: Partial<TimelineClip>): void => { if (project && selected) void save(updateClip(project.timeline, selected.id, update)) }
  const moveSelected = (positionSeconds: number): void => {
    if (!project || !selected || !Number.isFinite(positionSeconds)) return
    updateSelected({ positionSeconds: Math.max(0, snappedPosition(project.timeline, selected.id, positionSeconds)) })
  }
  const trimSelected = (edge: 'start' | 'end', value: number): void => {
    if (!selected || !Number.isFinite(value)) return
    if (edge === 'start' && value >= selected.sourceEndSeconds) { setMessage('入点必须早于出点。'); return }
    if (edge === 'end' && value <= selected.sourceStartSeconds) { setMessage('出点必须晚于入点。'); return }
    updateSelected(edge === 'start' ? { sourceStartSeconds: Math.max(0, value) } : { sourceEndSeconds: value })
  }
  const deleteSelected = (): void => {
    if (!project || !selected) return
    if (project.timeline.video.some((clip) => clip.id === selected.id) && project.timeline.video.length === 1) { setMessage('审核草稿至少需要保留一个视频片段。'); return }
    const next = removeClip(project.timeline, selected.id)
    setSelectedId(next.video[0]?.id ?? next.music.flat()[0]?.id ?? next.sfx.flat()[0]?.id ?? null)
    void save(next)
  }
  const moveVideoOrder = (direction: -1 | 1): void => {
    if (!project || !selected || !project.timeline.video.some((clip) => clip.id === selected.id)) return
    void save(reorderVideo(project.timeline, selected.id, direction))
  }
  const confirm = async (): Promise<boolean> => {
    if (!window.desktopApi) return false
    setBusy(true); setMessage(null)
    try { const next = await window.desktopApi.confirmTimelineDraft(draftId); setProject(next); setConfirmed(Boolean(next.confirmed)); setMessage('草稿已确认，可选择输出目录后导出。'); return Boolean(next.confirmed) } catch (error) { setMessage(error instanceof Error ? error.message : '确认草稿失败。'); return false } finally { setBusy(false) }
  }
  const exportDraft = async (): Promise<void> => {
    if (!window.desktopApi || !outputDirectory) return
    setBusy(true); setMessage(null)
    try { const result = await window.desktopApi.exportTimelineDraft(draftId, outputDirectory); setMessage(`已导出到 ${result.outputPath}`) } catch (error) { setMessage(error instanceof Error ? error.message : '导出审核草稿失败。') } finally { setBusy(false) }
  }
  const chooseExportDirectory = async (): Promise<void> => {
    setMessage(null)
    try {
      const path = await window.desktopApi?.chooseOutputDirectory()
      if (path) setOutputDirectory(path)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '选择输出目录失败，请重试。')
    }
  }
  const confirmAndExport = async (): Promise<void> => {
    if (!outputDirectory) { setExportSettingsOpen(true); return }
    const isConfirmed = confirmed || await confirm()
    if (isConfirmed) await exportDraft()
  }
  const previewDraft = (): void => {
    const video = document.querySelector<HTMLVideoElement>('.ai-review-top video')
    if (!video) { setMessage('当前片段没有可预览的视频。'); return }
    void video.play().catch(() => setMessage('预览无法自动开始，请使用监视器播放按钮。'))
  }
  const addAudio = async (kind: 'music' | 'sfx', trackIndex: 0 | 1): Promise<void> => {
    if (!window.desktopApi) return
    const sourcePath = await window.desktopApi.chooseAudioFile()
    if (!sourcePath) return
    setBusy(true); setMessage(null)
    try { const next = await window.desktopApi.addTimelineAudio(draftId, { kind, trackIndex, sourcePath, durationSeconds: 1, positionSeconds: 0 }); setProject(next); setConfirmed(Boolean(next.confirmed)); setMessage('音频片段已加入固定轨道。') } catch (error) { setMessage(error instanceof Error ? error.message : '添加音频片段失败。') } finally { setBusy(false) }
  }

  const timelineLength = project ? Math.max(30, ...[project.timeline.video, ...project.timeline.music, ...project.timeline.sfx].flat().map((clip) => clip.positionSeconds + clipDuration(clip))) : 30
  const pageMeta = origin === 'P1' ? 'P1 审核草稿 · 自动保存' : 'P2 轻量审核'
  const pageTitle = origin === 'P1' ? '候选草稿 01' : '固定轨道时间线'
  if (!project) return <section className="state-panel" role="status">
<h1>正在加载审核时间线</h1>
<p>{message ?? '正在读取草稿与来源证据。'}</p>
<button className="btn" type="button" onClick={onBack}>返回草稿</button>
</section>
  return <section aria-labelledby="ai-review-title" data-review-origin={origin}>
    <div className="screen-head">
<div>
<p className="meta">{pageMeta}</p>
<h1 id="ai-review-title">{pageTitle}</h1>
<p>{origin === 'P2' ? '旁白复用固定音效轨，不新增轨道；原片、旁白、音乐和音效均需人工确认。' : '仅编辑当前草稿的片段、音量、淡入淡出、转场和吸附；不能新增轨道或使用复杂剪辑功能。'}</p>
</div>
<div className="top-actions">
<button className="btn btn-secondary" type="button" onClick={onBack}>{origin === 'P1' ? '返回二创配置' : '返回草稿'}</button>
<button className="btn" type="button" onClick={() => setExportSettingsOpen(true)}>导出设置</button>
<button className="btn btn-secondary" type="button" onClick={previewDraft}>预览草稿</button>
<button className="btn btn-primary" disabled={busy} type="button" onClick={() => void confirmAndExport()}>{confirmed ? '导出已确认草稿' : '确认并导出'}</button>
</div>
</div>
    <div className="ai-review-top">
<div>{selected?.role === 'narration' ? <div className="state-panel" role="status">
<h2>旁白资产</h2>
<p>受控本地旁白 · {selected.sourceStartSeconds.toFixed(1)}–{selected.sourceEndSeconds.toFixed(1)} 秒</p>
<p>{selected.narrationText ?? '未记录旁白文案。'}</p>
<p className="helper">来源证据：{selected.sourceEvidenceId ?? '未记录'} · 旁白期间原片人声避让至 35%</p>
<p className="path">{selected.sourcePath}</p>
</div> : selected ? <MediaMonitor sourcePath={selected.sourcePath} startSeconds={selected.sourceStartSeconds} endSeconds={selected.sourceEndSeconds} /> : <div className="state-panel" role="status">请选择一个片段。</div>}</div>
<aside className="card card-pad timeline-inspector">
<h2>片段属性</h2>{selected ? <>
<div className="selected-clip">
<strong>{selected.role === 'narration' ? '旁白' : selected.role === 'conflict' ? '冲突原片' : '视频片段'}</strong>
<span>{selected.role === 'narration' ? '旁白与音效轨' : '视频主轨'} · {selected.positionSeconds.toFixed(1)}–{(selected.positionSeconds + clipDuration(selected)).toFixed(1)} 秒</span>
</div>
<div className="form-grid">
<label className="field">位置（秒）<input className="input num" type="number" min="0" value={selected.positionSeconds} disabled={busy} onChange={(event) => moveSelected(Number(event.target.value))} />
</label>
<label className="field">入点（秒）<input className="input num" type="number" min="0" value={selected.sourceStartSeconds} disabled={busy} onChange={(event) => trimSelected('start', Number(event.target.value))} />
</label>
<label className="field">出点（秒）<input className="input num" type="number" min="0" value={selected.sourceEndSeconds} disabled={busy} onChange={(event) => trimSelected('end', Number(event.target.value))} />
</label>
<label className="field">音量<div className="input-with-unit">
<input className="input num" type="number" min="-60" max="12" step="0.5" value={toDecibels(selected.volume)} disabled={busy} onChange={(event) => updateSelected({ volume: fromDecibels(Number(event.target.value)) })} />
<span className="input-unit">dB</span>
</div>
</label>
<label className="field">淡入（秒）<input className="input num" type="number" min="0" value={selected.fadeInSeconds} disabled={busy} onChange={(event) => updateSelected({ fadeInSeconds: Number(event.target.value) })} />
</label>
<label className="field">淡出（秒）<input className="input num" type="number" min="0" value={selected.fadeOutSeconds} disabled={busy} onChange={(event) => updateSelected({ fadeOutSeconds: Number(event.target.value) })} />
</label>
<label className="field">转场<select className="select" value={selected.transition} disabled={busy} onChange={(event) => updateSelected({ transition: event.target.value as TimelineClip['transition'] })}>
<option value="cut">直接切换</option>
<option value="fade">淡入淡出</option>
</select>
</label>
<label className="field">转场时长（秒）<input className="input num" type="number" min="0" max="5" step="0.1" value={selected.transitionDurationSeconds} disabled={busy} onChange={(event) => updateSelected({ transitionDurationSeconds: Number(event.target.value) })} />
</label>
</div>
<div className="toolbar timeline-actions">
<button className="btn" type="button" disabled={busy || selected.positionSeconds <= 0} onClick={() => moveSelected(selected.positionSeconds - 1)}>前移 1 秒</button>
<button className="btn" type="button" disabled={busy} onClick={() => moveSelected(selected.positionSeconds + 1)}>后移 1 秒</button>{project.timeline.video.some((clip) => clip.id === selected.id) && <>
<button className="btn" type="button" disabled={busy} onClick={() => moveVideoOrder(-1)}>视频前置</button>
<button className="btn" type="button" disabled={busy} onClick={() => moveVideoOrder(1)}>视频后置</button>
</>}<button className="btn btn-danger" type="button" disabled={busy} onClick={deleteSelected}>删除片段</button>
</div>
<div className="timeline-snap-control">
<div>
<h3>吸附</h3>
<p>吸附到切点与转场</p>
</div>
<button className={`switch${project.timeline.snapEnabled ? ' on' : ''}`} type="button" aria-label="时间线吸附" aria-pressed={project.timeline.snapEnabled} disabled={busy} onClick={() => void save({ ...project.timeline, snapEnabled: !project.timeline.snapEnabled })}>吸附</button>
</div>
</> : <p className="helper">尚未选择片段。</p>}</aside>
</div>
    <section className="panel" aria-labelledby="timeline-tracks-title">
<div className="screen-head">
<div>
<h2 id="timeline-tracks-title">时间线</h2>
<p>固定 1 视频、2 音乐、2 音效轨。音频可重叠；默认吸附视频切点和转场点。</p>
</div>
</div>
<div className="timeline-ruler" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <span key={index}>{Math.round(timelineLength * index / 6)} 秒</span>)}</div>
<Track label="视频主轨" clips={project.timeline.video} selectedId={selectedId} durationSeconds={timelineLength} onSelect={setSelectedId} />
<Track label="音乐 1" clips={project.timeline.music[0]} selectedId={selectedId} durationSeconds={timelineLength} onSelect={setSelectedId} onAdd={() => void addAudio('music', 0)} />
<Track label="音乐 2" clips={project.timeline.music[1]} selectedId={selectedId} durationSeconds={timelineLength} onSelect={setSelectedId} onAdd={() => void addAudio('music', 1)} />
<Track label={origin === 'P2' ? '旁白与音效 1' : '音效 1'} clips={project.timeline.sfx[0]} selectedId={selectedId} durationSeconds={timelineLength} onSelect={setSelectedId} onAdd={() => void addAudio('sfx', 0)} />
<Track label="音效 2" clips={project.timeline.sfx[1]} selectedId={selectedId} durationSeconds={timelineLength} onSelect={setSelectedId} onAdd={() => void addAudio('sfx', 1)} />
</section>
    {message && <p className="helper" role="status">{message}</p>}
    <div className="toolbar">
<button className="btn btn-primary" disabled={busy || confirmed} type="button" onClick={() => void confirm()}>{confirmed ? '已确认审核草稿' : '确认审核草稿'}</button>
<span className="helper">{outputDirectory ? `导出目录：${outputDirectory}` : '请通过右上角“导出设置”选择输出目录。'}</span>
<button className="btn btn-secondary" disabled={busy || !confirmed || !outputDirectory} type="button" onClick={() => void exportDraft()}>导出已确认草稿</button>
</div>
    {exportSettingsOpen && <ModalDialog labelledBy="timeline-export-settings-title" className="export-settings-modal" initialFocusSelector="#timeline-output-directory" onClose={() => setExportSettingsOpen(false)}>
<div className="modal-head">
<h2 id="timeline-export-settings-title">导出设置</h2>
<button className="btn icon-btn" type="button" aria-label="关闭导出设置" disabled={busy} onClick={() => setExportSettingsOpen(false)}>×</button>
</div>
<div className="modal-body">
<label className="field" htmlFor="timeline-output-directory">输出目录<div className="inline-form">
<input className="input path" id="timeline-output-directory" aria-label="输出目录" value={outputDirectory} disabled={busy} onChange={(event) => setOutputDirectory(event.target.value)} />
<button className="btn" disabled={busy} type="button" onClick={() => void chooseExportDirectory()}>选择</button>
</div>
<span className="helper">已确认的审核草稿将导出到此目录。</span>
</label>{message && <p className="form-error" role="alert">{message}</p>}</div>
<div className="modal-foot">
<button className="btn btn-secondary" disabled={busy} type="button" onClick={() => setExportSettingsOpen(false)}>取消</button>
<button className="btn btn-primary" disabled={busy || !outputDirectory} type="button" onClick={() => setExportSettingsOpen(false)}>保存导出设置</button>
</div>
</ModalDialog>}
  </section>
}

type TrackProps = {
  label: string
  clips: TimelineClip[]
  selectedId: string | null
  durationSeconds: number
  onSelect: (id: string) => void
  onAdd?: () => void
}

const Track = ({ label, clips, selectedId, durationSeconds, onSelect, onAdd }: TrackProps): ReactElement => (
  <div className="timeline-track">
    <strong>{label}</strong>
    <div className="timeline-track-lane">
      {clips.length === 0 ? <span className="meta">暂无片段</span> : clips.map((clip) => (
        <button
          key={clip.id}
          className={`timeline-clip${selectedId === clip.id ? ' active' : ''}`}
          type="button"
          style={{
            left: `${Math.min(96, clip.positionSeconds / durationSeconds * 100)}%`,
            width: `${Math.max(8, Math.min(100, clipDuration(clip) / durationSeconds * 100))}%`
          }}
          onClick={() => onSelect(clip.id)}
        >
          {clip.role === 'narration' ? '旁白 ' : clip.role === 'conflict' ? '冲突原片 ' : ''}
          {clip.sourceStartSeconds.toFixed(1)}–{clip.sourceEndSeconds.toFixed(1)}s
        </button>
      ))}
    </div>
    {onAdd && (
      <button className="btn timeline-add-audio" type="button" aria-label={`为${label} 添加音频`} title={`为${label} 添加音频`} onClick={onAdd}>
        +
      </button>
    )}
  </div>
)
