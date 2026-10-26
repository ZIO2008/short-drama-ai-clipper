import { app } from 'electron'
import { writeFile } from 'node:fs/promises'
import { PackagedRealAsrEvidenceError, packagedRealAsrEvidenceFailureSummary, packagedRealAsrEvidenceResultPath, runPackagedRealAsrEvidence } from './services/packaged-real-asr-evidence.js'
import { PackagedRealSemanticEvidenceError, packagedRealSemanticEvidenceResultPath, runPackagedRealSemanticEvidence } from './services/packaged-real-semantic-evidence.js'
import { PackagedRealMultimodalProbeError, packagedRealMultimodalProbeFailureSummary, packagedRealMultimodalProbeResultPath, runPackagedRealMultimodalProbe } from './services/packaged-real-multimodal-probe.js'
import { PackagedRealMultimodalEvidenceError, packagedRealMultimodalEvidenceFailureSummary, packagedRealMultimodalEvidenceResultPath, runPackagedRealMultimodalEvidence } from './services/packaged-real-multimodal-evidence.js'
import { packagedRealProviderPreflightResultPath, runPackagedRealProviderPreflight } from './services/packaged-real-provider-preflight.js'
import { packagedRealOriginalClipE2eResultPath, runPackagedRealOriginalClipE2e } from './services/packaged-real-original-clip-e2e.js'

const argument = (name: string): string | null => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]?.trim() || null }
const writeExclusiveJson = (path: string, value: unknown): Promise<void> => writeFile(path, `${JSON.stringify(value)}\n`, { encoding: 'utf8', flag: 'wx' })
const finish = (): void => { const code = typeof process.exitCode === 'number' ? process.exitCode : 1; app.exit(code) }

const runAsrEvidence = async (sample: string): Promise<void> => {
  let result: string | null = null
  try {
    result = packagedRealAsrEvidenceResultPath()
    if (!result) { console.error('真实 ASR 隔离验收必须提供 --real-asr-evidence-result <absolute-json-path>。'); process.exitCode = 1; return }
    await writeExclusiveJson(result, { status: 'passed', ...await runPackagedRealAsrEvidence(sample) })
    process.exitCode = 0
  } catch (error) {
    const stage = error instanceof PackagedRealAsrEvidenceError ? error.stage : 'setup'
    if (result) try { await writeExclusiveJson(result, packagedRealAsrEvidenceFailureSummary(stage)) } catch { /* Exit code remains authoritative. */ }
    console.error(`真实 ASR 隔离验收失败；阶段：${stage}。`); process.exitCode = 1
  } finally { finish() }
}

const runSemanticEvidence = async (sample: string): Promise<void> => {
  let result: string | null = null
  try {
    result = packagedRealSemanticEvidenceResultPath()
    if (!result) { console.error('真实文本语义隔离验收必须提供 --real-semantic-evidence-result <absolute-json-path>。'); process.exitCode = 1; return }
    await writeExclusiveJson(result, { status: 'passed', ...await runPackagedRealSemanticEvidence(sample) })
    process.exitCode = 0
  } catch (error) {
    const stage = error instanceof PackagedRealSemanticEvidenceError ? error.stage : 'setup'
    const code = error instanceof PackagedRealSemanticEvidenceError ? error.code : 'unknown'
    const qualificationCounts = error instanceof PackagedRealSemanticEvidenceError ? error.qualificationCounts : undefined
    if (result) try { await writeExclusiveJson(result, { status: 'failed', sampleId: sample, reason: 'isolated-semantic-evidence-failed', stage, code, ...(qualificationCounts ? { qualificationCounts } : {}) }) } catch { /* Exit code remains authoritative. */ }
    console.error('真实文本语义隔离验收失败；详情未写入结果摘要。'); process.exitCode = 1
  } finally { finish() }
}

const runMultimodalProbe = async (): Promise<void> => {
  let result: string | null = null
  const startedAt = Date.now()
  try {
    result = packagedRealMultimodalProbeResultPath()
    if (!result) { console.error('真实视频复核连通性验收必须提供 --real-multimodal-probe-result <absolute-json-path>。'); process.exitCode = 1; return }
    await writeExclusiveJson(result, { status: 'passed', ...await runPackagedRealMultimodalProbe() }); process.exitCode = 0
  } catch (error) {
    const code = error instanceof PackagedRealMultimodalProbeError ? error.code : 'unexpected'
    if (result) try { await writeExclusiveJson(result, packagedRealMultimodalProbeFailureSummary(code, startedAt)) } catch { /* Exit code remains authoritative. */ }
    console.error('真实视频复核连通性验收失败；详情未写入结果摘要。'); process.exitCode = 1
  } finally { finish() }
}

