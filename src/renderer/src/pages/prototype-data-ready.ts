const DATA_READY_EVENT = 'shortdrama:prototype-initial-data-ready'

export const beginPrototypeDataRead = (document: Document): void => { document.body.dataset.prototypeInitialData = 'loading' }
export const completePrototypeDataRead = (document: Document): void => {
  if (document.body.dataset.prototypeInitialData === 'ready') return
  document.body.dataset.prototypeInitialData = 'ready'
  document.dispatchEvent(new Event(DATA_READY_EVENT))
}

/** Bound only the initial read; subsequent background refreshes never hide the surface. */
export const waitForPrototypeData = (document: Document, done: () => void): (() => void) => {
  if (document.body.dataset.prototypeInitialData !== 'loading') { done(); return () => undefined }
  let timer: ReturnType<typeof setTimeout> | undefined, finished = false
  const dispose = (): void => { document.removeEventListener(DATA_READY_EVENT, finish); if (timer !== undefined) clearTimeout(timer) }
  const finish = (): void => { if (finished) return; finished = true; dispose(); done() }
  document.addEventListener(DATA_READY_EVENT, finish)
  timer = setTimeout(finish, 250)
  return () => { finished = true; dispose() }
}
