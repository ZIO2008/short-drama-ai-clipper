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
  resolveNotification: (notificationId) => ipcRenderer.invoke('notifications:resolve', notificationId),
  listDramas: () => ipcRenderer.invoke('dramas:list'),
  getDrama: (dramaId) => ipcRenderer.invoke('dramas:get', dramaId),
  createDrama: (name) => ipcRenderer.invoke('dramas:create', name),
  updateDrama: (dramaId, name) => ipcRenderer.invoke('dramas:update', dramaId, name),
  deleteDrama: (dramaId, deleteTempFiles) => ipcRenderer.invoke('dramas:delete', dramaId, deleteTempFiles),
  importEpisodes: (dramaId, paths) => ipcRenderer.invoke('episodes:import', dramaId, paths),
  chooseVideoFiles: () => ipcRenderer.invoke('episodes:choose-files'),
  updateEpisode: (dramaId, episodeId, update) => ipcRenderer.invoke('episodes:update', dramaId, episodeId, update),
  removeEpisode: (dramaId, episodeId) => ipcRenderer.invoke('episodes:remove', dramaId, episodeId),
  listTags: () => ipcRenderer.invoke('tags:list'),
  createTag: (name) => ipcRenderer.invoke('tags:create', name),
  renameTag: (tagId, name) => ipcRenderer.invoke('tags:rename', tagId, name),
  deleteTag: (tagId) => ipcRenderer.invoke('tags:delete', tagId),
  attachTag: (dramaId, tagId) => ipcRenderer.invoke('tags:attach', dramaId, tagId)
  ,chooseScriptFile: () => ipcRenderer.invoke('scripts:choose-file')
  ,importScript: (dramaId, path) => ipcRenderer.invoke('scripts:import', dramaId, path)
  ,listScripts: (dramaId) => ipcRenderer.invoke('scripts:list', dramaId)
  ,linkScriptEpisode: (scriptId, episodeId) => ipcRenderer.invoke('scripts:link-episode', scriptId, episodeId)
  ,linkScriptSegment: (segmentId, episodeId) => ipcRenderer.invoke('scripts:link-segment', segmentId, episodeId)
  ,inspectAssetHealth: (dramaId) => ipcRenderer.invoke('assets:health', dramaId)
  ,relinkEpisodes: (dramaId, paths) => ipcRenderer.invoke('assets:relink', dramaId, paths)
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
