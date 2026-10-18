export type ClipModuleFixtureState = 'default' | 'generating' | 'missing' | 'filtered' | 'exception'

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
