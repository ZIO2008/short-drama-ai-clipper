import { useState, type FormEvent, type ReactElement } from 'react'
import type { TagSummary } from '../../../shared/contracts.js'
import { ModalDialog } from '../components/ModalDialog.js'

type Props = { tags: TagSummary[]; onCreate: (name: string) => Promise<void>; onRename: (id: string, name: string) => Promise<void>; onDelete: (tag: TagSummary) => Promise<void> }
type EditState = { mode: 'create' } | { mode: 'rename'; tag: TagSummary } | null

export const TagManagementPage = ({ tags, onCreate, onRename, onDelete }: Props): ReactElement => {
  const [editing, setEditing] = useState<EditState>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const openCreate = (): void => { setName(''); setError(null); setEditing({ mode: 'create' }) }
  const openRename = (tag: TagSummary): void => { setName(tag.name); setError(null); setEditing({ mode: 'rename', tag }) }
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    if (!editing || !name.trim()) { setError('请输入标签名称。'); return }
    setBusy(true); setError(null)
    try {
      if (editing.mode === 'create') await onCreate(name.trim())
      else await onRename(editing.tag.id, name.trim())
      setEditing(null)
    } catch { setError(editing.mode === 'create' ? '标签创建失败，请检查是否重名。' : '标签重命名失败，请检查是否重名。') }
    finally { setBusy(false) }
  }
  const remove = async (tag: TagSummary): Promise<void> => {
    if (!window.confirm(`将从 ${tag.usageCount} 部剧移除“${tag.name}”，剧目不会删除。`)) return
    setBusy(true); setError(null)
    try { await onDelete(tag) }
    catch { setError('标签删除失败，请重试。') }
    finally { setBusy(false) }
  }

  return <section aria-labelledby="tags-title"><div className="screen-head"><div><h1 id="tags-title">标签管理</h1><p>标签可跨剧目复用，删除标签不会删除剧目。</p></div><button className="btn btn-primary" type="button" onClick={openCreate}>创建标签</button></div>{error && <div className="state-panel state-panel-error tag-error" role="alert"><p>{error}</p></div>}<div className="table-wrap tag-table"><table><thead><tr><th>标签名称</th><th>使用剧目</th><th>最近更新</th><th className="right">操作</th></tr></thead><tbody>{tags.map((tag) => <tr key={tag.id}><td><strong>{tag.name}</strong></td><td className="num">{tag.usageCount} 部</td><td className="num">—</td><td className="right"><button className="btn" disabled={busy} type="button" onClick={() => openRename(tag)}>重命名</button><button className="btn btn-danger" disabled={busy} type="button" onClick={() => void remove(tag)}>删除</button></td></tr>)}</tbody></table>{tags.length === 0 && <div className="empty tag-empty" role="status"><div><strong>还没有标签</strong><p>创建后可在多个剧目中复用。</p></div></div>}</div>{editing && <ModalDialog labelledBy="tag-dialog-title" className="tag-modal" initialFocusSelector="#tag-name" onClose={() => setEditing(null)}><form onSubmit={(event) => void submit(event)}><div className="modal-head"><h2 id="tag-dialog-title">{editing.mode === 'create' ? '创建标签' : '重命名标签'}</h2><button className="btn icon-btn" type="button" aria-label="关闭标签编辑" onClick={() => setEditing(null)}>关闭</button></div><div className="modal-body"><label className="field" htmlFor="tag-name">标签名称<input id="tag-name" className="input" value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" /></label>{error && <p className="form-error" role="alert">{error}</p>}</div><div className="modal-foot"><button className="btn" type="button" onClick={() => setEditing(null)}>取消</button><button className="btn btn-primary" disabled={busy} type="submit">{busy ? '保存中…' : '保存标签'}</button></div></form></ModalDialog>}</section>
}
