import type { IconName } from './components/UiIcon.js'

export type RouteId = 'library' | 'tasks' | 'tags' | 'settings'
export const GLOBAL_NAVIGATION_EVENT = 'shortdrama:global-navigation'

export type NavigationItem = {
  id: RouteId
  label: string
  icon: IconName
  description: string
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  { id: 'library', label: '剧目库', icon: 'library', description: '按剧目管理原片、任务和成果。' },
  { id: 'tasks', label: '任务中心', icon: 'tasks', description: '查看所有剧目的生产任务。' },
  { id: 'tags', label: '标签管理', icon: 'tags', description: '维护剧目使用的本地标签。' },
  { id: 'settings', label: '设置', icon: 'settings', description: '配置本地数据、导出和运行选项。' }
]

export const isRouteId = (value: string): value is RouteId =>
  NAVIGATION_ITEMS.some((item) => item.id === value)

export const getInitialRoute = (): RouteId => {
  const route = window.location.hash.replace(/^#\/?/, '')
  return isRouteId(route) ? route : 'library'
}
