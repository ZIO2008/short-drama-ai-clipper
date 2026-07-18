import { useState, type FormEvent, type ReactElement } from 'react'
import type { TagSummary } from '../../../shared/contracts.js'

type Props = { tags: TagSummary[]; onCreate: (name: string) => Promise<void>; onRename: (id: string, name: string) => Promise<void>; onDelete: (tag: TagSummary) => Promise<void> }

export const TagManagementPage = ({ tags, onCreate, onRename, onDelete }: Props): ReactElement => {
  const [name, setName] = useState(''); const [error, setError] = useState<string | null>(null)
  const submit = async (event: FormEvent): Promise<void> => { event.preventDefault(); if (!name.trim()) return; try { await onCreate(name); setName(''); setError(null) } catch { setError('标签创建失败，请检查是否重名。') } }
  return <section aria-labelledby="tags-title"><div className="screen-head"><div><h1 id="tags-title">标签管理</h1><p>标签可跨剧目复用，删除标签不会删除剧目。</p></div></div><form className="panel inline-form" onSubmit={submit}><label htmlFor="tag-name">新标签</label><input id="tag-name" value={name} onChange={(event) => setName(event.target.value)} /><button className="btn btn-primary" type="submit">创建标签</button></form>{error && <p role="alert">{error}</p>}<div className="panel"><table><thead><tr><th>标签</th><th>使用剧目</th><th>操作</th></tr></thead><tbody>{tags.map((tag) => <tr key={tag.id}><td>{tag.name}</td><td>{tag.usageCount}</td><td><button className="btn" type="button" onClick={() => { const next = window.prompt('新标签名', tag.name); if (next) void onRename(tag.id, next).catch(() => setError('标签重命名失败')) }}>重命名</button><button className="btn" type="button" onClick={() => { if (window.confirm(`将从 ${tag.usageCount} 部剧移除“${tag.name}”，剧目不会删除。`)) void onDelete(tag).catch(() => setError('标签删除失败')) }}>删除</button></td></tr>)}</tbody></table>{tags.length === 0 && <div className="empty">还没有标签</div>}</div></section>
}
