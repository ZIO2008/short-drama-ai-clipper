import type { ReactElement } from 'react'
import { UiIcon } from '../components/UiIcon.js'
import { NAVIGATION_ITEMS, type RouteId } from '../navigation.js'

type AppShellProps = {
  activeRoute: RouteId
  appVersion: string | null
  loadState: 'loading' | 'ready' | 'error'
  errorMessage: string | null
  onNavigate: (route: RouteId) => void
}

export const AppShell = ({
  activeRoute,
  appVersion,
  loadState,
  errorMessage,
  onNavigate
}: AppShellProps): ReactElement => {
  const activeItem = NAVIGATION_ITEMS.find((item) => item.id === activeRoute) ?? NAVIGATION_ITEMS[0]

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
              title="通知中心将在通知抽屉接入后启用"
              disabled
            >
              <UiIcon name="bell" />
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
          />
        </main>
      </div>
    </div>
  )
}

type RouteContentProps = {
  route: RouteId
  title: string
  description: string
  loadState: AppShellProps['loadState']
  errorMessage: string | null
}

const RouteContent = ({
  route,
  title,
  description,
  loadState,
  errorMessage
}: RouteContentProps): ReactElement => (
  <section className="screen active" aria-labelledby={`${route}-title`}>
    <div className="screen-head">
      <div>
        <h1 id={`${route}-title`} tabIndex={-1}>{title}</h1>
        <p>{description}</p>
      </div>
    </div>
    {loadState === 'loading' && <LoadingState title={title} />}
    {loadState === 'error' && <ErrorState message={errorMessage} />}
    {loadState === 'ready' && <EmptyState route={route} />}
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
