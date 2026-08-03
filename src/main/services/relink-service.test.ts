import { describe, expect, it } from 'vitest'
import { parseRelinkCandidates } from './relink-service.js'

describe('RelinkService IPC input validation', () => {
  it('accepts only a bounded array of non-empty path strings', () => {
    expect(parseRelinkCandidates(['C:\\media\\episode.mp4', '\\\\server\\share\\episode.mov'])).toEqual([
      'C:\\media\\episode.mp4',
      '\\\\server\\share\\episode.mov'
    ])
  })

  it.each([
    null,
    'C:\\media\\episode.mp4',
    [42],
    ['   '],
    Array.from({ length: 10001 }, () => 'episode.mp4')
  ])('rejects unsafe input %p', (input) => {
    expect(() => parseRelinkCandidates(input)).toThrow()
  })
})
