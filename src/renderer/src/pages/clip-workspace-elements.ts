export const resolveClipWorkspaceElements = (screen: HTMLElement) => {
  const rail = screen.querySelector<HTMLElement>('.r5-episodes')
  const railMeta = rail?.previousElementSibling?.querySelector<HTMLElement>('.meta') ?? null
  const [sourceTimeline, candidateTimeline] = [...screen.querySelectorAll<HTMLElement>('.r5-timeline')]
  const sourceTrack = sourceTimeline?.querySelector<HTMLElement>('.r5-track')
  const candidateTrack = candidateTimeline?.querySelector<HTMLElement>('.r5-track')
  const sourceRange = sourceTrack?.querySelector<HTMLElement>('.r5-range')
  const candidateRange = candidateTrack?.querySelector<HTMLElement>('.r5-range')
  const candidateAnchor = candidateTrack?.querySelector<HTMLElement>('.r5-anchor')
  const frame = screen.querySelector<HTMLElement>('.r5-frame')
  const candidateId = screen.querySelector<HTMLElement>('.r5-candidate-id')
  const monitorTimecode = screen.querySelector<HTMLElement>('.r5-timecode')
  const monitorCaption = screen.querySelector<HTMLElement>('.r5-monitor-caption')
  const note = screen.querySelector<HTMLElement>('.r5-note')
  const inspectorMeta = screen.querySelector<HTMLElement>('.r5-inspector > .r5-panel-head .meta')
  const transportPlay = screen.querySelector<HTMLButtonElement>('[data-clip-play]')
  const transportLoop = screen.querySelector<HTMLButtonElement>('[data-clip-loop]')
  const speedTrigger = screen.querySelector<HTMLButtonElement>('[data-clip-speed-trigger]')
  const volumeTrigger = screen.querySelector<HTMLButtonElement>('[data-clip-volume-trigger]')
  const speedPopover = screen.querySelector<HTMLElement>('#clipSpeedPopover')
  const volumePopover = screen.querySelector<HTMLElement>('#clipVolumePopover')
  const sourceTime = screen.querySelector<HTMLElement>('[data-clip-source-time]')
  const relativeTime = screen.querySelector<HTMLElement>('[data-clip-relative-time]')
  const volumeLabel = screen.querySelector<HTMLElement>('[data-clip-volume-label]')
  const volumeInput = screen.querySelector<HTMLInputElement>('#clipVolumePopover input[type="range"]')
  const reviewButtons = [...screen.querySelectorAll<HTMLButtonElement>('[data-clip-review]')]
  const reviewDescription = screen.querySelector<HTMLElement>('[data-clip-review-description]')
  const boundaryState = screen.querySelector<HTMLElement>('[data-clip-boundary-state]')
  const nudges = [...screen.querySelectorAll<HTMLButtonElement>('[data-clip-nudge]')]
  const inlineCandidateSwitcher = screen.querySelector<HTMLElement>('[data-inline-candidate-switcher], [data-od-id="clip-inline-candidate-switcher"]')
  const inlineCandidateGrid = inlineCandidateSwitcher?.querySelector<HTMLElement>('.r5-candidate-switch-grid') ?? null
  const inlineCandidatePrevious = inlineCandidateSwitcher?.querySelector<HTMLButtonElement>('[data-inline-candidate-page="prev"]') ?? null
  const inlineCandidateNext = inlineCandidateSwitcher?.querySelector<HTMLButtonElement>('[data-inline-candidate-page="next"]') ?? null
  if (!rail || !sourceTimeline || !candidateTimeline || !sourceTrack || !candidateTrack || !sourceRange || !candidateRange || !candidateAnchor || !frame || !candidateId || !monitorTimecode || !monitorCaption || !note || !inspectorMeta || !transportPlay || !transportLoop || !speedTrigger || !volumeTrigger || !speedPopover || !volumePopover || !sourceTime || !relativeTime || !volumeLabel || !volumeInput || !reviewDescription || !boundaryState) return null
  return { rail, railMeta, sourceTimeline, candidateTimeline, sourceTrack, candidateTrack, sourceRange, candidateRange, candidateAnchor, frame, candidateId, monitorTimecode, monitorCaption, note, inspectorMeta, transportPlay, transportLoop, speedTrigger, volumeTrigger, speedPopover, volumePopover, sourceTime, relativeTime, volumeLabel, volumeInput, reviewButtons, reviewDescription, boundaryState, nudges, inlineCandidateSwitcher, inlineCandidateGrid, inlineCandidatePrevious, inlineCandidateNext }
}
