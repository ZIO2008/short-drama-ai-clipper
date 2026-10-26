import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement } from 'react'
import type { ClipCandidate, DramaDetail, DramaSummary, EpisodeUpdate, MaterialSummary, MultiEpisodeConfig, MultiEpisodeConfigInput, MultiEpisodePreflight, MultiEpisodeTaskPlan, TagSummary, TaskSummary } from '../../../shared/contracts.js'
import { ModalDialog } from '../components/ModalDialog.js'
import { UiIcon } from '../components/UiIcon.js'
import { DramaWorkspacePage } from './DramaWorkspacePage.js'

type Props = {
  exitRequestId?: number; dramas: DramaSummary[] | null; loading: boolean; error: string | null; onRetry: () => void; onCreate: (name: string) => Promise<DramaSummary | void>; onChooseVideoFiles?: () => Promise<string[]>; onChooseVideoFolder?: () => Promise<string[]>; onImportEpisodePaths?: (dramaId: string, paths: string[]) => Promise<void>; tags: TagSummary[]; tasks?: TaskSummary[]; onRename: (dramaId: string, name: string) => Promise<void>; onLoad?: (dramaId: string) => Promise<DramaDetail>; onDelete: (dramaId: string, deleteTempFiles?: boolean) => Promise<void>; onImport: (dramaId: string) => Promise<void>; onImportFolder?: (dramaId: string) => Promise<void>; onAttachTag: (dramaId: string, tagId: string) => Promise<void>; onUpdateEpisode?: (dramaId: string, episodeId: string, update: EpisodeUpdate) => Promise<DramaDetail>; onRemoveEpisode?: (dramaId: string, episodeId: string) => Promise<DramaDetail>; onImportScript?: (dramaId: string) => Promise<Array<{ segmentId?: string; scriptAssetId?: string; episodeNo: number | null; title: string; text: string }>>; onLinkScript?: (scriptId: string, episodeId: string | null) => Promise<void>; onLinkSegment?: (segmentId: string, episodeId: string | null) => Promise<void>; onRelink?: (dramaId: string) => Promise<void>; onListCandidates?: (dramaId: string) => Promise<ClipCandidate[]>; onConfirmCandidate?: (id: string) => Promise<ClipCandidate>; onExportCandidate?: (id: string, directory: string) => Promise<{ candidate: ClipCandidate; outputPath: string }>; onChooseOutputDirectory?: () => Promise<string | null>; onListMaterials?: (dramaId: string) => Promise<MaterialSummary[]>; onPreflightMultiTask?: (dramaId: string, config: MultiEpisodeConfigInput) => Promise<MultiEpisodePreflight>; onCreateMultiTask?: (dramaId: string, config: MultiEpisodeConfig) => Promise<MultiEpisodeTaskPlan>; onRunTask?: (taskId: string) => Promise<unknown>
}
type Selection = { drama: DramaSummary; detail: DramaDetail; mode: 'workspace' | 'edit'; exitRequestId: number }
type View = 'cards' | 'list'
type Sort = 'recent' | 'name' | 'issues'
const LIBRARY_PAGE_SIZE = 6

