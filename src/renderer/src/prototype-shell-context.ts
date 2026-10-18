export type PrototypeShellContext = { appVersion: string | null; releaseLabel: string | null; unreadCount: number; notificationsOpen?: boolean }

export const hydratePrototypeShell = (surface: Document, context: PrototypeShellContext): void => {
  const count = surface.querySelector<HTMLElement>('#notifBtn .count')
  const unread = context.unreadCount
  if (count) { count.textContent = unread > 99 ? '99+' : String(unread); count.hidden = unread === 0; count.setAttribute('aria-label', `${unread} 条未读通知`) }
  const button = surface.getElementById('notifBtn')
  if (button) { button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', String(context.notificationsOpen === true)) }
  const footer = surface.querySelector<HTMLElement>('.sidebar-foot')
  if (footer) footer.title = context.appVersion ? `v${context.appVersion} · ${context.releaseLabel ?? ''}` : '正在读取版本'
}
