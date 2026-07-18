import { useEffect, useState, type ReactElement } from 'react'
import type { AppHealth, DesktopApi, NotificationSnapshot } from '../../shared/contracts.js'
import { AppErrorBoundary } from './components/AppErrorBoundary.js'
import { AppShell } from './layout/AppShell.js'
import { getInitialRoute, type RouteId } from './navigation.js'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; health: AppHealth }
  | { kind: 'error'; message: string }

type NotificationLoadState = 'idle' | 'loading' | 'ready' | 'error'

export const App = (): ReactElement => (
  <AppErrorBoundary>
    <AppRuntime />
  </AppErrorBoundary>
)

const AppRuntime = (): ReactElement => {
  const [activeRoute, setActiveRoute] = useState<RouteId>(getInitialRoute)
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' })
  const [notificationSnapshot, setNotificationSnapshot] = useState<NotificationSnapshot | null>(null)
  const [notificationLoadState, setNotificationLoadState] = useState<NotificationLoadState>('idle')
  const [notificationError, setNotificationError] = useState<string | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  useEffect(() => {
    let active = true
    const desktopApi = window.desktopApi
    if (!desktopApi) {
      setLoadState({ kind: 'error', message: '桌面桥接不可用。请从短剧素材台应用窗口重新载入。' })
      return () => {
        active = false
      }
    }
    desktopApi
      .getAppHealth()
      .then((health) => {
        if (!active) return
        if (health.initializationErrorCode === 'DATABASE_UNAVAILABLE') {
          setLoadState({
            kind: 'error',
            message: '本地数据无法初始化。请检查应用数据目录权限后重试。'
          })
          return
        }
        setLoadState({ kind: 'ready', health })
      })
      .catch(() => {
        if (active) {
          setLoadState({
            kind: 'error',
            message: '应用初始化失败。请检查本地数据目录后重试。'
          })
        }
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (loadState.kind !== 'ready' || !window.desktopApi) return
    let active = true
    setNotificationLoadState('loading')
    window.desktopApi.getNotifications().then((snapshot) => {
      if (!active) return
      setNotificationSnapshot(snapshot)
      setNotificationLoadState('ready')
      setNotificationError(null)
    }).catch(() => {
      if (!active) return
      setNotificationLoadState('error')
      setNotificationError('通知读取失败，当前页面仍可继续工作。')
    })
    return () => {
      active = false
    }
  }, [loadState.kind])

  useEffect(() => {
    const syncRoute = (): void => setActiveRoute(getInitialRoute())
    window.addEventListener('hashchange', syncRoute)
    return () => window.removeEventListener('hashchange', syncRoute)
  }, [])

  const navigate = (route: RouteId): void => {
    if (window.location.hash !== `#/${route}`) {
      window.location.hash = `/${route}`
    }
    setActiveRoute(route)
  }

  const updateNotifications = (operation: (api: DesktopApi) => Promise<NotificationSnapshot>): void => {
    if (!window.desktopApi) return
    setNotificationLoadState('loading')
    operation(window.desktopApi).then((snapshot) => {
      setNotificationSnapshot(snapshot)
      setNotificationLoadState('ready')
      setNotificationError(null)
    }).catch(() => {
      setNotificationLoadState('error')
      setNotificationError('通知操作失败，请重试。')
    })
  }

  const retryNotifications = (): void => {
    if (!window.desktopApi) return
    setNotificationLoadState('loading')
    window.desktopApi.getNotifications().then((snapshot) => {
      setNotificationSnapshot(snapshot)
      setNotificationLoadState('ready')
      setNotificationError(null)
    }).catch(() => {
      setNotificationLoadState('error')
      setNotificationError('通知读取失败，当前页面仍可继续工作。')
    })
  }

  return (
    <AppShell
      activeRoute={activeRoute}
      appVersion={loadState.kind === 'ready' ? loadState.health.appVersion : null}
      loadState={loadState.kind}
      errorMessage={loadState.kind === 'error' ? loadState.message : null}
      onNavigate={navigate}
      notificationSnapshot={notificationSnapshot}
      notificationLoadState={notificationLoadState}
      notificationError={notificationError}
      notificationsOpen={notificationsOpen}
      onOpenNotifications={() => setNotificationsOpen(true)}
      onCloseNotifications={() => setNotificationsOpen(false)}
      onRetryNotifications={retryNotifications}
      onMarkNotificationRead={(id) => updateNotifications((api) => api.markNotificationRead(id))}
      onMarkAllNotificationsRead={() => updateNotifications((api) => api.markAllNotificationsRead())}
      onClearReadNotifications={() => updateNotifications((api) => api.clearReadNotifications())}
      onResolveNotification={(id) => updateNotifications((api) => api.resolveNotification(id))}
    />
  )
}
