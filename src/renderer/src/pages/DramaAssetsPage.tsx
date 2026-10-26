import { useState, type ReactElement } from 'react'
import type { DramaDetail, ScriptAssetSummary } from '../../../shared/contracts.js'
import { ModalDialog } from '../components/ModalDialog.js'
import { UiIcon } from '../components/UiIcon.js'
import type { ScriptPreviewSegment } from './DramaEditorPage.js'

type Props = {
  drama: DramaDetail
  scripts: ScriptAssetSummary[]
  onImport: () => Promise<void>
  onImportFolder?: () => Promise<void>
  onImportScript: () => Promise<ScriptPreviewSegment[]>
  onLinkScript: (scriptId: string, episodeId: string | null) => Promise<void>
  onLinkSegment: (segmentId: string, episodeId: string | null) => Promise<void>
  onRelink: () => Promise<void>
  onRemoveEpisode?: (episodeId: string) => Promise<void>
  onDismissDurationAlert?: (episodeId: string) => Promise<void>
  onEdit: () => void
  embedded?: boolean
}

export const DramaAssetsPage = ({ drama, scripts, onImport, onImportFolder = onImport, onImportScript, onLinkScript, onLinkSegment, onRelink, onRemoveEpisode = async () => undefined, onDismissDurationAlert = async () => undefined, onEdit, embedded = false }: Props): ReactElement => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<ScriptPreviewSegment[]>([])
  const [statusFilter, setStatusFilter] = useState<'all' | 'attention' | 'available'>('all')
  const [episodePendingRemoval, setEpisodePendingRemoval] = useState<DramaDetail['episodes'][number] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const episodes = drama.episodes.filter((episode) => {
    const needsAttention = !isAvailable(episode.status) || hasActiveDurationAlert(episode)
    return statusFilter === 'all' || (statusFilter === 'available' ? !needsAttention : needsAttention)
  })
  const run = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try { await operation() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试。') }
    finally { setBusy(false) }
  }
  const importScript = async (): Promise<void> => {
    const nextPreview = await onImportScript()
    setPreview(nextPreview)
    if (nextPreview.length === 0) setError('没有识别到可预览的分集。若是扫描版 PDF，首版不支持 OCR；请改选可提取文本的 PDF、TXT 或 DOCX。')
  }

  return <section className="asset-page" aria-labelledby={embedded ? undefined : 'assets-title'} aria-label={embedded ? '剧目资产明细' : undefined}>
    {!embedded && <div className="asset-context"><div><div className="meta">剧目资产</div><h2 id="assets-title">{drama.name}</h2><p>{drama.episodeCount} 集 · {drama.tagNames.length > 0 ? drama.tagNames.join(' / ') : '未关联标签'} · {drama.issueCount} 项异常</p></div><button className="btn btn-secondary" type="button" onClick={onEdit}>编辑剧目</button></div>}
    <div className="toolbar"><button className="btn btn-secondary" disabled={busy} type="button" onClick={() => void run(onImport)}>添加视频文件</button><button className="btn btn-secondary" disabled={busy} type="button" onClick={() => void run(onImportFolder)}>导入视频文件夹</button><button className="btn btn-secondary" disabled={busy || drama.episodes.length === 0} type="button" onClick={() => void run(onRelink)}>批量重新定位</button><button className="btn btn-secondary" disabled={busy} type="button" onClick={() => void run(importScript)}>导入剧本</button><span className="spacer" /><select className="select" aria-label="剧集状态筛选" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">全部状态</option><option value="attention">需处理</option><option value="available">可用</option></select></div>
    {error && <div className="state-panel state-panel-error asset-error" role="alert"><strong>剧本或资产操作未完成</strong><p>{error}</p><p className="state-copy">已显示的分集预览会保留；可修正文件后重新导入。</p></div>}
    {message && <div className="state-panel asset-success" role="status">{message}</div>}
    {drama.episodes.length === 0 ? <div className="empty" role="status"><div><strong>还没有剧集</strong><p>添加视频后，系统会按文件名识别集号并只保存原路径引用。</p></div></div> : <div className="table-wrap asset-table-wrap"><table><thead><tr><th>集号</th><th>文件</th><th>时长</th><th>帧率</th><th>剧本</th><th>状态</th><th className="right">操作</th></tr></thead><tbody>{episodes.map((episode) => { const linked = scripts.some((script) => script.episodeId === episode.id); const statusClass = isAvailable(episode.status) ? 'success' : episode.status.includes('missing') || episode.status.includes('unreadable') ? 'danger' : 'warning'; const hasDurationAlert = hasActiveDurationAlert(episode); return <tr key={episode.id}><td className="num">{episode.episodeNo ?? '待填写'}</td><td><div>{episode.sourcePath.split(/[\\/]/).at(-1)}</div><div className="path" title={episode.sourcePath}>{episode.sourcePath}</div></td><td className="num">{episode.durationSeconds === null ? '—' : `${episode.durationSeconds.toFixed(2)} 秒`}</td><td className="num">{episode.fps === null ? '—' : `${episode.fps} FPS`}</td><td>{linked ? '已关联' : '未关联'}</td><td><span className={`badge ${statusClass}`}>{assetStatusLabel(episode.status)}</span>{hasDurationAlert && <span className="badge warning asset-duration-alert">时长异常 · {episode.durationSeconds!.toFixed(2)} 秒</span>}</td><td className="right"><div className="asset-row-actions"><button className="btn" disabled={busy} type="button" onClick={() => statusClass === 'danger' ? void run(onRelink) : void window.desktopApi.openPath(episode.sourcePath)}>{statusClass === 'danger' ? '重新定位' : '查看'}</button>{hasDurationAlert && <button className="btn" aria-label="忽略时长异常提示" disabled={busy} type="button" onClick={() => void run(async () => { await onDismissDurationAlert(episode.id); setMessage(`已忽略第 ${episode.episodeNo ?? '当前'} 集时长异常提示。`) })}>忽略提示</button>}<button className="btn btn-danger" aria-label="删除剧集" title="删除剧集" disabled={busy} type="button" onClick={() => setEpisodePendingRemoval(episode)}><UiIcon name="trash" /></button></div></td></tr> })}</tbody></table></div>}
    {(scripts.length > 0 || preview.length > 0) && <><section className="card script-assets" aria-labelledby="script-assets-title"><div className="section-title"><div><h2 id="script-assets-title">剧本资产</h2><p className="helper">支持 TXT、DOCX 和可提取文本的 PDF；扫描版 PDF 首版不支持 OCR。</p></div></div>{scripts.length > 0 && <ul>{scripts.map((script) => <li key={script.id}><span className="path" title={script.sourcePath}>{script.sourcePath}</span><span>{script.linkStatus}</span></li>)}</ul>}</section><section className="card script-preview" aria-labelledby="script-preview-title"><h2 id="script-preview-title">逐集拆分预览</h2>{preview.map((segment) => <div className="script-preview-row" key={segment.segmentId ?? segment.scriptAssetId ?? `${segment.episodeNo}-${segment.title}`}><div><strong>{segment.episodeNo === null ? '整部剧本（待手工关联）' : `第 ${segment.episodeNo} 集 · ${segment.title}`}</strong><p>{segment.text.slice(0, 180) || '该段没有可显示文本'}</p></div><label>关联视频集<select className="select" aria-label={segment.episodeNo === null ? '关联整部剧本' : `关联剧本第 ${segment.episodeNo} 集`} defaultValue="" onChange={(event) => { const episodeId = event.target.value || null; if (segment.segmentId) void run(() => onLinkSegment(segment.segmentId as string, episodeId)); else if (segment.scriptAssetId) void run(() => onLinkScript(segment.scriptAssetId as string, episodeId)) }}><option value="">暂不关联</option>{drama.episodes.map((episode) => <option key={episode.id} value={episode.id}>第 {episode.episodeNo ?? '待填写'} 集 · {episode.sourcePath.split(/[\\/]/).at(-1)}</option>)}</select></label></div>)}</section></>}
    {episodePendingRemoval && <ModalDialog labelledBy="remove-episode-title" className="confirm-modal" initialFocusSelector="#confirm-remove-episode" onClose={() => setEpisodePendingRemoval(null)}><div className="modal-head"><div><div className="meta">删除剧集引用</div><h2 id="remove-episode-title">确认删除第 {episodePendingRemoval.episodeNo ?? '待填写'} 集？</h2></div></div><p>仅从短剧素材台移除该剧集引用、任务关联和必要本地记录；不会删除或移动原始视频文件。</p><p className="path">{episodePendingRemoval.sourcePath}</p><div className="modal-actions"><button className="btn" disabled={busy} type="button" onClick={() => setEpisodePendingRemoval(null)}>取消</button><button className="btn btn-danger" id="confirm-remove-episode" disabled={busy} type="button" onClick={() => void run(async () => { await onRemoveEpisode(episodePendingRemoval.id); setEpisodePendingRemoval(null); setMessage('剧集引用已移除，原始视频文件未受影响。') })}>确认删除剧集</button></div></ModalDialog>}
  </section>
}

const isAvailable = (status: string): boolean => status === 'ready' || status === 'available'

const hasActiveDurationAlert = (episode: DramaDetail['episodes'][number]): boolean => episode.durationSeconds !== null && episode.durationSeconds > 0 && episode.durationSeconds < 10 && !episode.durationAlertDismissedAt

const assetStatusLabel = (status: string): string => isAvailable(status) ? '可用' : status.includes('missing') ? '缺集' : status.includes('unreadable') ? '文件失联' : status
