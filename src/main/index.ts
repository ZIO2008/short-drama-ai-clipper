import { app, BrowserWindow, dialog } from 'electron'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { openDatabase } from './db/migrate.js'
import { canStoreSecrets } from './security/secret-store.js'
import { SecretService } from './security/secret-service.js'
import { NotificationService } from './services/notification-service.js'
import { DramaService } from './services/drama-service.js'
import { DramaCoverService } from './services/drama-cover-service.js'
import { TagService } from './services/tag-service.js'
import { ScriptAssetService } from './services/script-asset-service.js'
import { AssetHealthService } from './services/asset-health-service.js'
import { RelinkService } from './services/relink-service.js'
import { OriginalClipService } from './services/original-clip-service.js'
import type { ClipSemanticAdapter } from './services/clip-candidate-intelligence-service.js'
import { OpenAiCompatibleClipMultimodalReviewAdapter, OpenAiCompatibleClipSemanticAdapter } from './services/openai-compatible-clip-semantic-adapter.js'
import { createE2eClipSemanticAdapter } from './services/e2e-clip-semantic-adapter.js'
import { TaskCenterService } from './tasks/task-center-service.js'
import { TaskQueue } from './tasks/task-queue.js'
import { BackupService, shouldBackupBeforeUpgrade, shouldCreateDailyBackup } from './services/backup-service.js'
import { writeDiagnosticManifest } from './services/diagnostic-bundle-service.js'
import { LogService } from './services/log-service.js'
import { ProviderProfileService } from './services/provider-profile-service.js'
import { DeepSeekConfigurationTestService } from './services/deepseek-configuration-test-service.js'
import { ModelStudioConfigurationTestService } from './services/model-studio-configuration-test-service.js'
import { TencentAsrConfigurationTestService } from './services/tencent-asr-configuration-test-service.js'
import { MultiEpisodeService } from './services/multi-episode-service.js'
import { SubtitleAssetService } from './services/subtitle-asset-service.js'
import { SubtitleEvidenceService } from './services/subtitle-evidence-service.js'
import { LocalOcrSubtitleService } from './services/local-ocr-subtitle-service.js'
import { DefaultAsrSubtitleService } from './services/default-asr-subtitle-service.js'
import { SubtitleRecognitionRunService } from './services/subtitle-recognition-run-service.js'
import { normalizeP0StartupState } from './p0-startup-recovery.js'
import { registerAppIpc } from './ipc/app-ipc.js'
import { createMainWindow } from './window-factory.js'
import { AiAnalysisService } from './ai/ai-analysis-service.js'
import { AiTaskLifecycleService } from './ai/ai-task-lifecycle-service.js'
import { TimelineService } from './ai/timeline-service.js'
import { RemixExportService } from './ai/remix-export-service.js'
import { ProjectLibraryIntegrityService } from './services/project-library-integrity-service.js'
import { registerLocalMediaProtocol, registerLocalMediaScheme } from './media/local-media-protocol.js'
import { migrateLegacyUserData } from './data/legacy-user-data-migration.js'
import { runPackagedEvidenceCli } from './packaged-evidence-dispatcher.js'
import { createP0TaskRuntime } from './p0-task-runtime.js'
import { disablePackagedE2eEnvironment, isE2eRuntimeEnabled } from './e2e-runtime-gate.js'
import { resolvePackagedSmokeUserData } from './packaged-smoke-runtime.js'
import type { AppHealth } from '../shared/contracts.js'
import { RELEASE_METADATA } from '../shared/release-metadata.js'
import { resolveUserDataProfile } from './user-data-profile.js'
import type Database from 'better-sqlite3'
const APP_ID = 'local.shortdrama.materialstudio'
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('in-process-gpu')
app.commandLine.appendSwitch('use-gl', 'swiftshader')
app.commandLine.appendSwitch('use-angle', 'swiftshader')
registerLocalMediaScheme()
disablePackagedE2eEnvironment(app.isPackaged)
const CHANNEL = process.env.SHORTDRAMA_MATERIAL_CHANNEL ?? (app.isPackaged ? 'stable' : 'development')
const e2eRuntimeEnabled = isE2eRuntimeEnabled(app.isPackaged, CHANNEL)
app.setAppUserModelId(APP_ID)
const explicitTestDataPath = e2eRuntimeEnabled && process.env.SHORTDRAMA_MATERIAL_USER_DATA ? resolve(process.env.SHORTDRAMA_MATERIAL_USER_DATA) : null
const packagedSmokeDataPath = resolvePackagedSmokeUserData(app.isPackaged, process.argv, tmpdir())
const isolatedRuntimeDataPath = resolveUserDataProfile(app.getPath('appData'), process.argv, explicitTestDataPath ?? packagedSmokeDataPath)
const sharedUserDataPath = join(app.getPath('appData'), 'ShortDramaMaterialStudio')
app.setPath('userData', isolatedRuntimeDataPath ?? sharedUserDataPath)
let mainWindow: BrowserWindow | null = null
let databasePath = ''
let startupErrorCode: AppHealth['initializationErrorCode'] = null
let startupErrorMessage: string | null = null
let recoveryNotice: string | null = null
let secretService: SecretService | null = null
let notificationService: NotificationService | null = null
let dramaService: DramaService | null = null
let dramaCoverService: DramaCoverService | null = null
let tagService: TagService | null = null
let scriptAssetService: ScriptAssetService | null = null
let assetHealthService: AssetHealthService | null = null
let relinkService: RelinkService | null = null
let originalClipService: OriginalClipService | null = null
let taskCenterService: TaskCenterService | null = null
let databaseHandle: Database.Database | null = null
let taskQueue: TaskQueue | null = null
let multiEpisodeService: MultiEpisodeService | null = null
let subtitleAssetService: SubtitleAssetService | null = null
let subtitleEvidenceService: SubtitleEvidenceService | null = null
let localOcrSubtitleService: LocalOcrSubtitleService | null = null
let defaultAsrSubtitleService: DefaultAsrSubtitleService | null = null
let subtitleRecognitionRunService: SubtitleRecognitionRunService | null = null
let quittingAfterConfirmation = false
let backupService: BackupService | null = null
let logService: LogService | null = null
let providerProfileService: ProviderProfileService | null = null
let deepSeekConfigurationTestService: DeepSeekConfigurationTestService | null = null
let modelStudioConfigurationTestService: ModelStudioConfigurationTestService | null = null
let tencentAsrConfigurationTestService: TencentAsrConfigurationTestService | null = null
let aiAnalysisService: AiAnalysisService | null = null
let aiTaskLifecycleService: AiTaskLifecycleService | null = null
let timelineService: TimelineService | null = null
let remixExportService: RemixExportService | null = null
let projectLibraryIntegrityService: ProjectLibraryIntegrityService | null = null

