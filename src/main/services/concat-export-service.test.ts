import { describe, expect, it } from 'vitest'
import { buildEncodingArgs } from './concat-export-service.js'

describe('concat export encoding options', () => {
  const window = { startEpisode: 1, endEpisode: 3, episodeNumbers: [1, 2, 3], durationSeconds: 180, status: 'ready' as const, reason: null }
  it('keeps compatible original quality as stream copy', () => { expect(buildEncodingArgs(window, { qualityMode: 'original', fps: 'source' })).toEqual(['-c', 'copy']) })
  it('applies explicit fps and bitrate', () => { expect(buildEncodingArgs(window, { qualityMode: 'bitrate', bitrateKbps: 2500, fps: 25 })).toEqual(expect.arrayContaining(['-r', '25', '-b:v', '2500k'])) })
  it('calculates a target-size video bitrate', () => { expect(buildEncodingArgs(window, { qualityMode: 'size', targetSizeMb: 100, fps: 'source' })).toEqual(expect.arrayContaining(['-b:v', '4391k'])) })
  it('adds safe title packaging only when enabled', () => { expect(buildEncodingArgs(window, { qualityMode: 'original', fps: 'source', packagingEnabled: true, packagingTitle: '测试剧目' }).join(' ')).toContain('drawtext=text=') })
})
