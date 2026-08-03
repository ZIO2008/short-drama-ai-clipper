import Database from 'better-sqlite3'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import ffmpegModule from 'ffmpeg-static'
import ffprobeModule from 'ffprobe-static'
import { migrateDatabase } from '../db/migrate.js'
import { runMediaProcess } from '../media/ffmpeg-runner.js'
import { RemixExportService, buildTimelineExportArgs, buildVideoExportArgs } from './remix-export-service.js'

const clip = { id: 'clip', sourcePath: 'episode.mp4', sourceStartSeconds: 10, sourceEndSeconds: 40, positionSeconds: 0, volume: 1, fadeInSeconds: 0, fadeOutSeconds: 0, transition: 'cut' as const, transitionDurationSeconds: 0 }

describe('buildVideoExportArgs', () => {
  it('trims a single timeline clip and encodes a portable output', () => {
    expect(buildVideoExportArgs([clip], 'output.mp4')).toEqual(['-y', '-ss', '10', '-to', '40', '-i', 'episode.mp4', '-c:v', 'libx264', '-c:a', 'aac', 'output.mp4'])
  })

  it('orders multiple clips through the FFmpeg concat filter', () => {
    expect(buildVideoExportArgs([clip, { ...clip, id: 'clip-2', positionSeconds: 30 }], 'output.mp4').join(' ')).toContain('concat=n=2:v=1:a=1[v][a]')
  })

  it('mixes overlapping audio clips with their saved volume and fades', () => {
    const args = buildTimelineExportArgs({ version: 1, snapEnabled: true, video: [clip], music: [[{ ...clip, id: 'music', sourcePath: 'music.mp3', sourceEndSeconds: 15, positionSeconds: 4, volume: 0.5, fadeInSeconds: 1, fadeOutSeconds: 2 }], []], sfx: [[], []] }, 'output.mp4').join(' ')
    expect(args).toContain('volume=0.5,afade=t=in:st=0:d=1,afade=t=out:st=3:d=2,adelay=4000|4000')
    expect(args).toContain('amix=inputs=2:duration=longest[a]')
  })

  it('composites saved video position, volume, fades and fade transitions into the export graph', () => {
    const args = buildTimelineExportArgs({ version: 1, snapEnabled: true, video: [{ ...clip, positionSeconds: 3, volume: 0.7, fadeInSeconds: 1, fadeOutSeconds: 2, transition: 'fade', transitionDurationSeconds: 0.5 }], music: [[], []], sfx: [[], []] }, 'output.mp4').join(' ')
    expect(args).toContain('setpts=PTS-STARTPTS+3/TB')
    expect(args).toContain('fade=t=in:st=0:d=1')
    expect(args).toContain('fade=t=out:st=28:d=2')
    expect(args).toContain('volume=0.7')
    expect(args).toContain('overlay=eof_action=pass:repeatlast=0[v]')
  })

  it('ducks the original audio while a narration clip is active', () => {
    const args = buildTimelineExportArgs({ version: 1, snapEnabled: true, video: [clip], music: [[], []], sfx: [[{ ...clip, id: 'narration', sourcePath: 'narration.wav', sourceStartSeconds: 0, sourceEndSeconds: 10, positionSeconds: 5, role: 'narration', duckOriginalAudio: true }], []] }, 'output.mp4').join(' ')
    expect(args).toContain("volume=0.35:enable='between(t,5,15)'")
  })
})

