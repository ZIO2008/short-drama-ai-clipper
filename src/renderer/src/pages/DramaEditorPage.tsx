import { useEffect, useState, type ReactElement } from 'react'
import type { DramaCover, DramaDetail, DramaSummary, EpisodeUpdate, TagSummary } from '../../../shared/contracts.js'

export type ScriptPreviewSegment = { segmentId?: string; scriptAssetId?: string; episodeNo: number | null; title: string; text: string }

type Props = {
  drama: DramaSummary
  tags: TagSummary[]
  onClose: () => void
  onLoad: () => Promise<DramaDetail>
  onRename: (name: string) => Promise<void>
  onImport: () => Promise<void>
  onImportFolder?: () => Promise<void>
  onAttachTag: (tagId: string) => Promise<void>
  onUpdateEpisode: (episodeId: string, update: EpisodeUpdate) => Promise<DramaDetail>
  onRemoveEpisode: (episodeId: string) => Promise<DramaDetail>
  onDelete: (deleteTempFiles: boolean) => Promise<void>
  onImportScript: () => Promise<ScriptPreviewSegment[]>
  onLinkScript: (scriptId: string, episodeId: string | null) => Promise<void>
  onLinkSegment: (segmentId: string, episodeId: string | null) => Promise<void>
  onRelink: () => Promise<void>
}

export const DramaEditorPage = (props: Props): ReactElement => {
  const [name, setName] = useState(props.drama.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cover, setCover] = useState<DramaCover | null>(null)
  const [coverLoading, setCoverLoading] = useState(true)

  const refreshCover = async (): Promise<void> => {
    setCoverLoading(true)
    try { setCover(await window.desktopApi.getDramaCover(props.drama.id)) }
    catch { setCover(null) }
    finally { setCoverLoading(false) }
  }
  useEffect(() => { void refreshCover() }, [props.drama.id])

  const run = async (operation: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try { await operation() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败，请重试。') }
    finally { setBusy(false) }
  }

  return <div className="drama-editor drama-editor-compact">
    <div className="modal-head"><h2 id="drama-dialog-title">编辑剧目</h2><button className="btn icon-btn" disabled={busy} type="button" aria-label="关闭编辑剧目" onClick={props.onClose}>×</button></div>
    <div className="modal-body">
      <label className="field" htmlFor="edit-drama-name">剧名<input className="input" id="edit-drama-name" value={name} onChange={(event) => setName(event.target.value)} /></label>
      <div className="field drama-cover-field"><span>剧目封面</span><div className="drama-cover-editor"><div className="drama-cover-preview">{cover ? <img src={cover.url} alt={`${props.drama.name}封面`} /> : <span>{coverLoading ? '正在生成代表画面…' : '未设置代表画面'}</span>}</div><div><strong>{cover?.sourceKind === 'uploaded' ? '已上传封面' : cover?.sourceKind === 'auto_frame' ? '自动截取代表画面' : '未设置代表画面'}</strong><p>上传图片会复制到应用缓存，不会改动原图；未上传时将从第一条可用视频截取非开头画面。</p><div className="toolbar"><button className="btn btn-secondary" disabled={busy} type="button" onClick={() => void run(async () => { const path = await window.desktopApi.chooseDramaCoverImage(); if (!path) return; setCover(await window.desktopApi.uploadDramaCover(props.drama.id, path)) })}>{cover?.sourceKind === 'uploaded' ? '替换封面' : '上传封面'}</button>{cover?.sourceKind === 'uploaded' && <button className="btn" disabled={busy} type="button" onClick={() => void run(async () => { setCover(await window.desktopApi.removeDramaCover(props.drama.id)) })}>移除上传封面</button>}</div></div></div></div>
      <div className="field editor-compact-import"><span>导入剧集</span><div className="empty"><div><strong>{props.drama.episodeCount > 0 ? `已关联 ${props.drama.episodeCount} 个视频文件` : '尚未导入剧集'}</strong><p>可多选视频文件，或选择一个文件夹让系统扫描其中的视频；系统只保存原路径引用，不复制原片。</p><div className="toolbar"><button className="btn btn-secondary" disabled={busy} type="button" onClick={() => void run(props.onImport)}>选择视频文件</button><button className="btn btn-secondary" disabled={busy} type="button" onClick={() => void run(props.onImportFolder ?? props.onImport)}>选择视频文件夹</button></div></div></div></div>
      <div className="ai-banner editor-compact-rule"><span className="ai-mark">规则</span><p>自动识别集号并自然排序；重复集号会阻止创建生产任务，缺集允许保留。</p></div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
    <div className="modal-foot"><button className="btn btn-secondary" disabled={busy} type="button" onClick={props.onClose}>取消</button><button className="btn btn-primary" disabled={busy || !name.trim()} type="button" onClick={() => void run(async () => { await props.onRename(name.trim()); props.onClose() })}>{busy ? '保存中…' : '保存并整理资产'}</button></div>
  </div>
}
