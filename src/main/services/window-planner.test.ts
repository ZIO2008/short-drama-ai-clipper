import { describe, expect, it } from 'vitest'
import { planContinuousWindows } from './window-planner.js'

describe('window planner', () => {
  const episodes = [1, 2, 3, 4, 5, 6].map((episodeNo) => ({ episodeNo, durationSeconds: 10, sourcePath: `${episodeNo}.mp4`, status: 'ready' }))
  it('plans 1-3, 2-4, 3-5, 4-6 for group size 3', () => { expect(planContinuousWindows(episodes, 3, 'skip').map((window) => [window.startEpisode, window.endEpisode])).toEqual([[1, 3], [2, 4], [3, 5], [4, 6]]) })
  it('blocks windows crossing a missing episode', () => { expect(planContinuousWindows(episodes.filter(({ episodeNo }) => episodeNo !== 3), 3, 'return').some((window) => window.status === 'blocked')).toBe(true) })
})
