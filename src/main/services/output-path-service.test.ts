import { describe, expect, it } from 'vitest'
import { isPathWithin, sanitizePathSegment } from './output-path-service.js'

describe('output path safety', () => {
  it('does not allow user names to introduce path separators or traversal', () => {
    expect(sanitizePathSegment('..\\outside/C:\\escape')).toBe('__outside_C__escape')
    expect(sanitizePathSegment('  ')).toBe('_')
  })

  it('keeps drive-root output directories usable while rejecting siblings', () => {
    expect(isPathWithin('C:\\', 'C:\\短剧')).toBe(true)
    expect(isPathWithin('C:\\output', 'C:\\outside')).toBe(false)
  })
})