describe('RemixExportService', () => {
  it('rejects a historical P2 narration draft before any export or material record is created', async () => {
    const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
    const now = new Date().toISOString(); const draftId = 'c2719c5e-4a18-4f2a-9f8d-6d9877a4b321'
    try {
      database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama-p2', '冻结剧目', now, now)
      database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('episode-p2', 'drama-p2', 1, 1, 'historical.mp4', 2, 25, 'ready', now, now)
      database.prepare('INSERT INTO production_tasks VALUES (?, ?, ?, ?, ?, 0, 1, NULL, ?, ?, ?)').run('task-p2', 'drama-p2', 'ai_narration', '{}', 'completed', '{}', now, now)
      database.prepare('INSERT INTO ai_evidence VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('evidence-p2', 'drama-p2', 'episode-p2', 'subtitle', 0, 1, 0.9, '历史旁白证据', '{}', now, now)
      database.prepare('INSERT INTO ai_drafts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(draftId, 'task-p2', 'evidence-p2', '历史旁白草稿', 0, 1, 0.9, 'confirmed', now, now)
      database.prepare('INSERT INTO timeline_projects VALUES (?, ?, ?, ?, ?)').run('timeline-p2', draftId, JSON.stringify({ version: 1, snapEnabled: true, video: [], music: [[], []], sfx: [[], []] }), now, now)
      await expect(new RemixExportService(database).export(draftId, join(tmpdir(), 'should-not-export'))).rejects.toThrow('当前内部试点仅支持 P1 二创草稿导出。')
      expect(database.prepare('SELECT COUNT(*) AS count FROM generated_materials').get()).toEqual({ count: 0 })
    } finally { database.close() }
  })

  it('exports a confirmed draft and records its traceable material in an isolated directory', async () => {
    const ffmpegPath = typeof ffmpegModule === 'string' ? ffmpegModule : (ffmpegModule as unknown as { default?: string }).default ?? ''
    const ffprobePath = ffprobeModule.path
    if (!ffmpegPath || !ffprobePath) throw new Error('static media tools are unavailable')
    const root = await mkdtemp(join(tmpdir(), 'remix-export-')); const output = await mkdtemp(join(tmpdir(), 'remix-output-')); const source = join(root, 'source.mp4'); const music = join(root, 'music.wav'); const draftId = 'd2719c5e-4a18-4f2a-9f8d-6d9877a4b321'; const now = new Date().toISOString(); const previousFfmpeg = process.env.SHORTDRAMA_FFMPEG_PATH; const previousFfprobe = process.env.SHORTDRAMA_FFPROBE_PATH
    try {
      await runMediaProcess(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:d=2', '-f', 'lavfi', '-i', 'sine=frequency=600:duration=2', '-shortest', '-c:v', 'libx264', '-c:a', 'aac', source])
      await runMediaProcess(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1', music])
      process.env.SHORTDRAMA_FFMPEG_PATH = ffmpegPath; process.env.SHORTDRAMA_FFPROBE_PATH = ffprobePath
      const database = new Database(':memory:'); database.pragma('foreign_keys = ON'); migrateDatabase(database)
      database.prepare('INSERT INTO dramas VALUES (?, ?, ?, ?)').run('drama', '测试剧', now, now)
      database.prepare('INSERT INTO episodes (id, drama_id, episode_no, sort_order, source_path, duration_seconds, fps, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('episode', 'drama', 1, 1, source, 2, 25, 'ready', now, now)
      database.prepare('INSERT INTO production_tasks VALUES (?, ?, ?, ?, ?, 0, 1, NULL, ?, ?, ?)').run('task', 'drama', 'ai_remix', '{}', 'completed', '{}', now, now)
      database.prepare('INSERT INTO task_items (id, task_id, status, retry_count, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)').run('item', 'task', 'succeeded', now, now)
      database.prepare('INSERT INTO ai_evidence VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run('evidence', 'drama', 'episode', 'subtitle', 0, 1.5, 0.9, '冲突', '{}', now, now)
      database.prepare('INSERT INTO ai_drafts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(draftId, 'task', 'evidence', '冲突', 0, 1.5, 0.9, 'pending_review', now, now)
      const timelineService = (await import('./timeline-service.js')).TimelineService; const timeline = new timelineService(database); timeline.addAudio(draftId, { kind: 'music', trackIndex: 0, sourcePath: music, durationSeconds: 1, positionSeconds: 0.2 }); timeline.confirm(draftId)
      const result = await new RemixExportService(database).export(draftId, output)
      expect((await stat(result.outputPath)).size).toBeGreaterThan(0)
      expect(database.prepare('SELECT draft_id AS draftId, task_item_id AS taskItemId, path FROM generated_materials').get()).toEqual({ draftId, taskItemId: 'item', path: result.outputPath })
      database.close()
    } finally { if (previousFfmpeg === undefined) delete process.env.SHORTDRAMA_FFMPEG_PATH; else process.env.SHORTDRAMA_FFMPEG_PATH = previousFfmpeg; if (previousFfprobe === undefined) delete process.env.SHORTDRAMA_FFPROBE_PATH; else process.env.SHORTDRAMA_FFPROBE_PATH = previousFfprobe; await rm(root, { recursive: true, force: true }); await rm(output, { recursive: true, force: true }) }
  })
})
