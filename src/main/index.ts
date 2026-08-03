import { app, BrowserWindow, dialog } from 'electron'
import { join, resolve } from 'node:path'
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
import { TaskCenterService } from './tasks/task-center-service.js'
import { TaskQueue, type TaskExecutor } from './tasks/task-queue.js'
import { BackupService, shouldBackupBeforeUpgrade, shouldCreateDailyBackup } from './services/backup-service.js'
import { writeDiagnosticManifest } from './services/diagnostic-bundle-service.js'
import { LogService } from './services/log-service.js'
import { ProviderProfileService } from './services/provider-profile-service.js'
import { MultiEpisodeService } from './services/multi-episode-service.js'
import { SubtitleAssetService } from './services/subtitle-asset-service.js'
import { SubtitleEvidenceService } from './services/subtitle-evidence-service.js'
import { LocalOcrSubtitleService } from './services/local-ocr-subtitle-service.js'
import { TaskCheckpointService } from './tasks/task-checkpoint-service.js'
import { registerAppIpc } from './ipc/app-ipc.js'
import { createMainWindow } from './window-factory.js'
import { AiAnalysisService } from './ai/ai-analysis-service.js'
import { AiTaskLifecycleService } from './ai/ai-task-lifecycle-service.js'
import { TimelineService } from './ai/timeline-service.js'
import { RemixExportService } from './ai/remix-export-service.js'
import { ProjectLibraryIntegrityService } from './services/project-library-integrity-service.js'
import type { AppHealth } from '../shared/contracts.js'
import { RELEASE_METADATA } from '../shared/release-metadata.js'
import type Database from 'better-sqlite3'

const APP_ID = 'local.shortdrama.materialstudio'
// The workspace is a data-focused desktop app; software rendering keeps clean
// Windows/VM environments usable when Chromium cannot initialize a GPU process.
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-compositing')
app.commandLine.appendSwitch('in-process-gpu')
app.commandLine.appendSwitch('use-gl', 'swiftshader')
app.commandLine.appendSwitch('use-angle', 'swiftshader')
const CHANNEL = process.env.SHORTDRAMA_MATERIAL_CHANNEL ?? (app.isPackaged ? 'stable' : 'development')
app.setAppUserModelId(APP_ID)
const explicitTestDataPath = process.env.SHORTDRAMA_MATERIAL_E2E === '1' && process.env.SHORTDRAMA_MATERIAL_USER_DATA ? resolve(process.env.SHORTDRAMA_MATERIAL_USER_DATA) : null
app.setPath('userData', explicitTestDataPath ?? join(app.getPath('appData'), 'ShortDramaMaterialStudio', CHANNEL))

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
let quittingAfterConfirmation = false
let backupService: BackupService | null = null
let logService: LogService | null = null
let providerProfileService: ProviderProfileService | null = null
let aiAnalysisService: AiAnalysisService | null = null
let aiTaskLifecycleService: AiTaskLifecycleService | null = null
let timelineService: TimelineService | null = null
let remixExportService: RemixExportService | null = null
let projectLibraryIntegrityService: ProjectLibraryIntegrityService | null = null

const createWindow = (): void => { mainWindow = createMainWindow() }

