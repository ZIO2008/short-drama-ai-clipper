import { useEffect, useState, type ReactElement } from 'react'
import type { AppHealth } from '../../shared/contracts.js'
import { AppErrorBoundary } from './components/AppErrorBoundary.js'
import { AppShell } from './layout/AppShell.js'
import { getInitialRoute, type RouteId } from './navigation.js'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; health: AppHealth }
  | { kind: 'error'; message: string }

export const App = (): ReactElement => (
  <AppErrorBoundary>
    <AppRuntime />
  </AppErrorBoundary>
)

const AppRuntime = (): ReactElement => {
  const [activeRoute, setActiveRoute] = useState<RouteId>(getInitialRoute)
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' })

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

  return (
    <AppShell
      activeRoute={activeRoute}
      appVersion={loadState.kind === 'ready' ? loadState.health.appVersion : null}
      loadState={loadState.kind}
      errorMessage={loadState.kind === 'error' ? loadState.message : null}
      onNavigate={navigate}
    />
  )
}