export const DramaLibraryPage = ({ exitRequestId = 0, dramas, loading, error, onRetry, onCreate, onChooseVideoFiles = () => window.desktopApi.chooseVideoFiles(), onChooseVideoFolder = () => window.desktopApi.chooseVideoFolder(), onImportEpisodePaths = async (dramaId, paths) => { await window.desktopApi.importEpisodes(dramaId, paths) }, tags, tasks = [], onRename, onLoad = async () => { throw new Error('剧目详情能力未接入') }, onDelete, onImport, onImportFolder = onImport, onAttachTag, onUpdateEpisode = async () => { throw new Error('剧集编辑能力未接入') }, onRemoveEpisode = async () => { throw new Error('剧集移除能力未接入') }, onImportScript = async () => [], onLinkScript = async () => undefined, onLinkSegment = async () => undefined, onRelink = async () => undefined, onListCandidates = async () => [], onConfirmCandidate = async () => { throw new Error('生产能力未接入') }, onExportCandidate = async () => { throw new Error('生产能力未接入') }, onChooseOutputDirectory = async () => null, onListMaterials = async () => [], onPreflightMultiTask = async () => ({ preflightId: '', windows: [] }), onCreateMultiTask = async () => { throw new Error('多集拼接能力未接入') }, onRunTask = async () => undefined }: Props): ReactElement => {
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<Selection | null>(null)
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  const [view, setView] = useState<View>('cards')
  const [page, setPage] = useState(0)
  const [opening, setOpening] = useState<{ dramaId: string; exitRequestId: number } | null>(null)
  const [openingError, setOpeningError] = useState<string | null>(null)
  const activeExitRequestId = useRef(exitRequestId)
  const openingGeneration = useRef(0)
  if (activeExitRequestId.current !== exitRequestId) {
    activeExitRequestId.current = exitRequestId
    openingGeneration.current += 1
  }
  const openingDramaId = opening?.exitRequestId === exitRequestId ? opening.dramaId : null
  useEffect(() => { setSelected(null) }, [exitRequestId])
  const items = dramas ?? []
  const visible = useMemo(() => items.filter((drama) => {
    const needle = query.trim().toLocaleLowerCase('zh-CN')
    return (!needle || drama.name.toLocaleLowerCase('zh-CN').includes(needle) || drama.tagNames.some((tag) => tag.toLocaleLowerCase('zh-CN').includes(needle))) && (!tagFilter || drama.tagNames.includes(tagFilter))
  }).sort((left, right) => sort === 'name' ? left.name.localeCompare(right.name, 'zh-CN') : sort === 'issues' ? right.issueCount - left.issueCount || right.updatedAt.localeCompare(left.updatedAt) : right.updatedAt.localeCompare(left.updatedAt)), [items, query, sort, tagFilter])
  const pageCount = Math.max(1, Math.ceil(visible.length / LIBRARY_PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageItems = visible.slice(currentPage * LIBRARY_PAGE_SIZE, (currentPage + 1) * LIBRARY_PAGE_SIZE)
  const clearFilters = (): void => { setQuery(''); setTagFilter(''); setPage(0) }
  const openDrama = async (drama: DramaSummary, mode: Selection['mode']): Promise<void> => {
    if (openingDramaId) return
    const generation = openingGeneration.current + 1
    openingGeneration.current = generation
    const requestedExitId = exitRequestId
    setOpening({ dramaId: drama.id, exitRequestId: requestedExitId })
    setOpeningError(null)
    try {
      const detail = await onLoad(drama.id)
      if (openingGeneration.current !== generation || activeExitRequestId.current !== requestedExitId) return
      setSelected({ drama, detail, mode, exitRequestId: requestedExitId })
    } catch (cause) {
      if (openingGeneration.current === generation && activeExitRequestId.current === requestedExitId) setOpeningError(cause instanceof Error ? `无法打开剧目：${cause.message}` : '无法打开剧目，请重试。')
    } finally {
      if (openingGeneration.current === generation && activeExitRequestId.current === requestedExitId) setOpening(null)
    }
  }

  if (selected && selected.exitRequestId === exitRequestId) return <DramaWorkspacePage drama={selected.drama} tags={tags} initialMode={selected.mode} initialDetail={selected.detail} onClose={() => setSelected(null)} onRename={(name) => onRename(selected.drama.id, name)} onDelete={(deleteTempFiles) => onDelete(selected.drama.id, deleteTempFiles)} onLoad={() => onLoad(selected.drama.id)} onImport={() => onImport(selected.drama.id)} onImportFolder={() => onImportFolder(selected.drama.id)} onImportScript={() => onImportScript(selected.drama.id)} onLinkScript={onLinkScript} onLinkSegment={onLinkSegment} onRelink={() => onRelink(selected.drama.id)} onAttachTag={(tagId) => onAttachTag(selected.drama.id, tagId)} onUpdateEpisode={(episodeId, update) => onUpdateEpisode(selected.drama.id, episodeId, update)} onRemoveEpisode={(episodeId) => onRemoveEpisode(selected.drama.id, episodeId)} onListCandidates={() => onListCandidates(selected.drama.id)} onConfirmCandidate={onConfirmCandidate} onExportCandidate={onExportCandidate} onChooseOutputDirectory={onChooseOutputDirectory} onListMaterials={() => onListMaterials(selected.drama.id)} onPreflightMultiTask={onPreflightMultiTask} onCreateMultiTask={onCreateMultiTask} onRunTask={onRunTask} />

  return <section className="library-screen" aria-labelledby="library-title" aria-busy={loading || openingDramaId !== null} data-prototype-source="screen-library">
    <div className="screen-head"><div><h1 id="library-title" tabIndex={-1}>剧目库</h1><p>按剧目管理原片、剧本、生产任务和生成成果。</p></div><div className="top-actions"><button className="btn btn-primary" type="button" onClick={() => setCreating(true)}>创建剧目</button></div></div>
    <div className="toolbar library-toolbar"><label className="search-field"><span className="sr-only">搜索剧目</span><input className="input search" aria-label="搜索剧目" placeholder="搜索剧名或标签" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} /></label><label><span className="sr-only">标签筛选</span><select className="select" aria-label="标签筛选" value={tagFilter} onChange={(event) => { setTagFilter(event.target.value); setPage(0) }}><option value="">全部标签</option>{tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}</select></label><label><span className="sr-only">排序</span><select className="select" aria-label="排序" value={sort} onChange={(event) => { setSort(event.target.value as Sort); setPage(0) }}><option value="recent">最近更新</option><option value="name">剧名</option><option value="issues">异常优先</option></select></label><span className="spacer" /><div className="segmented" role="group" aria-label="剧目视图"><button type="button" className={`icon-btn${view === 'cards' ? ' active' : ''}`} aria-label="卡片" title="卡片" aria-pressed={view === 'cards'} onClick={() => { setView('cards'); setPage(0) }}><UiIcon name="grid" /></button><button type="button" className={`icon-btn${view === 'list' ? ' active' : ''}`} aria-label="列表" title="列表" aria-pressed={view === 'list'} onClick={() => { setView('list'); setPage(0) }}><UiIcon name="list" /></button></div></div>
    {openingError && <p className="form-error" role="alert">{openingError}</p>}
    {loading && items.length > 0 && <p className="sr-only" role="status">正在刷新剧目库</p>}
    {loading && items.length === 0 ? <LibrarySkeleton view={view} /> : error ? <div className="state-panel state-panel-error library-state" role="alert"><strong>无法读取剧目库</strong><p>{error}</p><p className="state-copy">请先重试；如果持续失败，请从“设置 / 数据与日志”检查本地数据和备份。</p><button className="btn btn-primary" type="button" onClick={onRetry}>重试读取</button></div> : items.length === 0 ? <div className="empty library-empty" role="status"><div><span className="empty-media" aria-hidden="true">▣</span><strong>还没有剧目</strong><p>先创建一部剧，再导入原片。</p><button className="btn btn-primary" type="button" onClick={() => setCreating(true)}>创建剧目</button></div></div> : visible.length === 0 ? <div className="empty library-empty" role="status"><div><strong>没有匹配的剧目</strong><p>可清除搜索条件，或调整标签筛选后继续查看。</p><button className="btn btn-secondary" type="button" onClick={clearFilters}>清除筛选</button></div></div> : <><div className={view === 'cards' ? 'drama-grid prototype-drama-grid' : 'library-list'}>{pageItems.map((drama) => <DramaCard key={drama.id} drama={drama} task={latestTask(tasks, drama.id)} list={view === 'list'} disabled={openingDramaId !== null} onOpen={() => { void openDrama(drama, 'workspace') }} />)}</div><nav className="library-pagination" aria-label="剧目分页"><span className="meta" role="status" aria-live="polite">第 {currentPage + 1} / {pageCount} 页 · 共 {visible.length} 部剧目</span><div className="library-pagination-actions"><button className="btn btn-secondary" type="button" disabled={currentPage === 0} aria-label="上一页" onClick={() => setPage(currentPage - 1)}>上一页</button><button className="btn btn-secondary" type="button" disabled={currentPage === pageCount - 1} aria-label="下一页" onClick={() => setPage(currentPage + 1)}>下一页</button></div></nav></>}
    {creating && <CreateDramaDialog onCreate={onCreate} onChooseVideoFiles={onChooseVideoFiles} onChooseVideoFolder={onChooseVideoFolder} onImportEpisodePaths={onImportEpisodePaths} onCreated={(drama) => { void openDrama(drama, 'edit') }} onClose={() => setCreating(false)} />}
  </section>
}

const DramaPoster = ({ drama }: { drama: DramaSummary }): ReactElement => {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let disposed = false
    const api = window.desktopApi
    if (!api?.getDramaCover) { setUrl(null); return () => { disposed = true } }
    void api.getDramaCover(drama.id).then((cover) => {
      const nextUrl = cover?.url ?? null
      if (!disposed) setUrl(nextUrl)
    }).catch(() => {
      if (!disposed) setUrl(null)
    })
    return () => { disposed = true }
  }, [drama.id])
  if (url === undefined) return <span className="poster poster-cover-loading" aria-label={`${drama.name}封面读取中`} />
  return url ? <img className="poster drama-cover-image" src={url} alt={`${drama.name}封面`} /> : <span className="poster poster-placeholder"><span className="poster-code">未设置代表画面</span></span>
}

