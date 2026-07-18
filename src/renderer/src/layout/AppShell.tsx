import { useEffect, useRef, type ReactElement } from 'react'
import type { NotificationSnapshot } from '../../../shared/contracts.js'
import { NotificationDrawer } from '../components/NotificationDrawer.js'
import { UiIcon } from '../components/UiIcon.js'
import { NAVIGATION_ITEMS, isRouteId, type RouteId } from '../navigation.js'
import type { DramaDetail, DramaSummary, EpisodeUpdate, TagSummary } from '../../../shared/contracts.js'
import { DramaLibraryPage } from '../pages/DramaLibraryPage.js'
import { TagManagementPage } from '../pages/TagManagementPage.js'

type AppShellProps = {
  activeRoute: RouteId
  appVersion: string | null
  loadState: 'loading' | 'ready' | 'error'
  errorMessage: string | null
  onNavigate: (route: RouteId) => void
  notificationSnapshot: NotificationSnapshot | null
  notificationLoadState: 'idle' | 'loading' | 'ready' | 'error'
  notificationError: string | null
  notificationsOpen: boolean
  onOpenNotifications: () => void
  onCloseNotifications: () => void
  onRetryNotifications: () => void
  onMarkNotificationRead: (notificationId: string) => void
  onMarkAllNotificationsRead: () => void
  onClearReadNotifications: () => void
  onResolveNotification: (notificationId: string) => void
  dramas?: DramaSummary[] | null
  dramasLoading?: boolean
  dramasError?: string | null
  onRetryDramas?: () => void
  onCreateDrama?: (name: string) => Promise<void>
  tags?: TagSummary[]
  onRenameDrama?: (id: string, name: string) => Promise<void>
  onLoadDrama?: (id: string) => Promise<DramaDetail>
  onDeleteDrama?: (id: string, deleteTempFiles: boolean) => Promise<void>
  onImportEpisodes?: (id: string) => Promise<void>
  onAttachTag?: (dramaId: string, tagId: string) => Promise<void>
  onUpdateEpisode?: (dramaId: string, episodeId: string, update: EpisodeUpdate) => Promise<DramaDetail>
  onRemoveEpisode?: (dramaId: string, episodeId: string) => Promise<DramaDetail>
  onImportScript?: (dramaId: string) => Promise<Array<{ segmentId?: string; episodeNo: number; title: string; text: string }>>
  onLinkSegment?: (segmentId: string, episodeId: string | null) => Promise<void>
  onRelink?: (dramaId: string) => Promise<void>
  onCreateTag?: (name: string) => Promise<void>
  onRenameTag?: (id: string, name: string) => Promise<void>
  onDeleteTag?: (tag: TagSummary) => Promise<void>
}

