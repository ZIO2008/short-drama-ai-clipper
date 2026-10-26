import { useEffect, useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'

type Props = {
  labelledBy: string
  className?: string
  initialFocusSelector?: string
  children: ReactNode
  onClose: () => void
}

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'

export const ModalDialog = ({ labelledBy, className = '', initialFocusSelector, children, onClose }: Props): ReactElement => {
  const dialogRef = useRef<HTMLElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = initialFocusSelector
      ? dialogRef.current?.querySelector<HTMLElement>(initialFocusSelector)
      : dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    return () => { if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus() }
  }, [])

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => { document.removeEventListener('keydown', closeOnEscape, true) }
  }, [onClose])

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    if (focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable.at(-1)!
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return <div className="modal-backdrop"><section ref={dialogRef} className={`modal ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={labelledBy} onKeyDown={handleKeyDown}>{children}</section></div>
}
