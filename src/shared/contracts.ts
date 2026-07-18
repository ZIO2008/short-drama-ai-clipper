export type AppHealth = {
  appVersion: string
  databaseInitialized: boolean
  initializationErrorCode: 'DATABASE_UNAVAILABLE' | null
  isSecretStorageAvailable: boolean
}

export type SecretStatus = {
  exists: boolean
  maskedValue: string | null
  secretRef: string
}

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error' | 'decision'

export type NotificationItem = {
  id: string
  severity: NotificationSeverity
  title: string
  summary: string
  actionTarget: string | null
  dramaId: string | null
  dramaName: string | null
  taskId: string | null
  taskItemId: string | null
  taskType: string | null
  occurredAt: string
  readAt: string | null
  resolvedAt: string | null
}

export type NotificationSnapshot = {
  items: NotificationItem[]
  unreadCount: number
}

export type EpisodeAsset = {
  id: string
  episodeNo: number | null
  sortOrder: number
  sourcePath: string
  durationSeconds: number | null
  fps: number | null
  status: string
}

export type DramaSummary = {
  id: string
  name: string
  episodeCount: number
  tagNames: string[]
  issueCount: number
  updatedAt: string
}

export type DramaDetail = DramaSummary & { episodes: EpisodeAsset[] }
export type EpisodeUpdate = { episodeNo: number | null; sortOrder: number; sourcePath: string }
export type TagSummary = { id: string; name: string; usageCount: number }
export type ScriptAssetSummary = { id: string; sourcePath: string; format: string; linkStatus: string; episodeId: string | null; extractedText: string | null }
export type AssetHealth = { missing: string[]; unreadable: string[]; unsupported: string[]; duplicateEpisodeNumbers: number[]; missingEpisodeNumbers: number[]; issueCount: number }
export type ClipCandidate = { id: string; episodeId: string; startSeconds: number; endSeconds: number; status: string; reason: string | null }

export type DesktopApi = {
  getAppHealth: () => Promise<AppHealth>
  saveSecret: (value: string, secretRef?: string) => Promise<SecretStatus>
  getSecretStatus: (secretRef: string) => Promise<SecretStatus>
  deleteSecret: (secretRef: string) => Promise<void>
  getNotifications: () => Promise<NotificationSnapshot>
  markNotificationRead: (notificationId: string) => Promise<NotificationSnapshot>
  markAllNotificationsRead: () => Promise<NotificationSnapshot>
  clearReadNotifications: () => Promise<NotificationSnapshot>
  resolveNotification: (notificationId: string) => Promise<NotificationSnapshot>
  listDramas: () => Promise<DramaSummary[]>
  getDrama: (dramaId: string) => Promise<DramaDetail>
  createDrama: (name: string) => Promise<DramaDetail>
  updateDrama: (dramaId: string, name: string) => Promise<DramaDetail>
  deleteDrama: (dramaId: string, deleteTempFiles: boolean) => Promise<void>
  importEpisodes: (dramaId: string, paths: string[]) => Promise<DramaDetail>
  chooseVideoFiles: () => Promise<string[]>
  updateEpisode: (dramaId: string, episodeId: string, update: EpisodeUpdate) => Promise<DramaDetail>
  removeEpisode: (dramaId: string, episodeId: string) => Promise<DramaDetail>
  listTags: () => Promise<TagSummary[]>
  createTag: (name: string) => Promise<TagSummary>
  renameTag: (tagId: string, name: string) => Promise<TagSummary>
  deleteTag: (tagId: string) => Promise<{ affectedDramas: number }>
  attachTag: (dramaId: string, tagId: string) => Promise<void>
  chooseScriptFile: () => Promise<string | null>
  importScript: (dramaId: string, path: string) => Promise<{ asset: ScriptAssetSummary; episodes: Array<{ segmentId?: string; episodeNo: number; title: string; text: string }> }>
  listScripts: (dramaId: string) => Promise<ScriptAssetSummary[]>
  linkScriptEpisode: (scriptId: string, episodeId: string | null) => Promise<void>
  linkScriptSegment: (segmentId: string, episodeId: string | null) => Promise<void>
  inspectAssetHealth: (dramaId: string) => Promise<AssetHealth>
  relinkEpisodes: (dramaId: string, paths: string[]) => Promise<{ relinked: number; unresolved: string[] }>
  createClipCandidate: (dramaId: string, episodeId: string, startSeconds: number, endSeconds: number) => Promise<ClipCandidate>
  confirmClipCandidate: (candidateId: string) => Promise<ClipCandidate>
  exportClipCandidate: (candidateId: string, outputDirectory: string) => Promise<{ candidate: ClipCandidate; outputPath: string }>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}

export {}
