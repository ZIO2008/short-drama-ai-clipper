import { useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import type { NotificationSnapshot } from '../../../shared/contracts.js'
import { NotificationDrawer } from '../components/NotificationDrawer.js'
import { UiIcon } from '../components/UiIcon.js'
import { NAVIGATION_ITEMS, isRouteId, type RouteId } from '../navigation.js'
import { RouteContent, type RouteContentProps } from './RouteContent.js'

type AppShellProps = Partial<Omit<RouteContentProps, 'route' | 'title' | 'description'>> & {
  activeRoute: RouteId; appVersion: string | null; releaseLabel: string | null; loadState: RouteContentProps['loadState']; errorMessage: string | null; onNavigate: (route: RouteId) => void
  notificationSnapshot: NotificationSnapshot | null; notificationLoadState: 'idle' | 'loading' | 'ready' | 'error'; notificationError: string | null; notificationsOpen: boolean
  recoveryNotice?: string | null
  backgroundNotice?: string | null
  onOpenNotifications: () => void; onCloseNotifications: () => void; onRetryNotifications: () => void; onMarkNotificationRead: (id: string) => void; onMarkAllNotificationsRead: () => void; onClearReadNotifications: () => void; onResolveNotification: (id: string) => void
}

export const AppShell = (props: AppShellProps): ReactElement => {
  const activeItem = NAVIGATION_ITEMS.find((item) => item.id === props.activeRoute) ?? NAVIGATION_ITEMS[0]
  const notificationButtonRef = useRef<HTMLButtonElement>(null); const wasOpen = useRef(false)
  const [taskFocusId, setTaskFocusId] = useState<string | null>(null)
  useEffect(() => { if (wasOpen.current && !props.notificationsOpen) notificationButtonRef.current?.focus(); wasOpen.current = props.notificationsOpen }, [props.notificationsOpen])
  useEffect(() => {
    const defaultContext = `全局 / ${activeItem.label}`
    const updateContext = (value: string | null): void => { const crumb = document.querySelector<HTMLElement>('.topbar .crumb'); if (crumb) crumb.textContent = value ?? defaultContext }
    const handleContext = (event: Event): void => updateContext((event as CustomEvent<string | null>).detail ?? null)
    updateContext(null)
    window.addEventListener('shortdrama:topbar-context', handleContext)
    return () => window.removeEventListener('shortdrama:topbar-context', handleContext)
  }, [activeItem.label])
  const scrollContentFromKeyboard = (event: KeyboardEvent<HTMLElement>): void => {
    if (!['PageDown', 'PageUp', 'Home', 'End'].includes(event.key)) return
    const content = event.currentTarget
    const assetTable = content.querySelector<HTMLElement>('.asset-table-wrap')
    const target = assetTable && assetTable.scrollHeight > assetTable.clientHeight ? assetTable : content
    const amount = Math.max(240, Math.floor(target.clientHeight * 0.82))
    if (event.key === 'PageDown') target.scrollBy({ top: amount })
    if (event.key === 'PageUp') target.scrollBy({ top: -amount })
    if (event.key === 'Home') target.scrollTo({ top: 0 })
    if (event.key === 'End') target.scrollTo({ top: target.scrollHeight })
    event.preventDefault()
  }
  const routeProps: RouteContentProps = {
    route: props.activeRoute, title: activeItem.label, description: activeItem.description, loadState: props.loadState, errorMessage: props.errorMessage, libraryInstanceKey: props.libraryInstanceKey ?? 0,
    dramas: props.dramas ?? null, dramasLoading: props.dramasLoading ?? false, dramasError: props.dramasError ?? null, onRetryDramas: props.onRetryDramas ?? (() => undefined), onCreateDrama: props.onCreateDrama ?? (async () => undefined), onChooseVideoFiles: props.onChooseVideoFiles ?? (async () => []), onChooseVideoFolder: props.onChooseVideoFolder ?? (async () => []), onImportEpisodePaths: props.onImportEpisodePaths ?? (async () => undefined), tags: props.tags ?? [],
    onRenameDrama: props.onRenameDrama ?? (async () => undefined), onLoadDrama: props.onLoadDrama ?? (async () => { throw new Error('Not available') }), onDeleteDrama: props.onDeleteDrama ?? (async () => undefined), onImportEpisodes: props.onImportEpisodes ?? (async () => undefined), onImportEpisodeFolder: props.onImportEpisodeFolder ?? (async () => undefined), onAttachTag: props.onAttachTag ?? (async () => undefined),
    onUpdateEpisode: props.onUpdateEpisode ?? (async () => { throw new Error('Not available') }), onRemoveEpisode: props.onRemoveEpisode ?? (async () => { throw new Error('Not available') }), onImportScript: props.onImportScript ?? (async () => []), onLinkScript: props.onLinkScript ?? (async () => undefined), onLinkSegment: props.onLinkSegment ?? (async () => undefined), onRelink: props.onRelink ?? (async () => undefined),
    onCreateCandidate: props.onCreateCandidate ?? (async () => { throw new Error('Not available') }), onListCandidates: props.onListCandidates ?? (async () => []), onConfirmCandidate: props.onConfirmCandidate ?? (async () => { throw new Error('Not available') }), onExportCandidate: props.onExportCandidate ?? (async () => { throw new Error('Not available') }), onChooseOutputDirectory: props.onChooseOutputDirectory ?? (async () => null), onListMaterials: props.onListMaterials ?? (async () => []), onPreflightMultiTask: props.onPreflightMultiTask ?? (async () => ({ preflightId: '', windows: [] })), onCreateMultiTask: props.onCreateMultiTask ?? (async () => { throw new Error('Not available') }), onRunTask: props.onRunTask ?? (async () => undefined),
    tasks: props.tasks ?? [], tasksLoading: props.tasksLoading ?? false, tasksError: props.tasksError ?? null, taskFocusId, onRetryTasks: props.onRetryTasks ?? (() => undefined), onRetryTask: props.onRetryTask ?? (async () => undefined),
    onSaveSecret: props.onSaveSecret ?? (async () => undefined), onCreateTag: props.onCreateTag ?? (async () => undefined), onRenameTag: props.onRenameTag ?? (async () => undefined), onDeleteTag: props.onDeleteTag ?? (async () => undefined)
  }
  return <div className="app" data-prototype-source="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark" aria-hidden="true">剧</span><span className="brand-name">短剧素材台</span></div><div className="nav-label">全局工作区</div><nav className="nav" aria-label="全局导航">{NAVIGATION_ITEMS.map((item) => <button className={`nav-btn${item.id === props.activeRoute ? ' active' : ''}`} type="button" key={item.id} aria-current={item.id === props.activeRoute ? 'page' : undefined} aria-label={item.label} title={item.label} onClick={() => props.onNavigate(item.id)}><span className="nav-icon"><UiIcon name={item.icon} /></span><span>{item.label}</span></button>)}</nav><div className="sidebar-foot"><span>Windows 10/11 · 本地模式</span><div className="meta">{props.appVersion && props.releaseLabel ? `v${props.appVersion} · ${props.releaseLabel}` : '正在读取版本'}</div></div></aside><div className="workspace"><header className="topbar"><p className="crumb">全局 / {activeItem.label}</p>{props.recoveryNotice && <span className="badge success" role="status">{props.recoveryNotice}</span>}<button className="btn icon-btn" type="button" aria-label="打开通知中心" aria-haspopup="dialog" aria-expanded={props.notificationsOpen} onClick={props.onOpenNotifications} ref={notificationButtonRef}><UiIcon name="bell" />{props.notificationSnapshot && props.notificationSnapshot.unreadCount > 0 && <span className="count" aria-label={`${props.notificationSnapshot.unreadCount} 条未读通知`}>{props.notificationSnapshot.unreadCount > 99 ? '99+' : props.notificationSnapshot.unreadCount}</span>}</button></header><main className="content" id="main-content" tabIndex={0} onKeyDown={scrollContentFromKeyboard}><div className="screen active"><RouteContent {...routeProps} /></div></main></div>{props.backgroundNotice && <div className="toast show" role="status">{props.backgroundNotice}</div>}<NotificationDrawer open={props.notificationsOpen} snapshot={props.notificationSnapshot} loadState={props.notificationLoadState} errorMessage={props.notificationError} onClose={props.onCloseNotifications} onRetry={props.onRetryNotifications} onMarkRead={props.onMarkNotificationRead} onMarkAllRead={props.onMarkAllNotificationsRead} onClearRead={props.onClearReadNotifications} onResolve={props.onResolveNotification} onOpenTarget={(target) => { const taskMatch = /^tasks\/([^/]+)$/.exec(target); if (taskMatch?.[1]) { setTaskFocusId(taskMatch[1]); props.onNavigate('tasks'); return true } if (isRouteId(target)) { setTaskFocusId(null); props.onNavigate(target); return true } return false }} /></div>
}
