import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/contracts.js'

const desktopApi: DesktopApi = {
  getAppHealth: () => ipcRenderer.invoke('app:get-health'),
  saveSecret: (value, secretRef) => ipcRenderer.invoke('secrets:save', value, secretRef),
  getSecretStatus: (secretRef) => ipcRenderer.invoke('secrets:get-status', secretRef),
  deleteSecret: (secretRef) => ipcRenderer.invoke('secrets:delete', secretRef),
  getNotifications: () => ipcRenderer.invoke('notifications:list'),
  markNotificationRead: (notificationId) => ipcRenderer.invoke('notifications:mark-read', notificationId),
  markAllNotificationsRead: () => ipcRenderer.invoke('notifications:mark-all-read'),
  clearReadNotifications: () => ipcRenderer.invoke('notifications:clear-read'),
  resolveNotification: (notificationId) => ipcRenderer.invoke('notifications:resolve', notificationId)
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
