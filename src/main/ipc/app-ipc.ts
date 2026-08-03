import { dialog, ipcMain, shell, type BrowserWindow, type OpenDialogOptions } from 'electron'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { AppHealth } from '../../shared/contracts.js'
import { RELEASE_METADATA } from '../../shared/release-metadata.js'
import { AI_CAPABILITIES, resolveCapability } from '../ai/capability-registry.js'
import { createVideoFileDialogOptions, createVideoFolderDialogOptions } from './video-file-dialog.js'
import { parseRelinkCandidates, type RelinkService } from '../services/relink-service.js'
import type { SecretService } from '../security/secret-service.js'
import type { NotificationService } from '../services/notification-service.js'
import type { DramaService } from '../services/drama-service.js'
import type { DramaCoverService } from '../services/drama-cover-service.js'
import type { TagService } from '../services/tag-service.js'
import type { ScriptAssetService } from '../services/script-asset-service.js'
import type { AssetHealthService } from '../services/asset-health-service.js'
import type { SubtitleAssetService } from '../services/subtitle-asset-service.js'
import type { SubtitleEvidenceService } from '../services/subtitle-evidence-service.js'
import type { LocalOcrSubtitleService } from '../services/local-ocr-subtitle-service.js'
import { writeFile } from 'node:fs/promises'
import type { ProviderProfileService } from '../services/provider-profile-service.js'
import type { LogService } from '../services/log-service.js'
import type { OriginalClipService } from '../services/original-clip-service.js'
import type { TaskCenterService } from '../tasks/task-center-service.js'
import type { TaskQueue, TaskExecutor } from '../tasks/task-queue.js'
import type { MultiEpisodeService } from '../services/multi-episode-service.js'
import type { AiAnalysisService } from '../ai/ai-analysis-service.js'
import type { AiTaskLifecycleService } from '../ai/ai-task-lifecycle-service.js'
import type { TimelineService } from '../ai/timeline-service.js'
import type { RemixExportService } from '../ai/remix-export-service.js'
import { registerProductionIpc } from './production-ipc.js'
import { openExternalUrl } from '../security/external-url.js'

export type AppIpcDependencies = {
  getHealth: () => AppHealth
  getMainWindow: () => BrowserWindow | null
  getAppVersion: () => string
  resolveLastImportDirectory: (dramaId: unknown) => string | undefined
  exportDiagnostics: (directory: string) => Promise<unknown>
  requireSecretService: () => SecretService
  requireNotificationService: () => NotificationService
  requireDramaService: () => DramaService
  requireDramaCoverService: () => DramaCoverService
  requireTagService: () => TagService
  requireScriptAssetService: () => ScriptAssetService
  requireAssetHealthService: () => AssetHealthService
  requireRelinkService: () => RelinkService
  requireDatabase: () => Database.Database
  requireSubtitleAssetService: () => SubtitleAssetService
  requireSubtitleEvidenceService: () => SubtitleEvidenceService
  requireLocalOcrSubtitleService: () => LocalOcrSubtitleService
  requireProviderProfileService: () => ProviderProfileService
  requireLogService: () => LogService
  requireAiAnalysisService: () => AiAnalysisService
  requireAiTaskLifecycleService: () => AiTaskLifecycleService
  requireTimelineService: () => TimelineService
  requireRemixExportService: () => RemixExportService
  requireOriginalClipService: () => OriginalClipService
  requireTaskCenterService: () => TaskCenterService
  requireTaskQueue: () => TaskQueue
  requireMultiEpisodeService: () => MultiEpisodeService
  requireP0Task: (taskId: string) => { type: 'original_clip' | 'multi_episode' }
  taskExecutor: TaskExecutor
  resumeP0Task: (taskId: string) => Promise<void>
  recordTaskCompletion: (taskId: string) => void
  writeTechnicalLog: (level: 'info' | 'warning' | 'error', eventType: string, details?: Record<string, unknown>) => void
}

const chooseFile = async (dependencies: AppIpcDependencies, options: OpenDialogOptions): Promise<string | null> => {
  const window = dependencies.getMainWindow()
  const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
  return result.canceled ? null : result.filePaths[0] ?? null
}

