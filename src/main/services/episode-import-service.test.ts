import { describe, expect, it } from 'vitest'
import { buildContinuousWindows, extractEpisodeNumber, findDuplicateEpisodeNumbers, hasContinuousWindow, sortEpisodeCandidates } from './episode-import-service.js'

describe('episode import rules', () => {
  it('recognizes common filenames and natural-sorts episodes', () => {
    expect(extractEpisodeNumber('01（戏后）.mp4')).toBe(1)
    expect(extractEpisodeNumber('episode-10.mp4')).toBe(10)
    expect(extractEpisodeNumber('S01E02.mp4')).toBe(2)
    expect(extractEpisodeNumber('第03集.mp4')).toBe(3)
    expect(extractEpisodeNumber('bonus.mp4')).toBeNull()
    expect(sortEpisodeCandidates(['10.mp4', '02.mp4', '01（戏后）.mp4']).map(({ episodeNo }) => episodeNo)).toEqual([1, 2, 10])
  })

  it('detects duplicate numbers and blocks windows over gaps', () => {
    const candidates = sortEpisodeCandidates(['01.mp4', '02.mp4', '02-copy.mp4', '04.mp4'])
    expect(findDuplicateEpisodeNumbers(candidates)).toEqual([2])
    expect(hasContinuousWindow([1, 2, 4, 5], 1, 3)).toBe(false)
    expect(hasContinuousWindow([1, 2, 4, 5], 4, 2)).toBe(true)
    expect(buildContinuousWindows([1, 2, 4, 5], 3)).toEqual([])
    expect(buildContinuousWindows([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [2, 3, 4]])
  })
})
