// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePrototypeNavigation, waitForPrototypeFrame } from './use-prototype-navigation.js'
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); delete document.documentElement.dataset.prototypeTransition })
const fakeTransition = () => {
  let finish = () => undefined as void
  const finished = new Promise<void>(resolve => { finish = resolve })
  const transition: ViewTransition = { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished, skipTransition: vi.fn(finish), types: new Set<string>() }
  return { transition, finish }
}
describe('prototype navigation handoff', () => {
  it('uses the existing direct path if the browser API is unavailable', () => {
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: undefined })
    const { result } = renderHook(usePrototypeNavigation), update = vi.fn()
    act(() => result.current(update)); expect(update).toHaveBeenCalledOnce()
  })
  it('does not apply an obsolete queued target', async () => {
    const callbacks: Array<() => Promise<void>> = [], transitions = [fakeTransition(), fakeTransition()]
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: vi.fn(callback => { callbacks.push(callback); return transitions[callbacks.length - 1]!.transition }) })
    const { result } = renderHook(usePrototypeNavigation), old = vi.fn(), latest = vi.fn()
    act(() => { result.current(old); result.current(latest) })
    await act(async () => { await callbacks[0]!(); await callbacks[1]!() })
    expect(old).not.toHaveBeenCalled(); expect(latest).toHaveBeenCalledOnce()
    expect(transitions[0]!.transition.skipTransition).toHaveBeenCalledOnce()
    await act(async () => { transitions[1]!.finish(); await Promise.resolve() })
    expect(document.documentElement.dataset.prototypeTransition).toBeUndefined()
  })
  it('does not apply a queued update after unmount', async () => {
    let callback = async () => undefined as void
    const { transition } = fakeTransition()
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: vi.fn(next => { callback = next; return transition }) })
    const { result, unmount } = renderHook(usePrototypeNavigation), update = vi.fn()
    act(() => result.current(update)); unmount(); await callback()
    expect(update).not.toHaveBeenCalled(); expect(transition.skipTransition).toHaveBeenCalled()
  })
  it('still navigates if native capture throws before it can start', () => {
    Object.defineProperty(document, 'startViewTransition', { configurable: true, value: vi.fn(() => { throw new Error('capture unavailable') }) })
    const { result } = renderHook(usePrototypeNavigation), update = vi.fn()
    act(() => result.current(update)); expect(update).toHaveBeenCalledOnce()
    expect(document.documentElement.dataset.prototypeTransition).toBeUndefined()
  })
  it('waits for the real frame ready attribute and cancels its observer', async () => {
    const frame = document.createElement('iframe'); document.body.append(frame)
    const waiting = waitForPrototypeFrame(frame), done = vi.fn(); void waiting.ready.then(done)
    await Promise.resolve(); expect(done).not.toHaveBeenCalled()
    frame.dataset.prototypeReady = 'true'; await waiting.ready
    expect(done).toHaveBeenCalledOnce(); frame.remove()
  })
  it('releases a removed frame and a bounded stalled load', async () => {
    vi.useFakeTimers(); const frame = document.createElement('iframe'); document.body.append(frame)
    const removed = waitForPrototypeFrame(frame); frame.remove(); await removed.ready
    const stalled = document.createElement('iframe'); document.body.append(stalled)
    const waiting = waitForPrototypeFrame(stalled); vi.advanceTimersByTime(3600); await waiting.ready; stalled.remove()
  })
})
