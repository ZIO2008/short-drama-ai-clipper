import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import prototypeHtml from '../../../../design/open-design/v2026-07-30-open-design-final/short-drama-material-studio.html?raw'

export type StaticPrototypeScreen = 'clip' | 'clip-pool' | 'clip-report' | 'subtitles' | 'settings' | 'provider-asr' | 'provider-text-analysis' | 'provider-multimodal-review'
type Screen = StaticPrototypeScreen
type Props = { screen: Screen; onBack: () => void; onOpenResults?: () => void; onNavigate?: (target: string) => void; onReady?: (document: Document) => void | (() => void); onPrepared?: (screen: Screen) => void }

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

const clipScreenIds = ['screen-clip', 'screen-clip-pool', 'screen-clip-export', 'screen-clip-report', 'exportModal', 'packagingModal', 'toast']
const prototypeTopbarHeight = 56
const prototypeCompactHeight = 760
const isolatedCompactHeight = prototypeCompactHeight - prototypeTopbarHeight

export const remapClipHeightMediaQueries = (source: string): string => (
  source.replaceAll(`max-height:${prototypeCompactHeight}px`, `max-height:${isolatedCompactHeight}px`)
)

export const preparePrototypeHead = (sourceHead: string, screen: Screen): string => (
  screen === 'subtitles' ? sourceHead : remapClipHeightMediaQueries(sourceHead)
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

export const isolatePrototypeScreen = (document: Document, screen: Screen): IsolationState => {
  if (document.body.dataset.staticPrototypeIsolated === 'true') return 'ready'
  // The prototype creates pool/report screens and their `clip-r5-style` stylesheet
  // in separate inline-script turns. Extracting the screen first leaves it with
  // browser default controls, so wait until its original stylesheet exists.
  const requiresClipRuntimeStyle = screen === 'clip-pool' || screen === 'clip-report'
  if (requiresClipRuntimeStyle && !document.getElementById('clip-r5-style')) return 'missing'
  const isProviderScreen = screen === 'provider-asr' || screen === 'provider-text-analysis' || screen === 'provider-multimodal-review'
  const ids = screen === 'subtitles'
    ? [screenIds[screen], 'subtitleAssetModal', 'subtitleRecognitionSettingsModal', 'toast']
    : screen === 'settings' || isProviderScreen
      ? [screenIds[screen], 'toast']
      : clipScreenIds
  const targets = ids.map((id) => document.getElementById(id)).filter((target): target is HTMLElement => target !== null)
  const target = targets.find((item) => item.id === screenIds[screen])
  if (!target || (screen === 'subtitles' && !document.getElementById('subtitleRecognitionSettingsModal')) || ((screen === 'settings' || isProviderScreen) && !document.getElementById('settings-providers'))) return 'missing'
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
  // A clip screen's iframe begins below the host application's 56px top bar.
  // Shift all prototype height media queries into that coordinate system so the
  // original <=760px layout begins at the same outer-window height (<=704px).
  const head = preparePrototypeHead(sourceHead, screen)
  // The original prototype calculates the three clip canvases from the full app
  // viewport, including its 56px top bar. Inside our isolated iframe that bar is
  // outside the document, so its `100dvh` is 56px shorter and leaves a false
  // page-level gap below every clip screen. Keep the prototype geometry and only
  // restore that omitted shell height at the isolation boundary.
  const isolationLayout = screen === 'subtitles'
    ? '<style id="static-prototype-subtitles-isolation-layout">html,body,#content{height:100%;min-height:0;overflow:hidden}#content>.screen.active{animation:none!important}</style>'
    : isProviderScreen || screen === 'settings'
      ? '<style id="static-prototype-settings-isolation-layout">html,body,#content{height:100%;min-height:0;overflow:auto}#content>.screen.active{animation:none!important}</style>'
      : '<style id="static-prototype-clip-isolation-layout">html,body,#content{height:100%;min-height:0;overflow:hidden}#content>.screen.active{height:100%;min-height:0;overflow:hidden;animation:none!important}#screen-clip .r5-shell{height:calc(100dvh - 216px)}#screen-clip .r5-monitor>.r5-frame{height:min(100%,calc(100dvh - 364px))}#screen-clip-pool .clip-module-board{height:calc(100dvh - 192px)}#screen-clip-report .clip-report-board{height:calc(100dvh - 258px)}@media(max-height:704px){#screen-clip .r5-shell{height:calc(100dvh - 196px)}#screen-clip .r5-monitor>.r5-frame{height:min(100%,calc(100dvh - 354px))}}@media(max-width:680px){#screen-clip-pool .clip-module-board{height:calc(100dvh - 156px)}} </style>'
  document.open()
  document.write(`<!doctype html><html lang="zh-CN"><head>${head}${isolationLayout}</head><body data-static-prototype-isolated="true"><main class="content" id="content">${targets.map((item) => item.outerHTML).join('')}</main></body></html>`)
  document.close()
  return 'rewritten'
}

export const StaticPrototypeSurface = ({ screen, onBack, onOpenResults, onNavigate, onReady, onPrepared }: Props): ReactElement => {
  const sourceDocument = useMemo(() => prototypeHtml, [])
  const runtimeCleanup = useRef<(() => void) | null>(null)
  const currentFrame = useRef<HTMLIFrameElement | null>(null)
  const preparationTimer = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const preparationGeneration = useRef(0)
  const activeScreen = useRef(screen)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const cancelPreparation = (): void => {
    preparationGeneration.current += 1
    if (preparationTimer.current !== null) window.clearTimeout(preparationTimer.current)
    preparationTimer.current = null
    currentFrame.current = null
  }
  // This ref is updated during render, before the new iframe can commit. It
  // prevents a previous screen's queued timeout from replacing the new screen
  // in the passive-effect gap of a React transition.
  if (activeScreen.current !== screen) {
    activeScreen.current = screen
    cancelPreparation()
  }
  useLayoutEffect(() => {
    setLoadFailed(false)
    return () => {
      cancelPreparation()
      runtimeCleanup.current?.()
      runtimeCleanup.current = null
    }
  }, [screen, loadAttempt])
  const wireSurface = (document: Document): void => {
    if (document.body.dataset.staticPrototypeWired === 'true') return
    document.body.dataset.staticPrototypeWired = 'true'
    document.addEventListener('click', (click) => {
      const trigger = (click.target as Element).closest<HTMLElement>('[data-open], [data-r5-open]')
      if (!trigger) return
      const target = trigger.dataset.r5Open ?? trigger.dataset.open
      if (!target) return
      if (trigger.textContent?.includes('返回剧目库')) { click.preventDefault(); onBack(); return }
      if (target === 'results' && onOpenResults) { click.preventDefault(); onOpenResults(); return }
      if (onNavigate) { click.preventDefault(); onNavigate(target); return }
      if (target === 'production' || target === 'library') { click.preventDefault(); onBack() }
    })
    runtimeCleanup.current?.()
    runtimeCleanup.current = onReady?.(document) ?? null
  }
  if (loadFailed) return <section className="static-prototype-surface-error" role="alert" aria-live="assertive">
    <div>
      <h1>{titles[screen]}加载失败</h1>
      <p>页面未能在规定时间内完成加载，未显示中间原型页面。</p>
      <button className="btn btn-primary" type="button" onClick={() => { setLoadFailed(false); setLoadAttempt((value) => value + 1) }}>重新加载页面</button>
    </div>
  </section>

  return <iframe
    key={`${screen}:${loadAttempt}`}
    className="static-prototype-surface"
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
        const state = isolatePrototypeScreen(document, screen)
        if (state === 'ready') {
          if (activeScreen.current !== screen || preparationGeneration.current !== generation || currentFrame.current !== frame) return
          wireSurface(document)
          frame.dataset.prototypeReady = 'true'
          onPrepared?.(screen)
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
        runtimeCleanup.current?.()
        runtimeCleanup.current = null
        preparationTimer.current = null
        setLoadFailed(true)
      }
      prepareSurface()
    }}
  />
}
