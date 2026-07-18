import { describe, expect, it } from 'vitest'
import { planContinuousWindows } from './window-planner.js'
import { preflightWindows } from './preflight-service.js'

describe('preflight service', () => { it('blocks unavailable media before export', async () => { const episodes = [{ episodeNo: 1, durationSeconds: 4, sourcePath: '1.mp4', status: 'missing' }, { episodeNo: 2, durationSeconds: 4, sourcePath: '2.mp4', status: 'ready' }]; const windows = planContinuousWindows(episodes, 2, 'skip'); const result = await preflightWindows(windows, episodes, '.'); expect(result[0]?.ok).toBe(false); expect(result[0]?.checks.media).toBe(false) }) })