const DramaCard = ({ drama, task, list = false, disabled = false, onOpen }: { drama: DramaSummary; task?: TaskSummary; list?: boolean; disabled?: boolean; onOpen: () => void }): ReactElement => <article className={`drama-card${list ? ' library-list-card' : ''}`}><button className="drama-card-open" type="button" disabled={disabled} onClick={onOpen} aria-label={`打开剧目：${drama.name}`}><DramaPoster drama={drama} /><span className="card-body"><span className="card-title"><strong>{drama.name}</strong><span className={`badge ${drama.issueCount > 0 ? 'warning' : 'success'}`}>{drama.issueCount > 0 ? `${drama.issueCount} 项需处理` : '资产正常'}</span></span><span className="card-meta">{drama.episodeCount} 集 · {drama.tagNames.length > 0 ? drama.tagNames.join(' / ') : '未关联标签'}</span><span className="card-foot"><span className="meta">{formatUpdatedAt(drama.updatedAt)}更新</span><span className={`badge ${task ? taskStatusTone(task.status) : 'neutral'}`}>{task ? `${taskTypeLabel(task.type)} · ${taskStatusLabel(task.status)}` : '暂无生产记录'}</span></span></span></button></article>

const latestTask = (tasks: TaskSummary[], dramaId: string): TaskSummary | undefined => tasks.filter((task) => task.dramaId === dramaId).sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? ''))[0]
const taskStatusLabel = (status: string): string => ({ pending: '待执行', running: '运行中', paused: '已暂停', partial: '部分完成', failed: '失败', completed: '已完成', cancelled: '已取消' })[status] ?? status
const taskStatusTone = (status: string): string => status === 'failed' ? 'danger' : status === 'partial' || status === 'paused' ? 'warning' : status === 'completed' ? 'success' : status === 'running' ? 'info' : 'neutral'
const taskTypeLabel = (type: string): string => ({ multi_episode: '多集拼接', original_clip: '原剧切片' })[type] ?? type

