import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { AssetHealth, ClipCandidate, ClipExportBatch, DramaDetail, DramaSummary, EpisodeUpdate, MaterialSummary, MultiEpisodeConfig, MultiEpisodeConfigInput, MultiEpisodePreflight, MultiEpisodeTaskPlan, ScriptAssetSummary, TagSummary } from '../../../shared/contracts.js'
import { DramaAssetsPage } from './DramaAssetsPage.js'
import { DramaEditorPage, type ScriptPreviewSegment } from './DramaEditorPage.js'
import { MultiEpisodeWorkspacePage } from './MultiEpisodeWorkspacePage.js'
import { StaticPrototypeSurface, type StaticPrototypeScreen } from './StaticPrototypeSurface.js'
import { bindOriginalClipWorkspaceRuntime, refreshOriginalClipWorkspace, selectOriginalClipWorkspaceCandidate } from './OriginalClipWorkspaceRuntimeBridge.js'
import { bindOriginalClipPoolReportRuntime } from './OriginalClipPoolReportRuntimeBridge.js'
import { bindSubtitleImport } from './SubtitleImportBridge.js'
import { bindSubtitleAssetRuntime } from './SubtitleAssetRuntimeBridge.js'
import { bindSubtitleRecognitionSettings } from './SubtitleRecognitionSettingsBridge.js'
import { bindSubtitleOcrRegionCalibration } from './SubtitleOcrRegionCalibrationBridge.js'
import { bindSubtitleStaticDetailReadOnly } from './SubtitleStaticDetailReadOnlyBridge.js'
import { bindSubtitleStaticDetailPreview } from './SubtitleStaticDetailPreviewBridge.js'
import { ProductionPage } from './ProductionPage.js'
import { AiRemixWorkspacePage } from './AiRemixWorkspacePage.js'
import { AiReviewTimelinePage } from './AiReviewTimelinePage.js'
import { ModalDialog } from '../components/ModalDialog.js'

type Props = {
  drama: DramaSummary; tags: TagSummary[]; initialMode?: 'workspace' | 'edit'; initialDetail?: DramaDetail; onClose: () => void; onLoad: () => Promise<DramaDetail>
  onRename: (name: string) => Promise<void>; onDelete: (deleteTempFiles: boolean) => Promise<void>; onImport: () => Promise<void>; onImportFolder?: () => Promise<void>; onImportScript: () => Promise<ScriptPreviewSegment[]>; onLinkScript: (id: string, episodeId: string | null) => Promise<void>; onLinkSegment: (id: string, episodeId: string | null) => Promise<void>; onRelink: () => Promise<void>; onAttachTag: (id: string) => Promise<void>; onUpdateEpisode: (id: string, update: EpisodeUpdate) => Promise<DramaDetail>; onRemoveEpisode: (id: string) => Promise<DramaDetail>; onDismissDurationAlert?: (id: string) => Promise<DramaDetail>
  onListCandidates: () => Promise<ClipCandidate[]>; onConfirmCandidate: (id: string) => Promise<ClipCandidate>; onExportCandidate: (id: string, directory: string) => Promise<{ candidate: ClipCandidate; outputPath: string }>; onChooseOutputDirectory: () => Promise<string | null>; onListMaterials: () => Promise<MaterialSummary[]>; onPreflightMultiTask: (dramaId: string, config: MultiEpisodeConfigInput) => Promise<MultiEpisodePreflight>; onCreateMultiTask: (dramaId: string, config: MultiEpisodeConfig) => Promise<MultiEpisodeTaskPlan>; onRunTask: (taskId: string) => Promise<unknown>
}
type Tab = 'assets' | 'production' | 'subtitles' | 'results'

