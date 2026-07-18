import { describe, expect, it, vi } from 'vitest'
import { NAVIGATION_ITEMS, getInitialRoute, isRouteId } from './navigation.js'

describe('global navigation', () => {
  it('keeps the four prototype routes in their fixed order', () => {
    expect(NAVIGATION_ITEMS.map((item) => item.id)).toEqual(['library', 'tasks', 'tags', 'settings'])
    expect(new Set(NAVIGATION_ITEMS.map((item) => item.label)).size).toBe(4)
  })

  it('recognizes only product routes', () => {
    expect(isRouteId('library')).toBe(true)
    expect(isRouteId('unknown')).toBe(false)
  })

  it('defaults invalid and empty hashes to the drama library', () => {
    vi.stubGlobal('window', { location: { hash: '' } })
    expect(getInitialRoute()).toBe('library')
    window.location.hash = '#/not-a-route'
    expect(getInitialRoute()).toBe('library')
    window.location.hash = '#/tasks'
    expect(getInitialRoute()).toBe('tasks')
    vi.unstubAllGlobals()
  })
})