const CreateDramaDialog = ({ onCreate, onChooseVideoFiles, onChooseVideoFolder, onImportEpisodePaths, onCreated, onClose }: { onCreate: (name: string) => Promise<DramaSummary | void>; onChooseVideoFiles: () => Promise<string[]>; onChooseVideoFolder: () => Promise<string[]>; onImportEpisodePaths: (dramaId: string, paths: string[]) => Promise<void>; onCreated: (drama: DramaSummary) => void; onClose: () => void }): ReactElement => {
  const [name, setName] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null); const [selectedPaths, setSelectedPaths] = useState<string[]>([]); const [selectedKind, setSelectedKind] = useState<'files' | 'folder' | null>(null); const [createdDrama, setCreatedDrama] = useState<DramaSummary | null>(null)
  const chooseFiles = async (): Promise<void> => { setError(null); try { const paths = await onChooseVideoFiles(); if (paths.length > 0) { setSelectedPaths(paths); setSelectedKind('files') } } catch (cause) { setError(cause instanceof Error ? cause.message : '无法打开视频文件选择器，请重试。') } }
  const chooseFolder = async (): Promise<void> => { setError(null); try { const paths = await onChooseVideoFolder(); if (paths.length > 0) { setSelectedPaths(paths); setSelectedKind('folder') } } catch (cause) { setError(cause instanceof Error ? cause.message : '无法打开视频文件夹选择器，请重试。') } }
  const finish = (drama?: DramaSummary): void => { onClose(); if (drama) onCreated(drama) }
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => { event.preventDefault(); if (!createdDrama && !name.trim()) { setError('请输入剧名后再保存。'); return } setSaving(true); setError(null); let created = createdDrama; try { if (!created) { const response = await onCreate(name.trim()); if (response) { created = response; setCreatedDrama(response) } } if (created && selectedPaths.length > 0) await onImportEpisodePaths(created.id, selectedPaths); finish(created ?? undefined) } catch (cause) { setError(created ? `剧目已创建，但导入失败：${cause instanceof Error ? cause.message : '请重新选择文件后重试。'}` : cause instanceof Error ? cause.message : '创建失败，请重试。') } finally { setSaving(false) } }
  const closeIfIdle = (): void => { if (!saving) onClose() }
  return <ModalDialog labelledBy="create-drama-title" className="create-drama-modal" initialFocusSelector="#drama-name" onClose={closeIfIdle}><form onSubmit={(event) => void submit(event)}><div className="modal-head"><h2 id="create-drama-title">创建剧目</h2><button className="btn icon-btn" type="button" aria-label="关闭创建剧目" disabled={saving} onClick={closeIfIdle}>×</button></div><div className="modal-body"><div className="field"><label htmlFor="drama-name">剧名</label><input autoFocus className="input" id="drama-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} placeholder="例如：破茧之后" disabled={Boolean(createdDrama)} aria-describedby={error ? 'create-drama-error' : undefined} /></div><div className="field"><label>导入剧集</label><div className="empty create-drama-import-note"><div><strong>{selectedPaths.length > 0 ? selectedKind === 'folder' ? '已选择 1 个视频文件夹，将扫描其中的视频' : `已选择 ${selectedPaths.length} 个视频文件` : '尚未导入剧集'}</strong><p>可多选视频文件，或选择一个文件夹让系统扫描其中的视频；系统只保存原路径引用，不复制原片。</p><div className="toolbar"><button className="btn btn-secondary" type="button" disabled={saving} onClick={() => void chooseFiles()}>选择视频文件</button><button className="btn btn-secondary" type="button" disabled={saving} onClick={() => void chooseFolder()}>选择视频文件夹</button></div></div></div></div><div className="ai-banner"><span className="ai-mark">规则</span><p>系统会自动识别集号并自然排序；重复集号会阻止创建生产任务，缺集允许保留。</p></div>{error && <p className="form-error" id="create-drama-error" role="alert">{error}</p>}</div><div className="modal-foot"><button className="btn btn-secondary" disabled={saving} type="button" onClick={closeIfIdle}>取消</button><button className="btn btn-primary" disabled={saving} type="submit">{saving ? '保存中…' : createdDrama ? '重试导入' : '保存并整理资产'}</button></div></form></ModalDialog>
}

const LibrarySkeleton = ({ view }: { view: View }): ReactElement => <div className={view === 'cards' ? 'drama-grid prototype-drama-grid' : 'table-wrap'} role="status" aria-label="正在读取剧目库">{view === 'cards' ? [0, 1, 2].map((item) => <div className="drama-card skeleton-card" key={item}><div className="poster poster-placeholder" /><div className="card-body"><div className="skeleton-line skeleton-title" /><div className="skeleton-line" /></div></div>) : <div className="list-skeleton"><div className="skeleton-line skeleton-title" /><div className="skeleton-line" /><div className="skeleton-line" /></div>}</div>

const formatUpdatedAt = (value: string): string => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date) }