const registerIpc = (): void => registerAppIpc({
  getHealth: () => ({ appVersion: app.getVersion(), releaseScope: RELEASE_METADATA.scope, releaseChannel: RELEASE_METADATA.channel, releaseChannelLabel: RELEASE_METADATA.channelLabel, projectLibraryIntegrity: projectLibraryIntegrityService?.inspect() ?? null, databaseInitialized: startupErrorCode === null, initializationErrorCode: startupErrorCode, initializationErrorMessage: startupErrorMessage, isSecretStorageAvailable: canStoreSecrets(), recoveryNotice }),
  getMainWindow: () => mainWindow,
  getAppVersion: () => app.getVersion(),
  resolveLastImportDirectory,
  exportDiagnostics: (directory) => writeDiagnosticManifest(directory, { appVersion: app.getVersion(), databaseInitialized: startupErrorCode === null }),
  requireSecretService, requireNotificationService, requireDramaService, requireDramaCoverService, requireTagService, requireScriptAssetService, requireAssetHealthService, requireRelinkService, requireDatabase, requireSubtitleAssetService, requireSubtitleEvidenceService, requireLocalOcrSubtitleService, requireProviderProfileService, requireLogService, requireAiAnalysisService, requireAiTaskLifecycleService, requireTimelineService, requireRemixExportService, requireOriginalClipService, requireTaskCenterService, requireTaskQueue, requireMultiEpisodeService, requireP0Task, taskExecutor, resumeP0Task, recordTaskCompletion, writeTechnicalLog
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
const requireProviderProfileService = (): ProviderProfileService => { if (!providerProfileService) throw new Error('供应商配置服务尚未初始化'); return providerProfileService }
const requireLogService = (): LogService => { if (!logService) throw new Error('本地数据尚未初始化'); return logService }
const requireAiAnalysisService = (): AiAnalysisService => { if (!aiAnalysisService) throw new Error('AI 分析服务尚未初始化'); return aiAnalysisService }
const requireAiTaskLifecycleService = (): AiTaskLifecycleService => { if (!aiTaskLifecycleService) throw new Error('AI 任务服务尚未初始化'); return aiTaskLifecycleService }
const requireTimelineService = (): TimelineService => { if (!timelineService) throw new Error('审核时间线服务尚未初始化'); return timelineService }
const requireRemixExportService = (): RemixExportService => { if (!remixExportService) throw new Error('审核导出服务尚未初始化'); return remixExportService }
const requireDatabase = (): Database.Database => { if (!databaseHandle) throw new Error('Local database is not initialized'); return databaseHandle }
const requireP0Task = (taskId: string): { type: 'original_clip' | 'multi_episode' } => {
  const task = requireDatabase().prepare("SELECT type FROM production_tasks WHERE id = ? AND type IN ('original_clip', 'multi_episode')").get(taskId) as { type: 'original_clip' | 'multi_episode' } | undefined
  if (!task) throw new Error('该任务不属于当前 P0 候选版本，无法继续执行。')
  return task
}
const resumeP0Task = async (taskId: string): Promise<void> => {
  const task = requireP0Task(taskId)
  try {
    requireTaskQueue().resume(taskId)
    return
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'Task is not running in this queue') throw error
  }
  if (task.type === 'multi_episode') await requireMultiEpisodeService().recover(taskId)
  else await requireTaskQueue().recover(taskId, taskExecutor)
}

const writeTechnicalLog = (level: 'info' | 'warning' | 'error', eventType: string, details: Record<string, unknown> = {}): void => {
  try {
    logService?.write(level, eventType, details)
  } catch {
    // Logging must never prevent startup or fail an IPC request.
  }
}

const taskExecutor: TaskExecutor = async (item) => {
  const database = requireDatabase()
  const task = database.prepare('SELECT type, config_snapshot AS configSnapshot FROM production_tasks WHERE id = ?').get(item.taskId) as { type: string; configSnapshot: string } | undefined
  if (!task) throw new Error('任务不存在。')
  if (task.type !== 'original_clip') throw new Error('该任务类型尚未接入可恢复执行器，请回到生产工作区重新创建。')
  const config = JSON.parse(task.configSnapshot) as { outputDirectory?: string }
  if (!config.outputDirectory) throw new Error('任务缺少输出目录配置，请回到原剧切片工作区重新导出。')
  await requireOriginalClipService().retryFailedCandidate(item.id, config.outputDirectory)
  return { status: 'succeeded' as const }
}

const recordTaskCompletion = (taskId: string): void => {
  if (!notificationService) return
  const row = requireDatabase().prepare('SELECT status FROM production_tasks WHERE id = ?').get(taskId) as { status: string } | undefined
  if (!row) return
  const counts = requireDatabase().prepare('SELECT status, COUNT(*) AS count FROM task_items WHERE task_id = ? GROUP BY status').all(taskId) as Array<{ status: string; count: number }>
  const summary = counts.map(({ status, count }) => `${status} ${count} 项`).join('，') || '无任务项'
  const status = row.status === 'partial' || row.status === 'partially_completed' ? 'partial' : row.status
  const severity = status === 'completed' ? 'success' : status === 'partial' ? 'warning' : status === 'failed' ? 'error' : 'info'
  const title = status === 'completed' ? '生产任务已完成' : status === 'partial' ? '生产任务部分完成' : status === 'failed' ? '生产任务连续失败' : `生产任务${status}`
  notificationService.recordTaskEvent({ eventKey: `${taskId}:${status}`, taskId, severity, title, summary, actionTarget: `tasks/${taskId}` })
}

app.whenReady().then(async () => {
  databasePath = join(app.getPath('userData'), 'data', 'material-studio.sqlite')
  backupService = new BackupService()
  try {
    let database: Database.Database
    try { database = openDatabase(databasePath) } catch (error) {
      const backupDirectory = join(app.getPath('userData'), 'backups')
      const restored = await backupService.restoreLatestValid(backupDirectory, databasePath)
      if (!restored) throw error
      recoveryNotice = `已从 ${restored.createdAt} 的本地备份恢复数据库。`
      database = openDatabase(databasePath)
    }
    databaseHandle = database
    new TaskCheckpointService(database).normalizeInterruptedTasks()
    secretService = new SecretService(database)
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
    originalClipService = new OriginalClipService(database, taskQueue)
    multiEpisodeService = new MultiEpisodeService(database, taskQueue)
    subtitleAssetService = new SubtitleAssetService(database)
    subtitleEvidenceService = new SubtitleEvidenceService(database)
    localOcrSubtitleService = new LocalOcrSubtitleService(database, subtitleEvidenceService)
    providerProfileService = new ProviderProfileService(database)
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (quittingAfterConfirmation || !databaseHandle) return
  const running = databaseHandle.prepare("SELECT id, progress_current AS progressCurrent, progress_total AS progressTotal FROM production_tasks WHERE status IN ('running', 'pending')").all() as Array<{ id: string; progressCurrent: number; progressTotal: number }>
  if (running.length === 0) return
  event.preventDefault()
  const summary = running.map(({ progressCurrent, progressTotal }) => `${progressCurrent}/${progressTotal}`).join('、')
  const confirmation = mainWindow ? dialog.showMessageBox(mainWindow, { type: 'warning', title: '仍有任务运行', message: `当前有 ${running.length} 个任务（进度 ${summary}）。退出后会保存检查点，下一次启动可继续。`, buttons: ['取消', '退出并保存检查点'], defaultId: 0, cancelId: 0 }) : dialog.showMessageBox({ type: 'warning', title: '仍有任务运行', message: `当前有 ${running.length} 个任务（进度 ${summary}）。退出后会保存检查点，下一次启动可继续。`, buttons: ['取消', '退出并保存检查点'], defaultId: 0, cancelId: 0 })
  void confirmation.then(({ response }) => {
    if (response !== 1) return
    for (const task of running) { try { taskQueue?.stopForShutdown(task.id) } catch { databaseHandle?.prepare("UPDATE production_tasks SET status = 'paused', updated_at = ? WHERE id = ?").run(new Date().toISOString(), task.id) } }
    quittingAfterConfirmation = true
    app.quit()
  })
})
