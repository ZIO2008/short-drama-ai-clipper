import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { openDatabase } from './db/migrate.js'
import { canStoreSecrets } from './security/secret-store.js'
import { SecretService } from './security/secret-service.js'
import { NotificationService } from './services/notification-service.js'
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

app.whenReady().then(() => {
  databasePath = join(app.getPath('userData'), 'data', 'material-studio.sqlite')
  try {
    const database = openDatabase(databasePath)
    secretService = new SecretService(database)
    notificationService = new NotificationService(database)
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
