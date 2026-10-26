// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell.js'
import { GLOBAL_NAVIGATION_EVENT } from '../navigation.js'

afterEach(cleanup)

describe('prototype host navigation', () => {
  it('routes valid global destinations including the current library and removes its listener on unmount', () => {
    const navigate = vi.fn()
    const { unmount } = render(<AppShell activeRoute="library" appVersion="0.1.96" releaseLabel="P1" loadState="ready" errorMessage={null} onNavigate={navigate} notificationSnapshot={null} notificationLoadState="ready" notificationError={null} notificationsOpen={false} onOpenNotifications={vi.fn()} onCloseNotifications={vi.fn()} onRetryNotifications={vi.fn()} onMarkNotificationRead={vi.fn()} onMarkAllNotificationsRead={vi.fn()} onClearReadNotifications={vi.fn()} onResolveNotification={vi.fn()} />)
    act(() => {
      for (const target of ['library', 'tasks', 'tags', 'settings', 'unknown', null, { target: 'tasks' }]) {
        window.dispatchEvent(new CustomEvent(GLOBAL_NAVIGATION_EVENT, { detail: target }))
      }
    })
    expect(navigate.mock.calls).toEqual([['library'], ['tasks'], ['tags'], ['settings']])
    unmount()
    window.dispatchEvent(new CustomEvent(GLOBAL_NAVIGATION_EVENT, { detail: 'library' }))
    expect(navigate).toHaveBeenCalledTimes(4)
  })
})
