// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell.js'
import { bindPrototypeGlobalNavigation } from '../navigation.js'

afterEach(cleanup)
describe('complete prototype shell notification integration', () => {
  it('opens the real host drawer callback and restores focus to the iframe trigger', () => {
    const frame = document.createElement('iframe'); frame.dataset.v49RuntimeShell = 'true'; document.body.append(frame)
    const surface = frame.contentDocument!
    surface.body.innerHTML = '<button id="notifBtn"><span class="count">3</span></button><div class="sidebar-foot"></div>'
    const open = vi.fn()
    const props = { activeRoute: 'library' as const, appVersion: '0.1.106', releaseLabel: 'P1', loadState: 'ready' as const, errorMessage: null, onNavigate: vi.fn(), notificationSnapshot: { items: [], unreadCount: 0 }, notificationLoadState: 'ready' as const, notificationError: null, notificationsOpen: false, onOpenNotifications: open, onCloseNotifications: vi.fn(), onRetryNotifications: vi.fn(), onMarkNotificationRead: vi.fn(), onMarkAllNotificationsRead: vi.fn(), onClearReadNotifications: vi.fn(), onResolveNotification: vi.fn() }
    const view = render(<AppShell {...props} />)
    const dispose = bindPrototypeGlobalNavigation(surface)
    try {
      expect(surface.querySelector<HTMLElement>('.count')?.hidden).toBe(true)
      expect(surface.querySelector<HTMLElement>('.sidebar-foot')?.title).toContain('0.1.106')
      surface.getElementById('notifBtn')!.click()
      expect(open).toHaveBeenCalledOnce()
      view.rerender(<AppShell {...props} notificationsOpen />)
      expect(surface.getElementById('notifBtn')?.getAttribute('aria-expanded')).toBe('true')
      view.rerender(<AppShell {...props} />)
      expect(surface.activeElement).toBe(surface.getElementById('notifBtn'))
      expect(surface.getElementById('notifBtn')?.getAttribute('aria-expanded')).toBe('false')
      view.unmount()
      surface.getElementById('notifBtn')!.click()
      expect(open).toHaveBeenCalledOnce()
    } finally { dispose(); frame.remove(); view.unmount() }
  })
})
