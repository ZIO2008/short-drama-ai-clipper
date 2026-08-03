import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from './AppShell.js'

describe('AppShell', () => {
  it('renders the four prototype navigation buttons and one current page', () => {
    vi.stubGlobal('window', { location: { reload: vi.fn() } })
    const html = renderToStaticMarkup(
      <AppShell
        activeRoute="library"
        appVersion="0.1.0"
        releaseLabel="P1 · 内部试点"
        loadState="ready"
        errorMessage={null}
        onNavigate={vi.fn()}
        notificationSnapshot={null}
        notificationLoadState="ready"
        notificationError={null}
        notificationsOpen={false}
        onOpenNotifications={vi.fn()}
        onCloseNotifications={vi.fn()}
        onRetryNotifications={vi.fn()}
        onMarkNotificationRead={vi.fn()}
        onMarkAllNotificationsRead={vi.fn()}
        onClearReadNotifications={vi.fn()}
        onResolveNotification={vi.fn()}
      />
    )

    expect((html.match(/class="nav-btn/g) ?? []).length).toBe(4)
    expect((html.match(/aria-current="page"/g) ?? []).length).toBe(1)
    expect(html).toContain('全局 / 剧目库')
    expect(html).toContain('还没有剧目')
    vi.unstubAllGlobals()
  })
})
