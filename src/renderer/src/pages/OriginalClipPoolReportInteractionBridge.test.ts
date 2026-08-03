// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { bindOriginalClipPoolReportInteractions } from './OriginalClipPoolReportInteractionBridge.js'

const fixture = (): Document => {
  const testDocument = document.implementation.createHTMLDocument('clip-pool-report')
  testDocument.body.innerHTML = `<section id="screen-clip-pool"><div id="clipCandidateEpisodes"></div><h2 id="clipPoolTitle"></h2><span id="clipPoolWindowMeta"></span><button data-clip-filter="all"></button><button data-clip-filter="pending"></button><button data-clip-filter="confirmed"></button><button data-clip-filter="exported"></button><input id="clipCandidateSearch"><div id="clipCandidateRows"></div><button data-clip-export-open>导出</button></section><section id="screen-clip-report"><div id="clipReportEpisodes"></div><h2 id="clipReportTitle"></h2><span id="clipReportMeta"></span><button data-clip-report-filter="all"></button><button data-clip-report-filter="exception"></button><div id="clipReportSummary"></div><div id="clipReportRows"></div><button data-r5-open="clip-report">报告阶段</button></section><section id="exportModal" inert aria-hidden="true"><div class="modal-head"><span class="meta"></span></div><h2 id="exportTitle"></h2><button id="closeExport"></button><button id="cancelExport"></button><button id="saveExport"></button><button id="exportPackageToggle" class="switch on"></button><button id="configurePackagingFromExport"></button><div class="package-summary"></div><button data-quality-mode="original"></button><button data-quality-mode="bitrate"></button><button data-quality-mode="size"></button><div data-quality-field="original"></div><div data-quality-field="bitrate"></div><div data-quality-field="size"></div></section><section id="packagingModal" inert aria-hidden="true"><button id="closePackaging"></button><button id="cancelPackaging"></button><button id="savePackaging"></button><button data-package-aspect="portrait"></button><button data-package-aspect="landscape"></button><select id="packagePreset"><option>剧目默认方案</option></select><input id="packageTitleInput" value="标题"><select id="packageTitlePosition"><option>顶部居中</option><option>底部居中</option></select><input id="packagePromptInput" value="提示"><select id="packagePromptPosition"><option>左侧竖排</option><option>右侧竖排</option></select><select id="packageBadge"><option>热播中</option><option>不显示</option></select><select id="packageTitleSize"><option value="medium">标准</option></select><select id="packageTitleTone"><option value="warm">暖白</option></select><select id="packagePromptStyle"><option value="solid">实底</option></select><select id="packageOverlay"><option value="subtle">轻度</option></select><div id="packageAspectLabel"></div><figure id="packagePreview"></figure><strong id="packagePreviewTitle"></strong><span id="packagePreviewPrompt"></span><span id="packagePreviewBadge"></span></section><div id="toast"></div>`
  return testDocument
}