export const AppShell = ({
  activeRoute,
  appVersion,
  loadState,
  errorMessage,
  onNavigate,
  notificationSnapshot,
  notificationLoadState,
  notificationError,
  notificationsOpen,
  onOpenNotifications,
  onCloseNotifications,
  onRetryNotifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onClearReadNotifications,
  onResolveNotification,
  dramas = null,
  dramasLoading = false,
  dramasError = null,
  onRetryDramas = () => undefined,
  onCreateDrama = async () => undefined,
  tags = [],
  onRenameDrama = async () => undefined,
  onLoadDrama = async () => { throw new Error('Not available') },
  onDeleteDrama = async () => undefined,
  onImportEpisodes = async () => undefined,
  onAttachTag = async () => undefined,
  onUpdateEpisode = async () => { throw new Error('Not available') },
  onRemoveEpisode = async () => { throw new Error('Not available') },
  onImportScript = async () => [],
  onLinkSegment = async () => undefined,
  onRelink = async () => undefined,
  onCreateTag = async () => undefined,
  onRenameTag = async () => undefined,
  onDeleteTag = async () => undefined
}: AppShellProps): ReactElement => {
  const activeItem = NAVIGATION_ITEMS.find((item) => item.id === activeRoute) ?? NAVIGATION_ITEMS[0]
  const notificationButtonRef = useRef<HTMLButtonElement>(null)
  const wasNotificationsOpen = useRef(false)

  useEffect(() => {
    if (wasNotificationsOpen.current && !notificationsOpen) notificationButtonRef.current?.focus()
    wasNotificationsOpen.current = notificationsOpen
  }, [notificationsOpen])

  return (
    <div className="app" data-prototype-source="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">剧</span>
          <span className="brand-name">短剧素材台</span>
        </div>
        <div className="nav-label">全局工作区</div>
        <nav className="nav" aria-label="全局导航">
          {NAVIGATION_ITEMS.map((item) => (
            <button
              className={`nav-btn${item.id === activeRoute ? ' active' : ''}`}
              type="button"
              key={item.id}
              aria-current={item.id === activeRoute ? 'page' : undefined}
              aria-label={item.label}
              title={item.label}
              onClick={() => onNavigate(item.id)}
            >
              <span className="nav-icon"><UiIcon name={item.icon} /></span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>Windows 10/11 · 本地模式</span>
          <div className="meta">{appVersion ? `v${appVersion} P0` : '正在读取版本'}</div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="top-context">
            <p className="crumb">全局 / {activeItem.label}</p>
          </div>
          <div className="top-actions">
            <button
              className="btn icon-btn"
              type="button"
              aria-label="打开通知中心"
              title={notificationLoadState === 'error' ? '通知暂时不可用' : '通知中心'}
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
              onClick={onOpenNotifications}
              ref={notificationButtonRef}
            >
              <UiIcon name="bell" />
              {notificationSnapshot && notificationSnapshot.unreadCount > 0 && (
                <span className="count" aria-label={`${notificationSnapshot.unreadCount} 条未读通知`}>
                  {notificationSnapshot.unreadCount > 99 ? '99+' : notificationSnapshot.unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>
        <main className="content" id="main-content">
            <RouteContent
              route={activeRoute}
            title={activeItem.label}
            description={activeItem.description}
            loadState={loadState}
              errorMessage={errorMessage}
              dramas={dramas}
              dramasLoading={dramasLoading}
              dramasError={dramasError}
              onRetryDramas={onRetryDramas}
              onCreateDrama={onCreateDrama}
              tags={tags}
              onRenameDrama={onRenameDrama}
              onLoadDrama={onLoadDrama}
              onDeleteDrama={onDeleteDrama}
              onImportEpisodes={onImportEpisodes}
              onAttachTag={onAttachTag}
              onUpdateEpisode={onUpdateEpisode}
              onRemoveEpisode={onRemoveEpisode}
              onImportScript={onImportScript}
              onLinkSegment={onLinkSegment}
              onRelink={onRelink}
              onCreateTag={onCreateTag}
              onRenameTag={onRenameTag}
              onDeleteTag={onDeleteTag}
          />
        </main>
      </div>
      <NotificationDrawer
        open={notificationsOpen}
        snapshot={notificationSnapshot}
        loadState={notificationLoadState}
        errorMessage={notificationError}
        onClose={onCloseNotifications}
        onRetry={onRetryNotifications}
        onMarkRead={onMarkNotificationRead}
        onMarkAllRead={onMarkAllNotificationsRead}
        onClearRead={onClearReadNotifications}
        onResolve={onResolveNotification}
        onOpenTarget={(target) => {
          if (isRouteId(target)) {
            onNavigate(target)
            return true
          }
          return false
        }}
      />
    </div>
  )
}

type RouteContentProps = {
  route: RouteId
  title: string
  description: string
  loadState: AppShellProps['loadState']
  errorMessage: string | null
  dramas: DramaSummary[] | null
  dramasLoading: boolean
  dramasError: string | null
  onRetryDramas: () => void
  onCreateDrama: (name: string) => Promise<void>
  tags: TagSummary[]
  onRenameDrama: (id: string, name: string) => Promise<void>
  onLoadDrama: (id: string) => Promise<DramaDetail>
  onDeleteDrama: (id: string, deleteTempFiles: boolean) => Promise<void>
  onImportEpisodes: (id: string) => Promise<void>
  onAttachTag: (dramaId: string, tagId: string) => Promise<void>
  onUpdateEpisode: (dramaId: string, episodeId: string, update: EpisodeUpdate) => Promise<DramaDetail>
  onRemoveEpisode: (dramaId: string, episodeId: string) => Promise<DramaDetail>
  onImportScript: (dramaId: string) => Promise<Array<{ segmentId?: string; episodeNo: number; title: string; text: string }>>
  onLinkSegment: (segmentId: string, episodeId: string | null) => Promise<void>
  onRelink: (dramaId: string) => Promise<void>
  onCreateTag: (name: string) => Promise<void>
  onRenameTag: (id: string, name: string) => Promise<void>
  onDeleteTag: (tag: TagSummary) => Promise<void>
}

const RouteContent = ({
  route,
  title,
  description,
  loadState,
  errorMessage,
  dramas,
  dramasLoading,
  dramasError,
  onRetryDramas,
  onCreateDrama,
  tags,
  onRenameDrama,
  onLoadDrama,
  onDeleteDrama,
  onImportEpisodes,
  onAttachTag,
  onUpdateEpisode,
  onRemoveEpisode,
  onImportScript,
  onLinkSegment,
  onRelink,
  onCreateTag,
  onRenameTag,
  onDeleteTag
}: RouteContentProps): ReactElement => (
  <section className="screen active" aria-labelledby={`${route}-title`}>
    {route === 'library' && loadState === 'ready' ? <DramaLibraryPage dramas={dramas} loading={dramasLoading} error={dramasError} onRetry={onRetryDramas} onCreate={onCreateDrama} tags={tags} onRename={onRenameDrama} onLoad={onLoadDrama} onDelete={(id, deleteTempFiles = false) => onDeleteDrama(id, deleteTempFiles)} onImport={onImportEpisodes} onAttachTag={onAttachTag} onUpdateEpisode={onUpdateEpisode} onRemoveEpisode={onRemoveEpisode} onImportScript={onImportScript} onLinkSegment={onLinkSegment} onRelink={onRelink} /> : null}
    {route === 'tags' && loadState === 'ready' ? <TagManagementPage tags={tags} onCreate={onCreateTag} onRename={onRenameTag} onDelete={onDeleteTag} /> : null}
    {route !== 'library' && route !== 'tags' && <>
    <div className="screen-head">
      <div>
        <h1 id={`${route}-title`} tabIndex={-1}>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
    {loadState === 'loading' && <LoadingState title={title} />}
    {loadState === 'error' && <ErrorState message={errorMessage} />}
    {loadState === 'ready' && <EmptyState route={route} />}</>}
  </section>
)

const LoadingState = ({ title }: { title: string }): ReactElement => (
  <div className="state-panel" role="status" aria-live="polite">
    <div className="skeleton-line skeleton-title" />
    <div className="skeleton-line" />
    <p className="state-copy">正在读取{title}的本地数据。</p>
  </div>
)

const ErrorState = ({ message }: { message: string | null }): ReactElement => (
  <div className="state-panel state-panel-error" role="alert">
    <p className="state-kicker">本地数据不可用</p>
    <h2>无法读取当前工作区</h2>
    <p>{message ?? '请检查数据目录后重新载入应用。'}</p>
    <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
      重试
    </button>
  </div>
)

const EmptyState = ({ route }: { route: RouteId }): ReactElement => {
  const copy: Record<RouteId, { title: string; message: string }> = {
    library: { title: '还没有剧目', message: '创建剧目后，原片、任务和成果会在这里统一管理。' },
    tasks: { title: '还没有生产任务', message: '剧目开始生产后，任务状态会汇总到这里。' },
    tags: { title: '还没有标签', message: '创建标签后，可以用它们整理和筛选剧目。' },
    settings: { title: '设置尚未载入', message: '能力供应商、导出、性能和数据设置将在对应模块接入。' }
  }
  return (
    <div className="empty" role="status">
      <div>
        <strong>{copy[route].title}</strong>
        <p>{copy[route].message}</p>
      </div>
    </div>
  )
}
