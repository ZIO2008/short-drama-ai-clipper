import { describe, expect, it } from 'vitest'
import { buildEncodingArgs, escapeDrawtextText } from './concat-export-service.js'

describe('concat export encoding options', () => {
  const window = { startEpisode: 1, endEpisode: 3, episodeNumbers: [1, 2, 3], durationSeconds: 180, status: 'ready' as const, reason: null }
  it('keeps compatible original quality as stream copy', () => { expect(buildEncodingArgs(window, { qualityMode: 'original', fps: 'source' })).toEqual(['-c', 'copy']) })
  it('applies explicit fps and bitrate', () => { expect(buildEncodingArgs(window, { qualityMode: 'bitrate', bitrateKbps: 2500, fps: 25 })).toEqual(expect.arrayContaining(['-r', '25', '-b:v', '2500k'])) })
  it('maps the speed choices to real FFmpeg encoding presets', () => {
    expect(buildEncodingArgs(window, { qualityMode: 'bitrate', bitrateKbps: 2500, encodingPreset: 'fast' })).toEqual(expect.arrayContaining(['-preset', 'veryfast']))
    expect(buildEncodingArgs(window, { qualityMode: 'bitrate', bitrateKbps: 2500, encodingPreset: 'quality' })).toEqual(expect.arrayContaining(['-preset', 'slow']))
  })
  it('calculates a target-size video bitrate', () => { expect(buildEncodingArgs(window, { qualityMode: 'size', targetSizeMb: 100, fps: 'source' })).toEqual(expect.arrayContaining(['-b:v', '4391k'])) })
  it('adds safe title packaging only when enabled', () => { expect(buildEncodingArgs(window, { qualityMode: 'original', fps: 'source', packagingEnabled: true, packagingTitle: '测试剧目' }).join(' ')).toContain('drawtext=text=') })
  it('renders each prompt character on its own line and anchors it to the selected side', () => {
    const left = buildEncodingArgs(window, { qualityMode: 'original', fps: 'source', packagingEnabled: true, packaging: { title: '标题', titlePosition: 'top', prompt: '追剧必看', promptPosition: 'left', badge: 'none' } }).join(' ')
    const right = buildEncodingArgs(window, { qualityMode: 'original', fps: 'source', packagingEnabled: true, packaging: { title: '标题', titlePosition: 'top', prompt: '追剧必看', promptPosition: 'right', badge: 'none' } }).join(' ')
    expect(left).toContain("追\\n剧\\n必\\n看")
    expect(left).toContain('x=w*0.06')
    expect(right).toContain('x=w*0.91-text_w')
  })

  it('persists the selected packaging frame and text style into the FFmpeg filtergraph', () => {
    const args = buildEncodingArgs(window, { qualityMode: 'original', fps: 'source', packagingEnabled: true, packaging: { aspect: 'landscape', preset: 'conflict', title: '标题', titlePosition: 'bottom', prompt: '追剧', promptPosition: 'right', badge: '热播中', titleSize: 'large', titleTone: 'accent', promptStyle: 'outline', overlay: 'strong' } }).join(' ')
    expect(args).toContain('scale=1920:1080:force_original_aspect_ratio=decrease')
    expect(args).toContain('pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black')
    expect(args).toContain('fontsize=38:fontcolor=orange')
    expect(args).toContain('borderw=2:bordercolor=black@0.9')
  })

  it('escapes filtergraph punctuation and line breaks instead of dropping user text', () => {
    const value = "逗号,分号;方括号[片段]\n下一行 100%"
    const escaped = escapeDrawtextText(value)
    expect(escaped).toBe('逗号\\,分号\\;方括号\\[片段\\]\\n下一行 100\\\\%')
    const args = buildEncodingArgs(window, { qualityMode: 'original', fps: 'source', packagingEnabled: true, packaging: { title: value, titlePosition: 'top', prompt: '', promptPosition: 'left', badge: 'none' } })
    expect(args.join(' ')).toContain("text='逗号\\,分号\\;方括号\\[片段\\]\\n下一行 100\\\\%'")
  })
})
