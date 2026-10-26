import type { SubtitleEvidenceCue } from '../../../shared/contracts.js'
import { escapeHtml, formatEpisode } from './subtitle-evidence-presentation.js'

type Source = 'asr' | 'import' | 'ocr'
type SourceCues = Record<Source, SubtitleEvidenceCue[]>
type EvidenceWindow = { start: number; end: number; cues: Record<Source, SubtitleEvidenceCue[]> }
type PlaybackPosition = { seconds: number; isPlaying: boolean }

const sources: Source[] = ['asr', 'import', 'ocr']
const formatTime = (seconds: number): string => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}.${String(Math.round((seconds % 1) * 1000)).padStart(3, '0')}`

export const buildEvidenceWindows = (input: SourceCues): EvidenceWindow[] => {
  const entries = sources.flatMap((source) => input[source]
    .filter((cue) => Number.isFinite(cue.startSeconds) && Number.isFinite(cue.endSeconds) && cue.startSeconds >= 0 && cue.endSeconds >= cue.startSeconds)
    .map((cue) => ({ source, cue })))
    .sort((left, right) => left.cue.startSeconds - right.cue.startSeconds || left.cue.endSeconds - right.cue.endSeconds)
  const windows: EvidenceWindow[] = []
  entries.forEach(({ source, cue }) => {
    const current = windows.at(-1)
    if (!current || cue.startSeconds > current.end) windows.push({ start: cue.startSeconds, end: cue.endSeconds, cues: { asr: [], import: [], ocr: [] } })
    else current.end = Math.max(current.end, cue.endSeconds)
    windows.at(-1)!.cues[source].push(cue)
  })
  return windows
}

const cell = (source: Source, cues: SubtitleEvidenceCue[]): string => cues.length === 0
  ? '<span class="subtitle-cue-empty" aria-label="该来源在此时间窗无字幕">—</span>'
  : cues.map((cue) => `<button class="subtitle-cue" type="button" data-subtitle-evidence-cue data-source="${source}" data-start="${cue.startSeconds}" data-end="${cue.endSeconds}" aria-pressed="false"><time>${formatTime(cue.startSeconds)} — ${formatTime(cue.endSeconds)}</time><span>${escapeHtml(cue.text)}</span></button>`).join('')

const contains = (start: number, end: number, seconds: number): boolean => seconds >= start && seconds <= end

const ensurePlaybackStateStyle = (evidence: HTMLElement): void => {
  const document = evidence.ownerDocument
  if (document.getElementById('subtitle-three-source-playback-state-style')) return
  const style = document.createElement('style')
  style.id = 'subtitle-three-source-playback-state-style'
  style.textContent = '#subtitleAssetModal .subtitle-evidence-window.is-current{background:color-mix(in oklch,var(--accent) 4%,transparent)}#subtitleAssetModal .subtitle-cue.is-current{border-color:color-mix(in oklch,var(--accent) 38%,var(--r5-line));background:color-mix(in oklch,var(--accent) 6%,var(--r5-panel))}#subtitleAssetModal .subtitle-cue.is-selected.is-current{border-color:var(--accent);background:color-mix(in oklch,var(--accent) 12%,var(--r5-panel))}'
  document.head.append(style)
}

export const syncThreeSourceEvidencePlayback = (evidence: HTMLElement, position: PlaybackPosition): void => {
  if (!Number.isFinite(position.seconds) || position.seconds < 0) return
  let currentCount = 0
  evidence.querySelectorAll<HTMLElement>('[data-subtitle-evidence-cue]').forEach((cue) => {
    const current = contains(Number(cue.dataset.start), Number(cue.dataset.end), position.seconds)
    cue.classList.toggle('is-current', current)
    if (current) cue.setAttribute('aria-current', 'true')
    else cue.removeAttribute('aria-current')
    if (current) currentCount += 1
  })
  evidence.querySelectorAll<HTMLElement>('.subtitle-evidence-window[data-start][data-end]').forEach((window) => {
    const current = contains(Number(window.dataset.start), Number(window.dataset.end), position.seconds)
    window.classList.toggle('is-current', current)
    window.toggleAttribute('data-current-window', current)
  })
  const note = evidence.querySelector<HTMLElement>('.subtitle-position-note')
  if (note) {
    note.setAttribute('aria-live', position.isPlaying ? 'off' : 'polite')
    const verb = position.isPlaying ? '正在播放' : '已定位'
    const suffix = currentCount > 0 ? ` · 当前命中 ${currentCount} 条证据` : ' · 当前时刻没有字幕证据'
    note.replaceChildren(`${verb} ${formatTime(position.seconds)}${suffix}`)
  }
}

export const renderThreeSourceEvidence = (evidence: HTMLElement, episodeNo: number | null, input: SourceCues): void => {
  ensurePlaybackStateStyle(evidence)
  const windows = buildEvidenceWindows(input)
  evidence.innerHTML = `<div class="subtitle-evidence-headline"><div><b>${escapeHtml(formatEpisode(episodeNo))} · 三源时间窗对照</b><p>仅按真实时间重叠同窗；原始时间码不校准、不改写。</p></div></div><div class="subtitle-position-note" role="status" aria-live="polite">点击任一字幕，定位至该条自身起点；不自动播放。</div><div class="three-source-head" role="row"><span>时间窗</span><span>在线 ASR</span><span>导入字幕</span><span>OCR 字幕</span></div><div class="subtitle-evidence-scroll" role="table" aria-label="三源字幕时间窗对照">${windows.map((item) => `<div class="subtitle-evidence-window" role="row" data-start="${item.start}" data-end="${item.end}"><time class="subtitle-window-time">${formatTime(item.start)} — ${formatTime(item.end)}</time><div>${cell('asr', item.cues.asr)}</div><div>${cell('import', item.cues.import)}</div><div>${cell('ocr', item.cues.ocr)}</div></div>`).join('') || '<div class="subtitle-evidence-window"><time class="subtitle-window-time">—</time><span class="subtitle-cue-empty">—</span><span class="subtitle-cue-empty">—</span><span class="subtitle-cue-empty">暂无可用证据</span></div>'}</div>`
  evidence.addEventListener('click', (event) => {
    const cue = (event.target as Element).closest<HTMLElement>('[data-subtitle-evidence-cue]')
    const startSeconds = Number(cue?.dataset.start)
    if (!cue || !Number.isFinite(startSeconds) || startSeconds < 0) return
    evidence.querySelectorAll<HTMLElement>('[data-subtitle-evidence-cue]').forEach((item) => {
      const selected = item === cue
      item.classList.toggle('is-selected', selected)
      item.setAttribute('aria-pressed', String(selected))
    })
    evidence.dispatchEvent(new CustomEvent('subtitle-evidence:locate', { bubbles: true, detail: { startSeconds } }))
  })
}
