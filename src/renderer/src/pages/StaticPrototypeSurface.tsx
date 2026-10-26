import { prepareClipModuleFixture, prepareClipModuleRuntime, type ClipModuleFixtureState } from './clip-module-prototype-host.js'
import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { bindPrototypeGlobalNavigation } from '../navigation.js'
import { waitForPrototypeData } from './prototype-data-ready.js'
import { bindPrototypeLocalNavigation } from './prototype-local-navigation.js'
import prototypeHtml from '../../../../design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html?raw'
import clipMonitorReviewPrototypeHtml from '../../../../design/open-design/v2026-08-11-v49-clip-monitor-review/short-drama-material-studio-v49-clip-review.html?raw'
import textAnalysisConnectivityPrototypeHtml from '../../../../design/open-design/v2026-08-05-model-studio-connectivity/short-drama-material-studio.html?raw'
import asrDefaultConfigurationPrototypeHtml from '../../../../design/open-design/v2026-08-05-asr-default-configuration/short-drama-material-studio.html?raw'
import subtitleRegionCalibrationPrototypeHtml from '../../../../design/open-design/v2026-08-06-subtitle-region-calibration/short-drama-material-studio.html?raw'

export type StaticPrototypeScreen = 'clip' | 'clip-pool' | 'clip-report' | 'subtitles' | 'settings' | 'provider-asr' | 'provider-text-analysis' | 'provider-multimodal-review'
type Screen = StaticPrototypeScreen
export type StaticPrototypeSurfaceMode = 'runtime' | 'static-fixture'
export type ClipStaticFixtureState = ClipModuleFixtureState | 'context-speed'
type Props = { screen: Screen; mode?: StaticPrototypeSurfaceMode; fixtureState?: ClipStaticFixtureState; onBack: () => void; onOpenResults?: () => void; onNavigate?: (target: string) => void; onReady?: (document: Document) => void | (() => void); onPrepared?: (screen: Screen) => void }

const screenIds: Record<Screen, string> = {
  clip: 'screen-clip',
  'clip-pool': 'screen-clip-pool',
  'clip-report': 'screen-clip-report',
  subtitles: 'screen-subtitles',
  settings: 'screen-settings',
  'provider-asr': 'screen-asr',
  'provider-text-analysis': 'screen-textAnalysis',
  'provider-multimodal-review': 'screen-multimodalReview'
}

const prototypeTopbarHeight = 56
const prototypeCompactHeight = 760
const isolatedCompactHeight = prototypeCompactHeight - prototypeTopbarHeight

export const remapClipHeightMediaQueries = (source: string): string => (
  source.replaceAll(`max-height:${prototypeCompactHeight}px`, `max-height:${isolatedCompactHeight}px`)
)

export const preparePrototypeHead = (sourceHead: string, screen: Screen): string => (
  screen === 'subtitles' ? sourceHead : remapClipHeightMediaQueries(sourceHead)
)

export const prototypeSourceForScreen = (screen: Screen, mode: StaticPrototypeSurfaceMode = 'runtime'): string => (
  screen === 'clip' || screen === 'clip-pool' || screen === 'clip-report' ? clipMonitorReviewPrototypeHtml
    : screen === 'subtitles' ? subtitleRegionCalibrationPrototypeHtml
    : screen === 'provider-asr' ? asrDefaultConfigurationPrototypeHtml
    : screen === 'provider-text-analysis' || screen === 'provider-multimodal-review' ? textAnalysisConnectivityPrototypeHtml
      : prototypeHtml
)

const titles: Record<Screen, string> = {
  clip: '原剧切片工作区',
  'clip-pool': '原剧切片候选池',
  'clip-report': '原剧切片完成报告',
  subtitles: '字幕资产',
  settings: '设置',
  'provider-asr': 'ASR 字幕识别',
  'provider-text-analysis': '文本语义分析',
  'provider-multimodal-review': '视频理解复核'
}

type IsolationState = 'ready' | 'missing' | 'rewritten'
const applyClipFixtureState = (document: Document, state: ClipStaticFixtureState): boolean => {
  if (state === 'default') return true
  if (state === 'context-speed') {
    const context = document.querySelector<HTMLButtonElement>('[data-clip-review="context"]')
    const speed = document.querySelector<HTMLButtonElement>('[data-clip-speed-trigger]')
    if (!context || !speed) return false
    context.click()
    speed.click()
    return context.getAttribute('aria-pressed') === 'true' && document.getElementById('clipSpeedPopover')?.classList.contains('is-open') === true
  }
  const missingEpisode = document.querySelectorAll<HTMLButtonElement>('#screen-clip .r5-episode')[5]
  if (!missingEpisode) return false
  missingEpisode.click()
  return document.querySelector('.clip-media-missing') !== null
}

