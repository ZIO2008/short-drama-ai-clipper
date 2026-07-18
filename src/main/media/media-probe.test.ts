import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import ffmpegModule from 'ffmpeg-static'
import { path as ffprobePath } from 'ffprobe-static'
import { runMediaProcess } from './ffmpeg-runner.js'
import { assertReadable, parseFrameRate, parseProbePayload, probeMedia } from './media-probe.js'

const ffmpegPath = typeof ffmpegModule === 'string'
  ? ffmpegModule
  : (ffmpegModule as unknown as { default?: string }).default ?? null

describe('media probe', () => {
  it('maps ffprobe streams into the stable media contract', async () => {
    const result = await parseProbePayload('episode-01.mp4', {
      format: { duration: '123.45', format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
      streams: [
        { codec_type: 'video', codec_name: 'h264', width: 1080, height: 1920, r_frame_rate: '25/1' },
        { codec_type: 'audio', codec_name: 'aac' }
      ]
    })
    expect(result).toMatchObject({ durationSeconds: 123.45, fps: 25, videoCodec: 'h264', audioCodec: 'aac', width: 1080, height: 1920 })
  })

  it('rejects payloads without a video stream', async () => {
    await expect(parseProbePayload('audio.mp3', { streams: [] })).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
  })

  it('distinguishes missing files before invoking ffprobe', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'short-drama-probe-'))
    try {
      await writeFile(join(folder, 'placeholder.txt'), 'isolated test data', 'utf8')
      await expect(probeMedia(join(folder, 'missing.mp4'), process.execPath)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('probes a real isolated MP4 with ffmpeg and ffprobe', async () => {
    if (!ffmpegPath || !existsSync(ffmpegPath) || !existsSync(ffprobePath)) throw new Error('static media tools are unavailable')
    const folder = await mkdtemp(join(tmpdir(), 'short-drama-real-probe-'))
    const videoPath = join(folder, 'clip.mp4')
    try {
      const generated = await runMediaProcess(ffmpegPath, [
        '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=1', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1',
        '-shortest', '-c:v', 'mpeg4', '-c:a', 'aac', videoPath
      ])
      expect(generated.exitCode).toBe(0)
      const result = await probeMedia(videoPath, ffprobePath)
      expect(result.readable).toBe(true)
      expect(result.durationSeconds).toBeGreaterThan(0)
      expect(result.fps).toBeGreaterThan(0)
      expect(result.videoCodec).toBe('mpeg4')
      expect(result.audioCodec).toBe('aac')
      expect(result.width).toBe(320)
      expect(result.height).toBe(240)
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('maps malformed media to UNSUPPORTED_FORMAT', async () => {
    if (!existsSync(ffprobePath)) throw new Error('static ffprobe is unavailable')
    const folder = await mkdtemp(join(tmpdir(), 'short-drama-invalid-probe-'))
    const videoPath = join(folder, 'fake.mp4')
    try {
      await writeFile(videoPath, 'not an mp4', 'utf8')
      await expect(probeMedia(videoPath, ffprobePath)).rejects.toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('maps an unreadable file check to NOT_READABLE', async () => {
    const deniedAccess = async (): Promise<void> => { throw Object.assign(new Error('denied'), { code: 'EACCES' }) }
    await expect(assertReadable('blocked.mp4', deniedAccess)).rejects.toMatchObject({ code: 'NOT_READABLE' })
  })

  it('reports FFMPEG_UNAVAILABLE when ffprobe cannot be resolved', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'short-drama-missing-tool-'))
    const videoPath = join(folder, 'clip.mp4')
    try {
      await writeFile(videoPath, 'placeholder', 'utf8')
      vi.stubEnv('PATH', '')
      vi.stubEnv('SHORTDRAMA_FFPROBE_PATH', join(folder, 'missing-ffprobe.exe'))
      await expect(probeMedia(videoPath)).rejects.toMatchObject({ code: 'FFMPEG_UNAVAILABLE' })
    } finally {
      vi.unstubAllEnvs()
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('parses rational frame rates and invalid values safely', () => {
    expect(parseFrameRate('24000/1001')).toBe(23.976)
    expect(parseFrameRate('0/0')).toBeNull()
    expect(parseFrameRate(undefined)).toBeNull()
  })
})
