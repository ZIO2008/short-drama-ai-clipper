import { useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'

/** Wait for the mounted frame or real failure panel, with a hard cancellation deadline. */
export const waitForPrototypeFrame = (frame: HTMLIFrameElement | null): { ready: Promise<void>; cancel: () => void } => {
  if (!frame) return { ready: Promise.resolve(), cancel: () => undefined }
  let finish: () => void = () => undefined
  const ready = new Promise<void>(resolve => {
    const observer = new MutationObserver(() => check())
    const timer = setTimeout(() => finish(), 3600)
    finish = () => { observer.disconnect(); clearTimeout(timer); resolve() }
    const check = (): void => { if (!frame.isConnected || frame.dataset.prototypeReady === 'true') finish() }
    observer.observe(frame.ownerDocument.documentElement, { attributes: true, attributeFilter: ['data-prototype-ready'], childList: true, subtree: true })
    check()
  })
  return { ready, cancel: () => finish() }
}

export const usePrototypeNavigation = (): ((update: () => void) => void) => {
  const generation = useRef(0), transition = useRef<ViewTransition | null>(null), cancelWait = useRef<(() => void) | null>(null)
  useEffect(() => () => { generation.current++; cancelWait.current?.(); transition.current?.skipTransition(); delete document.documentElement.dataset.prototypeTransition }, [])
  return update => {
    const id = ++generation.current
    cancelWait.current?.(); transition.current?.skipTransition()
    if (typeof document.startViewTransition !== 'function') { update(); return }
    document.documentElement.dataset.prototypeTransition = 'true'
    let current: ViewTransition
    try { current = document.startViewTransition(async () => {
      if (id !== generation.current) return
      flushSync(update)
      const waiting = waitForPrototypeFrame(document.querySelector<HTMLIFrameElement>('iframe.static-prototype-surface'))
      cancelWait.current = waiting.cancel
      await waiting.ready
    }) } catch { delete document.documentElement.dataset.prototypeTransition; update(); return }
    transition.current = current
    void current.ready.catch(() => undefined)
    void current.updateCallbackDone.catch(() => undefined)
    void current.finished.catch(() => undefined).finally(() => {
      if (id !== generation.current) return
      transition.current = null; cancelWait.current = null
      delete document.documentElement.dataset.prototypeTransition
    })
  }
}
