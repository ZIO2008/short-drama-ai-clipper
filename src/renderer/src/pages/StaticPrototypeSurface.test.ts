// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import prototypeHtml from '../../../../design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html?raw'
import textAnalysisConnectivityPrototypeHtml from '../../../../design/open-design/v2026-08-05-provider-connectivity-deepseek-candidate/short-drama-material-studio.html?raw'
import asrDefaultConfigurationPrototypeHtml from '../../../../design/open-design/v2026-08-05-asr-default-configuration/short-drama-material-studio.html?raw'
import subtitleRegionCalibrationPrototypeHtml from '../../../../design/open-design/v2026-08-06-subtitle-region-calibration/short-drama-material-studio.html?raw'
import clipMonitorReviewPrototypeHtml from '../../../../design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html?raw'
import { isolatePrototypeScreen, preparePrototypeHead, prototypeSourceForScreen } from './StaticPrototypeSurface.js'

const subtitleSurface = (): Document => {
  const testDocument = document.implementation.createHTMLDocument('subtitle-surface')
  testDocument.head.innerHTML = '<style>#screen-subtitles{display:flex}@media(max-height:760px){#screen-subtitles{padding:0}}</style>'
  testDocument.body.innerHTML = [
    '<section id="screen-subtitles" class="screen active">',
    '<header>字幕资产页头</header>',
    '<section id="subtitleListPanel"><div class="toolbar">按剧集归档</div><div class="table-wrap subtitle-list-scroll">列表</div></section>',
    '</section>',
    '<section id="subtitleRecognitionSettingsModal"><button data-subtitle-method="asr"></button><button data-subtitle-method="ocr"></button><button data-subtitle-method="dual"></button><section data-subtitle-region-setting></section></section>',
    '<section id="subtitleAssetModal" data-three-source-evidence-ready="true"><div id="subtitleDetailAsset"><div class="r5-evidence"><div class="three-source-head">三源对照</div><div class="subtitle-evidence-scroll">证据</div></div></div></section>',
    '<script id="subtitle-three-source-evidence-script"></script>',
    '<div id="toast"></div>'
  ].join('')
  return testDocument
}

const providerSurface = (screenId: string): Document => {
  const testDocument = document.implementation.createHTMLDocument('provider-surface')
  testDocument.head.innerHTML = '<style>.screen{display:none}</style>'
  testDocument.body.innerHTML = [
    '<section id="screen-settings" class="screen"><div id="settings-providers"></div></section>',
    `<section id="${screenId}" class="screen supplier-screen active"><div class="screen-head"></div><div class="supplier-layout"><div class="supplier-main"><div class="supplier-candidate-list"></div></div><aside class="supplier-draft"></aside></div></section>`,
    '<div id="toast"></div>'
  ].join('')
  return testDocument
}

const clipFixtureSurface = (): Document => {
  const testDocument = document.implementation.createHTMLDocument('clip-fixture')
  testDocument.body.innerHTML = [
    '<div class="app"><aside class="sidebar">V49 应用壳</aside><main class="workspace"><div id="content">',
    '<section id="screen-library" class="screen active">剧目库</section>',
    '<section id="screen-clip" class="screen"><div data-od-id="clip-monitor-media"></div><section data-od-id="clip-monitor-transport"><button data-clip-speed-trigger type="button"></button><div id="clipSpeedPopover"></div></section><section data-od-id="clip-review-range"><button data-clip-review="context" aria-pressed="false" type="button"></button></section><section data-od-id="clip-boundary-nudges"></section><div class="episodes">' + Array.from({ length: 6 }, (_, index) => `<button class="r5-episode" type="button">${index + 1}</button>`).join('') + '</div></section>',
    '</div></main></div>'
  ].join('')
  testDocument.querySelector<HTMLButtonElement>('[data-clip-review="context"]')?.addEventListener('click', (event) => { (event.currentTarget as HTMLButtonElement).setAttribute('aria-pressed', 'true') })
  testDocument.querySelector<HTMLButtonElement>('[data-clip-speed-trigger]')?.addEventListener('click', () => testDocument.getElementById('clipSpeedPopover')?.classList.add('is-open'))
  testDocument.querySelectorAll<HTMLButtonElement>('.r5-episode')[5]?.addEventListener('click', () => testDocument.querySelector('[data-od-id="clip-monitor-media"]')?.classList.add('clip-media-missing'))
  return testDocument
}

