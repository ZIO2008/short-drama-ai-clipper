import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { join, resolve } from 'node:path'
import { openDatabase } from './db/migrate.js'
import { canStoreSecrets } from './security/secret-store.js'
import { SecretService } from './security/secret-service.js'
import { NotificationService } from './services/notification-service.js'
import { DramaService } from './services/drama-service.js'
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
import type { AppHealth } from '../shared/contracts.js'
import type Database from 'better-sqlite3'
import { z } from 'zod'

const APP_ID = 'local.shortdrama.materialstudio'
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
let quittingAfterConfirmation = false
let backupService: BackupService | null = null
let logService: LogService | null = null
let providerProfileService: ProviderProfileService | null = null

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#28231f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const registerIpc = (): void => {
  ipcMain.handle('app:get-health', (): AppHealth => ({
    appVersion: app.getVersion(),
    databaseInitialized: startupErrorCode === null,
    initializationErrorCode: startupErrorCode,
    initializationErrorMessage: startupErrorMessage,
    isSecretStorageAvailable: canStoreSecrets(),
    recoveryNotice
  }))

  ipcMain.handle('secrets:save', (_event, value: unknown, secretRef?: unknown) => {
    return requireSecretService().save({ secretRef, value })
  })
  ipcMain.handle('secrets:get-status', (_event, secretRef: unknown) => requireSecretService().getStatus(secretRef))
  ipcMain.handle('secrets:delete', (_event, secretRef: unknown) => requireSecretService().delete(secretRef))
  ipcMain.handle('notifications:list', () => requireNotificationService().list())
  ipcMain.handle('notifications:mark-read', (_event, notificationId: unknown) => requireNotificationService().markRead(notificationId))
  ipcMain.handle('notifications:mark-all-read', () => requireNotificationService().markAllRead())
  ipcMain.handle('notifications:clear-read', () => requireNotificationService().clearRead())
  ipcMain.handle('notifications:resolve', (_event, notificationId: unknown) => requireNotificationService().resolve(notificationId))
  ipcMain.handle('dramas:list', () => requireDramaService().list())
  ipcMain.handle('dramas:get', (_event, dramaId: unknown) => requireDramaService().get(dramaId))
  ipcMain.handle('dramas:create', (_event, name: unknown) => requireDramaService().create(name))
  ipcMain.handle('dramas:update', (_event, dramaId: unknown, name: unknown) => requireDramaService().update(dramaId, name))
  ipcMain.handle('dramas:delete', (_event, dramaId: unknown, deleteTempFiles: unknown) => requireDramaService().delete(dramaId, deleteTempFiles))
  ipcMain.handle('episodes:import', (_event, dramaId: unknown, paths: unknown) => requireDramaService().importEpisodes(dramaId, paths))
  ipcMain.handle('episodes:update', (_event, dramaId: unknown, episodeId: unknown, update: unknown) => requireDramaService().updateEpisode(dramaId, episodeId, update))
  ipcMain.handle('episodes:remove', (_event, dramaId: unknown, episodeId: unknown) => requireDramaService().removeEpisode(dramaId, episodeId))
  ipcMain.handle('episodes:choose-files', async () => {
    const options: OpenDialogOptions = { properties: ['openFile', 'multiSelections'], filters: [{ name: 'Video files', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }] }
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options)
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle('tags:list', () => requireTagService().list())
  ipcMain.handle('tags:create', (_event, name: unknown) => requireTagService().create(name))
  ipcMain.handle('tags:rename', (_event, tagId: unknown, name: unknown) => requireTagService().rename(tagId, name))
  ipcMain.handle('tags:delete', (_event, tagId: unknown) => requireTagService().delete(tagId))
  ipcMain.handle('tags:attach', (_event, dramaId: unknown, tagId: unknown) => requireTagService().attach(dramaId, tagId))
  ipcMain.handle('scripts:list', (_event, dramaId: unknown) => requireScriptAssetService().list(dramaId))
  ipcMain.handle('scripts:import', (_event, dramaId: unknown, path: unknown) => requireScriptAssetService().import(dramaId, path))
  ipcMain.handle('scripts:link-episode', (_event, scriptId: unknown, episodeId: unknown) => requireScriptAssetService().link(scriptId, episodeId))
  ipcMain.handle('scripts:link-segment', (_event, segmentId: unknown, episodeId: unknown) => requireScriptAssetService().linkSegment(segmentId, episodeId))
  ipcMain.handle('assets:health', (_event, dramaId: unknown) => requireAssetHealthService().inspect(String(dramaId)))
  ipcMain.handle('assets:relink', (_event, dramaId: unknown, paths: unknown) => requireRelinkService().relink(String(dramaId), paths as string[]))
  ipcMain.handle('clips:create-candidate', (_event, dramaId: unknown, episodeId: unknown, start: unknown, end: unknown) => requireOriginalClipService().createCandidate(dramaId, episodeId, { startSeconds: Number(start), endSeconds: Number(end) }))
  ipcMain.handle('clips:list-candidates', (_event, dramaId: unknown) => requireOriginalClipService().listCandidates(dramaId))
  ipcMain.handle('clips:confirm', (_event, candidateId: unknown) => requireOriginalClipService().confirmCandidate(candidateId))
  ipcMain.handle('clips:export', (_event, candidateId: unknown, outputDirectory: unknown) => requireOriginalClipService().exportCandidate(candidateId, outputDirectory))
  ipcMain.handle('materials:list', (_event, dramaId: unknown) => requireDatabase().prepare('SELECT id, task_id AS taskId, task_item_id AS taskItemId, path, duration_seconds AS durationSeconds, fps, size_bytes AS sizeBytes, created_at AS createdAt FROM generated_materials WHERE drama_id = ? ORDER BY created_at DESC').all(String(dramaId)))
  ipcMain.handle('output:choose-directory', async () => { const result = mainWindow ? await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] }) : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] }); return result.canceled ? null : result.filePaths[0] ?? null })
  ipcMain.handle('subtitles:choose-file', async () => { const options: OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'Subtitles', extensions: ['srt', 'vtt'] }] }; const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options); return result.canceled ? null : result.filePaths[0] ?? null })
  ipcMain.handle('subtitles:import', (_event, dramaId: unknown, episodeId: unknown, path: unknown) => requireSubtitleAssetService().importFile(dramaId, episodeId, path))
  ipcMain.handle('subtitles:list', (_event, dramaId: unknown) => requireSubtitleAssetService().list(dramaId))
  ipcMain.handle('providers:list', () => { if (!providerProfileService) throw new Error('本地数据尚未初始化'); return providerProfileService.list() })
  ipcMain.handle('providers:save', (_event, input: unknown) => { if (!providerProfileService) throw new Error('本地数据尚未初始化'); return providerProfileService.save(input) })
  ipcMain.handle('logs:clear', () => { if (!logService) throw new Error('本地数据尚未初始化'); return logService.clear() })
  ipcMain.handle('diagnostics:export', async (_event, directory: unknown) => writeDiagnosticManifest(z.string().trim().min(1).parse(directory), { appVersion: app.getVersion(), databaseInitialized: startupErrorCode === null }))
  ipcMain.handle('paths:open', (_event, path: unknown) => shell.showItemInFolder(z.string().trim().min(1).parse(path)))
  ipcMain.handle('tasks:list', () => requireTaskCenterService().list())
  ipcMain.handle('tasks:retry-failed', async (_event, taskId: unknown) => { const id = z.string().trim().min(1).parse(taskId); const task = requireDatabase().prepare('SELECT type FROM production_tasks WHERE id = ?').get(id) as { type: string } | undefined; const result = task?.type === 'multi_episode' ? await requireMultiEpisodeService().retryFailed(id) : await requireTaskQueue().retryFailed(id, taskExecutor); recordTaskCompletion(id); return requireTaskCenterService().list().map((item) => item.id === id ? { ...item, status: typeof result === 'object' && result !== null && 'status' in result ? String(result.status) : item.status } : item) })
  ipcMain.handle('tasks:run', async (_event, taskId: unknown) => { const id = z.string().trim().min(1).parse(taskId); const task = requireDatabase().prepare('SELECT type FROM production_tasks WHERE id = ?').get(id) as { type: string } | undefined; const result = task?.type === 'multi_episode' ? await requireMultiEpisodeService().run(id) : await requireTaskQueue().run(id, taskExecutor); recordTaskCompletion(id); return result })
  ipcMain.handle('multi:preflight', (_event, dramaId: unknown, config: unknown) => requireMultiEpisodeService().preflight(dramaId, config))
  ipcMain.handle('multi:create-task', (_event, dramaId: unknown, config: unknown) => requireMultiEpisodeService().createTask(dramaId, config))
  ipcMain.handle('scripts:choose-file', async () => { const options: OpenDialogOptions = { properties: ['openFile'], filters: [{ name: 'Scripts', extensions: ['txt', 'docx', 'pdf'] }] }; const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options); return result.canceled ? null : result.filePaths[0] ?? null })
}

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
const requireDatabase = (): Database.Database => { if (!databaseHandle) throw new Error('Local database is not initialized'); return databaseHandle }

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
  notificationService.recordTaskEvent({ eventKey: `${taskId}:${status}`, taskId, severity, title, summary, actionTarget: 'tasks' })
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
    secretService = new SecretService(database)
    notificationService = new NotificationService(database)
    dramaService = new DramaService(database)
    tagService = new TagService(database)
    scriptAssetService = new ScriptAssetService(database)
    assetHealthService = new AssetHealthService(database)
    relinkService = new RelinkService(database, dramaService)
    originalClipService = new OriginalClipService(database)
    taskCenterService = new TaskCenterService(database)
    taskQueue = new TaskQueue(database)
    multiEpisodeService = new MultiEpisodeService(database, taskQueue)
    subtitleAssetService = new SubtitleAssetService(database)
    logService = new LogService(database)
    providerProfileService = new ProviderProfileService(database)
    logService.rotate()
    const backupDirectory = join(app.getPath('userData'), 'backups')
    const latest = database.prepare('SELECT created_at AS createdAt FROM app_backups ORDER BY created_at DESC LIMIT 1').get() as { createdAt: string } | undefined
    if (shouldCreateDailyBackup(latest?.createdAt ?? null) || shouldBackupBeforeUpgrade(null, app.getVersion())) await backupService.create(database, backupDirectory, 'daily', database)
  } catch (error) {
    startupErrorCode = 'DATABASE_UNAVAILABLE'
    startupErrorMessage = error instanceof Error ? error.message : '未知数据库初始化错误。'
    console.error('Database initialization failed', error)
  }
  registerIpc()
  createWindow()

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
