import { isAbsolute, resolve } from 'node:path'
import { runPackagedRealSemanticEvidence, type PackagedRealSemanticEvidenceSummary } from './packaged-real-semantic-evidence.js'

const argument = (name: string): string | null => {
  const index = process.argv.indexOf(name)
  return index < 0 ? null : process.argv[index + 1]?.trim() || null
}

export const packagedRealOriginalClipE2eResultPath = (): string | null => {
  const path = argument('--real-original-clip-e2e-result')
  if (!path) return null
  if (!isAbsolute(path) || !path.toLowerCase().endsWith('.json')) throw new Error('真实原剧切片闭环结果必须写入一个绝对 .json 路径。')
  return resolve(path)
}

export const runPackagedRealOriginalClipE2e = async (sampleId: string): Promise<PackagedRealSemanticEvidenceSummary> => {
  const summary = await runPackagedRealSemanticEvidence(sampleId, { completeWorkflow: true })
  if (!summary.e2e) throw new Error('真实原剧切片闭环未生成安全摘要。')
  return summary
}