export const isolatePrototypeScreen = (document: Document, screen: Screen, mode: StaticPrototypeSurfaceMode = 'runtime', fixtureState: ClipStaticFixtureState = 'default'): IsolationState => {
  if (mode === 'static-fixture' && (screen === 'clip-pool' || screen === 'clip-report')) return prepareClipModuleFixture(document, screen, fixtureState === 'context-speed' ? 'default' : fixtureState)
  if (screen === 'clip-pool' || screen === 'clip-report') return prepareClipModuleRuntime(document, screen)
  if (screen === 'clip') {
    const target = document.getElementById(screenIds[screen])
    if (!target || !document.querySelector('[data-od-id="clip-monitor-media"]') || !document.querySelector('[data-od-id="clip-monitor-transport"]') || !document.querySelector('[data-od-id="clip-review-range"]') || !document.querySelector('[data-od-id="clip-boundary-nudges"]')) return 'missing'
    document.querySelectorAll<HTMLElement>('.screen').forEach((item) => {
      const active = item === target
      item.classList.toggle('active', active)
      item.setAttribute('aria-hidden', String(!active))
    })
    document.body.dataset.staticPrototypeIsolated = 'true'
    if (mode === 'static-fixture') {
      document.body.dataset.staticPrototypeFixture = 'v49-screen-clip'
      return applyClipFixtureState(document, fixtureState) ? 'ready' : 'missing'
    }
    document.body.dataset.staticPrototypeRuntime = 'v49-screen-clip'
    return 'ready'
  }
  if (document.body.dataset.staticPrototypeIsolated === 'true') {
    const subtitleModal = document.getElementById('subtitleAssetModal')
    if (screen === 'subtitles' && (!subtitleModal || !document.querySelector('[data-subtitle-region-setting]'))) return 'missing'
    return 'ready'
  }
  if (screen === 'subtitles') {
    if (document.querySelectorAll('[data-subtitle-method]').length !== 3 || !document.querySelector('[data-subtitle-region-setting]')) return 'missing'
  }
  const isProviderScreen = screen === 'provider-asr' || screen === 'provider-text-analysis' || screen === 'provider-multimodal-review'
  const ids = screen === 'subtitles'
    ? [screenIds[screen], 'subtitleAssetModal', 'subtitleRecognitionSettingsModal', 'toast']
    : screen === 'settings' || isProviderScreen
      ? [screenIds[screen], 'toast']
      : [screenIds[screen], 'toast']
  const targets = ids.map((id) => document.getElementById(id)).filter((target): target is HTMLElement => target !== null)
  const target = targets.find((item) => item.id === screenIds[screen])
  const subtitleModalReady = screen !== 'subtitles' || (
    document.getElementById('subtitleRecognitionSettingsModal') !== null &&
    document.getElementById('subtitleAssetModal') !== null
  )
  if (!target || !subtitleModalReady || ((screen === 'settings' || isProviderScreen) && !document.getElementById('settings-providers'))) return 'missing'
  targets.forEach((item) => {
    if (!item.classList.contains('screen')) return
    const active = item === target
    item.classList.toggle('active', active)
    item.setAttribute('aria-hidden', String(!active))
  })
  // The finalized Open Design prototype keeps additional clip pool/report rules in
  // body-level style nodes that are injected after the base head stylesheet.
  // Preserve every prototype style node when extracting a screen; otherwise these
  // pages fall back to browser-default buttons and table layout.
  const sourceHead = [
    ...document.head.querySelectorAll('meta'),
    ...document.querySelectorAll('style')
  ].map((node) => node.outerHTML).join('')
  const head = preparePrototypeHead(sourceHead, screen)
  // Extracting a provider screen replaces its document and discards the
  // source listeners. Keep the ASR prototype's own initializer so its
  // credential state is rebound before the runtime Bridge pre-fills values.
  const providerRuntimeScript = screen === 'provider-asr'
    ? ['tencent-asr-credentials-runtime', 'tencent-asr-connectivity-runtime', 'asr-default-configuration-runtime'].map((id) => document.getElementById(id)?.outerHTML ?? '').join('')
    : ''
  const isolationLayout = screen === 'subtitles'
    ? '<style id="static-prototype-subtitles-isolation-layout">html,body,#content{height:100%;min-height:0;overflow:hidden}#content>.screen.active{animation:none!important}</style>'
    : screen === 'provider-text-analysis'
      ? '<style id="static-prototype-provider-isolation-layout">html,body,#content{height:100%;min-height:0;overflow:hidden}#content>.supplier-screen.active{display:grid;height:100%;min-height:0;grid-template-rows:auto minmax(0,1fr);overflow:hidden}#content>.supplier-screen.active>.supplier-layout{min-height:0;overflow:hidden}#content>.supplier-screen.active .supplier-main{min-height:0}#toast{pointer-events:none}</style>'
    : isProviderScreen
      ? '<style id="static-prototype-provider-isolation-layout">html,body,#content{height:100%;min-height:0;overflow:hidden}#content>.screen.active{animation:none!important}</style>'
      : screen === 'settings'
      ? '<style id="static-prototype-settings-isolation-layout">html,body,#content{height:100%;min-height:0;overflow:auto}#content>.screen.active{animation:none!important}</style>'
      : '<style id="static-prototype-clip-isolation-layout">html,body,#content{height:100%;min-height:0;overflow:hidden}#content>.screen.active{height:100%;min-height:0;overflow:hidden;animation:none!important}#screen-clip .r5-shell{height:calc(100dvh - 216px)}#screen-clip .r5-monitor>.r5-frame{height:min(100%,calc(100dvh - 364px))}#screen-clip-pool .clip-module-board{height:calc(100dvh - 192px)}#screen-clip-report .clip-report-board{height:calc(100dvh - 258px)}@media(max-height:704px){#screen-clip .r5-shell{height:calc(100dvh - 196px)}#screen-clip .r5-monitor>.r5-frame{height:min(100%,calc(100dvh - 354px))}}@media(max-width:680px){#screen-clip-pool .clip-module-board{height:calc(100dvh - 156px)}} </style>'
  if (screen === 'subtitles') {
    const content = document.createElement('main')
    content.className = 'content'
    content.id = 'content'
    const subtitleModal = document.getElementById('subtitleAssetModal')
    const settingsModal = document.getElementById('subtitleRecognitionSettingsModal')
    targets.filter((item) => item !== subtitleModal && item !== settingsModal).forEach((item) => content.append(item))

    document.body.replaceChildren(content, ...(subtitleModal ? [subtitleModal] : []), ...(settingsModal ? [settingsModal] : []))
    document.body.dataset.staticPrototypeIsolated = 'true'
    const isolationDocument = new DOMParser().parseFromString(isolationLayout, 'text/html')
    isolationDocument.head.querySelectorAll('style').forEach((style) => document.head.append(document.importNode(style, true)))
    return 'rewritten'
  }
  const isolatedTargets = targets.map((item) => item.outerHTML).join('')
  document.open()
  document.write(`<!doctype html><html lang="zh-CN"><head>${head}${isolationLayout}</head><body data-static-prototype-isolated="true"><main class="content" id="content">${isolatedTargets}${providerRuntimeScript}</main></body></html>`)
  document.close()
  return 'rewritten'
}