const e2eDeepSeekProbeFetch = (): typeof fetch => {
  if (!e2eRuntimeEnabled) return fetch
  const result = process.env.SHORTDRAMA_MATERIAL_E2E_DEEPSEEK_RESULT
  if (result !== 'success' && result !== 'authentication') return async () => {
    const error = new Error('E2E DeepSeek probe mock was not explicitly selected.')
    error.name = 'E2EBlockedRequest'
    throw error
  }
  return async () => {
    // The connectivity E2E captures the in-flight state at two viewports.
    // Keep this delay inside the explicit E2E-only mock so renderer contention
    // cannot race that state into a completed result between captures.
    await new Promise<void>((resolve) => setTimeout(resolve, 4_000))
    return result === 'success'
      ? new Response(JSON.stringify({ id: 'e2e-deepseek-probe', object: 'chat.completion', created: 0, model: 'deepseek-v4-flash', choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'ok' } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(JSON.stringify({ error: { message: 'e2e mock only' } }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }
}

// The fixture remains bundled for current Electron tests but is unreachable in packaged or non-e2e channels.
const e2eClipSemanticAdapter = (): ClipSemanticAdapter | null => {
  if (!e2eRuntimeEnabled) return null
  return createE2eClipSemanticAdapter()
}

const createWindow = (): void => { mainWindow = createMainWindow() }

const registerIpc = (): void => registerAppIpc({
  getHealth: () => ({ appVersion: app.getVersion(), releaseScope: RELEASE_METADATA.scope, releaseChannel: RELEASE_METADATA.channel, releaseChannelLabel: RELEASE_METADATA.channelLabel, projectLibraryIntegrity: projectLibraryIntegrityService?.inspect() ?? null, databaseInitialized: startupErrorCode === null, initializationErrorCode: startupErrorCode, initializationErrorMessage: startupErrorMessage, isSecretStorageAvailable: canStoreSecrets(), recoveryNotice }),
  getMainWindow: () => mainWindow,
  getAppVersion: () => app.getVersion(),
  resolveLastImportDirectory,
  exportDiagnostics: (directory) => writeDiagnosticManifest(directory, { appVersion: app.getVersion(), databaseInitialized: startupErrorCode === null }),
  requireSecretService, requireNotificationService, requireDramaService, requireDramaCoverService, requireTagService, requireScriptAssetService, requireAssetHealthService, requireRelinkService, requireDatabase, requireSubtitleAssetService, requireSubtitleEvidenceService, requireLocalOcrSubtitleService, requireDefaultAsrSubtitleService, requireSubtitleRecognitionRunService, requireProviderProfileService, requireDeepSeekConfigurationTestService, requireModelStudioConfigurationTestService, requireTencentAsrConfigurationTestService, requireLogService, requireAiAnalysisService, requireAiTaskLifecycleService, requireTimelineService, requireRemixExportService, requireOriginalClipService, requireTaskCenterService, requireTaskQueue, requireMultiEpisodeService, requireP0Task: p0TaskRuntime.requireTask, taskExecutor, resumeP0Task, recordTaskCompletion, writeTechnicalLog
})

const requireNotificationService = (): NotificationService => {
  if (!notificationService) {
    throw new Error('本地数据尚未初始化，无法读取通知。')
  }
  return notificationService
}

const requireSecretService = (): SecretService => {
  if (!secretService) {
    throw new Error('本地数据尚未初始化，无法保存供应商密钥。')
  }

  return secretService
}

const requireDramaService = (): DramaService => {
  if (!dramaService) throw new Error('Local database is not initialized')
  return dramaService
}
const requireDramaCoverService = (): DramaCoverService => {
  if (!dramaCoverService) throw new Error('Local database is not initialized')
  return dramaCoverService
}
const resolveLastImportDirectory = (dramaId: unknown): string | undefined => {
  if (typeof dramaId !== 'string' || !dramaId.trim()) return undefined
  return requireDramaService().getLastImportDirectory(dramaId) ?? undefined
}
const requireTagService = (): TagService => {
  if (!tagService) throw new Error('Local database is not initialized')
  return tagService
}
const requireScriptAssetService = (): ScriptAssetService => {
  if (!scriptAssetService) throw new Error('Local database is not initialized')
  return scriptAssetService
}
const requireAssetHealthService = (): AssetHealthService => { if (!assetHealthService) throw new Error('Local database is not initialized'); return assetHealthService }
const requireRelinkService = (): RelinkService => { if (!relinkService) throw new Error('Local database is not initialized'); return relinkService }
const requireOriginalClipService = (): OriginalClipService => { if (!originalClipService) throw new Error('Local database is not initialized'); return originalClipService }
const requireTaskCenterService = (): TaskCenterService => { if (!taskCenterService) throw new Error('Local database is not initialized'); return taskCenterService }
const requireTaskQueue = (): TaskQueue => { if (!taskQueue) throw new Error('Task queue is not initialized'); return taskQueue }
const requireMultiEpisodeService = (): MultiEpisodeService => { if (!multiEpisodeService) throw new Error('多集拼接服务尚未初始化'); return multiEpisodeService }
const requireSubtitleAssetService = (): SubtitleAssetService => { if (!subtitleAssetService) throw new Error('字幕服务尚未初始化'); return subtitleAssetService }
const requireSubtitleEvidenceService = (): SubtitleEvidenceService => { if (!subtitleEvidenceService) throw new Error('字幕证据服务尚未初始化'); return subtitleEvidenceService }
const requireLocalOcrSubtitleService = (): LocalOcrSubtitleService => { if (!localOcrSubtitleService) throw new Error('本地 OCR 服务尚未初始化'); return localOcrSubtitleService }
const requireDefaultAsrSubtitleService = (): DefaultAsrSubtitleService => { if (!defaultAsrSubtitleService) throw new Error('默认 ASR 服务尚未初始化'); return defaultAsrSubtitleService }
const requireSubtitleRecognitionRunService = (): SubtitleRecognitionRunService => { if (!subtitleRecognitionRunService) throw new Error('字幕识别任务尚未初始化'); return subtitleRecognitionRunService }
const requireProviderProfileService = (): ProviderProfileService => { if (!providerProfileService) throw new Error('供应商配置服务尚未初始化'); return providerProfileService }
const requireDeepSeekConfigurationTestService = (): DeepSeekConfigurationTestService => { if (!deepSeekConfigurationTestService) throw new Error('DeepSeek 配置测试服务尚未初始化'); return deepSeekConfigurationTestService }
const requireModelStudioConfigurationTestService = (): ModelStudioConfigurationTestService => { if (!modelStudioConfigurationTestService) throw new Error('百炼配置测试服务尚未初始化'); return modelStudioConfigurationTestService }
const requireTencentAsrConfigurationTestService = (): TencentAsrConfigurationTestService => { if (!tencentAsrConfigurationTestService) throw new Error('腾讯云 ASR 配置测试服务尚未初始化'); return tencentAsrConfigurationTestService }
const requireLogService = (): LogService => { if (!logService) throw new Error('本地数据尚未初始化'); return logService }
const requireAiAnalysisService = (): AiAnalysisService => { if (!aiAnalysisService) throw new Error('AI 分析服务尚未初始化'); return aiAnalysisService }
const requireAiTaskLifecycleService = (): AiTaskLifecycleService => { if (!aiTaskLifecycleService) throw new Error('AI 任务服务尚未初始化'); return aiTaskLifecycleService }
const requireTimelineService = (): TimelineService => { if (!timelineService) throw new Error('审核时间线服务尚未初始化'); return timelineService }
const requireRemixExportService = (): RemixExportService => { if (!remixExportService) throw new Error('审核导出服务尚未初始化'); return remixExportService }
const requireDatabase = (): Database.Database => { if (!databaseHandle) throw new Error('Local database is not initialized'); return databaseHandle }
const writeTechnicalLog = (level: 'info' | 'warning' | 'error', eventType: string, details: Record<string, unknown> = {}): void => { try { logService?.write(level, eventType, details) } catch { /* Logging must never prevent startup or fail an IPC request. */ } }
const p0TaskRuntime = createP0TaskRuntime({ database: requireDatabase, queue: requireTaskQueue, multiEpisode: requireMultiEpisodeService, originalClip: requireOriginalClipService, notification: () => notificationService })
const taskExecutor = p0TaskRuntime.executor
const resumeP0Task = p0TaskRuntime.resume
const recordTaskCompletion = p0TaskRuntime.recordCompletion

app.whenReady().then(async () => {
  registerLocalMediaProtocol()
  if (await runPackagedEvidenceCli()) return
  databasePath = join(app.getPath('userData'), 'data', 'material-studio.sqlite')
  backupService = new BackupService()
  try {
    const dataMigration = isolatedRuntimeDataPath ? null : await migrateLegacyUserData(sharedUserDataPath)
    if (dataMigration?.migrated) {
      recoveryNotice = `已将 ${dataMigration.sourceChannel} 数据迁移到统一数据目录`
    }
    let database: Database.Database
    try { database = openDatabase(databasePath) } catch (error) {
      const backupDirectory = join(app.getPath('userData'), 'backups')
      const restored = await backupService.restoreLatestValid(backupDirectory, databasePath)
      if (!restored) throw error
      recoveryNotice = `已从 ${restored.createdAt} 的本地备份恢复数据库。`
      database = openDatabase(databasePath)
    }
    databaseHandle = database
    normalizeP0StartupState(database)
    secretService = new SecretService(database)
    secretService.cleanupExpiredModelStudioProvisionals()
    notificationService = new NotificationService(database)
    dramaService = new DramaService(database, join(app.getPath('userData'), 'cache'))
    dramaCoverService = new DramaCoverService(database, join(app.getPath('userData'), 'cache'))
    tagService = new TagService(database)
    scriptAssetService = new ScriptAssetService(database)
    assetHealthService = new AssetHealthService(database)
    relinkService = new RelinkService(database, dramaService)
    taskCenterService = new TaskCenterService(database)
    logService = new LogService(database)
    writeTechnicalLog('info', 'app.initialization.completed', { appVersion: app.getVersion(), channel: CHANNEL })
    taskQueue = new TaskQueue(database, 2, logService)
    providerProfileService = new ProviderProfileService(database)
    originalClipService = new OriginalClipService(database, taskQueue, {
      profiles: { list: () => e2eClipSemanticAdapter() ? [{ id: 'e2e-text-semantics', capability: 'text-analysis', region: 'local', provider: 'E2E fixture only', endpoint: 'http://127.0.0.1/e2e', model: 'fixture', secretRef: null, timeoutMs: 1_000, pricing: null }] : providerProfileService?.list() ?? [] },
      hasValidSecret: (secretRef) => {
        try { return secretService?.getStatus(secretRef).exists ?? false } catch { return false }
      },
      adapter: e2eClipSemanticAdapter() ?? new OpenAiCompatibleClipSemanticAdapter(secretService),
      multimodalAdapter: new OpenAiCompatibleClipMultimodalReviewAdapter(secretService),
    })
    // Only persistent pending work is resumed. Running provider calls were
    // explicitly marked interrupted above and are never replayed on startup.
    originalClipService.resumePendingIntelligentGenerations()
    multiEpisodeService = new MultiEpisodeService(database, taskQueue)
    subtitleAssetService = new SubtitleAssetService(database)
    subtitleEvidenceService = new SubtitleEvidenceService(database)
    localOcrSubtitleService = new LocalOcrSubtitleService(database, subtitleEvidenceService)
    defaultAsrSubtitleService = new DefaultAsrSubtitleService(database, subtitleEvidenceService, providerProfileService, secretService)
    subtitleRecognitionRunService = new SubtitleRecognitionRunService(database)
    subtitleRecognitionRunService.recoverInterruptedRuns()
    deepSeekConfigurationTestService = new DeepSeekConfigurationTestService(providerProfileService, secretService, e2eDeepSeekProbeFetch())
    modelStudioConfigurationTestService = new ModelStudioConfigurationTestService(providerProfileService, secretService)
    tencentAsrConfigurationTestService = new TencentAsrConfigurationTestService(providerProfileService, secretService)
    aiAnalysisService = new AiAnalysisService(database)
    aiTaskLifecycleService = new AiTaskLifecycleService(database, taskQueue, notificationService)
    timelineService = new TimelineService(database)
    remixExportService = new RemixExportService(database)
    projectLibraryIntegrityService = new ProjectLibraryIntegrityService(database)
    logService.rotate()
    const backupDirectory = join(app.getPath('userData'), 'backups')
    const latest = database.prepare('SELECT created_at AS createdAt FROM app_backups ORDER BY created_at DESC LIMIT 1').get() as { createdAt: string } | undefined
    const previousStart = database.prepare("SELECT details_json AS details FROM app_logs WHERE event_type = 'app.started' ORDER BY created_at DESC LIMIT 1").get() as { details: string | null } | undefined
    let previousVersion: string | null = null
    try { const details = previousStart?.details ? JSON.parse(previousStart.details) as { appVersion?: unknown } : null; previousVersion = typeof details?.appVersion === 'string' ? details.appVersion : null } catch { previousVersion = null }
    if (shouldCreateDailyBackup(latest?.createdAt ?? null) || shouldBackupBeforeUpgrade(previousVersion, app.getVersion())) await backupService.create(database, backupDirectory, shouldBackupBeforeUpgrade(previousVersion, app.getVersion()) ? 'upgrade' : 'daily', database)
  } catch (error) {
    startupErrorCode = 'DATABASE_UNAVAILABLE'
    startupErrorMessage = error instanceof Error ? error.message : '未知数据库初始化错误。'
    writeTechnicalLog('error', 'app.initialization.failed', { errorCode: 'DATABASE_UNAVAILABLE' })
    console.error('Database initialization failed', error)
  }
  registerIpc()
  createWindow()
  writeTechnicalLog('info', 'app.started', { appVersion: app.getVersion(), channel: CHANNEL })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

app.on('before-quit', (event) => {
  if (quittingAfterConfirmation || !databaseHandle) return
  const running = databaseHandle.prepare("SELECT id, progress_current AS progressCurrent, progress_total AS progressTotal FROM production_tasks WHERE status IN ('running', 'pending')").all() as Array<{ id: string; progressCurrent: number; progressTotal: number }>
  if (running.length === 0) return
  event.preventDefault()
  const summary = running.map(({ progressCurrent, progressTotal }) => `${progressCurrent}/${progressTotal}`).join('、')
  const confirmation = mainWindow ? dialog.showMessageBox(mainWindow, { type: 'warning', title: '仍有任务运行', message: `当前有 ${running.length} 个任务（进度 ${summary}）。退出后会保存检查点，下一次启动可继续。`, buttons: ['取消', '退出并保存检查点'], defaultId: 0, cancelId: 0 }) : dialog.showMessageBox({ type: 'warning', title: '仍有任务运行', message: `当前有 ${running.length} 个任务（进度 ${summary}）。退出后会保存检查点，下一次启动可继续。`, buttons: ['取消', '退出并保存检查点'], defaultId: 0, cancelId: 0 })
  void confirmation.then(({ response }) => {
    if (response !== 1) return
    for (const task of running) { try { p0TaskRuntime.stopForShutdown(task.id) } catch { databaseHandle?.prepare("UPDATE production_tasks SET status = 'paused', updated_at = ? WHERE id = ?").run(new Date().toISOString(), task.id) } }
    quittingAfterConfirmation = true
    app.quit()
  })
})
