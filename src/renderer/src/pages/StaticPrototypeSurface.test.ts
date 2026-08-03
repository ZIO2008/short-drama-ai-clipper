// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import prototypeHtml from '../../../../design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html?raw'
import { isolatePrototypeScreen, preparePrototypeHead } from './StaticPrototypeSurface.js'

const subtitleSurface = (): Document => {
  const testDocument = document.implementation.createHTMLDocument('subtitle-surface')
  testDocument.head.innerHTML = '<style>#screen-subtitles{display:flex}@media(max-height:760px){#screen-subtitles{padding:0}}</style>'
  testDocument.body.innerHTML = [
    '<section id="screen-subtitles" class="screen active">',
    '<header>字幕资产页头</header>',
    '<section id="subtitleListPanel"><div class="toolbar">按剧集归档</div><div class="table-wrap subtitle-list-scroll">列表</div></section>',
    '</section>',
    '<section id="subtitleRecognitionSettingsModal"></section>',
    '<div id="toast"></div>'
  ].join('')
  return testDocument
}

describe('isolatePrototypeScreen', () => {
  it('maps the finalized prototype head only for clip iframe screens', () => {
    const originalQueries = prototypeHtml.match(/max-height:760px/g) ?? []
    const remappedPrototype = preparePrototypeHead(prototypeHtml, 'clip')
    const subtitlePrototype = preparePrototypeHead(prototypeHtml, 'subtitles')

    expect(originalQueries).toHaveLength(6)
    expect(remappedPrototype.match(/max-height:704px/g)).toHaveLength(originalQueries.length)
    expect(remappedPrototype).not.toContain('max-height:760px')
    expect(subtitlePrototype).toBe(prototypeHtml)
    expect(subtitlePrototype.match(/max-height:760px/g)).toHaveLength(originalQueries.length)
  })

  it('retains prototype stylesheet nodes injected in the body for clip pool and report screens', () => {
    const testDocument = document.implementation.createHTMLDocument('clip-surface')
    testDocument.head.innerHTML = '<style id="base-style">.screen{display:none}</style>'
    testDocument.body.innerHTML = [
      '<style id="clip-module-board-style">.clip-module-board{display:grid}</style>',
      '<section id="screen-clip" class="screen"></section>',
      '<section id="screen-clip-pool" class="screen clip-r5 active"><div class="clip-module-board">候选池</div></section>',
      '<section id="screen-clip-export" class="screen"></section>',
      '<section id="screen-clip-report" class="screen clip-r5"></section>',
      '<section id="exportModal" aria-hidden="true">导出设置</section>',
      '<section id="packagingModal" aria-hidden="true">包装设置</section>',
      '<div id="toast"></div>',
      '<style id="clip-r5-style">.clip-r5{color:white}@media(max-height:760px){.clip-r5{color:orange}}</style>'
    ].join('')

    expect(isolatePrototypeScreen(testDocument, 'clip-pool')).toBe('rewritten')
    expect(testDocument.getElementById('base-style')).not.toBeNull()
    expect(testDocument.getElementById('clip-r5-style')).not.toBeNull()
    expect(testDocument.getElementById('clip-r5-style')?.textContent).toContain('@media(max-height:704px)')
    expect(testDocument.getElementById('clip-r5-style')?.textContent).not.toContain('@media(max-height:760px)')
    expect(testDocument.getElementById('clip-module-board-style')?.textContent).toContain('display:grid')
    expect(testDocument.getElementById('exportModal')?.textContent).toBe('导出设置')
    expect(testDocument.getElementById('packagingModal')?.textContent).toBe('包装设置')
    expect(testDocument.getElementById('toast')).not.toBeNull()
    const clipIsolationStyle = testDocument.getElementById('static-prototype-clip-isolation-layout')?.textContent
    expect(clipIsolationStyle).toContain('html,body,#content{height:100%;min-height:0;overflow:hidden}')
    expect(clipIsolationStyle).toContain('#content>.screen.active{height:100%;min-height:0;overflow:hidden;animation:none!important}')
    expect(clipIsolationStyle).toContain('#screen-clip .r5-shell{height:calc(100dvh - 216px)}')
    expect(clipIsolationStyle).toContain('#screen-clip-pool .clip-module-board{height:calc(100dvh - 192px)}')
    expect(clipIsolationStyle).toContain('#screen-clip-report .clip-report-board{height:calc(100dvh - 258px)}')
    expect(clipIsolationStyle).toContain('@media(max-height:704px){#screen-clip .r5-shell{height:calc(100dvh - 196px)}')
    expect(clipIsolationStyle).toContain('@media(max-width:680px){#screen-clip-pool .clip-module-board{height:calc(100dvh - 156px)}}')
    expect(clipIsolationStyle).not.toContain('@media(max-height:704px){#screen-clip .r5-shell{height:calc(100dvh - 196px)}#screen-clip-pool')
  })

  it('restores only the subtitle isolation height chain and retains the prototype list scroll contract', () => {
    const testDocument = subtitleSurface()

    expect(isolatePrototypeScreen(testDocument, 'subtitles')).toBe('rewritten')
    expect(testDocument.head.querySelector('style')?.textContent).toContain('@media(max-height:760px)')
    expect(testDocument.getElementById('static-prototype-subtitles-isolation-layout')?.textContent)
      .toBe('html,body,#content{height:100%;min-height:0;overflow:hidden}#content>.screen.active{animation:none!important}')
    expect(testDocument.querySelector('#screen-subtitles header')?.textContent).toBe('字幕资产页头')
    expect(testDocument.querySelector('#subtitleListPanel > .toolbar')?.textContent).toBe('按剧集归档')
    expect(testDocument.querySelector('.subtitle-list-scroll')?.textContent).toBe('列表')
    expect(prototypeHtml).toMatch(/body #screen-subtitles \.subtitle-list-scroll\s*\{\s*flex:1 1 auto;\s*min-height:0;\s*max-height:none;\s*overflow:auto;/)
    expect(prototypeHtml).toMatch(/body #screen-subtitles #subtitleListPanel\s*\{[\s\S]*?overflow:hidden;/)
  })
})
