import { useEffect, useState, type ReactElement } from 'react'
import type { AppHealth } from '../../shared/contracts.js'

export const App = (): ReactElement => {
  const [health, setHealth] = useState<AppHealth | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.desktopApi.getAppHealth().then(setHealth).catch(() => {
      setError('应用初始化失败。请检查本地数据目录后重试。')
    })
  }, [])

  return (
    <main className="bootstrap-screen" aria-labelledby="bootstrap-title">
      <p className="bootstrap-kicker">短剧投流素材生成平台</p>
      <h1 id="bootstrap-title">正在加载已定稿的界面基线</h1>
      <p>{error ?? getStatusMessage(health)}</p>
    </main>
  )
}

const getStatusMessage = (health: AppHealth | null): string => {
  if (!health) {
    return '正在检查本地数据与 Windows 密钥保护。'
  }
  if (health.initializationErrorCode === 'DATABASE_UNAVAILABLE') {
    return '本地数据无法初始化。请检查应用数据目录权限后重试。'
  }

  return `本地数据目录已隔离 · 应用版本 ${health.appVersion}`
}
