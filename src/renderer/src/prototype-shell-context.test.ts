// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { hydratePrototypeShell } from './prototype-shell-context.js'
import { bindPrototypeGlobalNavigation, OPEN_NOTIFICATIONS_EVENT } from './navigation.js'

describe('prototype shell live metadata', () => {
  it('replaces demonstration unread counts and forwards the existing notification trigger', () => {
    const surface = document.implementation.createHTMLDocument('shell')
    surface.body.innerHTML = '<button id="notifBtn"><span class="count">3</span></button><div class="sidebar-foot"></div>'
    const open = vi.fn()
    window.addEventListener(OPEN_NOTIFICATIONS_EVENT, open)
    const cleanup = bindPrototypeGlobalNavigation(surface)
    try {
      hydratePrototypeShell(surface, { appVersion: '0.1.106', releaseLabel: 'P1', unreadCount: 0 })
      expect(surface.querySelector<HTMLElement>('.count')?.hidden).toBe(true)
      expect(surface.querySelector<HTMLElement>('.sidebar-foot')?.title).toContain('0.1.106')
      hydratePrototypeShell(surface, { appVersion: '0.1.106', releaseLabel: 'P1', unreadCount: 7, notificationsOpen: true })
      expect(surface.querySelector<HTMLElement>('.count')?.hidden).toBe(false)
      expect(surface.querySelector('.count')?.textContent).toBe('7')
      expect(surface.getElementById('notifBtn')?.getAttribute('aria-expanded')).toBe('true')
      surface.getElementById('notifBtn')!.click()
      expect(open).toHaveBeenCalledOnce()
      cleanup()
      surface.getElementById('notifBtn')!.click()
      expect(open).toHaveBeenCalledOnce()
    } finally { cleanup(); window.removeEventListener(OPEN_NOTIFICATIONS_EVENT, open) }
  })
})
