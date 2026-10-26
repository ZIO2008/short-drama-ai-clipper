export const hasExactSampleIds = (runs, expectedIds) => {
  if (!Array.isArray(runs) || runs.length !== expectedIds.length) return false
  const actual = new Set(runs.map((run) => run?.sampleId))
  return actual.size === expectedIds.length && expectedIds.every((sampleId) => actual.has(sampleId))
}
