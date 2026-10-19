// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginPrototypeDataRead, completePrototypeDataRead, waitForPrototypeData } from './prototype-data-ready.js'
afterEach(() => { vi.useRealTimers() })
describe('initial prototype data readiness', () => {
  it('does not delay unrelated surfaces or static fixtures', () => {
    const doc = document.implementation.createHTMLDocument(), done = vi.fn()
    waitForPrototypeData(doc, done); expect(done).toHaveBeenCalledTimes(1)
  })
  it('waits for a terminal first read and publishes only once', () => {
    const doc = document.implementation.createHTMLDocument(), done = vi.fn()
    beginPrototypeDataRead(doc); waitForPrototypeData(doc, done)
    expect(done).not.toHaveBeenCalled()
    completePrototypeDataRead(doc); completePrototypeDataRead(doc)
    expect(done).toHaveBeenCalledTimes(1)
  })
  it('bounds a slow read without marking the data as loaded', () => {
    vi.useFakeTimers(); const doc = document.implementation.createHTMLDocument(), done = vi.fn()
    beginPrototypeDataRead(doc); waitForPrototypeData(doc, done)
    vi.advanceTimersByTime(249); expect(done).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1); expect(done).toHaveBeenCalledOnce()
    expect(doc.body.dataset.prototypeInitialData).toBe('loading')
    completePrototypeDataRead(doc); expect(done).toHaveBeenCalledOnce()
  })
  it('ignores reads and timeout after the surface is cancelled', () => {
    vi.useFakeTimers(); const doc = document.implementation.createHTMLDocument(), done = vi.fn()
    beginPrototypeDataRead(doc); const cancel = waitForPrototypeData(doc, done); cancel()
    completePrototypeDataRead(doc); vi.runAllTimers(); expect(done).not.toHaveBeenCalled()
  })
})