describe('bindOriginalClipPoolReportInteractions', () => {
  it('filters, searches, switches episodes and windows within the candidate-pool prototype session', () => {
    const testDocument = fixture()
    bindOriginalClipPoolReportInteractions({ document: testDocument })
    expect(testDocument.getElementById('exportPackageToggle')?.getAttribute('aria-pressed')).toBe('true')

    expect(testDocument.querySelectorAll('[data-clip-candidate-episode]').length).toBe(120)
    expect(testDocument.querySelectorAll('.clip-candidate-list-row').length).toBe(20)
    testDocument.querySelector<HTMLButtonElement>('[data-clip-filter="confirmed"]')!.click()
    expect(testDocument.getElementById('clipPoolWindowMeta')?.textContent).toContain('9 个匹配候选')
    testDocument.querySelector<HTMLInputElement>('#clipCandidateSearch')!.value = 'C-03'
    testDocument.querySelector<HTMLInputElement>('#clipCandidateSearch')!.dispatchEvent(new Event('input', { bubbles: true }))
    expect(testDocument.querySelectorAll('.clip-candidate-list-row').length).toBe(1)
    testDocument.querySelector<HTMLButtonElement>('[data-clip-candidate-episode="6"]')!.click()
    expect(testDocument.getElementById('clipCandidateRows')?.textContent).toContain('源媒体缺失')
  })

  it('handles controls whose event targets come from an iframe document realm', () => {
    const frame = document.createElement('iframe')
    document.body.append(frame)
    const frameDocument = frame.contentDocument
    expect(frameDocument).not.toBeNull()
    frameDocument!.body.innerHTML = fixture().body.innerHTML
    bindOriginalClipPoolReportInteractions({ document: frameDocument! })

    frameDocument!.querySelector<HTMLButtonElement>('[data-clip-candidate-episode="2"]')!.click()
    expect(frameDocument!.getElementById('clipPoolTitle')?.textContent).toBe('第 02 集候选')

    frameDocument!.querySelector<HTMLButtonElement>('[data-clip-filter="confirmed"]')!.click()
    expect(frameDocument!.getElementById('clipPoolWindowMeta')?.textContent).toContain('9 个匹配候选')
    frame.remove()
  })

  it('renders report exceptions, selects result rows and preserves row actions', () => {
    const testDocument = fixture()
    bindOriginalClipPoolReportInteractions({ document: testDocument })

    testDocument.querySelector<HTMLButtonElement>('[data-clip-report-filter="exception"]')!.click()
    expect(testDocument.querySelectorAll('.clip-report-list-row').length).toBe(1)
    const row = testDocument.querySelector<HTMLElement>('.clip-report-list-row')!
    row.click()
    expect(row.classList.contains('is-selected')).toBe(true)
    expect(row.querySelector('button')?.getAttribute('data-r5-open')).toBe('clip')
    testDocument.querySelector<HTMLButtonElement>('[data-clip-report-episode="6"]')!.click()
    expect(testDocument.getElementById('clipReportMeta')?.textContent).toContain('源媒体缺失')
    expect(testDocument.querySelector('.clip-report-list-row button')?.getAttribute('data-r5-open')).toBe('assets')
  })

  it('opens, configures and closes the source export and packaging dialogs without calling a service', () => {
    const testDocument = fixture()
    bindOriginalClipPoolReportInteractions({ document: testDocument })
    let reportTransition = 0
    testDocument.querySelector('[data-r5-open="clip-report"]')?.addEventListener('click', () => { reportTransition += 1 })

    testDocument.querySelector<HTMLButtonElement>('[data-clip-export-open]')!.click()
    expect(testDocument.getElementById('exportModal')?.classList.contains('open')).toBe(true)
    expect(testDocument.getElementById('saveExport')?.textContent).toBe('开始导出 500 项')
    testDocument.querySelector<HTMLButtonElement>('[data-quality-mode="bitrate"]')!.click()
    expect(testDocument.querySelector('[data-quality-field="original"]')?.hasAttribute('hidden')).toBe(true)
    expect(testDocument.querySelector('[data-quality-field="bitrate"]')?.hasAttribute('hidden')).toBe(false)
    testDocument.querySelector<HTMLButtonElement>('#cancelExport')!.click()
    expect(testDocument.getElementById('exportModal')?.classList.contains('open')).toBe(false)
    testDocument.querySelector<HTMLButtonElement>('#configurePackagingFromExport')!.click()
    expect(testDocument.getElementById('packagingModal')?.classList.contains('open')).toBe(true)
    testDocument.querySelector<HTMLButtonElement>('[data-package-aspect="landscape"]')!.click()
    expect(testDocument.getElementById('packagePreview')?.dataset.aspect).toBe('landscape')
    expect(testDocument.getElementById('packageAspectLabel')?.textContent).toContain('横屏 16:9')
    const title = testDocument.querySelector<HTMLInputElement>('#packageTitleInput')!
    title.value = '新的包装标题'
    title.dispatchEvent(new Event('input', { bubbles: true }))
    expect(testDocument.getElementById('packagePreviewTitle')?.textContent).toBe('新的包装标题')
    testDocument.querySelector<HTMLButtonElement>('#savePackaging')!.click()
    expect(testDocument.querySelector('#exportModal .package-summary')?.textContent).toContain('横屏 16:9')
    expect(testDocument.querySelector('#exportModal .package-summary')?.textContent).toContain('标准')
    testDocument.querySelector<HTMLButtonElement>('#exportPackageToggle')!.click()
    expect(testDocument.getElementById('exportPackageToggle')?.classList.contains('on')).toBe(false)
    testDocument.querySelector<HTMLButtonElement>('#saveExport')!.click()
    expect(reportTransition).toBe(1)
    testDocument.querySelector<HTMLButtonElement>('#configurePackagingFromExport')!.click()
    expect(testDocument.getElementById('packagingModal')?.classList.contains('open')).toBe(true)
    testDocument.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(testDocument.getElementById('packagingModal')?.classList.contains('open')).toBe(false)
  })
})
