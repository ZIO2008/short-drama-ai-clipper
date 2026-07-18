export type AppHealth = {
  appVersion: string
  databaseInitialized: boolean
  initializationErrorCode: 'DATABASE_UNAVAILABLE' | null
  initializationErrorMessage: string | null
  isSecretStorageAvailable: boolean
  recoveryNotice: string | null
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
export type MaterialSummary = { id: string; taskId: string; taskItemId: string | null; path: string; durationSeconds: number | null; fps: number | null; sizeBytes: number | null; createdAt: string }
export type ProviderProfile = { id: string; capability: string; region: string; provider: string; endpoint: string | null; model: string | null; secretRef: string | null; timeoutMs: number | null }
export type ProviderProfileInput = Omit<ProviderProfile, 'id'>
export type SubtitleAsset = { id: string; dramaId: string; episodeId: string | null; sourcePath: string; format: string; cueCount: number; status: string }
export type MultiEpisodeConfigInput = { startEpisode: number; endEpisode: number; groupSize: number; tailStrategy: 'reduce' | 'skip'; maxMinutes: number; outputDirectory: string; qualityMode: 'original' | 'bitrate' | 'size'; bitrateKbps?: number; targetSizeMb?: number; fps: 'source' | number; packagingEnabled: boolean }
export type MultiEpisodeConfig = MultiEpisodeConfigInput & { preflightConfirmed: true; preflightId: string }
export type MultiEpisodeWindow = { startEpisode: number; endEpisode: number; episodeNumbers: number[]; actualRange?: number[]; durationSeconds: number | null; status: 'ready' | 'reduced' | 'skipped' | 'blocked'; reason: string | null; ok: boolean; estimatedSizeMb: number | null; estimatedBitrateKbps: number | null }
export type MultiEpisodePreflight = { preflightId: string; windows: MultiEpisodeWindow[] }
export type MultiEpisodeTaskPlan = MultiEpisodePreflight & { taskId: string }
export type TaskSummary = { id: string; dramaName: string; type: string; status: string; progressCurrent: number; progressTotal: number }

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
  listClipCandidates: (dramaId: string) => Promise<ClipCandidate[]>
  listMaterials: (dramaId: string) => Promise<MaterialSummary[]>
  chooseOutputDirectory: () => Promise<string | null>
  chooseSubtitleFile: () => Promise<string | null>
  saveProviderProfile: (input: ProviderProfileInput) => Promise<string>
  listProviderProfiles: () => Promise<ProviderProfile[]>
  clearLogs: () => Promise<number>
  exportDiagnostics: (directory: string) => Promise<string>
  openPath: (path: string) => Promise<void>
  importSubtitle: (dramaId: string, episodeId: string | null, path: string) => Promise<SubtitleAsset>
  listSubtitles: (dramaId: string) => Promise<SubtitleAsset[]>
  preflightMultiEpisode: (dramaId: string, config: MultiEpisodeConfigInput) => Promise<MultiEpisodePreflight>
  createMultiEpisodeTask: (dramaId: string, config: MultiEpisodeConfig) => Promise<MultiEpisodeTaskPlan>
  runProductionTask: (taskId: string) => Promise<unknown>
  listTasks: () => Promise<TaskSummary[]>
  retryFailedTaskItems: (taskId: string) => Promise<TaskSummary[]>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}

export {}