export const StaticPrototypeSurface = ({ screen, mode = 'runtime', fixtureState = 'default', onBack, onOpenResults, onNavigate, onReady, onPrepared }: Props): ReactElement => {
  // Each provider-screen source is isolated so a provider-specific prototype
  // change cannot alter the other settings surfaces.
  const sourceDocument = useMemo(() => prototypeSourceForScreen(screen, mode), [screen, mode])
  const runtimeCleanup = useRef<(() => void) | null>(null)
  const currentFrame = useRef<HTMLIFrameElement | null>(null)
  const preparationTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const preparationGeneration = useRef(0)
  const cancelDataWait = useRef<(() => void) | null>(null)
  const initialDeadline = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeScreen = useRef(screen)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const cancelPreparation = (): void => {
    cancelDataWait.current?.(); cancelDataWait.current = null
    preparationGeneration.current += 1
    if (preparationTimer.current !== null) window.clearTimeout(preparationTimer.current)
    preparationTimer.current = null
    currentFrame.current = null
  }
  const clearDeadline = (): void => { if (initialDeadline.current !== null) clearTimeout(initialDeadline.current); initialDeadline.current = null }
  const failPreparation = (): void => { clearDeadline(); cancelPreparation(); runtimeCleanup.current?.(); runtimeCleanup.current = null; setLoadFailed(true) }
  // This ref is updated during render, before the new iframe can commit. It
  // prevents a previous screen's queued timeout from replacing the new screen
  // in the passive-effect gap of a React transition.
  if (activeScreen.current !== screen) {
    activeScreen.current = screen
    cancelPreparation()
  }
  useLayoutEffect(() => {
    setLoadFailed(false)
    if (mode === 'runtime' && ['clip', 'clip-pool', 'clip-report', 'subtitles'].includes(screen)) initialDeadline.current = setTimeout(failPreparation, 3000)
    return () => {
      clearDeadline()
      cancelPreparation()
      runtimeCleanup.current?.()
      runtimeCleanup.current = null
    }
  }, [screen, mode, fixtureState, loadAttempt])
  const wireSurface = (document: Document): void => {
    if (document.body.dataset.staticPrototypeWired === 'true') return
    document.body.dataset.staticPrototypeWired = 'true'
    const disposeNavigation = mode === 'runtime' ? bindPrototypeGlobalNavigation(document) : () => undefined
    document.addEventListener('click', (click) => {
      const trigger = (click.target as Element).closest<HTMLElement>('[data-subtitle-open-static]')
      if (!trigger) return
      const modal = document.getElementById('subtitleAssetModal')
      if (!modal) return
      click.preventDefault()
      click.stopImmediatePropagation()
      const kind = trigger.dataset.subtitleOpenStatic === 'view' ? 'view' : 'status'
      document.getElementById('subtitleDetailAsset')?.toggleAttribute('hidden', kind !== 'view')
      document.getElementById('subtitleDetailEmpty')?.toggleAttribute('hidden', kind === 'view')
      modal.classList.add('open')
      modal.setAttribute('aria-hidden', 'false')
      document.dispatchEvent(new CustomEvent('subtitle-static-detail:opened', {
        detail: { episodeId: trigger.dataset.subtitleStaticEpisodeId ?? '', kind }
      }))
    }, true)
    const disposeLocalNavigation = bindPrototypeLocalNavigation(document, { onBack, onOpenResults, onNavigate }, mode === 'runtime')
    runtimeCleanup.current?.()
    const disposeRuntime = mode === 'runtime' ? onReady?.(document) : null
    runtimeCleanup.current = () => { disposeLocalNavigation(); disposeNavigation(); disposeRuntime?.() }
  }
  if (loadFailed) return <section className="static-prototype-surface-error" role="alert" aria-live="assertive">
    <div>
      <h1>{titles[screen]}加载失败</h1>
      <p>页面未能在规定时间内完成加载，未显示中间原型页面。</p>
      <button className="btn btn-primary" type="button" onClick={() => { setLoadFailed(false); setLoadAttempt((value) => value + 1) }}>重新加载页面</button>
    </div>
  </section>

  return <iframe
    key={`${screen}:${mode}:${fixtureState}:${loadAttempt}`}
    className="static-prototype-surface"
    data-v49-runtime-shell={(screen === 'clip' || screen === 'clip-pool' || screen === 'clip-report') && mode === 'runtime' ? 'true' : undefined}
    data-prototype-ready="false"
    title={titles[screen]}
    srcDoc={sourceDocument}
    onLoad={(event) => {
      const frame = event.currentTarget
      // `srcDoc` first loads the complete Open Design document, then
      // `isolatePrototypeScreen` rewrites it to the requested screen.  Never
      // expose that intermediate full document during a workspace switch.
      frame.dataset.prototypeReady = 'false'
      cancelPreparation()
      const generation = preparationGeneration.current
      currentFrame.current = frame
      let attempts = 0
      const prepareSurface = (): void => {
        if (activeScreen.current !== screen || preparationGeneration.current !== generation || currentFrame.current !== frame) return
        const document = frame.contentDocument
        if (!document) return
        const state = isolatePrototypeScreen(document, screen, mode, fixtureState)
        if (state === 'ready') {
          if (activeScreen.current !== screen || preparationGeneration.current !== generation || currentFrame.current !== frame) return
          wireSurface(document)
          cancelDataWait.current = waitForPrototypeData(document, () => {
            if (activeScreen.current !== screen || preparationGeneration.current !== generation || currentFrame.current !== frame) return
            clearDeadline()
            frame.dataset.prototypeReady = 'true'; onPrepared?.(screen)
          })
          preparationTimer.current = null
          return
        }
        // `screen-subtitles` is created by the prototype's own final inline script.
        // A document rewrite also produces a new iframe document, so re-read it on
        // every turn instead of assuming one zero-delay callback is sufficient.
        if (attempts < 60) {
          attempts += 1
          preparationTimer.current = window.setTimeout(prepareSurface, 16)
          return
        }
        if (activeScreen.current !== screen || preparationGeneration.current !== generation || currentFrame.current !== frame) return
        failPreparation()
      }
      prepareSurface()
    }}
  />
}
