export type ClipModuleFixtureState = 'default' | 'generating' | 'missing' | 'filtered' | 'exception'

/** Freeze the complete rendered prototype, removing only its demonstration event owners. */
export const prepareClipModuleRuntime = (document: Document, screen: 'clip-pool' | 'clip-report'): 'ready' | 'missing' | 'rewritten' => {
  if (document.body.dataset.staticPrototypeRuntime === `v49-screen-${screen}`) return 'ready'
  const target = document.getElementById(`screen-${screen}`)
  if (!target || !document.querySelector('.app .sidebar') || !document.getElementById('clip-r5-style')) return 'missing'
  document.querySelectorAll<HTMLElement>('.screen').forEach(node => {
    node.classList.toggle('active', node === target)
    node.setAttribute('aria-hidden', String(node !== target))
  })
  document.body.dataset.staticPrototypeRuntime = `v49-screen-${screen}`
  document.body.dataset.staticPrototypeIsolated = 'true'
  const placeholderCount = document.querySelector<HTMLElement>('#notifBtn .count')
  if (placeholderCount) { placeholderCount.hidden = true; placeholderCount.textContent = '' }
  const snapshot = document.documentElement.cloneNode(true) as HTMLElement
  snapshot.querySelectorAll('script').forEach(node => node.remove())
  snapshot.querySelectorAll('*').forEach(node => { for (const attribute of [...node.attributes]) if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name) })
  document.open()
  document.write(`<!doctype html>${snapshot.outerHTML}`)
  document.close()
  return 'rewritten'
}

/** Keep the complete final V49 document; never extract a page or remap its viewport. */
export const prepareClipModuleFixture = (document: Document, screen: 'clip-pool' | 'clip-report', state: ClipModuleFixtureState): 'ready' | 'missing' => {
  const target = document.getElementById(`screen-${screen}`)
  if (!target || !document.querySelector('.app .sidebar') || !document.getElementById('clip-r5-style')) return 'missing'
  if (!document.getElementById(screen === 'clip-pool' ? 'clipCandidateRows' : 'clipReportRows')) return 'missing'
  document.querySelectorAll<HTMLElement>('.screen').forEach(item => {
    const active = item === target
    item.classList.toggle('active', active)
    item.setAttribute('aria-hidden', String(!active))
  })
  if (document.body.dataset.staticPrototypeFixture !== `v49-screen-${screen}`) {
    const selector = state === 'generating' ? '[data-clip-candidate-episode="3"]'
      : state === 'missing' ? `[data-${screen === 'clip-pool' ? 'clip-candidate' : 'clip-report'}-episode="6"]`
        : state === 'filtered' ? '[data-clip-filter="exported"]'
          : state === 'exception' ? '[data-clip-report-filter="exception"]' : null
    if (selector) {
      const control = target.querySelector<HTMLButtonElement>(selector)
      if (!control) return 'missing'
      control.click()
    }
  }
  document.body.dataset.staticPrototypeIsolated = 'true'
  document.body.dataset.staticPrototypeFixture = `v49-screen-${screen}`
  return 'ready'
}
