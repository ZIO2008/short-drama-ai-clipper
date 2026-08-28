// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StaticPrototypeSurface } from './StaticPrototypeSurface.js'

afterEach(() => { cleanup(); vi.useRealTimers() })

const readySubtitleDocument = (): Document => {
  const surface = document.implementation.createHTMLDocument('subtitle-surface')
  surface.head.innerHTML = '<style>#screen-subtitles{display:flex}</style>'
  surface.body.innerHTML = '<section id="screen-subtitles" class="screen active">字幕资产</section><section id="subtitleRecognitionSettingsModal"></section><div id="toast"></div>'
  surface.body.append(
    ...Array.from({ length: 3 }, (_, index) => {
      const method = surface.createElement('button')
      method.dataset.subtitleMethod = `test-${index}`
      return method
    })
  )
  const regionSetting = surface.createElement('div')
  regionSetting.dataset.subtitleRegionSetting = 'true'
  surface.body.append(regionSetting)
  const subtitleAssetModal = surface.createElement('div')
  subtitleAssetModal.id = 'subtitleAssetModal'
  surface.body.append(subtitleAssetModal)
  surface.body.dataset.staticPrototypeIsolated = 'true'
  return surface
}

const readyClipFixtureDocument = (): Document => {
  const surface = document.implementation.createHTMLDocument('clip-fixture')
  surface.body.innerHTML = [
    '<div class="app"><aside class="sidebar">V49 壳</aside><main class="workspace"><div id="content">',
    '<section id="screen-library" class="screen active">剧目库</section>',
    '<section id="screen-clip" class="screen"><div data-od-id="clip-monitor-media"></div><section data-od-id="clip-monitor-transport"></section><section data-od-id="clip-review-range"></section><section data-od-id="clip-boundary-nudges"></section></section>',
    '</div></main></div>'
  ].join('')
  return surface
}

const setFrameDocument = (frame: HTMLIFrameElement, contentDocument: Document): void => {
  Object.defineProperty(frame, 'contentDocument', { configurable: true, value: contentDocument })
}

describe('StaticPrototypeSurface loading guard', () => {
  it('keeps the V49 clip fixture isolated from the runtime bridge', async () => {
    const onReady = vi.fn()
    const onPrepared = vi.fn()
    const { container } = render(<StaticPrototypeSurface screen="clip" mode="static-fixture" onBack={vi.fn()} onReady={onReady} onPrepared={onPrepared} />)
    const frame = container.querySelector<HTMLIFrameElement>('iframe.static-prototype-surface')!
    const fixture = readyClipFixtureDocument()

    setFrameDocument(frame, fixture)
    fireEvent.load(frame)
    await act(async () => { await Promise.resolve() })

    expect(frame.dataset.prototypeReady).toBe('true')
    expect(fixture.body.dataset.staticPrototypeFixture).toBe('v49-screen-clip')
    expect(fixture.querySelector('.app .sidebar')?.textContent).toBe('V49 壳')
    expect(fixture.getElementById('screen-clip')?.classList.contains('active')).toBe(true)
    expect(fixture.getElementById('screen-library')?.classList.contains('active')).toBe(false)
    expect(onReady).not.toHaveBeenCalled()
    expect(onPrepared).toHaveBeenCalledWith('clip')
  })

  it('marks the V49 clip runtime as a full-shell surface and exposes it to the bridge', async () => {
    const onReady = vi.fn()
    const { container } = render(<StaticPrototypeSurface screen="clip" mode="runtime" onBack={vi.fn()} onReady={onReady} />)
    const frame = container.querySelector<HTMLIFrameElement>('iframe.static-prototype-surface')!
    const runtimeDocument = readyClipFixtureDocument()

    setFrameDocument(frame, runtimeDocument)
    fireEvent.load(frame)
    await act(async () => { await Promise.resolve() })

    expect(frame.dataset.v49RuntimeShell).toBe('true')
    expect(runtimeDocument.body.dataset.staticPrototypeRuntime).toBe('v49-screen-clip')
    expect(runtimeDocument.querySelector('.app .sidebar')?.textContent).toBe('V49 壳')
    expect(onReady).toHaveBeenCalledWith(runtimeDocument)
  })

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
