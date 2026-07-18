import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from '../shared/contracts.js'

const desktopApi: DesktopApi = {
  getAppHealth: () => ipcRenderer.invoke('app:get-health'),
  saveSecret: (value, secretRef) => ipcRenderer.invoke('secrets:save', value, secretRef),
  getSecretStatus: (secretRef) => ipcRenderer.invoke('secrets:get-status', secretRef),
  deleteSecret: (secretRef) => ipcRenderer.invoke('secrets:delete', secretRef)
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
