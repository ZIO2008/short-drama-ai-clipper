import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

type Sample = { id: string; sceneCards: string[] }
type Manifest = { publicDevelopmentSet: Sample[]; hiddenAcceptanceSet: Sample[] }
type AcceptanceRecord = { sampleId: string; status: 'passed' | 'failed'; code?: string; conclusion?: 'supported' | 'blocked'; e2e?: { exportStatus?: string } }

export type Phase29AcceptanceOutcome = 'passed' | 'correctly-blocked' | 'limited-evidence' | 'external-failed' | 'failed' | 'not-run'
export type Phase29AcceptanceEntry = { sampleId: string; tier: 'public' | 'hidden'; sceneCards: string[]; outcome: Phase29AcceptanceOutcome; failureCode: string | null }
export type Phase29AcceptanceLedgerEntry = { sampleId: string; tier: 'public' | 'hidden'; sceneCards: string[]; outcome: Phase29AcceptanceOutcome; runCount: number; sourceShaVerified: boolean; productionDatabaseWrites: number; temporaryDataCleaned: boolean; evidence: string[] }
type AcceptanceLedger = { version: number; baselineManifestSha256: string; entries: Phase29AcceptanceLedgerEntry[] }
export const PHASE29_ACCEPTANCE_LEDGER_SHA256 = '19BFA1D05BB487C4ECB1F3E9BC1EB586311A0A043A7F584EDE1D7CE8E020ABDC'

const outcomeFor = (record: AcceptanceRecord | undefined): Phase29AcceptanceOutcome => {
  if (!record) return 'not-run'
  if (record.status === 'failed') return record.code?.startsWith('provider-') ? 'external-failed' : 'failed'
  if (record.e2e?.exportStatus === 'completed') return 'passed'
  if (record.conclusion === 'blocked') return 'correctly-blocked'
  return 'limited-evidence'
}

/** Builds a fixed 6+2 fact matrix and rejects duplicate hidden-sample runs. */
export const buildPhase29AcceptanceMatrix = (manifest: Manifest, records: readonly AcceptanceRecord[]): Phase29AcceptanceEntry[] => {
  if (manifest.publicDevelopmentSet.length !== 6 || manifest.hiddenAcceptanceSet.length !== 2) throw new Error('Phase 29 验收清单必须保持公开 6 集 + 隐藏 2 集。')
  const expected = new Set([...manifest.publicDevelopmentSet, ...manifest.hiddenAcceptanceSet].map(({ id }) => id))
  if (expected.size !== 8) throw new Error('Phase 29 验收样本标识必须唯一。')
  const seen = new Set<string>()
  const byId = new Map<string, AcceptanceRecord>()
  for (const record of records) {
    if (!expected.has(record.sampleId)) throw new Error('验收结果包含冻结清单之外的样本。')
    if (seen.has(record.sampleId)) throw new Error(record.sampleId.startsWith('hidden-') ? '隐藏样本只能执行一次冻结验收。' : '同一样本不能重复写入验收矩阵。')
    seen.add(record.sampleId)
    byId.set(record.sampleId, record)
  }
  const entry = (sample: Sample, tier: 'public' | 'hidden'): Phase29AcceptanceEntry => {
    const record = byId.get(sample.id)
    return { sampleId: sample.id, tier, sceneCards: [...sample.sceneCards], outcome: outcomeFor(record), failureCode: record?.status === 'failed' ? record.code ?? 'unknown' : null }
  }
  return [...manifest.publicDevelopmentSet.map((sample) => entry(sample, 'public')), ...manifest.hiddenAcceptanceSet.map((sample) => entry(sample, 'hidden'))]
}

export const readSealedPhase29AcceptanceLedger = async (path: string, baselineManifestSha256: string, manifest: Manifest): Promise<Phase29AcceptanceLedgerEntry[]> => {
  const bytes = await readFile(path)
  const digest = createHash('sha256').update(bytes).digest('hex').toUpperCase()
  if (digest !== PHASE29_ACCEPTANCE_LEDGER_SHA256) throw new Error('Phase 29 验收账本哈希不匹配，拒绝执行隐藏样本。')
  const ledger = JSON.parse(bytes.toString('utf8')) as AcceptanceLedger
  if (ledger.version !== 1 || ledger.baselineManifestSha256 !== baselineManifestSha256.toUpperCase()) throw new Error('Phase 29 验收账本未绑定当前 Baseline v1。')
  const expected = [...manifest.publicDevelopmentSet.map((sample) => ({ ...sample, tier: 'public' as const })), ...manifest.hiddenAcceptanceSet.map((sample) => ({ ...sample, tier: 'hidden' as const }))]
  if (ledger.entries.length !== expected.length) throw new Error('Phase 29 验收账本必须完整覆盖公开 6 集 + 隐藏 2 集。')
  const seen = new Set<string>()
  for (const item of expected) {
    const entry = ledger.entries.find((candidate) => candidate.sampleId === item.id)
    if (!entry || seen.has(entry.sampleId) || entry.tier !== item.tier || JSON.stringify(entry.sceneCards) !== JSON.stringify(item.sceneCards)) throw new Error('Phase 29 验收账本身份或场景卡不一致。')
    if (!Number.isInteger(entry.runCount) || entry.runCount !== 1 || !entry.sourceShaVerified || entry.productionDatabaseWrites !== 0 || !entry.temporaryDataCleaned || !entry.evidence.length) throw new Error('Phase 29 验收账本缺少一次性运行、源片、隔离或清理证据。')
    seen.add(entry.sampleId)
  }
  return ledger.entries
}

export const assertHiddenAcceptanceUnused = (entries: readonly Phase29AcceptanceLedgerEntry[], sampleId: string): void => {
  const entry = entries.find((item) => item.sampleId === sampleId && item.tier === 'hidden')
  if (!entry) throw new Error('隐藏样本不在冻结验收账本中。')
  if (entry.runCount >= 1) throw new Error('隐藏样本已完成唯一一次冻结验收，拒绝重复执行或据此调参。')
}
