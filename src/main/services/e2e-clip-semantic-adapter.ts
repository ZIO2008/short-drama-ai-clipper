import type { ClipSemanticAdapter } from './clip-candidate-intelligence-service.js'

/** Process-gated fixture adapter; its results must obey the production contract. */
export const createE2eClipSemanticAdapter = (): ClipSemanticAdapter => ({
  select: async ({ proposals, candidateLimit }) => {
    const cap = Math.max(1, Math.min(50, Math.floor(candidateLimit ?? 50)))
    const selectedProposals = proposals.slice(0, cap)
    return {
      selections: selectedProposals.map((proposal, index) => {
        const evidenceIds = proposal.evidenceIds.slice(0, Math.min(2, proposal.evidenceIds.length))
        return { proposalId: `window-${index + 1}`, startEvidenceId: evidenceIds[0], endEvidenceId: evidenceIds[evidenceIds.length - 1], evidenceIds, beat: 'climax' as const, purpose: 'hook' as const, context: 'standalone' as const, narrative: { state: 'completion' as const, characters: [], relationship: 'fixture', conflict: 'fixture', continuity: 'continuous' as const }, seamStatus: 'closed' as const }
      })
    }
  }
})