const runMultimodalEvidence = async (sample: string): Promise<void> => {
  let result: string | null = null
  const startedAt = Date.now()
  try {
    result = packagedRealMultimodalEvidenceResultPath()
    if (!result) { console.error('真实视频帧级复核验收必须提供 --real-multimodal-evidence-result <absolute-json-path>。'); process.exitCode = 1; return }
    await writeExclusiveJson(result, { status: 'passed', ...await runPackagedRealMultimodalEvidence(sample) }); process.exitCode = 0
  } catch (error) {
    const code = error instanceof PackagedRealMultimodalEvidenceError ? error.code : 'unknown'
    if (result) try { await writeExclusiveJson(result, packagedRealMultimodalEvidenceFailureSummary(code, startedAt)) } catch { /* Exit code remains authoritative. */ }
    console.error('真实视频帧级复核验收失败；详情未写入结果摘要。'); process.exitCode = 1
  } finally { finish() }
}

const runProviderPreflight = async (): Promise<void> => {
  let result: string | null = null
  try {
    result = packagedRealProviderPreflightResultPath()
    if (!result) { console.error('真实供应商预检必须提供 --real-provider-preflight-result <absolute-json-path>。'); process.exitCode = 1; return }
    await writeExclusiveJson(result, { status: 'completed', ...await runPackagedRealProviderPreflight() })
    process.exitCode = 0
  } catch {
    if (result) try { await writeExclusiveJson(result, { status: 'failed', reason: 'isolated-provider-preflight-failed', sourceDatabaseWrites: 0 }) } catch { /* Exit code remains authoritative. */ }
    console.error('真实供应商预检失败；详情未写入结果摘要。'); process.exitCode = 1
  } finally { finish() }
}

const runOriginalClipE2e = async (sample: string): Promise<void> => {
  let result: string | null = null
  try {
    result = packagedRealOriginalClipE2eResultPath()
    if (!result) { console.error('真实原剧切片闭环必须提供 --real-original-clip-e2e-result <absolute-json-path>。'); process.exitCode = 1; return }
    await writeExclusiveJson(result, { status: 'passed', ...await runPackagedRealOriginalClipE2e(sample) })
    process.exitCode = 0
  } catch (error) {
    const stage = error instanceof PackagedRealSemanticEvidenceError ? error.stage : 'setup'
    const code = error instanceof PackagedRealSemanticEvidenceError ? error.code : 'unknown'
    const qualificationCounts = error instanceof PackagedRealSemanticEvidenceError ? error.qualificationCounts : undefined
    if (result) try { await writeExclusiveJson(result, { status: 'failed', sampleId: sample, reason: 'isolated-original-clip-e2e-failed', stage, code, ...(qualificationCounts ? { qualificationCounts } : {}), sourceDatabaseWrites: 0 }) } catch { /* Exit code remains authoritative. */ }
    console.error('真实原剧切片闭环失败；详情未写入结果摘要。'); process.exitCode = 1
  } finally { finish() }
}

export const runPackagedEvidenceCli = async (): Promise<boolean> => {
  if (process.argv.includes('--real-provider-preflight')) { await runProviderPreflight(); return true }
  const e2eSample = argument('--real-original-clip-e2e-sample')
  if (e2eSample) { await runOriginalClipE2e(e2eSample); return true }
  const asrSample = argument('--real-asr-evidence-sample')
  if (asrSample) { await runAsrEvidence(asrSample); return true }
  const semanticSample = argument('--real-semantic-evidence-sample')
  if (semanticSample) { await runSemanticEvidence(semanticSample); return true }
  if (process.argv.includes('--real-multimodal-probe')) { await runMultimodalProbe(); return true }
  const multimodalSample = argument('--real-multimodal-evidence-sample')
  if (multimodalSample) { await runMultimodalEvidence(multimodalSample); return true }
  return false
}
