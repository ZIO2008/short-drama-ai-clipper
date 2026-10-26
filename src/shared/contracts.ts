export type AppHealth = {
  appVersion: string
  releaseScope: string
  releaseChannel: string
  releaseChannelLabel: string
  projectLibraryIntegrity: ProjectLibraryIntegrity | null
  databaseInitialized: boolean
  initializationErrorCode: 'DATABASE_UNAVAILABLE' | null
  initializationErrorMessage: string | null
  isSecretStorageAvailable: boolean
  recoveryNotice: string | null
}

export type ProjectLibraryIntegrity = {
  foreignKeyViolations: number
  duplicateDramaNames: number
  crossProjectReferences: number
  warningCount: number
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
  videoWidth: number | null
  videoHeight: number | null
  durationAlertDismissedAt?: string | null
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

export type DramaCover = { sourceKind: 'uploaded' | 'auto_frame'; path: string; url: string }
export type DramaDetail = DramaSummary & { episodes: EpisodeAsset[] }
export type EpisodeImportConflict = { episodeNo: number | null; sourcePath: string; existingSourcePath: string }
export type EpisodeImportSummary = { imported: number; skipped: number; conflicts: EpisodeImportConflict[] }
export type EpisodeImportResult = { drama: DramaDetail; summary: EpisodeImportSummary }
export type EpisodeUpdate = { episodeNo: number | null; sortOrder: number; sourcePath: string }
export type TagSummary = { id: string; name: string; usageCount: number }
export type ScriptAssetSummary = { id: string; sourcePath: string; format: string; linkStatus: string; episodeId: string | null; extractedText: string | null }
export type AssetHealth = { missing: string[]; unreadable: string[]; unsupported: string[]; needsEpisodeNumber: string[]; duplicateEpisodeNumbers: number[]; missingEpisodeNumbers: number[]; issueCount: number }
export type { ClipCandidate, ClipCandidateBeat, ClipCandidateClaim, ClipCandidateContext, ClipCandidateEvidence, ClipCandidatePurpose, ClipCandidateQualification, ClipCandidateReviewStatus, ClipCandidateStatus } from './clip-candidate-contracts.js'
import type { ClipCandidate, ClipCandidateQualification, ClipCandidateStatus } from './clip-candidate-contracts.js'
export type ClipCandidateRange = { episodeId: string; startSeconds: number; endSeconds: number }
export type ClipCandidateGenerationInput = { episodeIds: string[]; candidatesPerEpisode: number; targetDurationSeconds: number; maxOverlapRatio: number; allowRepeat: boolean }
export type ClipIntelligentGenerationTask = { taskId: string; status: 'running' | 'queued' | 'deduplicated'; stage: 'queued' | 'text-semantics' | 'multimodal-review'; startedAt: string; queuePosition?: number; estimatedWaitMs?: number }
export type ClipGenerationPreflight = { episodeIds: string[]; eligibleEpisodeIds: string[]; requestedCandidates: number; estimatedCandidates: number; candidatesPerEpisode: number; targetDurationSeconds: number; maxOverlapRatio: number; allowRepeat: boolean; skipped: Array<{ episodeId: string; reason: string }>; subtitleSources: Array<{ episodeId: string; sourceKind: 'import' | 'ocr' | 'asr' | 'multi' | 'scene' | null; status: 'qualified' | 'blocked'; reason: string | null }>; resourceBudget?: { textWindows: number; projectedMandatoryReviews: number; maxFramesPerReview: number; maxInputBytesPerReview: number; providerConcurrency: number; providerTimeoutMs: number | null; queuePosition: number; estimatedWaitMs: number | null; expectedProviderRequests: number; projectedDerivedInputBytes: number; availableProviderSlots: number; quotaRisk: 'none' | 'review-budget' } }
export type ClipEpisodeStatus = { episodeId: string; episodeNo: number | null; sourceStatus: string; candidateCount: number; pendingCount: number; confirmedCount: number; exportedCount: number; failedCount: number; productionStatus: 'ready_to_generate' | 'generating' | 'pending_confirmation' | 'confirmed' | 'exporting' | 'exported' | 'failed' | 'missing_media' }
export type ClipExportConfig = { candidateIds: string[]; outputDirectory: string; namingPattern: string; encoding: 'copy' | 'h264-balanced' | 'h264-quality'; precisionMode?: 'final' | 'preview-copy'; outputSize: 'source' | '1080x1920' | '1920x1080'; subtitleStrategy: 'none' | 'soft' | 'burn'; conflictStrategy: 'append'; qualityMode?: 'original' | 'bitrate' | 'size'; bitrateKbps?: number; targetSizeMb?: number; fps?: 'source' | number; packagingEnabled?: boolean; packaging?: PackagingConfig }
export type ClipExportPreflight = { candidateIds: string[]; count: number; totalDurationSeconds: number; estimatedSizeBytes: number; outputDirectory: string; namingPattern: string; encoding: ClipExportConfig['encoding']; outputSize: ClipExportConfig['outputSize']; subtitleStrategy: ClipExportConfig['subtitleStrategy']; conflictStrategy: 'append'; blocked: Array<{ candidateId: string; reason: string }> }
export type ClipExportResult = { candidateId: string; status: 'exported' | 'failed'; outputPath: string | null; reason: string | null }
export type ClipExportProgress = { exportId: string; total: number; completed: number; status: 'running' | 'completed' | 'cancelled' | 'failed'; results: ClipExportResult[] }
export type ClipExportReportConfig = { namingPattern: string; encoding: ClipExportConfig['encoding']; precisionMode: NonNullable<ClipExportConfig['precisionMode']>; outputSize: ClipExportConfig['outputSize']; subtitleStrategy: ClipExportConfig['subtitleStrategy']; conflictStrategy: 'append'; qualityMode: ClipExportConfig['qualityMode']; bitrateKbps: number | null; targetSizeMb: number | null; fps: ClipExportConfig['fps']; packagingEnabled: boolean }
export type ClipExportBatchItem = { candidateId: string; sequenceNumber?: number; episodeId?: string | null; startSeconds?: number | null; endSeconds?: number | null; status: 'exported' | 'failed' | 'cancelled' | 'not_output'; reason: string | null; materialId: string | null }
export type ClipExportBatch = { id: string; dramaId: string; candidateIds: string[]; status: 'running' | 'completed' | 'cancelled' | 'failed'; reason: string | null; config: ClipExportReportConfig | null; items: ClipExportBatchItem[]; createdAt: string; updatedAt: string }
export type ClipSubtitleVariant = { id: string; candidateId: string; text: string; startSeconds: number; endSeconds: number; sourceTrackIds: string[]; reason: string; createdAt: string }
export type MaterialSummary = { id: string; taskId: string; taskItemId: string | null; path: string; durationSeconds: number | null; fps: number | null; sizeBytes: number | null; createdAt: string }
export type ProviderProfile = { id: string; capability: string; region: string; provider: string; endpoint: string | null; model: string | null; secretRef: string | null; timeoutMs: number | null; pricing?: string | null; modelSelectionSource?: 'model-studio-automatic' | null }
export type ProviderProfileInput = Omit<ProviderProfile, 'id' | 'modelSelectionSource'> & { modelStudioSelectionToken?: string }
export type DeepSeekConfigurationTestInput = { capability: 'text-analysis'; provider: 'DeepSeek API'; endpoint: string; model: string; timeoutSeconds: number; transientCredential?: ProviderCredentialPackage }
export type DeepSeekConfigurationTestFailureCategory = 'network' | 'timeout' | 'authentication' | 'address' | 'model' | 'rate-limit' | 'insufficient-balance' | 'server' | 'missing-key' | 'invalid-configuration' | 'unexpected'
export type DeepSeekConfigurationTestResult = { status: 'success'; elapsedMs: number } | { status: 'failure'; category: DeepSeekConfigurationTestFailureCategory; elapsedMs: number }
export type ModelStudioConfigurationTestInput = { capability: 'asr' | 'text-analysis' | 'multimodal-review'; provider: '阿里云百炼 / Model Studio'; endpoint: string; timeoutSeconds: number; secretRef?: string }
export type ModelStudioConfigurationTestFailureCategory = 'network' | 'timeout' | 'authentication' | 'address' | 'no-compatible-model' | 'rate-limit' | 'server' | 'missing-key' | 'invalid-configuration' | 'unexpected'
export type ModelStudioConfigurationTestResult = { status: 'success'; elapsedMs: number; selectedModelLabel: string; selectionToken: string } | { status: 'failure'; category: ModelStudioConfigurationTestFailureCategory; elapsedMs: number }
export type TencentAsrConfigurationTestInput = { capability: 'asr'; provider: '腾讯云 ASR'; endpoint: string; timeoutSeconds: number; transientCredential?: ProviderCredentialPackage }
export type TencentAsrConfigurationTestFailureCategory = 'network' | 'timeout' | 'authentication' | 'address' | 'rate-limit' | 'server' | 'missing-key' | 'invalid-configuration' | 'unexpected'
export type TencentAsrConfigurationTestResult = { status: 'success'; elapsedMs: number } | { status: 'failure'; category: TencentAsrConfigurationTestFailureCategory; elapsedMs: number }
export type TencentAsrStoredCredentialStatus = 'valid' | 'missing' | 'invalid'
export type AiCapabilityStatus = { capability: 'asr' | 'text-analysis' | 'multimodal-review' | 'tts'; mode: 'controlled' | 'configured'; reason: 'no-profile' | 'missing-secret' | 'unreadable-secret' | 'local-endpoint-required' | 'model-required' | null }
export type AiRemixInput = { dramaId: string; maxDrafts: number; episodeStart: number; episodeEnd: number; durationMinSeconds: number; durationMaxSeconds: number; controlledMode?: 'success' | 'low-confidence' | 'timeout' | 'cost-limit' | 'failure'; costLimit?: number }
export type AiRemixDraft = { draftId: string; evidenceId: string; summary: string; startSeconds: number | null; endSeconds: number | null; confidence: number | null; editingAngle?: string; hookReason?: string; coreStoryRange?: string; episodeStart?: number; episodeEnd?: number; expectedDurationSeconds?: number }
export type AiRemixCheckpoint = { version: 1; stage: 'evidence' | 'over-target' | 'awaiting-decision' | 'force-stopped' | 'drafts'; startedAt: string | null; decisionDeadlineAt?: string; extensionGranted?: boolean; recoveryCount?: number; outcome?: 'no-recommendation' | 'drafts-ready'; reason?: string | null; drafts: AiRemixDraft[] }
export type AiRemixTask = { id: string; dramaId: string; status: string; config: Omit<AiRemixInput, 'dramaId'>; cost: { estimated: number; actual: number; mode: 'controlled' | 'configured'; region: string; provider: string; costLimit: number }; checkpoint: AiRemixCheckpoint; createdAt: string; updatedAt: string }
export type AiEvidence = { id: string; episodeId: string | null; sourceType: string; startSeconds: number | null; endSeconds: number | null; confidence: number | null; summary: string }
export type NarrationInput = { dramaId: string; episodeStart: number; episodeEnd: number; mode: 'standard' | 'conflict-insert'; durationMinSeconds: number; durationMaxSeconds: number; maxDrafts: number; voice?: 'general-mandarin'; controlledMode?: 'success' | 'low-confidence' | 'timeout' | 'cost-limit' | 'failure'; costLimit?: number }
export type NarrationSegment = { id: string; draftId: string; evidenceId: string; narrationAssetId: string | null; assetPath: string | null; text: string; targetDurationSeconds: number; insertStartSeconds: number | null; insertEndSeconds: number | null; confidence: number | null; mode: 'standard' | 'conflict-insert'; status: string }
export type NarrationTask = { id: string; dramaId: string; status: string; config: Omit<NarrationInput, 'dramaId'>; cost: { estimated: number; actual: number; mode: 'controlled' | 'configured'; region: string; provider: string; costLimit: number }; checkpoint: unknown }
export type TimelineClip = { id: string; sourcePath: string; sourceStartSeconds: number; sourceEndSeconds: number; positionSeconds: number; volume: number; fadeInSeconds: number; fadeOutSeconds: number; transition: 'cut' | 'fade'; transitionDurationSeconds: number; role?: 'source' | 'conflict' | 'music' | 'sfx' | 'narration'; sourceEvidenceId?: string; narrationText?: string; duckOriginalAudio?: boolean }
export type FixedTimeline = { version: 1; snapEnabled: boolean; video: TimelineClip[]; music: [TimelineClip[], TimelineClip[]]; sfx: [TimelineClip[], TimelineClip[]] }
export type TimelineProject = { id: string; draftId: string; timeline: FixedTimeline; confirmed?: boolean; updatedAt: string }
export type SubtitleAsset = { id: string; dramaId: string; episodeId: string | null; sourcePath: string; format: string; cueCount: number; status: string }
export type SubtitleBatchImportedAsset = SubtitleAsset & { episodeNo: number }
export type SubtitleBatchImportResult = { assets: SubtitleBatchImportedAsset[]; skipped: Array<{ sourcePath: string; reason: string }> }
export type SubtitleBatchImportPreview = { matches: Array<{ episodeId: string; episodeNo: number; sourcePath: string; format: string }>; skipped: Array<{ sourcePath: string; reason: string }> }
export type SubtitleTrackSource = 'import' | 'asr' | 'ocr' | 'resolved'
export type SubtitleEvidenceCue = { id: string; index: number; startSeconds: number; endSeconds: number; text: string; confidence: number | null }
export type SubtitleEvidenceTrack = { id: string; dramaId: string; episodeId: string | null; assetId: string | null; baseTrackId: string | null; sourceKind: SubtitleTrackSource; label: string; language: string; status: 'active' | 'archived'; cueCount: number; cost: Record<string, unknown> }
export type SubtitleEvidenceTrackInput = { dramaId: string; episodeId: string | null; sourceKind: Exclude<SubtitleTrackSource, 'import'>; label: string; language?: string; cost?: Record<string, unknown>; cues: Array<Omit<SubtitleEvidenceCue, 'id'>> }
export type SubtitleOcrRegion = { id: string; dramaId: string; episodeId: string | null; scope: 'drama_default' | 'episode_override'; x: number; y: number; width: number; height: number }
export type SubtitleConflict = { id: string; dramaId: string; episodeId: string | null; asrCueId: string; ocrCueId: string; timeOverlapSeconds: number; textSimilarity: number; asrConfidence: number | null; ocrConfidence: number | null; status: 'open' | 'resolved_asr' | 'resolved_ocr' | 'resolved_manual' | 'reviewed'; resolvedText: string | null; resolvedStartSeconds: number | null; resolvedEndSeconds: number | null }
export type SubtitleEvidenceComparison = { asrCueId: string | null; ocrCueId: string | null; timeOverlapSeconds: number; textSimilarity: number; asrConfidence: number | null; ocrConfidence: number | null; conclusion: 'consistent' | 'different' | 'asr_only' | 'ocr_only' | 'needs_review' }
export type SubtitleConflictDecision = { source: 'reviewed' }
export type SubtitleQualityEvaluationInput = { dramaId: string; episodeId: string | null; sourceKind: SubtitleTrackSource; sampleLabel: string; referenceCharacters: number; differingCharacters: number; conflictCount: number; evaluatedCueCount: number; elapsedMs: number; estimatedCost?: number; actualCost?: number; notes?: string | null }
export type SubtitleQualityReport = { evaluationCount: number; referenceCharacters: number; differingCharacters: number; conflictCount: number; evaluatedCueCount: number; elapsedMs: number; estimatedCost: number; actualCost: number; characterErrorRate: number | null; conflictRate: number | null }
export type LocalOcrAvailability = { available: boolean; executablePath: string | null; reason: string | null }
export type LocalOcrRuntimeIdentity = { buildId: string; sha256: string }
export type LocalOcrRuntimeInfo = LocalOcrRuntimeIdentity & { available: boolean; runnerPath: string | null; selfTest: boolean; reason: string | null }
export type SubtitleRecognitionSettings = { recognitionMode: 'asr-only' | 'ocr-only' | 'asr-ocr'; scope: 'all' | 'current' | 'missing'; language: 'zh-CN' | 'zh-en' | 'auto'; asrMode: 'audio-first' | 'denoise' | 'import-only'; ocrMode: 'auto-region' | 'fixed-bottom' | 'episode-manual'; differenceThreshold: 'standard' | 'strict' | 'loose'; importStrategy: 'parallel' | 'review-only' }
export type SubtitleRecognitionRunStatus = 'running' | 'interrupted' | 'completed' | 'partial' | 'failed'
export type SubtitleRecognitionRunItemStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'interrupted'
export type SubtitleRecognitionRunItem = { episodeId: string; status: SubtitleRecognitionRunItemStatus; reason: string | null }
export type SubtitleRecognitionRun = { id: string; dramaId: string; status: SubtitleRecognitionRunStatus; settings: SubtitleRecognitionSettings; episodeIds: string[]; total: number; completed: number; failed: number; currentEpisodeId: string | null; ocrRuntime: LocalOcrRuntimeIdentity | null; reason: string | null; items: SubtitleRecognitionRunItem[]; createdAt: string; updatedAt: string }
export type SubtitleRecognitionRunInput = { dramaId: string; settings: SubtitleRecognitionSettings; episodeIds: string[]; ocrRuntime?: LocalOcrRuntimeIdentity | null }
export type LocalOcrExtractionInput = { asrTrackId: string; language?: string; pageSegmentationMode?: number }
export type PackagingConfig = { aspect?: 'portrait' | 'landscape'; preset?: 'default' | 'conflict' | 'clean'; title: string; titlePosition: 'top' | 'bottom'; prompt: string; promptPosition: 'left' | 'right'; badge: '热门短剧' | '热播中' | '爆款推荐' | 'none'; titleSize?: 'small' | 'medium' | 'large'; titleTone?: 'warm' | 'accent'; promptStyle?: 'solid' | 'outline'; overlay?: 'subtle' | 'strong' | 'none' }
export type MultiEpisodeConfigInput = { startEpisode: number; endEpisode: number; groupSize: number; tailStrategy: 'reduce' | 'skip' | 'return'; maxMinutes: number; outputDirectory: string; qualityMode: 'original' | 'bitrate' | 'size'; bitrateKbps?: number; targetSizeMb?: number; encodingPreset?: 'fast' | 'balanced' | 'quality'; fps: 'source' | number; packagingEnabled: boolean; performanceMode?: 'background' | 'speed'; packaging?: PackagingConfig }
export type MultiEpisodeConfig = MultiEpisodeConfigInput & { preflightConfirmed: true; preflightId: string }
export type MultiEpisodeWindow = { startEpisode: number; endEpisode: number; episodeNumbers: number[]; actualRange?: number[]; durationSeconds: number | null; status: 'ready' | 'reduced' | 'skipped' | 'blocked'; reason: string | null; ok: boolean; estimatedSizeMb: number | null; estimatedBitrateKbps: number | null }
export type MultiEpisodePreflight = { preflightId: string; windows: MultiEpisodeWindow[] }
export type MultiEpisodeTaskPlan = MultiEpisodePreflight & { taskId: string }
export type TaskSummary = { id: string; dramaId?: string; dramaName: string; type: string; status: string; progressCurrent: number; progressTotal: number; taskRound?: number; episodeIds?: string[]; checkpointStage?: string; checkpointReason?: string | null; startedAt?: string | null; elapsedMs?: number; activeSince?: string | null; decisionDeadlineAt?: string | null; estimatedCost?: number; actualCost?: number; processingRegion?: string | null; createdAt?: string; updatedAt?: string }
export type TaskReportItem = { id: string; plannedRange: string | null; actualRange: string | null; status: string; reason: string | null; outputPath: string | null }

export type DesktopApi = {
  getAppHealth: () => Promise<AppHealth>
  saveProviderCredential: (credential: ProviderCredentialPackage, secretRef?: string) => Promise<SecretStatus>
  getSecretStatus: (secretRef: string) => Promise<SecretStatus>
  deleteSecret: (secretRef: string) => Promise<void>
  saveModelStudioProvisionalCredential: (credential: ProviderCredentialPackage, secretRef: string, capability: 'asr' | 'text-analysis' | 'multimodal-review') => Promise<SecretStatus>
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
  estimateDramaCache: (dramaId: string) => Promise<number>
  chooseDramaCoverImage: () => Promise<string | null>
  getDramaCover: (dramaId: string) => Promise<DramaCover | null>
  uploadDramaCover: (dramaId: string, sourcePath: string) => Promise<DramaCover>
  removeDramaCover: (dramaId: string) => Promise<DramaCover | null>
  importEpisodes: (dramaId: string, paths: string[]) => Promise<EpisodeImportResult>
  chooseVideoFiles: (dramaId?: string) => Promise<string[]>
  chooseVideoFolder: (dramaId?: string) => Promise<string[]>
  updateEpisode: (dramaId: string, episodeId: string, update: EpisodeUpdate) => Promise<DramaDetail>
  removeEpisode: (dramaId: string, episodeId: string) => Promise<DramaDetail>
  dismissEpisodeDurationAlert: (dramaId: string, episodeId: string) => Promise<DramaDetail>
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
  generateClipCandidates: (dramaId: string, input: ClipCandidateGenerationInput) => Promise<ClipIntelligentGenerationTask>
  preflightClipGeneration: (dramaId: string, input: ClipCandidateGenerationInput) => Promise<ClipGenerationPreflight>
  cancelIntelligentClipGeneration: (taskId: string) => Promise<void>
  decideIntelligentClipDeadline: (taskId: string, action: 'continue' | 'stop') => Promise<void>
  updateClipCandidate: (candidateId: string, startSeconds: number, endSeconds: number) => Promise<ClipCandidate>
  deleteClipCandidate: (candidateId: string) => Promise<void>
  confirmClipCandidate: (candidateId: string) => Promise<ClipCandidate>
  exportClipCandidate: (candidateId: string, outputDirectory: string) => Promise<{ candidate: ClipCandidate; outputPath: string }>
  listClipCandidates: (dramaId: string) => Promise<ClipCandidate[]>
  listClipEpisodeStatuses: (dramaId: string) => Promise<ClipEpisodeStatus[]>
  preflightClipExport: (dramaId: string, config: ClipExportConfig) => Promise<ClipExportPreflight>
  exportClipCandidates: (dramaId: string, config: ClipExportConfig) => Promise<ClipExportResult[]>
  startClipExport: (dramaId: string, config: ClipExportConfig) => Promise<ClipExportProgress>
  getClipExportProgress: (exportId: string) => Promise<ClipExportProgress>
  cancelClipExport: (exportId: string) => Promise<ClipExportProgress>
  getLatestClipExportBatch: (dramaId: string) => Promise<ClipExportBatch | null>
  retryClipCandidate: (candidateId: string, outputDirectory: string) => Promise<{ candidate: ClipCandidate; outputPath: string }>
  listClipSubtitleVariants: (candidateId: string) => Promise<ClipSubtitleVariant[]>
  saveClipSubtitleVariant: (input: Omit<ClipSubtitleVariant, 'id' | 'createdAt'>) => Promise<ClipSubtitleVariant>
  listMaterials: (dramaId: string) => Promise<MaterialSummary[]>
  chooseOutputDirectory: () => Promise<string | null>
  chooseSubtitleFile: () => Promise<string | null>
  chooseSubtitleFiles: () => Promise<string[]>
  chooseAudioFile: () => Promise<string | null>
  saveProviderProfile: (input: ProviderProfileInput) => Promise<string>
  listProviderProfiles: () => Promise<ProviderProfile[]>
  testDeepSeekTextAnalysisConfiguration: (input: DeepSeekConfigurationTestInput) => Promise<DeepSeekConfigurationTestResult>
  testModelStudioMultimodalConfiguration: (input: ModelStudioConfigurationTestInput) => Promise<ModelStudioConfigurationTestResult>
  testTencentAsrConfiguration: (input: TencentAsrConfigurationTestInput) => Promise<TencentAsrConfigurationTestResult>
  getTencentAsrStoredCredentialStatus: () => Promise<TencentAsrStoredCredentialStatus>
  clearLogs: () => Promise<number>
  exportDiagnostics: (directory: string) => Promise<string>
  openPath: (path: string) => Promise<void>
  openExternalUrl: (url: string) => Promise<void>
  importSubtitle: (dramaId: string, episodeId: string | null, path: string) => Promise<SubtitleAsset>
  previewSubtitlesByEpisode: (dramaId: string, paths: string[]) => Promise<SubtitleBatchImportPreview>
  importSubtitlesByEpisode: (dramaId: string, paths: string[]) => Promise<SubtitleBatchImportResult>
  listSubtitles: (dramaId: string) => Promise<SubtitleAsset[]>
  removeSubtitle: (assetId: string) => Promise<void>
  removeSubtitlesByEpisode: (dramaId: string, episodeId: string) => Promise<number>
  createSubtitleEvidenceTrack: (input: SubtitleEvidenceTrackInput) => Promise<SubtitleEvidenceTrack>
  listSubtitleEvidenceTracks: (dramaId: string, episodeId?: string | null) => Promise<SubtitleEvidenceTrack[]>
  listSubtitleEvidenceCues: (trackId: string) => Promise<SubtitleEvidenceCue[]>
  setSubtitleOcrRegion: (dramaId: string, episodeId: string | null, region: Pick<SubtitleOcrRegion, 'x' | 'y' | 'width' | 'height'>) => Promise<SubtitleOcrRegion>
  getEffectiveSubtitleOcrRegion: (dramaId: string, episodeId: string | null) => Promise<SubtitleOcrRegion | null>
  clearSubtitleOcrRegion: (dramaId: string, episodeId: string | null) => Promise<void>
  startSubtitleManualRevision: (trackId: string, label?: string) => Promise<SubtitleEvidenceTrack>
  updateResolvedSubtitleCue: (trackId: string, cueId: string, update: Partial<Pick<SubtitleEvidenceCue, 'startSeconds' | 'endSeconds' | 'text' | 'confidence'>>) => Promise<SubtitleEvidenceCue>
  archiveSubtitleEvidenceTrack: (trackId: string) => Promise<void>
  compareSubtitleEvidence: (asrTrackId: string, ocrTrackId: string, minimumSimilarity?: number, minimumConfidence?: number) => Promise<SubtitleConflict[]>
  getSubtitleEvidenceComparisons: (asrTrackId: string, ocrTrackId: string, minimumSimilarity?: number, minimumConfidence?: number) => Promise<SubtitleEvidenceComparison[]>
  listSubtitleConflicts: (dramaId: string, episodeId?: string | null) => Promise<SubtitleConflict[]>
  resolveSubtitleConflict: (conflictId: string, decision: SubtitleConflictDecision) => Promise<SubtitleConflict>
  recordSubtitleQualityEvaluation: (input: SubtitleQualityEvaluationInput) => Promise<string>
  getSubtitleQualityReport: (dramaId: string, episodeId?: string | null) => Promise<SubtitleQualityReport>
  getLocalOcrAvailability: () => Promise<LocalOcrAvailability>
  getLocalOcrRuntimeInfo: () => Promise<LocalOcrRuntimeInfo>
  getSubtitleRecognitionSettings: (dramaId: string) => Promise<SubtitleRecognitionSettings>
  saveSubtitleRecognitionSettings: (dramaId: string, settings: SubtitleRecognitionSettings) => Promise<SubtitleRecognitionSettings>
  getLatestSubtitleRecognitionRun: (dramaId: string) => Promise<SubtitleRecognitionRun | null>
  startSubtitleRecognitionRun: (input: SubtitleRecognitionRunInput) => Promise<SubtitleRecognitionRun>
  resumeSubtitleRecognitionRun: (runId: string) => Promise<SubtitleRecognitionRun>
  retryFailedSubtitleRecognitionRun: (runId: string) => Promise<SubtitleRecognitionRun>
  interruptSubtitleRecognitionRun: (runId: string, reason: string) => Promise<SubtitleRecognitionRun>
  markSubtitleRecognitionRunItemRunning: (runId: string, episodeId: string) => Promise<SubtitleRecognitionRun>
  markSubtitleRecognitionRunItemSucceeded: (runId: string, episodeId: string) => Promise<SubtitleRecognitionRun>
  markSubtitleRecognitionRunItemFailed: (runId: string, episodeId: string, reason: string) => Promise<SubtitleRecognitionRun>
  finishSubtitleRecognitionRun: (runId: string) => Promise<SubtitleRecognitionRun>
  extractLocalOcrSubtitleTrack: (input: LocalOcrExtractionInput) => Promise<SubtitleEvidenceTrack>
  extractIndependentLocalOcrSubtitleTrack: (input: { dramaId: string; episodeId: string; language?: string; regionMode?: 'auto-region' | 'fixed-region' }) => Promise<SubtitleEvidenceTrack>
  extractDefaultAsrSubtitleTrack: (input: { dramaId: string; episodeId: string; language: 'zh-CN' | 'zh-en' | 'auto'; mode: 'audio-first' | 'denoise' | 'import-only' }) => Promise<SubtitleEvidenceTrack>
  exportSubtitleTrackSrt: (trackId: string) => Promise<string | null>
  exportSubtitleTrackVtt: (trackId: string) => Promise<string | null>
  exportSubtitleTrackAudit: (trackId: string) => Promise<string | null>
  preflightMultiEpisode: (dramaId: string, config: MultiEpisodeConfigInput) => Promise<MultiEpisodePreflight>
  createMultiEpisodeTask: (dramaId: string, config: MultiEpisodeConfig) => Promise<MultiEpisodeTaskPlan>
  runProductionTask: (taskId: string) => Promise<unknown>
  pauseProductionTask: (taskId: string) => Promise<void>
  resumeProductionTask: (taskId: string) => Promise<void>
  cancelProductionTask: (taskId: string) => Promise<void>
  recoverProductionTask: (taskId: string) => Promise<unknown>
  listTasks: () => Promise<TaskSummary[]>
  getTaskReport: (taskId: string) => Promise<TaskReportItem[]>
  retryFailedTaskItems: (taskId: string) => Promise<TaskSummary[]>
  listAiCapabilityStatus: () => Promise<AiCapabilityStatus[]>
  createAiRemixTask: (input: AiRemixInput) => Promise<{ taskId: string }>
  getAiRemixTask: (taskId: string) => Promise<AiRemixTask>
  runAiRemixTask: (taskId: string) => Promise<AiRemixTask>
  recoverAiRemixTask: (taskId: string) => Promise<AiRemixTask>
  decideAiRemixTaskDuration: (taskId: string, action: 'continue' | 'stop') => Promise<AiRemixTask>
  listAiRemixEvidence: (taskId: string) => Promise<AiEvidence[]>
  getTimelineProject: (draftId: string) => Promise<TimelineProject>
  saveTimelineProject: (draftId: string, timeline: FixedTimeline) => Promise<TimelineProject>
  addTimelineAudio: (draftId: string, input: { kind: 'music' | 'sfx'; trackIndex: 0 | 1; sourcePath: string; durationSeconds: number; positionSeconds: number }) => Promise<TimelineProject>
  confirmTimelineDraft: (draftId: string) => Promise<TimelineProject>
  exportTimelineDraft: (draftId: string, outputDirectory: string) => Promise<{ outputPath: string }>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}

export {}
import type { ProviderCredentialPackage } from './provider-auth-schema.js'