export const DramaWorkspacePage = (props: Props): ReactElement => {
  const [detail, setDetail] = useState<DramaDetail | null>(props.initialDetail ?? null)
  const [scripts, setScripts] = useState<ScriptAssetSummary[]>([])
  const [materials, setMaterials] = useState<MaterialSummary[]>([])
  const [health, setHealth] = useState<AssetHealth | null>(null)
  const [tab, setTab] = useState<Tab>('assets')
  const [workspace, setWorkspace] = useState<'production' | 'clip' | 'clipPool' | 'clipReport' | 'stitch' | 'remix' | 'review'>('production')
  const [clipSelection, setClipSelection] = useState<{ dataKey: string; candidate: ClipCandidate } | null>(null)
  const [reviewDraftId, setReviewDraftId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(props.initialMode === 'edit')
  const [error, setError] = useState<string | null>(null)
  const [clipSurfaceDocument, setClipSurfaceDocument] = useState<{ dataKey: string; document: Document } | null>(null)
  const [pendingClipCandidate, setPendingClipCandidate] = useState<{ dataKey: string; candidate: ClipCandidate } | null>(null)
  const staticSurfaceDataKey = detail?.episodes.map((episode) => [episode.id, episode.status, episode.sourcePath, episode.durationSeconds].join(':')).join('|') ?? ''

  const activateStaticScreen = (screen: StaticPrototypeScreen): void => {
    if (screen === 'subtitles') { setTab('subtitles'); setWorkspace('production'); return }
    setTab('production')
    setWorkspace(screen === 'clip' ? 'clip' : screen === 'clip-pool' ? 'clipPool' : 'clipReport')
  }
  const requestStaticScreen = (screen: StaticPrototypeScreen): void => {
    // Static surfaces are mounted one at a time.  A document from the preceding
    // clip iframe must never receive events intended for the next iframe.
    setClipSurfaceDocument(null)
    activateStaticScreen(screen)
  }
  const openCandidateInClipWorkspace = (candidate: ClipCandidate): void => {
    const selection = { dataKey: staticSurfaceDataKey, candidate }
    setClipSelection(selection)
    setPendingClipCandidate(selection)
    requestStaticScreen('clip')
  }
  useEffect(() => {
    if (!pendingClipCandidate || pendingClipCandidate.dataKey !== staticSurfaceDataKey || !clipSurfaceDocument || clipSurfaceDocument.dataKey !== staticSurfaceDataKey) return
    selectOriginalClipWorkspaceCandidate(clipSurfaceDocument.document, pendingClipCandidate.candidate)
    setPendingClipCandidate(null)
  }, [clipSurfaceDocument, pendingClipCandidate, staticSurfaceDataKey])
  useEffect(() => {
    if (tab !== 'production' || workspace !== 'clip' || !clipSurfaceDocument || clipSurfaceDocument.dataKey !== staticSurfaceDataKey) return
    refreshOriginalClipWorkspace(clipSurfaceDocument.document)
  }, [clipSurfaceDocument, staticSurfaceDataKey, tab, workspace])
  useEffect(() => {
    if (tab === 'production' && workspace === 'clip') return
    setClipSurfaceDocument(null)
  }, [tab, workspace])

  const reload = async (): Promise<void> => {
    try {
      setError(null)
      const loadedHealth = window.desktopApi?.inspectAssetHealth ? await window.desktopApi.inspectAssetHealth(props.drama.id) : null
      const loadedDetail = await props.onLoad()
      setDetail(loadedDetail)
      setHealth(loadedHealth)
      if (window.desktopApi) {
        const [loadedScripts, loadedMaterials] = await Promise.all([window.desktopApi.listScripts(props.drama.id), props.onListMaterials()])
        setScripts(loadedScripts)
        setMaterials(loadedMaterials)
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '剧目工作区读取失败。') }
  }
  useEffect(() => { void reload() }, [])
  useEffect(() => {
    const dramaName = detail?.name ?? props.drama.name
    const context = tab === 'assets'
      ? `${dramaName} / 剧目资产`
      : tab === 'subtitles'
        ? `${dramaName} / 字幕资产`
      : tab === 'results'
        ? `${dramaName} / 成果库`
        : workspace === 'clip'
          ? `${dramaName} / 原剧切片工作区`
          : workspace === 'clipPool'
            ? `${dramaName} / 原剧切片全部候选`
            : workspace === 'clipReport'
              ? `${dramaName} / 原剧切片完成报告`
          : workspace === 'stitch'
            ? `${dramaName} / 多集拼接工作区`
            : workspace === 'remix'
              ? `${dramaName} / AI 爆点前置二创`
              : workspace === 'review'
                ? `${dramaName} / P1 审核时间线`
                : `${dramaName} / 素材生产`
    window.dispatchEvent(new CustomEvent<string>('shortdrama:topbar-context', { detail: context }))
    return () => { window.dispatchEvent(new CustomEvent<string | null>('shortdrama:topbar-context', { detail: null })) }
  }, [detail?.name, props.drama.name, tab, workspace])

  if (error) return <section className="state-panel state-panel-error" aria-labelledby="drama-workspace-error-title" role="alert"><h1 id="drama-workspace-error-title">剧目工作区读取失败</h1><p>{error}</p><div className="toolbar"><button className="btn btn-primary" type="button" onClick={() => void reload()}>重试读取</button><button className="btn" type="button" onClick={props.onClose}>返回剧目库</button></div></section>
  if (!detail) return <section className="state-panel" aria-labelledby="drama-workspace-loading-title" role="status"><h1 id="drama-workspace-loading-title">正在读取剧目工作区</h1><div className="skeleton-line skeleton-title" /><p>剧目资产加载完成后即可操作。</p></section>

  const importScript = async (): Promise<ScriptPreviewSegment[]> => { const preview = await props.onImportScript(); await reload(); return preview }
  const availableEpisodes = detail.episodes.filter((episode) => episode.status === 'ready' || episode.status === 'available').length
  const missingEpisodes = health?.missingEpisodeNumbers.length ?? 0
  const disconnectedEpisodes = (health?.missing.length ?? 0) + (health?.unreadable.length ?? 0)
  const linkedScripts = scripts.filter((script) => script.episodeId !== null).length
  const body = tab === 'assets'
    ? <DramaAssetsPage embedded drama={detail} scripts={scripts} onImport={async () => { await props.onImport(); await reload() }} onImportFolder={async () => { await (props.onImportFolder ?? props.onImport)(); await reload() }} onImportScript={importScript} onLinkScript={async (scriptId, episodeId) => { await props.onLinkScript(scriptId, episodeId); await reload() }} onLinkSegment={async (segmentId, episodeId) => { await props.onLinkSegment(segmentId, episodeId); await reload() }} onRelink={async () => { await props.onRelink(); await reload() }} onRemoveEpisode={async (episodeId) => { await props.onRemoveEpisode(episodeId); await reload() }} onDismissDurationAlert={async (episodeId) => { await (props.onDismissDurationAlert ?? ((id) => window.desktopApi.dismissEpisodeDurationAlert(props.drama.id, id)))(episodeId); await reload() }} onEdit={() => setEditorOpen(true)} />
    : tab === 'subtitles'
      ? null
    : tab === 'production' && workspace === 'production'
      ? <ProductionPage embedded episodeCount={detail.episodes.length} readyEpisodeCount={availableEpisodes} onOriginalClip={() => requestStaticScreen('clip')} onMultiEpisode={() => setWorkspace('stitch')} onAiRemix={() => setWorkspace('remix')} />
    : tab === 'production' && workspace === 'clip'
        ? null
      : tab === 'production' && workspace === 'clipPool'
          ? null
        : tab === 'production' && workspace === 'clipReport'
            ? null
        : tab === 'production' && workspace === 'remix'
          ? <AiRemixWorkspacePage drama={detail} onBack={() => setWorkspace('production')} onOpenReview={(draftId) => { setReviewDraftId(draftId); setWorkspace('review') }} />
          : tab === 'production' && workspace === 'review' && reviewDraftId
            ? <AiReviewTimelinePage draftId={reviewDraftId} onBack={() => { setReviewDraftId(null); setWorkspace('remix') }} />
            : <MultiEpisodeWorkspacePage drama={detail} onBack={() => setWorkspace('production')} onPreflight={props.onPreflightMultiTask} onCreateTask={props.onCreateMultiTask} onRunTask={props.onRunTask} onChooseOutputDirectory={props.onChooseOutputDirectory} onOpenResults={async () => { await reload(); setTab('results'); setWorkspace('production') }} onOpenTaskCenter={() => { window.location.hash = '/tasks' }} />

  const activeStaticScreen: StaticPrototypeScreen | null = tab === 'subtitles'
    ? 'subtitles'
    : tab === 'production' && workspace === 'clip'
      ? 'clip'
      : tab === 'production' && workspace === 'clipPool'
        ? 'clip-pool'
        : tab === 'production' && workspace === 'clipReport'
          ? 'clip-report'
          : null
  const staticSurfaces = activeStaticScreen === null ? null : <div key={`static-surfaces:${activeStaticScreen}:${staticSurfaceDataKey}`} className="static-prototype-stage active">
    <div className={`static-prototype-slot${activeStaticScreen === 'subtitles' ? ' active' : ''}`} aria-hidden={activeStaticScreen !== 'subtitles'} inert={activeStaticScreen !== 'subtitles'}>{activeStaticScreen === 'subtitles' && <StaticPrototypeSurface screen="subtitles" onBack={props.onClose} onNavigate={(target) => {
      if (target === 'assets') { setTab('assets'); setWorkspace('production'); return }
      if (target === 'production') { setTab('production'); setWorkspace('production'); return }
      if (target === 'results') { setTab('results'); setWorkspace('production') }
    }} onReady={(document) => {
      bindSubtitleImport({ document, dramaId: props.drama.id })
      bindSubtitleAssetRuntime({ document, dramaId: props.drama.id, episodes: detail.episodes, detailActionsEnabled: false, staticDetailActionsEnabled: true })
      bindSubtitleRecognitionSettings({ document, dramaId: props.drama.id })
      bindSubtitleOcrRegionCalibration({ document, dramaId: props.drama.id, episodes: detail.episodes })
      bindSubtitleStaticDetailReadOnly({ document, dramaId: props.drama.id, episodes: detail.episodes })
      bindSubtitleStaticDetailPreview({ document, episodes: detail.episodes })
    }} />}</div>
    <div className={`static-prototype-slot${activeStaticScreen === 'clip' ? ' active' : ''}`} aria-hidden={activeStaticScreen !== 'clip'} inert={activeStaticScreen !== 'clip'}>{activeStaticScreen === 'clip' && <StaticPrototypeSurface screen="clip" onBack={() => setWorkspace('production')} onReady={(document) => { setClipSurfaceDocument({ dataKey: staticSurfaceDataKey, document }); bindOriginalClipWorkspaceRuntime({ document, dramaId: props.drama.id, episodes: detail.episodes, initialCandidate: clipSelection?.dataKey === staticSurfaceDataKey ? clipSelection.candidate : null, onRecoveryNavigate: (target) => { setTab(target); setWorkspace('production') } }) }} onNavigate={(target) => {
      if (target === 'clip-pool' || target === 'pool') { requestStaticScreen('clip-pool'); return }
      if (target === 'clip-report') { requestStaticScreen('clip-report'); return }
      if (target === 'production') setWorkspace('production')
    }} />}</div>
    <div className={`static-prototype-slot${activeStaticScreen === 'clip-pool' ? ' active' : ''}`} aria-hidden={activeStaticScreen !== 'clip-pool'} inert={activeStaticScreen !== 'clip-pool'}>{activeStaticScreen === 'clip-pool' && <StaticPrototypeSurface screen="clip-pool" onBack={() => requestStaticScreen('clip')} onReady={(document) => bindOriginalClipPoolReportRuntime({ document, dramaId: props.drama.id, episodes: detail.episodes, onOpenCandidate: openCandidateInClipWorkspace })} onNavigate={(target) => {
      if (target === 'clip') { requestStaticScreen('clip'); return }
      if (target === 'production') { setWorkspace('production'); return }
      if (target === 'clip-report') requestStaticScreen('clip-report')
    }} />}</div>
    <div className={`static-prototype-slot${activeStaticScreen === 'clip-report' ? ' active' : ''}`} aria-hidden={activeStaticScreen !== 'clip-report'} inert={activeStaticScreen !== 'clip-report'}>{activeStaticScreen === 'clip-report' && <StaticPrototypeSurface screen="clip-report" onBack={() => setWorkspace('production')} onReady={(document) => bindOriginalClipPoolReportRuntime({ document, dramaId: props.drama.id, episodes: detail.episodes, onOpenCandidate: openCandidateInClipWorkspace })} onOpenResults={() => { setTab('results'); setWorkspace('production') }} onNavigate={(target) => {
      if (target === 'clip') { requestStaticScreen('clip'); return }
      if (target === 'clip-pool') { requestStaticScreen('clip-pool'); return }
      if (target === 'assets') { setTab('assets'); setWorkspace('production'); return }
      if (target === 'production') setWorkspace('production')
    }} />}</div>
  </div>
  const withStaticSurfaces = (page: ReactElement | null): ReactElement => staticSurfaces === null ? <>{page}</> : <>{staticSurfaces}</>

  // The prototype treats production workspaces as full screens, not nested tab content.
  if (tab === 'production' && workspace !== 'production') return withStaticSurfaces(activeStaticScreen ? null : body)

  if (tab === 'assets') return withStaticSurfaces(<section className="drama-module-screen" aria-labelledby="assets-page-title"><div className="screen-head"><div><div className="meta">剧目资产</div><h1 id="assets-page-title">{detail.name}</h1><p>{detail.episodeCount} 集 · {detail.tagNames.length > 0 ? detail.tagNames.join(' / ') : '未关联标签'} · 本地路径引用</p></div><div className="top-actions"><button className="btn" type="button" onClick={props.onClose}>返回剧目库</button><button className="btn btn-secondary" type="button" onClick={() => setEditorOpen(true)}>编辑剧目</button></div></div><WorkspaceTabs tab={tab} onChange={(item) => { if (item === 'subtitles') { requestStaticScreen('subtitles'); return }; setTab(item); if (item === 'production') setWorkspace('production') }} /><div className="health-strip" aria-label="剧目资产健康概览"><div className="health-item"><div className="health-label">可用剧集</div><div className="health-value">{availableEpisodes} / {detail.episodeCount}</div></div><div className="health-item"><div className="health-label">缺集</div><div className="health-value">{missingEpisodes}</div></div><div className="health-item"><div className="health-label">失联</div><div className="health-value">{disconnectedEpisodes}</div></div><div className="health-item"><div className="health-label">剧本关联</div><div className="health-value">{linkedScripts} / {detail.episodeCount}</div></div></div>{body}{editorOpen && <ModalDialog labelledBy="drama-dialog-title" className="drama-editor-modal" initialFocusSelector="#edit-drama-name" onClose={() => { setEditorOpen(false); void reload() }}><DramaEditorPage {...props} drama={detail} onClose={() => { setEditorOpen(false); void reload() }} onDelete={async (deleteTempFiles) => { await props.onDelete(deleteTempFiles); props.onClose() }} /></ModalDialog>}</section>)

  if (tab === 'results') return withStaticSurfaces(<section className="drama-module-screen" aria-labelledby="results-page-title"><div className="screen-head"><div><div className="meta">{detail.name}</div><h1 id="results-page-title">成果库</h1><p>所有成果均可追溯到来源任务、剧集范围和输出路径。</p></div><div className="top-actions"><button className="btn" type="button" onClick={props.onClose}>返回剧目库</button><button className="btn btn-primary" type="button" onClick={() => void reload()}>刷新成果</button></div></div><WorkspaceTabs tab={tab} onChange={(item) => { if (item === 'subtitles') { requestStaticScreen('subtitles'); return }; setTab(item); if (item === 'production') setWorkspace('production') }} /><ResultsPanel embedded materials={materials} onRefresh={() => void reload()} /></section>)

  if (tab === 'production') return withStaticSurfaces(<section className="drama-module-screen" aria-labelledby="production-page-title"><div className="screen-head"><div><div className="meta">{detail.name}</div><h1 id="production-page-title">素材生产</h1><p>选择这次要生产的素材类型，具体参数将在独立工作区配置。</p></div><button className="btn" type="button" onClick={props.onClose}>返回剧目库</button></div><WorkspaceTabs tab={tab} onChange={(item) => { if (item === 'subtitles') { requestStaticScreen('subtitles'); return }; setTab(item); if (item === 'production') setWorkspace('production') }} />{body}</section>)

  return withStaticSurfaces(<section aria-labelledby="drama-workspace-title"><WorkspaceTabs tab={tab} onChange={(item) => { if (item === 'subtitles') { requestStaticScreen('subtitles'); return }; setTab(item); if (item === 'production') setWorkspace('production') }} />{body}</section>)
}

const WorkspaceTabs = ({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }): ReactElement => <div className="tabs" role="tablist" aria-label="剧目工作区">{([{ id: 'assets', label: '剧目资产' }, { id: 'production', label: '素材生产' }, { id: 'subtitles', label: '字幕资产' }, { id: 'results', label: '成果库' }] as Array<{ id: Tab; label: string }>).map((item) => <button key={item.id} className={`tab${tab === item.id ? ' active' : ''}`} role="tab" aria-selected={tab === item.id} type="button" onClick={() => onChange(item.id)}>{item.label}</button>)}</div>

const ResultsPanel = ({ materials, onRefresh, embedded = false }: { materials: MaterialSummary[]; onRefresh: () => void; embedded?: boolean }): ReactElement => {
  const [period, setPeriod] = useState<'latest' | 'earliest'>('latest')
  const visible = useMemo(() => [...materials].sort((left, right) => period === 'latest' ? new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() : new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()), [materials, period])
  return <div className="results-panel">{!embedded && <div className="screen-head"><div><h2>成果库</h2><p>成功输出保留来源任务、集数范围和文件路径。</p></div><button className="btn" type="button" onClick={onRefresh}>刷新成果</button></div>}<div className="toolbar results-toolbar"><select className="select" aria-label="成果类型筛选" defaultValue="all"><option value="all">全部类型</option></select><select className="select" aria-label="成果排序" value={period} onChange={(event) => setPeriod(event.target.value as 'latest' | 'earliest')}><option value="latest">最近生成</option><option value="earliest">最早生成</option></select><span className="spacer" /><span className="meta">{materials.length} 项成果</span></div>{materials.length === 0 ? <div className="empty" role="status"><strong>还没有成果</strong><p>完成一次原剧切片或多集拼接后，视频会出现在这里。</p></div> : <div className="grid-3 result-grid">{visible.map((material) => <article className="card result-card" key={material.id}><button className="result-card-open" type="button" aria-label={`打开${fileName(material.path)}`} onClick={() => void window.desktopApi.openPath(material.path)}><div className="result-preview"><span className="poster-code">{material.taskId.slice(0, 8)}</span></div><div className="result-info"><h3>{fileName(material.path)}</h3><p>{material.durationSeconds === null ? '—' : `${material.durationSeconds.toFixed(2)} 秒`} · {material.fps === null ? '—' : `${material.fps} FPS`} · {material.sizeBytes === null ? '—' : `${(material.sizeBytes / 1024 / 1024).toFixed(1)} MB`}</p></div></button></article>)}</div>}</div>
}
const fileName = (path: string): string => path.split(/[\\/]/).at(-1) ?? path
