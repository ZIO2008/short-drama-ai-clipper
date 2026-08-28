import { vi } from 'vitest'
import type { DesktopApi, EpisodeAsset, SubtitleEvidenceTrack, SubtitleRecognitionRun, SubtitleRecognitionRunInput } from '../../../shared/contracts.js'

export const episodes: EpisodeAsset[] = [
  { id: 'episode-1', episodeNo: 1, sortOrder: 1, sourcePath: 'D:\\episode-01.mp4', durationSeconds: 40, fps: 25, videoWidth: 1920, videoHeight: 1080, status: 'ready' },
  { id: 'episode-2', episodeNo: 2, sortOrder: 2, sourcePath: '', durationSeconds: null, fps: null, videoWidth: null, videoHeight: null, status: 'missing' }
]
export const asr: SubtitleEvidenceTrack = { id: 'asr-1', dramaId: 'd1', episodeId: 'episode-1', assetId: null, baseTrackId: null, sourceKind: 'asr', label: 'ASR', language: 'zh-CN', status: 'active', cueCount: 1, cost: {} }
export const ocr: SubtitleEvidenceTrack = { id: 'ocr-1', dramaId: 'd1', episodeId: 'episode-1', assetId: null, baseTrackId: null, sourceKind: 'ocr', label: 'OCR', language: 'zh-CN', status: 'active', cueCount: 1, cost: {} }
export const imported: SubtitleEvidenceTrack = { id: 'import-1', dramaId: 'd1', episodeId: 'episode-1', assetId: 'asset-1', baseTrackId: null, sourceKind: 'import', label: 'Imported SRT', language: 'zh-CN', status: 'active', cueCount: 1, cost: {} }

export const renderSubtitleRuntimeSurface = (): Document => {
  const testDocument = document.implementation.createHTMLDocument('subtitle-runtime')
  testDocument.body.innerHTML = '<button data-subtitle-generate>一键生成字幕</button><section id="subtitleListPanel"><p class="helper"></p><table><tbody><tr><td>原型样例</td></tr></tbody></table></section><section id="subtitleAssetModal" aria-hidden="true"><h2 id="subtitleAssetModalTitle"></h2><p id="subtitleAssetModalMeta"></p><div id="subtitleDetailAsset"><section class="r5-sub-preview"><div class="r5-frame"><i class="r5-window"></i><i class="r5-figure"></i><i class="r5-sub-region"></i><span class="r5-timecode"></span><span id="subtitleMonitorEpisode"></span></div><div class="r5-timeline"><div class="r5-timeline-head"><b>字幕校验时间线</b></div><div class="r5-track"><i class="r5-range"></i><i class="r5-anchor"></i></div></div></section><aside class="r5-evidence"><div class="r5-evidence-head"><b>对齐差异与校验结论</b></div></aside></div><div id="subtitleDetailEmpty"><p id="subtitleDetailEmptyText"></p></div></section><div id="toast"></div>'
  const modal = testDocument.getElementById('subtitleAssetModal') as HTMLElement
  const card = testDocument.createElement('div'); card.className = 'r5-modal-card'
  const modalBody = testDocument.createElement('div'); modalBody.className = 'r5-modal-body'
  while (modal.firstChild) modalBody.append(modal.firstChild)
  card.append(modalBody); modal.append(card)
  return testDocument
}

