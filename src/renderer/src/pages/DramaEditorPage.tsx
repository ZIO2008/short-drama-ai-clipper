import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { DramaDetail, DramaSummary, EpisodeAsset, EpisodeUpdate, TagSummary } from '../../../shared/contracts.js'
import type { AssetHealth } from '../../../shared/contracts.js'

type Props = {
  drama: DramaSummary; tags: TagSummary[]; onClose: () => void; onLoad: () => Promise<DramaDetail>
  onRename: (name: string) => Promise<void>; onImport: () => Promise<void>; onAttachTag: (tagId: string) => Promise<void>
  onUpdateEpisode: (episodeId: string, update: EpisodeUpdate) => Promise<DramaDetail>; onRemoveEpisode: (episodeId: string) => Promise<DramaDetail>
  onDelete: (deleteTempFiles: boolean) => Promise<void>; onImportScript: () => Promise<Array<{ segmentId?: string; episodeNo: number; title: string; text: string }>>; onLinkSegment: (segmentId: string, episodeId: string | null) => Promise<void>; onRelink: () => Promise<void>
}

export const DramaEditorPage = (props: Props): ReactElement => {
  const [name, setName] = useState(props.drama.name)
  const [detail, setDetail] = useState<DramaDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleteTempFiles, setDeleteTempFiles] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<AssetHealth | null>(null)
  const [scriptPreview, setScriptPreview] = useState<Array<{ segmentId?: string; episodeNo: number; title: string; text: string }>>([])
  const closeRef = useRef<HTMLButtonElement>(null)
  const modalRef = useRef<HTMLElement>(null)
  useEffect(() => { const load = async (): Promise<void> => { try { if (window.desktopApi?.inspectAssetHealth) setHealth(await window.desktopApi.inspectAssetHealth(props.drama.id)); setDetail(await props.onLoad()) } catch { setError('剧集读取失败') } }; void load(); closeRef.current?.focus() }, [])
  useEffect(() => { const close = (event: KeyboardEvent): void => { if (event.key === 'Escape') props.onClose(); if (event.key === 'Tab') { const focusable = modalRef.current?.querySelectorAll<HTMLElement>('button,input,select,[tabindex="0"]'); if (!focusable?.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() } } }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close) }, [props.onClose])
  const run = async (operation: () => Promise<void>): Promise<void> => { setBusy(true); setError(null); try { await operation() } catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败') } finally { setBusy(false) } }
  const updateEpisode = async (episode: EpisodeAsset, update: Partial<EpisodeUpdate>): Promise<void> => {
    try { setDetail(await props.onUpdateEpisode(episode.id, { episodeNo: episode.episodeNo, sortOrder: episode.sortOrder, sourcePath: episode.sourcePath, ...update })); setError(null) }
    catch { setError('集号重复或路径无效，请修正高亮行。') }
  }
  return <div className="modal-backdrop"><section ref={modalRef} className="modal" role="dialog" aria-modal="true" aria-labelledby="drama-editor-title">
    <div className="screen-head"><h2 id="drama-editor-title">编辑剧目</h2><button ref={closeRef} className="btn" type="button" onClick={props.onClose}>关闭</button></div>
    <div className="field"><label htmlFor="edit-drama-name">剧名</label><input className="input" id="edit-drama-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
    <div className="toolbar"><button className="btn btn-primary" disabled={busy} type="button" onClick={() => void run(() => props.onRename(name))}>保存名称</button><button className="btn" disabled={busy} type="button" onClick={() => void run(async () => { await props.onImport(); setDetail(await props.onLoad()) })}>选择并导入视频</button><button className="btn" disabled={busy} type="button" onClick={() => void run(async () => setScriptPreview(await props.onImportScript()))}>导入剧本并预览</button><button className="btn" disabled={busy} type="button" onClick={() => void run(async () => { await props.onRelink(); setDetail(await props.onLoad()); if (window.desktopApi?.inspectAssetHealth) setHealth(await window.desktopApi.inspectAssetHealth(props.drama.id)) })}>批量重新定位</button></div>
    {scriptPreview.length > 0 && <div className="card"><h3>逐集关联预览</h3>{scriptPreview.map((segment) => <div key={segment.segmentId ?? segment.episodeNo}><p>第 {segment.episodeNo} 集 · {segment.title} · {segment.text.slice(0, 120)}</p><select className="select" aria-label={`关联第${segment.episodeNo}集`} defaultValue="" onChange={(event) => { if (segment.segmentId) void run(() => props.onLinkSegment(segment.segmentId as string, event.target.value || null)) }}><option value="">选择对应视频集</option>{detail?.episodes.map((episode) => <option key={episode.id} value={episode.id}>{episode.episodeNo ?? '待填写'} · {episode.sourcePath}</option>)}</select></div>)}</div>}
    <div className="field"><label htmlFor="editor-tag">关联标签</label><select className="select" id="editor-tag" defaultValue="" onChange={(event) => { if (event.target.value) void run(() => props.onAttachTag(event.target.value)) }}><option value="">选择标签</option>{props.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></div>
    {health && <div className="card" role="status"><strong>资产健康：{health.issueCount === 0 ? '正常' : `${health.issueCount} 项需要处理`}</strong>{health.missingEpisodeNumbers.length > 0 && <p>缺集：{health.missingEpisodeNumbers.join('、')}</p>}{health.duplicateEpisodeNumbers.length > 0 && <p>重复集号：{health.duplicateEpisodeNumbers.join('、')}</p>}{health.missing.length > 0 && <p>失联文件：{health.missing.join('、')}</p>}{health.unreadable.length > 0 && <p>无权限文件：{health.unreadable.join('、')}</p>}{health.unsupported.length > 0 && <p>格式不支持：{health.unsupported.join('、')}</p>}</div>}
    <div className="table-wrap"><table><thead><tr><th>集号</th><th>顺序</th><th>原路径</th><th>状态</th><th>操作</th></tr></thead><tbody>{detail?.episodes.map((episode) => <tr key={episode.id}><td><input className="input" aria-label={`${episode.sourcePath} 集号`} type="number" min="1" value={episode.episodeNo ?? ''} onChange={(event) => void updateEpisode(episode, { episodeNo: event.target.value ? Number(event.target.value) : null })} /></td><td><input className="input" aria-label={`${episode.sourcePath} 顺序`} type="number" min="0" value={episode.sortOrder} onChange={(event) => void updateEpisode(episode, { sortOrder: Number(event.target.value) })} /></td><td><input className="input" aria-label={`${episode.sourcePath} 路径`} value={episode.sourcePath} onChange={(event) => void updateEpisode(episode, { sourcePath: event.target.value })} /></td><td>{episode.status}</td><td><button className="btn" type="button" onClick={() => void props.onRemoveEpisode(episode.id).then(setDetail)}>移除</button></td></tr>)}</tbody></table></div>
    {error && <p role="alert">{error}</p>}
    <div className="card danger-zone"><p>删除应用记录不会删除原片、剧本源文件或导出成片。当前登记临时缓存：0 B。</p><label><input type="checkbox" checked={deleteTempFiles} onChange={(event) => setDeleteTempFiles(event.target.checked)} /> 同时删除本应用生成的临时文件</label><button className="btn" disabled={busy} type="button" onClick={() => { if (window.confirm('确认删除剧目？原片不会被删除。')) void run(() => props.onDelete(deleteTempFiles)) }}>删除剧目</button></div>
  </section></div>
}