describe('isolatePrototypeScreen', () => {
  it.each([
    ['default', 'default'],
    ['context-speed', 'context-speed'],
    ['missing', 'missing']
  ] as const)('keeps the complete V49 clip shell for the %s fixture state', (_label, fixtureState) => {
    const testDocument = clipFixtureSurface()

    expect(isolatePrototypeScreen(testDocument, 'clip', 'static-fixture', fixtureState)).toBe('ready')
    expect(testDocument.body.dataset.staticPrototypeFixture).toBe('v49-screen-clip')
    expect(testDocument.querySelector('.app .sidebar')?.textContent).toBe('V49 应用壳')
    expect(testDocument.getElementById('screen-clip')?.classList.contains('active')).toBe(true)
    expect(testDocument.getElementById('screen-library')?.classList.contains('active')).toBe(false)
    expect(testDocument.querySelector('[data-od-id="clip-monitor-media"]')).not.toBeNull()
    expect(testDocument.querySelector('[data-od-id="clip-monitor-transport"]')).not.toBeNull()
    expect(testDocument.querySelector('[data-od-id="clip-review-range"]')).not.toBeNull()
    expect(testDocument.querySelector('[data-od-id="clip-boundary-nudges"]')).not.toBeNull()
    if (fixtureState === 'context-speed') expect(testDocument.getElementById('clipSpeedPopover')?.classList.contains('is-open')).toBe(true)
    if (fixtureState === 'missing') expect(testDocument.querySelector('.clip-media-missing')).not.toBeNull()
  })

  it('keeps the complete V49 application shell when the clip runtime is bound', () => {
    const testDocument = clipFixtureSurface()

    expect(isolatePrototypeScreen(testDocument, 'clip', 'runtime')).toBe('ready')
    expect(testDocument.body.dataset.staticPrototypeRuntime).toBe('v49-screen-clip')
    expect(testDocument.body.dataset.staticPrototypeFixture).toBeUndefined()
    expect(testDocument.querySelector('.app .sidebar')?.textContent).toBe('V49 应用壳')
    expect(testDocument.getElementById('screen-clip')?.classList.contains('active')).toBe(true)
    expect(testDocument.getElementById('screen-library')?.classList.contains('active')).toBe(false)
  })

  it('uses the Version 49 monitor-review prototype only for the clip screen', () => {
    expect(prototypeSourceForScreen('clip')).toBe(clipMonitorReviewPrototypeHtml)
    expect(prototypeSourceForScreen('clip')).toContain('clip-monitor-transport')
    expect(prototypeSourceForScreen('clip')).toContain('data-clip-review')
    expect(prototypeSourceForScreen('clip-pool')).toBe(prototypeHtml)
  })

  it('uses the Open Design subtitle region calibration prototype as the subtitle source', () => {
    expect(subtitleRegionCalibrationPrototypeHtml).toContain('id="subtitle-region-calibration-script"')
    expect(subtitleRegionCalibrationPrototypeHtml).toContain('data-subtitle-region-setting')
    expect(subtitleRegionCalibrationPrototypeHtml).toContain('data-od-id="subtitle-region-smart-generated"')
    expect(subtitleRegionCalibrationPrototypeHtml).toContain('data-od-id="subtitle-region-manual"')
    expect(subtitleRegionCalibrationPrototypeHtml).toContain('data-od-id="subtitle-region-confirm"')
    expect(subtitleRegionCalibrationPrototypeHtml).toContain('应用于本剧全部剧集')
  })

  it('keeps Tencent Cloud ASR credentials as a dedicated two-field prototype state', () => {
    expect(asrDefaultConfigurationPrototypeHtml).toContain('supplier-asr-secret-id')
    expect(asrDefaultConfigurationPrototypeHtml).toContain('supplier-asr-secret-key')
    expect(asrDefaultConfigurationPrototypeHtml).toContain('SecretId')
    expect(asrDefaultConfigurationPrototypeHtml).toContain('SecretKey')
    expect(asrDefaultConfigurationPrototypeHtml).toContain("=== '腾讯云 ASR'")
    expect(asrDefaultConfigurationPrototypeHtml).toContain('provider-asr:vendor-changed')
    expect(asrDefaultConfigurationPrototypeHtml).toContain('id="tencent-asr-credentials-runtime"')
    expect(asrDefaultConfigurationPrototypeHtml).toContain('id="tencent-asr-connectivity-runtime"')
    expect(asrDefaultConfigurationPrototypeHtml).toContain('id="asr-default-configuration-runtime"')
    expect(asrDefaultConfigurationPrototypeHtml).toContain("defaultPanel.dataset.odId = 'asr-current-default'")
    expect(asrDefaultConfigurationPrototypeHtml).toContain("save.dataset.odId = 'save-asr-as-default'")
    expect(asrDefaultConfigurationPrototypeHtml).toContain("testButton.dataset.odId = 'test-current-tencent-asr-configuration'")
    expect(asrDefaultConfigurationPrototypeHtml).toContain("testPanel.dataset.odId = 'tencent-asr-connection-status'")
    expect(asrDefaultConfigurationPrototypeHtml).toContain('[data-asr-generic-secret][hidden]{display:none!important}')
  })

  it('keeps the connectivity controls in the dedicated text-analysis source only', () => {
    expect(prototypeHtml).not.toContain('test-current-text-analysis-configuration')
    expect(textAnalysisConnectivityPrototypeHtml).toContain("defaultPanel.dataset.odId = 'text-analysis-current-default'")
    expect(textAnalysisConnectivityPrototypeHtml).toContain("testButton.dataset.odId = 'test-current-text-analysis-configuration'")
    expect(textAnalysisConnectivityPrototypeHtml).toContain("testPanel.dataset.odId = 'text-analysis-connection-status'")
    expect(textAnalysisConnectivityPrototypeHtml).toContain("save.dataset.odId = 'save-text-analysis-as-default'")
    expect(textAnalysisConnectivityPrototypeHtml).toContain("{name:'DeepSeek API',cost:'pay'")
    expect(textAnalysisConnectivityPrototypeHtml).toContain("endpoint:'https://api.deepseek.com',model:'deepseek-v4-flash'")
    expect(textAnalysisConnectivityPrototypeHtml).toContain("endpoint.value = 'https://api.deepseek.com'; model.value = 'deepseek-v4-flash';")
    expect(textAnalysisConnectivityPrototypeHtml).toContain('>密钥</label><input class="input" id="supplier-${key}-secret"')
    expect(textAnalysisConnectivityPrototypeHtml).not.toContain('>新密钥</label>')
  })

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

  it('waits for the subtitle-region calibration controls before isolating the prototype document', () => {
    const testDocument = subtitleSurface()
    testDocument.querySelector('[data-subtitle-region-setting]')?.remove()

    expect(isolatePrototypeScreen(testDocument, 'subtitles')).toBe('missing')
  })

  it('removes only the outer scroll boundary for text analysis', () => {
    const testDocument = providerSurface('screen-textAnalysis')

    expect(isolatePrototypeScreen(testDocument, 'provider-text-analysis')).toBe('rewritten')

    const layout = testDocument.getElementById('static-prototype-provider-isolation-layout')?.textContent
    expect(layout).toContain('html,body,#content{height:100%;min-height:0;overflow:hidden}')
    expect(layout).toContain('#content>.supplier-screen.active{display:grid;height:100%;min-height:0;grid-template-rows:auto minmax(0,1fr);overflow:hidden}')
    expect(layout).toContain('#toast{pointer-events:none}')
    expect(layout).not.toContain('supplier-candidate-list')
    expect(layout).not.toContain('supplier-draft')
    expect(testDocument.getElementById('static-prototype-settings-isolation-layout')).toBeNull()
  })

  it.each([
    ['provider-asr', 'screen-asr'],
    ['provider-multimodal-review', 'screen-multimodalReview']
  ] as const)('locks the outer scroll boundary for %s', (screen, screenId) => {
    const testDocument = providerSurface(screenId)

    expect(isolatePrototypeScreen(testDocument, screen)).toBe('rewritten')
    expect(testDocument.getElementById('static-prototype-provider-isolation-layout')?.textContent)
      .toBe('html,body,#content{height:100%;min-height:0;overflow:hidden}#content>.screen.active{animation:none!important}')
    expect(testDocument.getElementById('static-prototype-settings-isolation-layout')).toBeNull()
  })

  it('retains the ASR prototype initializer after provider-screen isolation', () => {
    const testDocument = providerSurface('screen-asr')
    const initializer = testDocument.createElement('script')
    initializer.id = 'tencent-asr-credentials-runtime'
    initializer.textContent = 'document.documentElement.dataset.tencentAsrInitializer = "retained"'
    testDocument.body.append(initializer)
    const connectivityInitializer = testDocument.createElement('script')
    connectivityInitializer.id = 'tencent-asr-connectivity-runtime'
    connectivityInitializer.textContent = 'document.documentElement.dataset.tencentAsrConnectivityInitializer = "retained"'
    testDocument.body.append(connectivityInitializer)
    const defaultInitializer = testDocument.createElement('script')
    defaultInitializer.id = 'asr-default-configuration-runtime'
    defaultInitializer.textContent = 'document.documentElement.dataset.asrDefaultConfigurationInitializer = "retained"'
    testDocument.body.append(defaultInitializer)

    expect(isolatePrototypeScreen(testDocument, 'provider-asr')).toBe('rewritten')
    expect(testDocument.getElementById('tencent-asr-credentials-runtime')).not.toBeNull()
    expect(testDocument.getElementById('tencent-asr-connectivity-runtime')).not.toBeNull()
    expect(testDocument.getElementById('asr-default-configuration-runtime')).not.toBeNull()
  })
})