export const installSubtitleRuntimeApi = (overrides: Partial<DesktopApi> = {}): void => {
  let recognitionRun: SubtitleRecognitionRun | null = null
  const snapshot = (): SubtitleRecognitionRun => {
    if (!recognitionRun) throw new Error('recognition run not found')
    return structuredClone(recognitionRun)
  }
  const updateItem = (episodeId: string, status: SubtitleRecognitionRun['items'][number]['status'], reason: string | null = null): SubtitleRecognitionRun => {
    if (!recognitionRun) throw new Error('recognition run not found')
    const item = recognitionRun.items.find((candidate) => candidate.episodeId === episodeId)
    if (!item) throw new Error('recognition episode not found')
    item.status = status
    item.reason = reason
    recognitionRun.completed = recognitionRun.items.filter((candidate) => candidate.status === 'succeeded').length
    recognitionRun.failed = recognitionRun.items.filter((candidate) => candidate.status === 'failed').length
    recognitionRun.currentEpisodeId = status === 'running' ? episodeId : null
    return snapshot()
  }
  window.desktopApi = {
    listSubtitles: vi.fn().mockResolvedValue([]),
    removeSubtitlesByEpisode: vi.fn().mockResolvedValue(0),
    listSubtitleEvidenceTracks: vi.fn().mockResolvedValue([asr, ocr]),
    getEffectiveSubtitleOcrRegion: vi.fn().mockResolvedValue({ id: 'region-1', dramaId: 'd1', episodeId: 'episode-1', scope: 'episode_override', x: 0.1, y: 0.72, width: 0.8, height: 0.2 }),
    getSubtitleQualityReport: vi.fn().mockResolvedValue({ evaluationCount: 0, referenceCharacters: 0, differingCharacters: 0, conflictCount: 0, evaluatedCueCount: 0, elapsedMs: 0, estimatedCost: 0, actualCost: 0, characterErrorRate: null, conflictRate: null }),
    listSubtitleEvidenceCues: vi.fn().mockResolvedValue([{ id: 'cue-1', index: 1, startSeconds: 12.4, endSeconds: 14, text: '真实字幕', confidence: 0.9 }]),
    getSubtitleEvidenceComparisons: vi.fn().mockResolvedValue([{ asrCueId: 'cue-1', ocrCueId: 'cue-2', timeOverlapSeconds: 1.6, textSimilarity: 0.9, asrConfidence: 0.9, ocrConfidence: null, conclusion: 'consistent' }]),
    getSubtitleRecognitionSettings: vi.fn().mockResolvedValue({ recognitionMode: 'ocr-only', scope: 'current', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'fixed-bottom', differenceThreshold: 'standard', importStrategy: 'parallel' }),
    getLocalOcrAvailability: vi.fn().mockResolvedValue({ available: true, executablePath: 'C:\\tesseract.exe', reason: null }),
    getLocalOcrRuntimeInfo: vi.fn().mockResolvedValue({ available: true, runnerPath: 'C:\\ocr-runner.exe', buildId: 'test-runner', sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', selfTest: true, reason: null }),
    setSubtitleOcrRegion: vi.fn().mockResolvedValue({ id: 'region-1', dramaId: 'd1', episodeId: 'episode-1', scope: 'episode_override', x: 0.08, y: 0.72, width: 0.84, height: 0.2 }),
    extractLocalOcrSubtitleTrack: vi.fn().mockResolvedValue(ocr),
    extractIndependentLocalOcrSubtitleTrack: vi.fn().mockResolvedValue(ocr),
    extractDefaultAsrSubtitleTrack: vi.fn().mockResolvedValue(asr),
    getLatestSubtitleRecognitionRun: vi.fn().mockImplementation(() => Promise.resolve(recognitionRun ? snapshot() : null)),
    startSubtitleRecognitionRun: vi.fn().mockImplementation((input: SubtitleRecognitionRunInput) => {
      recognitionRun = {
        id: 'recognition-run-1', dramaId: input.dramaId, status: 'running', settings: input.settings,
        episodeIds: input.episodeIds, total: input.episodeIds.length, completed: 0, failed: 0,
        currentEpisodeId: null, ocrRuntime: input.ocrRuntime ?? null, reason: null,
        items: input.episodeIds.map((episodeId) => ({ episodeId, status: 'pending', reason: null })),
        createdAt: '2026-08-05T00:00:00.000Z', updatedAt: '2026-08-05T00:00:00.000Z'
      }
      return Promise.resolve(snapshot())
    }),
    resumeSubtitleRecognitionRun: vi.fn().mockImplementation(() => {
      if (!recognitionRun) throw new Error('recognition run not found')
      recognitionRun.status = 'running'; recognitionRun.reason = null
      recognitionRun.items.forEach((item) => { if (item.status === 'interrupted') { item.status = 'pending'; item.reason = null } })
      return Promise.resolve(snapshot())
    }),
    retryFailedSubtitleRecognitionRun: vi.fn().mockImplementation(() => {
      if (!recognitionRun) throw new Error('recognition run not found')
      recognitionRun.status = 'running'; recognitionRun.reason = null; recognitionRun.failed = 0
      recognitionRun.items.forEach((item) => { if (item.status === 'failed') { item.status = 'pending'; item.reason = null } })
      return Promise.resolve(snapshot())
    }),
    interruptSubtitleRecognitionRun: vi.fn().mockImplementation((_runId: string, reason: string) => {
      if (!recognitionRun) throw new Error('recognition run not found')
      recognitionRun.status = 'interrupted'; recognitionRun.reason = reason; recognitionRun.currentEpisodeId = null
      recognitionRun.items.forEach((item) => { if (item.status === 'running') { item.status = 'interrupted'; item.reason = reason } })
      return Promise.resolve(snapshot())
    }),
    markSubtitleRecognitionRunItemRunning: vi.fn().mockImplementation((_runId: string, episodeId: string) => Promise.resolve(updateItem(episodeId, 'running'))),
    markSubtitleRecognitionRunItemSucceeded: vi.fn().mockImplementation((_runId: string, episodeId: string) => Promise.resolve(updateItem(episodeId, 'succeeded'))),
    markSubtitleRecognitionRunItemFailed: vi.fn().mockImplementation((_runId: string, episodeId: string, reason: string) => Promise.resolve(updateItem(episodeId, 'failed', reason))),
    finishSubtitleRecognitionRun: vi.fn().mockImplementation(() => {
      if (!recognitionRun) throw new Error('recognition run not found')
      recognitionRun.status = recognitionRun.failed === 0 ? 'completed' : recognitionRun.completed === 0 ? 'failed' : 'partial'
      recognitionRun.currentEpisodeId = null
      recognitionRun.reason = recognitionRun.failed > 0 ? `${recognitionRun.failed} episodes failed` : null
      return Promise.resolve(snapshot())
    }),
    ...overrides
  } as unknown as DesktopApi
}
