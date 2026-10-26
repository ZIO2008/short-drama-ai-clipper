import { z } from 'zod'
import type { ClipCandidateEvidence } from '../../shared/clip-candidate-contracts.js'

const claimSchema = z.object({
  kind: z.enum(['start-boundary', 'end-boundary', 'core-event', 'narrative-closure', 'visual-fact']),
  evidenceCount: z.number().int().nonnegative(),
  reason: z.string().max(1_000),
}).strict()

const evidenceSchema: z.ZodType<ClipCandidateEvidence> = z.object({
  beat: z.enum(['setup', 'entry', 'escalation', 'reversal', 'climax', 'reaction', 'aftermath']),
  purpose: z.enum(['hook', 'conflict', 'reveal', 'emotion', 'transition']),
  context: z.enum(['standalone', 'limited']),
  narrativeState: z.enum(['entry', 'escalation', 'reversal', 'completion', 'reaction']),
  seamStatus: z.enum(['closed', 'expanded-closed']),
  claims: z.array(claimSchema).max(50),
  reviewStatus: z.enum(['not-required', 'supported', 'failed']),
  reviewReason: z.string().max(1_000).nullable(),
  durationDeviationSeconds: z.number().finite().nullable(),
  durationDeviationReason: z.string().max(1_000).nullable(),
}).strict()

export const parseClipCandidateEvidence = (value: unknown): ClipCandidateEvidence | undefined => {
  const parsed = evidenceSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}
