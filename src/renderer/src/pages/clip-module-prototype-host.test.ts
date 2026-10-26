// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { prepareClipModuleFixture, prepareClipModuleRuntime } from './clip-module-prototype-host.js'
import { prototypeSourceForScreen } from './StaticPrototypeSurface.js'
import v49 from '../../../../design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html?raw'

describe('complete V49 module static fixture', () => {
  it.each(['clip-pool', 'clip-report'] as const)('keeps source identity and complete shell for %s', screen => {
    expect(prototypeSourceForScreen(screen, 'static-fixture')).toBe(v49)
    const document = window.document.implementation.createHTMLDocument('fixture')
    document.head.innerHTML = '<style id="clip-r5-style">@media(max-height:760px){.screen{color:red}}</style>'
    document.body.innerHTML = `<div class="app"><aside class="sidebar">完整壳</aside><main class="workspace"><div id="content"><section class="screen active" id="screen-library"></section><section class="screen" id="screen-${screen}"><div id="${screen === 'clip-pool' ? 'clipCandidateRows' : 'clipReportRows'}"></div></section></div></main></div>`
    const before = document.head.innerHTML
    expect(prepareClipModuleFixture(document, screen, 'default')).toBe('ready')
    expect(document.head.innerHTML).toBe(before)
    expect(document.querySelector('.app .sidebar')?.textContent).toBe('完整壳')
    expect(document.body.dataset.staticPrototypeFixture).toBe(`v49-screen-${screen}`)
    expect(document.querySelector('.screen.active')?.id).toBe(`screen-${screen}`)
    expect(document.getElementById('static-prototype-clip-isolation-layout')).toBeNull()
  })
  it('waits for the final dynamically generated module and style', () => {
    expect(prepareClipModuleFixture(document.implementation.createHTMLDocument(), 'clip-pool', 'default')).toBe('missing')
  })
  it.each(['clip-pool', 'clip-report'] as const)('preserves full %s runtime DOM while stripping demonstration owners', screen => {
    const document = window.document.implementation.createHTMLDocument('runtime')
    document.head.innerHTML = '<style id="clip-r5-style">@media(max-height:760px){.screen{color:red}}</style><script>window.demo=true</script>'
    document.body.innerHTML = `<div class="app"><aside class="sidebar"></aside><main class="workspace"><header class="topbar"><button id="notifBtn"><span class="count">3</span></button></header><div id="content"><section class="screen active" id="screen-library"></section><section class="screen" id="screen-${screen}"><button onclick="window.demo=true">选择</button><div id="${screen === 'clip-pool' ? 'clipCandidateRows' : 'clipReportRows'}"></div></section></div></main></div>`
    expect(prepareClipModuleRuntime(document, screen)).toBe('rewritten')
    expect(document.querySelector('.app .sidebar')).not.toBeNull()
    expect(document.querySelector('.topbar')).not.toBeNull()
    expect(document.querySelector('.screen.active')?.id).toBe(`screen-${screen}`)
    expect(document.querySelectorAll('script, [onclick]')).toHaveLength(0)
    expect(document.getElementById('clip-r5-style')?.textContent).toContain('max-height:760px')
    expect(document.querySelector<HTMLElement>('#notifBtn .count')?.hidden).toBe(true)
    expect(prepareClipModuleRuntime(document, screen)).toBe('ready')
  })
  it('uses original state buttons once and leaves their interaction ownership intact', () => {
    const document = window.document.implementation.createHTMLDocument()
    document.body.innerHTML = '<style id="clip-r5-style"></style><div class="app"><aside class="sidebar"></aside><section class="screen" id="screen-clip-pool"><div id="clipCandidateRows"></div><button data-clip-filter="exported"></button></section></div>'
    const click = vi.fn()
    document.querySelector('button')!.addEventListener('click', click)
    expect(prepareClipModuleFixture(document, 'clip-pool', 'filtered')).toBe('ready')
    expect(prepareClipModuleFixture(document, 'clip-pool', 'filtered')).toBe('ready')
    expect(click).toHaveBeenCalledOnce()
  })
})
