export type AiDurationDecision = 'on-target' | 'over-target' | 'needs-decision' | 'force-stop'

export const decideAiDuration = (elapsedMs: number): AiDurationDecision => {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error('耗时必须是非负有限数值。')
  if (elapsedMs >= 50 * 60_000) return 'force-stop'
  if (elapsedMs >= 40 * 60_000) return 'needs-decision'
  if (elapsedMs >= 30 * 60_000) return 'over-target'
  return 'on-target'
}
