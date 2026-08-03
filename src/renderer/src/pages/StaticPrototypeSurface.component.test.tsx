// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StaticPrototypeSurface } from './StaticPrototypeSurface.js'

afterEach(() => { cleanup(); vi.useRealTimers() })

const readySubtitleDocument = (): Document => {
  const surface = document.implementation.createHTMLDocument('subtitle-surface')
  surface.head.innerHTML = '<style>#screen-subtitles{display:flex}</style>'
  surface.body.innerHTML = '<section id="screen-subtitles" class="screen active">字幕资产</section><section id="subtitleRecognitionSettingsModal"></section><div id="toast"></div>'
  return surface
}

const setFrameDocument = (frame: HTMLIFrameElement, contentDocument: Document): void => {
  Object.defineProperty(frame, 'contentDocument', { configurable: true, value: contentDocument })
}

describe('StaticPrototypeSurface loading guard', () => {
  it('keeps the iframe marked not-ready and provides a retry action when isolation times out', async () => {
    vi.useFakeTimers()
    const { container } = render(<StaticPrototypeSurface screen="clip" onBack={vi.fn()} />)
    const frame = container.querySelector<HTMLIFrameElement>('iframe.static-prototype-surface')!

    expect(frame.dataset.prototypeReady).toBe('false')
    fireEvent.load(frame)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })

    expect(screen.getByRole('alert').textContent).toContain('原剧切片工作区加载失败')
    fireEvent.click(screen.getByRole('button', { name: '重新加载页面' }))
    expect(container.querySelector('iframe.static-prototype-surface')?.getAttribute('data-prototype-ready')).toBe('false')
  })

  it('does not let a timed-out former screen replace a ready current screen with an error panel', async () => {
    vi.useFakeTimers()
    const { container, rerender } = render(<StaticPrototypeSurface screen="clip" onBack={vi.fn()} />)
    const formerFrame = container.querySelector<HTMLIFrameElement>('iframe.static-prototype-surface')!
    fireEvent.load(formerFrame)

    rerender(<StaticPrototypeSurface screen="subtitles" onBack={vi.fn()} />)
    const currentFrame = container.querySelector<HTMLIFrameElement>('iframe.static-prototype-surface')!
    setFrameDocument(currentFrame, readySubtitleDocument())
    fireEvent.load(currentFrame)
    await act(async () => { await vi.advanceTimersByTimeAsync(20) })
    expect(currentFrame.dataset.prototypeReady).toBe('true')

    await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(container.querySelector('iframe.static-prototype-surface')?.getAttribute('data-prototype-ready')).toBe('true')
  })
})
