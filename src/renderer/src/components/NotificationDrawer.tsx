import { useEffect, useRef, type ReactElement } from 'react'
import type { NotificationItem, NotificationSeverity, NotificationSnapshot } from '../../../shared/contracts.js'

type NotificationDrawerProps = {
  open: boolean
  snapshot: NotificationSnapshot | null
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  errorMessage: string | null
  onClose: () => void
  onRetry: () => void
  onMarkRead: (notificationId: string) => void
  onMarkAllRead: () => void
  onClearRead: () => void
  onResolve: (notificationId: string) => void
  onOpenTarget: (target: string) => boolean
}

export const NotificationDrawer = ({
  open,
  snapshot,
  loadState,
  errorMessage,
  onClose,
  onRetry,
  onMarkRead,
  onMarkAllRead,
  onClearRead,
  onResolve,
  onOpenTarget
}: NotificationDrawerProps): ReactElement => {
  const drawerRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus()
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? [])]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open])

  const items = snapshot?.items ?? []
  const busy = loadState === 'loading' || loadState === 'idle'

  return (
    <aside
      className={`drawer${open ? ' open' : ''}`}
      ref={drawerRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="drawer-title"
      aria-hidden={!open}
    >
      <div className="drawer-head">
        <div>
          <h2 id="drawer-title">通知中心</h2>
          <div className="meta">{snapshot ? `${snapshot.unreadCount} 条未读` : '读取中'}</div>
        </div>
        <button className="btn icon-btn" type="button" aria-label="关闭通知中心" onClick={onClose} ref={closeButtonRef}>×</button>
      </div>
      <div className="drawer-body">
        <div className="toolbar drawer-toolbar">
          <button className="btn" type="button" onClick={onMarkAllRead} disabled={busy || !items.some((item) => !item.readAt)}>
            全部已读
          </button>
          <button className="btn" type="button" onClick={onClearRead} disabled={busy || !items.some((item) => item.readAt && (item.severity !== 'decision' || item.resolvedAt))}>
            清除已读
          </button>
        </div>
        {(loadState === 'loading' || loadState === 'idle') && <LoadingNotices />}
        {loadState === 'error' && <ErrorNotices message={errorMessage} onRetry={onRetry} />}
        {loadState === 'ready' && items.length === 0 && <div className="notice-empty">没有需要处理的通知</div>}
        {loadState === 'ready' && items.map((item) => (
          <NotificationRow
            key={item.id}
            item={item}
            onMarkRead={onMarkRead}
            onResolve={onResolve}
            onOpenTarget={onOpenTarget}
            onClose={onClose}
          />
        ))}
      </div>
    </aside>
  )
}

type NotificationRowProps = {
  item: NotificationItem
  onMarkRead: (notificationId: string) => void
  onResolve: (notificationId: string) => void
  onOpenTarget: (target: string) => boolean
  onClose: () => void
}

const NotificationRow = ({ item, onMarkRead, onResolve, onOpenTarget, onClose }: NotificationRowProps): ReactElement => {
  const activate = (): void => {
    if (!item.readAt) onMarkRead(item.id)
    if (item.actionTarget && onOpenTarget(item.actionTarget)) {
      onClose()
    }
  }
  const unresolvedDecision = item.severity === 'decision' && !item.resolvedAt

  return (
    <article className={`notice ${item.readAt ? '' : 'unread'} severity-${item.severity}`}>
      <button className="notice-open" type="button" aria-label={`${severityLabel(item.severity)}：${item.title}`} onClick={activate}>
        <h3><span className={`badge ${severityClass(item.severity)}`}>{severityLabel(item.severity)}</span> {item.title}</h3>
        <p>{item.dramaName ?? '全局'} · {taskTypeLabel(item.taskType)} · {item.summary}</p>
        <div className="notice-foot"><span className="meta">{formatOccurredAt(item.occurredAt)}</span><span className="meta">{item.actionTarget ? '进入来源 →' : '已记录'}</span></div>
      </button>
      {unresolvedDecision && (
        <button
          className="btn notice-resolve"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onResolve(item.id)
          }}
        >
          标记已解决
        </button>
      )}
    </article>
  )
}

const LoadingNotices = (): ReactElement => (
  <div className="notice-loading" role="status" aria-live="polite">
    <div className="skeleton-line" /><div className="skeleton-line" /><div className="skeleton-line" />
  </div>
)

const ErrorNotices = ({ message, onRetry }: { message: string | null; onRetry: () => void }): ReactElement => (
  <div className="notice-error" role="alert">
    <strong>通知暂时不可用</strong>
    <p>{message ?? '读取失败，请重试。'}</p>
    <button className="btn btn-secondary" type="button" onClick={onRetry}>重试</button>
  </div>
)

const SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  info: '信息', success: '成功', warning: '警告', error: '错误', decision: '待决策'
}

const severityLabel = (severity: NotificationSeverity): string => SEVERITY_LABELS[severity]
const severityClass = (severity: NotificationSeverity): string => severity === 'error' ? 'danger' : severity === 'decision' ? 'warning' : severity

const taskTypeLabel = (taskType: string | null): string => {
  if (!taskType) return '后台任务'
  const labels: Record<string, string> = {
    stitch: '多集拼接', multi_episode_stitch: '多集拼接', original_clip: '原剧切片'
  }
  return labels[taskType] ?? taskType
}

const formatOccurredAt = (occurredAt: string): string => {
  const timestamp = Date.parse(occurredAt)
  if (!Number.isFinite(timestamp)) return '时间未知'
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 60) return '刚刚'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(timestamp)
}
