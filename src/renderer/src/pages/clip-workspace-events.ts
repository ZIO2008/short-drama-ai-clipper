import type { ClipCandidate } from '../../../shared/contracts.js'

export const candidateSelectionEvent = 'shortdrama:select-original-clip-candidate'
export const workspaceRefreshEvent = 'shortdrama:refresh-original-clip-workspace'

export const selectOriginalClipWorkspaceCandidate = (document: Document, candidate: ClipCandidate): void => {
  const EventConstructor = document.defaultView?.CustomEvent ?? CustomEvent
  document.dispatchEvent(new EventConstructor<ClipCandidate>(candidateSelectionEvent, { detail: candidate }))
}

export const refreshOriginalClipWorkspace = (document: Document): void => {
  document.dispatchEvent(new Event(workspaceRefreshEvent))
}
