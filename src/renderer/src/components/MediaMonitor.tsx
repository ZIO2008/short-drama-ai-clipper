import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react'

const formatTime = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${(seconds % 60).toFixed(3).padStart(6, '0')}`

export type MediaMonitorState = 'ready' | 'loading' | 'missing' | 'unselected'

export const MediaMonitor = ({ sourcePath, startSeconds, endSeconds, state = 'ready', episodeLabel, monitorMeta, overlay, videoWidth, videoHeight, onRelocate, showTransport = true }: { sourcePath?: string; startSeconds: number; endSeconds: number; state?: MediaMonitorState; episodeLabel?: string; monitorMeta?: string; overlay?: ReactElement; videoWidth?: number | null; videoHeight?: number | null; onRelocate?: () => void; showTransport?: boolean }): ReactElement => {
  const video = useRef<HTMLVideoElement>(null)
  const [currentSeconds, setCurrentSeconds] = useState(startSeconds)
  const [playing, setPlaying] = useState(false)
  const [mediaLoadFailed, setMediaLoadFailed] = useState(false)
  useEffect(() => { setCurrentSeconds(startSeconds); const element = video.current; if (element) element.currentTime = startSeconds }, [sourcePath, startSeconds])
  useEffect(() => { setMediaLoadFailed(false); setPlaying(false) }, [sourcePath, state])
  const togglePlayback = async (): Promise<void> => {
    const element = video.current
    if (!element) return
    if (element.paused) { if (element.currentTime < startSeconds || element.currentTime >= endSeconds) element.currentTime = startSeconds; await element.play(); setPlaying(true) }
    else { element.pause(); setPlaying(false) }
  }
  const updatePlayback = (): void => {
    const element = video.current
    if (!element) return
    if (element.currentTime >= endSeconds) { element.pause(); element.currentTime = endSeconds; setPlaying(false) }
    setCurrentSeconds(Math.min(endSeconds, Math.max(startSeconds, element.currentTime)))
  }
  const stateCopy: Record<Exclude<MediaMonitorState, 'ready'>, { title: string; detail: string }> = {
    unselected: { title: '选择源分集或候选', detail: '从左侧源分集或全部候选池进入；监视器会保持源片画幅。' },
    loading: { title: '正在读取源媒体', detail: '读取完成后显示首帧与候选来源区间。' },
    missing: { title: '源媒体需要重新定位', detail: '返回剧目资产重新关联原文件；不会改写任何源视频。' }
  }
  const effectiveState: MediaMonitorState = state === 'ready' && (mediaLoadFailed || !sourcePath) ? 'missing' : state
  const hasVideo = effectiveState === 'ready' && Boolean(sourcePath)
  const hasFrameMetadata = Boolean(videoWidth && videoHeight && videoWidth > 0 && videoHeight > 0)
  const frameWidth = hasFrameMetadata ? videoWidth as number : 16
  const frameHeight = hasFrameMetadata ? videoHeight as number : 9
  const frameRatio = frameWidth / frameHeight
  const mediaStyle = { '--media-aspect-ratio': `${frameWidth} / ${frameHeight}` } as CSSProperties
  const placeholderStyle = { aspectRatio: `${frameWidth} / ${frameHeight}`, width: `min(86%, ${Math.min(560, Math.max(160, Math.round(360 * frameRatio)))}px)` } as CSSProperties
  const frameLabel = hasFrameMetadata ? `${videoWidth} × ${videoHeight}` : '默认 16:9'
  return <div className={`monitor card media-monitor media-monitor-${effectiveState}`} style={mediaStyle} role="region" aria-label="媒体审片"><div className="viewport">{hasVideo ? <video ref={video} preload="metadata" src={toMediaUrl(sourcePath ?? '')} onError={() => setMediaLoadFailed(true)} onLoadedMetadata={() => { if (video.current) video.current.currentTime = startSeconds }} onTimeUpdate={updatePlayback} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} /> : <div className="monitor-placeholder" style={placeholderStyle}><div className="monitor-placeholder-scene" aria-hidden="true"><span className="monitor-scene-window" /><span className="monitor-scene-figure monitor-scene-figure-left" /><span className="monitor-scene-figure monitor-scene-figure-right" /><span className="monitor-scene-floor" /></div><div className="monitor-placeholder-copy" role="status"><span className="monitor-placeholder-frame" aria-hidden="true" /><strong>{stateCopy[effectiveState as Exclude<MediaMonitorState, 'ready'>].title}</strong><span>{stateCopy[effectiveState as Exclude<MediaMonitorState, 'ready'>].detail}</span><small>{episodeLabel ?? '未选择源分集'} · {formatTime(startSeconds)} — {formatTime(endSeconds)} · {frameLabel}</small></div>{effectiveState === 'missing' && onRelocate && <button className="btn btn-secondary monitor-relink" type="button" onClick={onRelocate}>前往剧目资产重新关联</button>}</div>}{!showTransport && <><span className="monitor-timecode" aria-hidden="true">{formatTime(startSeconds)}</span><div className="monitor-context"><span>{episodeLabel ?? '未选择源分集'} · {formatTime(startSeconds)} — {formatTime(endSeconds)}</span>{monitorMeta && <span>{monitorMeta}</span>}</div></>}{overlay}</div>{showTransport && <><div className="transport"><span className="meta num">{formatTime(currentSeconds)}</span><button className="play" disabled={!hasVideo} type="button" aria-label={playing ? '暂停预览' : '播放预览'} onClick={() => void togglePlayback()}>{playing ? '||' : '▶'}</button><span className="meta num">{formatTime(endSeconds)}</span></div><p className="meta monitor-range">{episodeLabel ?? '源片'} · 预览范围 {formatTime(startSeconds)}–{formatTime(endSeconds)}</p></>}</div>
}

export const toMediaUrl = (sourcePath: string): string => {
  if (/^shortdrama-media:\/\//i.test(sourcePath)) return sourcePath
  if (/^file:\/\//i.test(sourcePath)) return `shortdrama-media://local/${encodeURIComponent(toLocalMediaPath(sourcePath))}`
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(sourcePath)) return 'about:blank'
  return `shortdrama-media://local/${encodeURIComponent(toLocalMediaPath(sourcePath))}`
}

const toLocalMediaPath = (value: string): string => {
  if (!/^file:\/\//i.test(value)) return value
  const match = /^file:\/\/([^/]*)(\/.*)?$/i.exec(value)
  if (!match) return value
  const host = match[1] ?? ''
  const path = match[2] ?? ''
  const decodedPath = path.split('/').map((segment) => {
    try { return decodeURIComponent(segment) } catch { return segment }
  }).join('/')
  if (host) return `//${host}${decodedPath}`
  return decodedPath.replace(/^\//, '')
}
