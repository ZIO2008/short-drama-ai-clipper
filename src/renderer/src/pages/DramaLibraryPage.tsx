import { useState, type FormEvent, type ReactElement } from 'react'
import type { DramaDetail, DramaSummary, EpisodeUpdate, TagSummary } from '../../../shared/contracts.js'
import { DramaEditorPage } from './DramaEditorPage.js'

type DramaLibraryPageProps = {
  dramas: DramaSummary[] | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onCreate: (name: string) => Promise<void>
  tags: TagSummary[]
  onRename: (dramaId: string, name: string) => Promise<void>
  onLoad?: (dramaId: string) => Promise<DramaDetail>
  onDelete: (dramaId: string, deleteTempFiles?: boolean) => Promise<void>
  onImport: (dramaId: string) => Promise<void>
  onAttachTag: (dramaId: string, tagId: string) => Promise<void>
  onUpdateEpisode?: (dramaId: string, episodeId: string, update: EpisodeUpdate) => Promise<DramaDetail>
  onRemoveEpisode?: (dramaId: string, episodeId: string) => Promise<DramaDetail>
  onImportScript?: (dramaId: string) => Promise<Array<{ segmentId?: string; episodeNo: number; title: string; text: string }>>
  onLinkSegment?: (segmentId: string, episodeId: string | null) => Promise<void>
  onRelink?: (dramaId: string) => Promise<void>
}

export const DramaLibraryPage = ({ dramas, loading, error, onRetry, onCreate, tags, onRename, onLoad = async () => { throw new Error('Not available') }, onDelete, onImport, onAttachTag, onUpdateEpisode = async () => { throw new Error('Not available') }, onRemoveEpisode = async () => { throw new Error('Not available') }, onImportScript = async () => [], onLinkSegment = async () => undefined, onRelink = async () => undefined }: DramaLibraryPageProps): ReactElement => {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DramaSummary | null>(null)
  const [tagFilter, setTagFilter] = useState('')
  const [sort, setSort] = useState<'recent' | 'name'>('recent')
  const visible = [...(dramas ?? [])].filter((drama) => !tagFilter || drama.tagNames.includes(tagFilter)).sort((left, right) => sort === 'name' ? left.name.localeCompare(right.name) : right.updatedAt.localeCompare(left.updatedAt))
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!name.trim()) { setFormError('请输入剧名'); return }
    setSaving(true); setFormError(null)
    try { await onCreate(name); setName('') } catch (cause) { setFormError(cause instanceof Error ? cause.message : '创建失败') } finally { setSaving(false) }
  }
  if (loading) return <div className="state-panel" role="status">正在读取剧目库…</div>
  if (error) return <div className="state-panel state-panel-error" role="alert"><p>{error}</p><button className="btn btn-primary" type="button" onClick={onRetry}>重试</button></div>
  return (
    <section aria-labelledby="library-title">
      <div className="screen-head"><div><h1 id="library-title" tabIndex={-1}>剧目库</h1><p>管理剧目、原片资产和生产任务。</p></div></div>
      <form className="panel" onSubmit={submit} aria-label="创建剧目">
        <label htmlFor="drama-name">新剧名</label>
        <div className="inline-form"><input id="drama-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} placeholder="输入剧名" /><button className="btn btn-primary" disabled={saving} type="submit">{saving ? '保存中…' : '创建剧目'}</button></div>
        {formError && <p className="form-error" role="alert">{formError}</p>}
      </form>
      <div className="toolbar"><label>标签筛选<select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}><option value="">全部</option>{tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}</select></label><label>排序<select value={sort} onChange={(event) => setSort(event.target.value as 'recent' | 'name')}><option value="recent">最近更新</option><option value="name">剧名</option></select></label></div>
      {(dramas ?? []).length === 0 ? <div className="empty" role="status"><strong>还没有剧目</strong><p>先创建一部剧，再导入原片。</p></div> : visible.length === 0 ? <div className="empty" role="status"><strong>没有匹配剧目</strong><p>清除标签筛选后查看全部剧目。</p></div> : <div className="drama-grid">{visible.map((drama) => <article className="panel" key={drama.id}><h2>{drama.name}</h2><p>{drama.episodeCount} 集 · {drama.issueCount} 个资产问题</p>{drama.tagNames.length > 0 && <p>{drama.tagNames.join('、')}</p>}<button className="btn" type="button" onClick={() => setSelected(drama)}>编辑与导入</button></article>)}</div>}
      {selected && <DramaEditorPage drama={selected} tags={tags} onClose={() => setSelected(null)} onLoad={() => onLoad(selected.id)} onRename={async (value) => { await onRename(selected.id, value); setSelected(null) }} onImport={() => onImport(selected.id)} onImportScript={() => onImportScript(selected.id)} onLinkSegment={onLinkSegment} onRelink={() => onRelink(selected.id)} onAttachTag={(tagId) => onAttachTag(selected.id, tagId)} onUpdateEpisode={(episodeId, update) => onUpdateEpisode(selected.id, episodeId, update)} onRemoveEpisode={(episodeId) => onRemoveEpisode(selected.id, episodeId)} onDelete={async (deleteTempFiles) => { await onDelete(selected.id, deleteTempFiles); setSelected(null) }} />}
    </section>
  )
}
