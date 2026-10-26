import { describe, expect, it, vi } from 'vitest'
import { openExternalUrl, parseExternalUrl } from './external-url.js'

describe('external URL security', () => {
  it('only sends a clean official http(s) URL to the system browser', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    await openExternalUrl(openExternal, 'https://developers.openai.com/api/docs/pricing')
    expect(openExternal).toHaveBeenCalledWith('https://developers.openai.com/api/docs/pricing')
  })

  it('rejects non-web protocols and embedded credentials', () => {
    expect(() => parseExternalUrl('file:///C:/Windows/System32')).toThrow()
    expect(() => parseExternalUrl('https://name:secret@example.com/docs')).toThrow()
  })
})
