import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { join } from 'node:path'
import { openDatabase } from './db/migrate.js'
import { canStoreSecrets } from './security/secret-store.js'
import { SecretService } from './security/secret-service.js'
import { NotificationService } from './services/notification-service.js'
import { DramaService } from './services/drama-service.js'
import { TagService } from './services/tag-service.js'
import { ScriptAssetService } from './services/script-asset-service.js'
import { AssetHealthService } from './services/asset-health-service.js'
import { RelinkService } from './services/relink-service.js'
import type { AppHealth } from '../shared/contracts.js'

const APP_ID = 'local.shortdrama.materialstudio'
const CHANNEL = process.env.SHORTDRAMA_MATERIAL_CHANNEL ?? (app.isPackaged ? 'stable' : 'development')

app.setAppUserModelId(APP_ID)
app.setPath('userData', join(app.getPath('appData'), 'ShortDramaMaterialStudio', CHANNEL))

let mainWindow: BrowserWindow | null = null
let databasePath = ''
let startupErrorCode: AppHealth['initializationErrorCode'] = null
let secretService: SecretService | null = null
let notificationService: NotificationService | null = null
let dramaService: DramaService | null = null
let tagService: TagService | null = null
let scriptAssetService: ScriptAssetService | null = null
let assetHealthService: AssetHealthService | null = null
let relinkService: RelinkService | null = null

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
    isSecretStorageAvailable: canStoreSecrets()
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

app.whenReady().then(() => {
  databasePath = join(app.getPath('userData'), 'data', 'material-studio.sqlite')
  try {
    const database = openDatabase(databasePath)
    secretService = new SecretService(database)
    notificationService = new NotificationService(database)
    dramaService = new DramaService(database)
    tagService = new TagService(database)
    scriptAssetService = new ScriptAssetService(database)
    assetHealthService = new AssetHealthService(database)
    relinkService = new RelinkService(database, dramaService)
  } catch (error) {
    startupErrorCode = 'DATABASE_UNAVAILABLE'
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
