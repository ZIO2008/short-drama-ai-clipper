// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { announceSubtitleToast } from './subtitle-toast.js'

afterEach(() => { vi.useRealTimers() })

describe('announceSubtitleToast', () => {
  it('lets a later long notice replace and outlive an earlier short notice on the same toast', async () => {
    vi.useFakeTimers()
    const testDocument = document.implementation.createHTMLDocument('subtitle-toast')
    testDocument.body.innerHTML = '<div id="toast"></div>'

    announceSubtitleToast(testDocument, '运行时提示', 2200)
    announceSubtitleToast(testDocument, '导入跳过明细', 8000)
    await vi.advanceTimersByTimeAsync(2201)

    const toast = testDocument.getElementById('toast') as HTMLElement
    expect(toast.textContent).toBe('导入跳过明细')
    expect(toast.classList.contains('show')).toBe(true)
    await vi.advanceTimersByTimeAsync(5800)
    expect(toast.classList.contains('show')).toBe(false)
  })
})
