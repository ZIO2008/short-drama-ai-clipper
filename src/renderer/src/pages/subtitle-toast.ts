const toastTimers = new WeakMap<HTMLElement, number>()

export const announceSubtitleToast = (document: Document, message: string, durationMs = 2200): void => {
  const toast = document.getElementById('toast')
  if (!toast) return
  const runtimeWindow = document.defaultView ?? window
  const previousTimer = toastTimers.get(toast)
  if (previousTimer !== undefined) runtimeWindow.clearTimeout(previousTimer)
  // The subtitle surface is isolated in an iframe, so its presentation must be
  // configured on the iframe element rather than through the host stylesheet.
  toast.style.maxWidth = 'min(520px, calc(100vw - 44px))'
  toast.style.maxHeight = '45vh'
  toast.style.overflow = 'auto'
  toast.style.whiteSpace = 'pre-wrap'
  toast.style.lineHeight = '1.5'
  toast.textContent = message
  toast.classList.add('show')
  toastTimers.set(toast, runtimeWindow.setTimeout(() => {
    toast.classList.remove('show')
    toastTimers.delete(toast)
  }, durationMs))
}
