import { randomUUID } from 'node:crypto'
import { mkdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { probeMedia } from '../media/media-probe.js'
import { assertSuccessfulProcess, resolveMediaBinary, runMediaProcess } from '../media/ffmpeg-runner.js'
import type { FixedTimeline, TimelineClip } from './timeline-service.js'

type DraftRow = { draftId: string; taskId: string; dramaId: string; dramaName: string; type: string; status: string; timelineJson: string }

export class RemixExportService {
  constructor(private readonly database: Database.Database) {}

  async export(draftIdInput: unknown, directoryInput: unknown): Promise<{ outputPath: string }> {
    const draftId = z.string().uuid().parse(draftIdInput); const directory = z.string().trim().min(1).parse(directoryInput)
    const draft = this.database.prepare(`
      SELECT draft.id AS draftId, draft.task_id AS taskId, task.drama_id AS dramaId,
             drama.name AS dramaName, task.type, draft.status, project.timeline_json AS timelineJson
      FROM ai_drafts draft
      JOIN timeline_projects project ON project.draft_id = draft.id
      JOIN production_tasks task ON task.id = draft.task_id
      JOIN dramas drama ON drama.id = task.drama_id
      WHERE draft.id = ?
    `).get(draftId) as DraftRow | undefined
    if (!draft) throw new Error('审核草稿或时间线不存在。')
    if (draft.type !== 'ai_remix') throw new Error('当前内部试点仅支持 P1 二创草稿导出。')
    if (draft.status !== 'confirmed') throw new Error('请先确认审核草稿再导出。')
    const timeline = JSON.parse(draft.timelineJson) as FixedTimeline
    if (timeline.video.length === 0) throw new Error('时间线没有可导出的视频片段。')
    await mkdir(directory, { recursive: true })
    const outputPath = await uniquePath(directory, `${safeSegment(draft.dramaName)}_AI二创_${draft.draftId.slice(0, 8)}.mp4`)
    const ordered = [...timeline.video].sort((a, b) => a.positionSeconds - b.positionSeconds)
    assertSuccessfulProcess(await runMediaProcess(resolveMediaBinary('ffmpeg') ?? 'ffmpeg', buildTimelineExportArgs({ ...timeline, video: ordered }, outputPath)))
    const metadata = await probeMedia(outputPath); const outputSize = (await stat(outputPath)).size; const now = new Date().toISOString()
    const taskItem = this.database.prepare('SELECT id FROM task_items WHERE task_id = ? ORDER BY created_at LIMIT 1').get(draft.taskId) as { id: string } | undefined
    this.database.transaction(() => {
      this.database.prepare('INSERT INTO generated_materials (id, drama_id, task_id, task_item_id, draft_id, path, duration_seconds, fps, size_bytes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), draft.dramaId, draft.taskId, taskItem?.id ?? null, draft.draftId, outputPath, metadata.durationSeconds, metadata.fps, outputSize, now, now)
    })()
    return { outputPath }
  }
}

export const buildVideoExportArgs = (clips: readonly TimelineClip[], outputPath: string): string[] => {
  if (clips.length === 0) throw new Error('时间线没有视频片段。')
  const inputs = clips.flatMap((clip) => ['-ss', String(clip.sourceStartSeconds), '-to', String(clip.sourceEndSeconds), '-i', clip.sourcePath])
  if (clips.length === 1) return ['-y', ...inputs, '-c:v', 'libx264', '-c:a', 'aac', outputPath]
  const videoInputs = clips.map((_, index) => `[${index}:v]`).join(''); const audioInputs = clips.map((_, index) => `[${index}:a]`).join('')
  return ['-y', ...inputs, '-filter_complex', `${videoInputs}${audioInputs}concat=n=${clips.length}:v=1:a=1[v][a]`, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-c:a', 'aac', outputPath]
}

export const buildTimelineExportArgs = (timeline: FixedTimeline, outputPath: string): string[] => {
  const video = [...timeline.video].sort((a, b) => a.positionSeconds - b.positionSeconds)
  const audio = [...timeline.music[0], ...timeline.music[1], ...timeline.sfx[0], ...timeline.sfx[1]]
  const videoInputs = video.flatMap((clip) => ['-ss', String(clip.sourceStartSeconds), '-to', String(clip.sourceEndSeconds), '-i', clip.sourcePath])
  const audioInputs = audio.flatMap((clip) => ['-ss', String(clip.sourceStartSeconds), '-to', String(clip.sourceEndSeconds), '-i', clip.sourcePath])
  const duration = (clip: TimelineClip): number => clip.sourceEndSeconds - clip.sourceStartSeconds
  const timelineDuration = Math.max(0.1, ...[...video, ...audio].map((clip) => clip.positionSeconds + duration(clip)))
  const videoFilters = [`color=c=black:s=2x2:d=${timelineDuration}[black]`, '[black][0:v]scale2ref[base][sizeRef]', '[sizeRef]nullsink']
  const videoLayers = video.map((clip, index) => {
    const inFade = Math.max(clip.fadeInSeconds, clip.transition === 'fade' ? clip.transitionDurationSeconds : 0)
    const filters = ['setpts=PTS-STARTPTS']
    if (inFade > 0) filters.push(`fade=t=in:st=0:d=${inFade}`)
    if (clip.fadeOutSeconds > 0) filters.push(`fade=t=out:st=${Math.max(0, duration(clip) - clip.fadeOutSeconds)}:d=${clip.fadeOutSeconds}`)
    filters.push(`setpts=PTS-STARTPTS+${clip.positionSeconds}/TB`)
    return `[${index}:v]${filters.join(',')}[video${index}]`
  })
  videoFilters.push(...videoLayers)
  let composite = 'base'
  for (let index = 0; index < video.length; index += 1) {
    const next = index === video.length - 1 ? 'v' : `layer${index}`
    videoFilters.push(`[${composite}][video${index}]overlay=eof_action=pass:repeatlast=0[${next}]`)
    composite = next
  }
  const videoAudioFilters = video.map((clip, index) => audioFilter(index, clip, `videoAudio${index}`))
  const baseMix = video.length === 1 ? '[videoAudio0]anull[base0]' : `${video.map((_, index) => `[videoAudio${index}]`).join('')}amix=inputs=${video.length}:duration=longest[base0]`
  const duckedNarration = audio.filter((clip) => clip.role === 'narration' && clip.duckOriginalAudio)
  const duckFilters = duckedNarration.length === 0
    ? ['[base0]anull[base]']
    : duckedNarration.map((clip, index) => {
        const input = index === 0 ? 'base0' : `duck${index - 1}`
        const output = index === duckedNarration.length - 1 ? 'base' : `duck${index}`
        const end = clip.positionSeconds + duration(clip)
        return `[${input}]volume=0.35:enable='between(t,${clip.positionSeconds},${end})'[${output}]`
      })
  const audioFilters = audio.map((clip, index) => audioFilter(video.length + index, clip, `mix${index}`))
  const mix = audio.length === 0 ? '[base]anull[a]' : `[base]${audio.map((_, index) => `[mix${index}]`).join('')}amix=inputs=${audio.length + 1}:duration=longest[a]`
  return ['-y', ...videoInputs, ...audioInputs, '-filter_complex', [...videoFilters, ...videoAudioFilters, baseMix, ...duckFilters, ...audioFilters, mix].join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-c:a', 'aac', outputPath]
}

const audioFilter = (input: number, clip: TimelineClip, output: string): string => {
  const delay = Math.round(clip.positionSeconds * 1000); const duration = clip.sourceEndSeconds - clip.sourceStartSeconds
  const filters = ['asetpts=PTS-STARTPTS', `volume=${clip.volume}`]
  if (clip.fadeInSeconds > 0) filters.push(`afade=t=in:st=0:d=${clip.fadeInSeconds}`)
  if (clip.fadeOutSeconds > 0) filters.push(`afade=t=out:st=${Math.max(0, duration - clip.fadeOutSeconds)}:d=${clip.fadeOutSeconds}`)
  filters.push(`adelay=${delay}|${delay}`)
  return `[${input}:a]${filters.join(',')}[${output}]`
}

const safeSegment = (value: string): string => value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_') || '短剧'
const uniquePath = async (directory: string, fileName: string): Promise<string> => { for (let index = 0; index < 1000; index += 1) { const suffix = index === 0 ? '' : `_${String(index + 1).padStart(2, '0')}`; const candidate = join(directory, `${basename(fileName, extname(fileName))}${suffix}${extname(fileName)}`); try { await stat(candidate) } catch { return candidate } } throw new Error('无法分配唯一输出文件名。') }
