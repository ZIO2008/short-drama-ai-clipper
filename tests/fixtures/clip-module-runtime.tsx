import { createRoot } from 'react-dom/client'
import type { ClipExportConfig, DesktopApi } from '../../src/shared/contracts.js'
import { StaticPrototypeSurface } from '../../src/renderer/src/pages/StaticPrototypeSurface.js'
import { bindOriginalClipPoolReportRuntime } from '../../src/renderer/src/pages/OriginalClipPoolReportRuntimeBridge.js'
import { hydratePrototypeShell } from '../../src/renderer/src/prototype-shell-context.js'
import { createPoolScenario, poolRuntimeStates } from './clip-module-scenarios.js'
import { createReportScenario, reportRuntimeStates } from './clip-report-scenarios.js'

const query = new URLSearchParams(location.search)
const state = poolRuntimeStates.find(state => state === query.get('state')) ?? 'default'
const scene = createPoolScenario(state)
const report = query.get('screen') === 'clip-report' ? createReportScenario(reportRuntimeStates.find(state => state === query.get('state')) ?? 'success') : null
const current = report ?? scene
let candidates = current.candidates
const probe = { preflightIds: [] as string[], preflightConfig: null as ClipExportConfig | null, deletedIds: [] as string[], openedIds: [] as string[], openedPaths: [] as string[], startCalls: 0 }
Object.assign(window, { fixtureProbe: probe, desktopApi: {
  listClipCandidates: async () => state === 'loading' ? await new Promise<never>(() => undefined) : state === 'error' ? await Promise.reject(new Error('隔离夹具读取失败')) : candidates,
  listClipEpisodeStatuses: async () => scene.statuses.map(status => {
    const owned = candidates.filter(candidate => candidate.episodeId === status.episodeId)
    return { ...status, candidateCount: owned.length, pendingCount: owned.filter(candidate => ['pending_review', 'editing'].includes(candidate.status)).length, confirmedCount: owned.filter(candidate => candidate.status === 'confirmed').length, exportedCount: owned.filter(candidate => candidate.status === 'exported').length, failedCount: owned.filter(candidate => candidate.status === 'failed').length }
  }),
  getLatestClipExportBatch: async () => report?.state === 'loading' ? await new Promise<never>(() => undefined) : report?.state === 'error' ? await Promise.reject(new Error('隔离报告读取失败')) : report?.batch ?? null,
  listMaterials: async () => report?.materials ?? [],
  chooseOutputDirectory: async () => 'D:\isolated-fixture\output',
  preflightClipExport: async (_dramaId: string, config: ClipExportConfig) => { probe.preflightIds = [...config.candidateIds]; probe.preflightConfig = config; return { blocked: [{ candidateId: config.candidateIds[0], reason: '隔离界面夹具不执行文件导出' }] } },
  startClipExport: async () => { probe.startCalls++; throw new Error('隔离界面夹具禁止执行文件导出') },
  deleteClipCandidate: async (id: string) => { probe.deletedIds.push(id); candidates = candidates.filter(candidate => candidate.id !== id) },
  openPath: async (path: string) => { probe.openedPaths.push(path) }
} as unknown as DesktopApi })
createRoot(document.getElementById('root')!).render(<StaticPrototypeSurface screen={report ? 'clip-report' : 'clip-pool'} mode="runtime" onBack={() => undefined} onReady={document => {
  hydratePrototypeShell(document, { appVersion: 'fixture', releaseLabel: '隔离测试', unreadCount: 0 })
  return bindOriginalClipPoolReportRuntime({ document, dramaId: 'fixture-drama', dramaName: current.dramaName, episodes: current.episodes, onOpenCandidate: candidate => { probe.openedIds.push(candidate.id) } })
}} />)