const saveSubtitleText = async (dependencies: AppIpcDependencies, defaultPath: string, name: string, extension: string, content: string): Promise<string | null> => {
  const window = dependencies.getMainWindow(); const options = { defaultPath, filters: [{ name, extensions: [extension] }] }
  const result = window ? await dialog.showSaveDialog(window, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  await writeFile(result.filePath, content, 'utf8')
  return result.filePath
}

const subtitleRecognitionSettingsSchema = z.object({ scope: z.enum(['all', 'current', 'missing']), language: z.enum(['zh-CN', 'zh-en', 'auto']), asrMode: z.enum(['audio-first', 'denoise', 'import-only']), ocrMode: z.enum(['auto-region', 'fixed-bottom', 'episode-manual']), differenceThreshold: z.enum(['standard', 'strict', 'loose']), importStrategy: z.enum(['parallel', 'review-only']) })
const defaultSubtitleRecognitionSettings = { scope: 'all', language: 'zh-CN', asrMode: 'audio-first', ocrMode: 'auto-region', differenceThreshold: 'standard', importStrategy: 'parallel' } as const

export const registerAppIpc = (dependencies: AppIpcDependencies): void => {
  ipcMain.handle('app:get-health', () => dependencies.getHealth())
  ipcMain.handle('secrets:save', (_event, value: unknown, secretRef?: unknown) => dependencies.requireSecretService().save({ secretRef, value }))
  ipcMain.handle('secrets:get-status', (_event, secretRef: unknown) => dependencies.requireSecretService().getStatus(secretRef))
  ipcMain.handle('secrets:delete', (_event, secretRef: unknown) => dependencies.requireSecretService().delete(secretRef))
  ipcMain.handle('notifications:list', () => dependencies.requireNotificationService().list())
  ipcMain.handle('notifications:mark-read', (_event, notificationId: unknown) => dependencies.requireNotificationService().markRead(notificationId))
  ipcMain.handle('notifications:mark-all-read', () => dependencies.requireNotificationService().markAllRead())
  ipcMain.handle('notifications:clear-read', () => dependencies.requireNotificationService().clearRead())
  ipcMain.handle('notifications:resolve', (_event, notificationId: unknown) => dependencies.requireNotificationService().resolve(notificationId))
  ipcMain.handle('dramas:list', () => dependencies.requireDramaService().list())
  ipcMain.handle('dramas:get', (_event, dramaId: unknown) => dependencies.requireDramaService().get(dramaId))
  ipcMain.handle('dramas:create', (_event, name: unknown) => dependencies.requireDramaService().create(name))
  ipcMain.handle('dramas:update', (_event, dramaId: unknown, name: unknown) => dependencies.requireDramaService().update(dramaId, name))
  ipcMain.handle('dramas:delete', (_event, dramaId: unknown, deleteTempFiles: unknown) => dependencies.requireDramaService().delete(dramaId, deleteTempFiles))
  ipcMain.handle('dramas:cache-size', (_event, dramaId: unknown) => dependencies.requireDramaService().estimateCacheBytes(dramaId))
  ipcMain.handle('dramas:cover:get', (_event, dramaId: unknown) => dependencies.requireDramaCoverService().get(dramaId))
  ipcMain.handle('dramas:cover:upload', (_event, dramaId: unknown, sourcePath: unknown) => dependencies.requireDramaCoverService().upload(dramaId, sourcePath))
  ipcMain.handle('dramas:cover:remove', (_event, dramaId: unknown) => dependencies.requireDramaCoverService().removeUpload(dramaId))
  ipcMain.handle('dramas:cover:choose-image', () => chooseFile(dependencies, { properties: ['openFile'], filters: [{ name: '封面图片', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] }))
  ipcMain.handle('episodes:import', (_event, dramaId: unknown, paths: unknown) => dependencies.requireDramaService().importEpisodes(dramaId, paths))
  ipcMain.handle('episodes:update', (_event, dramaId: unknown, episodeId: unknown, update: unknown) => dependencies.requireDramaService().updateEpisode(dramaId, episodeId, update))
  ipcMain.handle('episodes:remove', (_event, dramaId: unknown, episodeId: unknown) => dependencies.requireDramaService().removeEpisode(dramaId, episodeId))
  ipcMain.handle('episodes:choose-files', async (_event, dramaId: unknown) => {
    if (process.env.SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS) return process.env.SHORTDRAMA_MATERIAL_E2E_IMPORT_PATHS.split('|').filter((path) => path.length > 0)
    const window = dependencies.getMainWindow(); const options = createVideoFileDialogOptions(dependencies.resolveLastImportDirectory(dramaId))
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle('episodes:choose-folder', async (_event, dramaId: unknown) => {
    const window = dependencies.getMainWindow(); const options = createVideoFolderDialogOptions(dependencies.resolveLastImportDirectory(dramaId))
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle('tags:list', () => dependencies.requireTagService().list())
  ipcMain.handle('tags:create', (_event, name: unknown) => dependencies.requireTagService().create(name))
  ipcMain.handle('tags:rename', (_event, tagId: unknown, name: unknown) => dependencies.requireTagService().rename(tagId, name))
  ipcMain.handle('tags:delete', (_event, tagId: unknown) => dependencies.requireTagService().delete(tagId))
  ipcMain.handle('tags:attach', (_event, dramaId: unknown, tagId: unknown) => dependencies.requireTagService().attach(dramaId, tagId))
  ipcMain.handle('scripts:list', (_event, dramaId: unknown) => dependencies.requireScriptAssetService().list(dramaId))
  ipcMain.handle('scripts:import', (_event, dramaId: unknown, path: unknown) => dependencies.requireScriptAssetService().import(dramaId, path))
  ipcMain.handle('scripts:link-episode', (_event, scriptId: unknown, episodeId: unknown) => dependencies.requireScriptAssetService().link(scriptId, episodeId))
  ipcMain.handle('scripts:link-segment', (_event, segmentId: unknown, episodeId: unknown) => dependencies.requireScriptAssetService().linkSegment(segmentId, episodeId))
  ipcMain.handle('assets:health', (_event, dramaId: unknown) => dependencies.requireAssetHealthService().inspect(String(dramaId)))
  ipcMain.handle('assets:relink', (_event, dramaId: unknown, paths: unknown) => dependencies.requireRelinkService().relink(z.string().trim().min(1).parse(dramaId), parseRelinkCandidates(paths)))
  ipcMain.handle('materials:list', (_event, dramaId: unknown) => dependencies.requireDatabase().prepare('SELECT id, task_id AS taskId, task_item_id AS taskItemId, path, duration_seconds AS durationSeconds, fps, size_bytes AS sizeBytes, created_at AS createdAt FROM generated_materials WHERE drama_id = ? ORDER BY created_at DESC').all(String(dramaId)))
  ipcMain.handle('output:choose-directory', () => process.env.SHORTDRAMA_MATERIAL_E2E_OUTPUT_DIRECTORY ?? chooseFile(dependencies, { properties: ['openDirectory', 'createDirectory'] }))
  ipcMain.handle('subtitles:choose-file', () => process.env.SHORTDRAMA_MATERIAL_E2E_SUBTITLE_PATH ?? chooseFile(dependencies, { properties: ['openFile'], filters: [{ name: 'Subtitles', extensions: ['srt', 'vtt'] }] }))
  ipcMain.handle('audio:choose-file', () => chooseFile(dependencies, { properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }] }))
  ipcMain.handle('subtitles:import', (_event, dramaId: unknown, episodeId: unknown, path: unknown) => dependencies.requireSubtitleAssetService().importFile(dramaId, episodeId, path))
  ipcMain.handle('subtitles:list', (_event, dramaId: unknown) => dependencies.requireSubtitleAssetService().list(dramaId))
  ipcMain.handle('subtitles:remove', (_event, assetId: unknown) => dependencies.requireSubtitleAssetService().remove(assetId))
  ipcMain.handle('subtitles:recognition-settings:get', (_event, dramaId: unknown) => {
    const id = z.string().trim().min(1).parse(dramaId)
    const row = dependencies.requireDatabase().prepare('SELECT scope, language, asr_mode AS asrMode, ocr_mode AS ocrMode, difference_threshold AS differenceThreshold, import_strategy AS importStrategy FROM subtitle_recognition_settings WHERE drama_id = ?').get(id)
    return subtitleRecognitionSettingsSchema.parse(row ?? defaultSubtitleRecognitionSettings)
  })
  ipcMain.handle('subtitles:recognition-settings:save', (_event, dramaId: unknown, settings: unknown) => {
    const id = z.string().trim().min(1).parse(dramaId); const value = subtitleRecognitionSettingsSchema.parse(settings)
    dependencies.requireDatabase().prepare('INSERT INTO subtitle_recognition_settings (drama_id, scope, language, asr_mode, ocr_mode, difference_threshold, import_strategy, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(drama_id) DO UPDATE SET scope = excluded.scope, language = excluded.language, asr_mode = excluded.asr_mode, ocr_mode = excluded.ocr_mode, difference_threshold = excluded.difference_threshold, import_strategy = excluded.import_strategy, updated_at = excluded.updated_at').run(id, value.scope, value.language, value.asrMode, value.ocrMode, value.differenceThreshold, value.importStrategy, new Date().toISOString())
    return value
  })
  ipcMain.handle('subtitles:evidence:create-track', (_event, input: unknown) => dependencies.requireSubtitleEvidenceService().createTrack(input))
  ipcMain.handle('subtitles:evidence:list-tracks', (_event, dramaId: unknown, episodeId?: unknown) => dependencies.requireSubtitleEvidenceService().listTracks(dramaId, episodeId))
  ipcMain.handle('subtitles:evidence:list-cues', (_event, trackId: unknown) => dependencies.requireSubtitleEvidenceService().listCues(trackId))
  ipcMain.handle('subtitles:evidence:set-ocr-region', (_event, dramaId: unknown, episodeId: unknown, region: unknown) => dependencies.requireSubtitleEvidenceService().setOcrRegion(dramaId, episodeId, region))
  ipcMain.handle('subtitles:evidence:get-effective-ocr-region', (_event, dramaId: unknown, episodeId: unknown) => dependencies.requireSubtitleEvidenceService().getEffectiveOcrRegion(dramaId, episodeId))
  ipcMain.handle('subtitles:evidence:clear-ocr-region', (_event, dramaId: unknown, episodeId: unknown) => dependencies.requireSubtitleEvidenceService().clearOcrRegion(dramaId, episodeId))
  ipcMain.handle('subtitles:evidence:start-manual-revision', (_event, trackId: unknown, label?: unknown) => dependencies.requireSubtitleEvidenceService().startManualRevision(trackId, label))
  ipcMain.handle('subtitles:evidence:update-resolved-cue', (_event, trackId: unknown, cueId: unknown, update: unknown) => dependencies.requireSubtitleEvidenceService().updateResolvedCue(trackId, cueId, update))
  ipcMain.handle('subtitles:evidence:archive-track', (_event, trackId: unknown) => dependencies.requireSubtitleEvidenceService().archiveTrack(trackId))
  ipcMain.handle('subtitles:evidence:compare', (_event, asrTrackId: unknown, ocrTrackId: unknown, minimumSimilarity?: unknown, minimumConfidence?: unknown) => dependencies.requireSubtitleEvidenceService().compareAsrAndOcr(asrTrackId, ocrTrackId, minimumSimilarity, minimumConfidence))
  ipcMain.handle('subtitles:evidence:comparison-results', (_event, asrTrackId: unknown, visualTrackId: unknown, minimumSimilarity?: unknown, minimumConfidence?: unknown) => dependencies.requireSubtitleEvidenceService().getComparisonResults(asrTrackId, visualTrackId, minimumSimilarity, minimumConfidence))
  ipcMain.handle('subtitles:evidence:list-conflicts', (_event, dramaId: unknown, episodeId?: unknown) => dependencies.requireSubtitleEvidenceService().listConflicts(dramaId, episodeId))
  ipcMain.handle('subtitles:evidence:resolve-conflict', (_event, conflictId: unknown, decision: unknown) => dependencies.requireSubtitleEvidenceService().resolveConflict(conflictId, decision))
  ipcMain.handle('subtitles:evidence:record-quality-evaluation', (_event, input: unknown) => dependencies.requireSubtitleEvidenceService().recordQualityEvaluation(input))
  ipcMain.handle('subtitles:evidence:quality-report', (_event, dramaId: unknown, episodeId?: unknown) => dependencies.requireSubtitleEvidenceService().getQualityReport(dramaId, episodeId))
  ipcMain.handle('subtitles:evidence:local-ocr-availability', () => dependencies.requireLocalOcrSubtitleService().getAvailability())
  ipcMain.handle('subtitles:evidence:local-ocr-extract', (_event, input: unknown) => dependencies.requireLocalOcrSubtitleService().extractFixedRegionFromAsr(input))
  ipcMain.handle('subtitles:evidence:export-srt', async (_event, trackId: unknown) => {
    const window = dependencies.getMainWindow(); const result = window ? await dialog.showSaveDialog(window, { defaultPath: 'subtitles.srt', filters: [{ name: 'SubRip subtitles', extensions: ['srt'] }] }) : await dialog.showSaveDialog({ defaultPath: 'subtitles.srt', filters: [{ name: 'SubRip subtitles', extensions: ['srt'] }] })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, dependencies.requireSubtitleEvidenceService().exportTrackAsSrt(trackId), 'utf8')
    return result.filePath
  })
  ipcMain.handle('subtitles:evidence:export-vtt', async (_event, trackId: unknown) => saveSubtitleText(dependencies, 'subtitles.vtt', 'WebVTT subtitles', 'vtt', dependencies.requireSubtitleEvidenceService().exportTrackAsVtt(trackId)))
  ipcMain.handle('subtitles:evidence:export-audit', async (_event, trackId: unknown) => saveSubtitleText(dependencies, 'subtitle-audit.json', 'Subtitle audit', 'json', dependencies.requireSubtitleEvidenceService().exportTrackAudit(trackId)))
  ipcMain.handle('providers:list', () => dependencies.requireProviderProfileService().list())
  ipcMain.handle('providers:save', (_event, input: unknown) => dependencies.requireProviderProfileService().save(input))
  ipcMain.handle('logs:clear', () => dependencies.requireLogService().clear())
  ipcMain.handle('diagnostics:export', (_event, directory: unknown) => dependencies.exportDiagnostics(z.string().trim().min(1).parse(directory)))
  ipcMain.handle('paths:open', (_event, path: unknown) => shell.showItemInFolder(z.string().trim().min(1).parse(path)))
  ipcMain.handle('external:open-url', (_event, url: unknown) => openExternalUrl((target) => shell.openExternal(target), url))
  ipcMain.handle('ai:capabilities:list', () => {
    const profiles = dependencies.requireProviderProfileService().list()
    const secretService = dependencies.requireSecretService()
    const hasValidSecret = (secretRef: string): boolean => { try { return secretService.getStatus(secretRef).exists } catch { return false } }
    return AI_CAPABILITIES.filter((capability) => capability !== 'tts').map((capability) => {
      const resolved = resolveCapability(profiles, capability, hasValidSecret)
      return resolved.mode === 'configured' ? { capability, mode: 'configured' as const, reason: null } : { capability, mode: 'controlled' as const, reason: resolved.reason }
    })
  })
  ipcMain.handle('ai:remix:create', (_event, input: unknown) => dependencies.requireAiAnalysisService().create(input))
  ipcMain.handle('ai:remix:get', (_event, taskId: unknown) => dependencies.requireAiTaskLifecycleService().get(taskId))
  ipcMain.handle('ai:remix:run', (_event, taskId: unknown) => dependencies.requireAiTaskLifecycleService().run(taskId))
  ipcMain.handle('ai:remix:recover', (_event, taskId: unknown) => dependencies.requireAiTaskLifecycleService().recover(taskId))
  ipcMain.handle('ai:remix:decide-duration', (_event, taskId: unknown, action: unknown) => dependencies.requireAiTaskLifecycleService().decide(taskId, action))
  ipcMain.handle('ai:remix:evidence:list', (_event, taskId: unknown) => dependencies.requireAiTaskLifecycleService().listEvidence(taskId))
  ipcMain.handle('ai:timeline:get', (_event, draftId: unknown) => dependencies.requireTimelineService().getOrCreate(draftId))
  ipcMain.handle('ai:timeline:save', (_event, draftId: unknown, timeline: unknown) => dependencies.requireTimelineService().save(draftId, timeline))
  ipcMain.handle('ai:timeline:add-audio', (_event, draftId: unknown, input: unknown) => dependencies.requireTimelineService().addAudio(draftId, input))
  ipcMain.handle('ai:timeline:confirm', (_event, draftId: unknown) => dependencies.requireTimelineService().confirm(draftId))
  ipcMain.handle('ai:timeline:export', (_event, draftId: unknown, outputDirectory: unknown) => dependencies.requireRemixExportService().export(draftId, outputDirectory))
  registerProductionIpc({ originalClipService: dependencies.requireOriginalClipService, taskCenterService: dependencies.requireTaskCenterService, taskQueue: dependencies.requireTaskQueue, multiEpisodeService: dependencies.requireMultiEpisodeService, requireP0Task: dependencies.requireP0Task, taskExecutor: dependencies.taskExecutor, resumeP0Task: dependencies.resumeP0Task, recordTaskCompletion: dependencies.recordTaskCompletion, writeTechnicalLog: dependencies.writeTechnicalLog })
  ipcMain.handle('scripts:choose-file', () => chooseFile(dependencies, { properties: ['openFile'], filters: [{ name: 'Scripts', extensions: ['txt', 'docx', 'pdf'] }] }))
}
