type Callbacks = { onBack: () => void; onOpenResults?: () => void; onNavigate?: (target: string) => void }
const ROUTES = new Set(['clip', 'clip-pool', 'pool', 'clip-report', 'production', 'assets', 'library', 'results', 'settings', 'subtitles'])

/** Window capture precedes the source document's demonstration route handlers. */
export const bindPrototypeLocalNavigation = (document: Document, callbacks: Callbacks, runtime: boolean): (() => void) => {
  const target = runtime ? document.defaultView ?? document : document
  const navigate = (event: Event): void => {
    const trigger = (event.target as Element | null)?.closest?.<HTMLElement>('[data-open], [data-r5-open]')
    const route = trigger?.dataset.r5Open ?? trigger?.dataset.open
    if (!trigger || !route) return
    const intercept = (): void => { event.preventDefault(); if (runtime) event.stopImmediatePropagation() }
    if (trigger.textContent?.includes('返回剧目库')) { intercept(); callbacks.onBack(); return }
    if (route === 'results' && callbacks.onOpenResults) { intercept(); callbacks.onOpenResults(); return }
    if (callbacks.onNavigate) { event.preventDefault(); if (runtime && ROUTES.has(route)) event.stopImmediatePropagation(); callbacks.onNavigate(route); return }
    if (route === 'production' || route === 'library') { intercept(); callbacks.onBack() }
  }
  target.addEventListener('click', navigate, true)
  return () => target.removeEventListener('click', navigate, true)
}
