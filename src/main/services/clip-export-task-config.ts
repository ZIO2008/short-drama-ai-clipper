import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { ClipExportConfig } from '../../shared/contracts.js'

type StoredClipExportConfig = Omit<ClipExportConfig, 'candidateIds'>

const storedConfigSchema = z.object({
  outputDirectory: z.string().trim().min(1),
  namingPattern: z.string().trim().min(1).max(160),
  encoding: z.enum(['copy', 'h264-balanced', 'h264-quality']),
  precisionMode: z.enum(['final', 'preview-copy']).default('final'),
  outputSize: z.enum(['source', '1080x1920', '1920x1080']),
  subtitleStrategy: z.enum(['none', 'soft', 'burn']),
  conflictStrategy: z.literal('append'),
  qualityMode: z.enum(['original', 'bitrate', 'size']).optional(),
  bitrateKbps: z.number().finite().positive().optional(),
  targetSizeMb: z.number().finite().positive().optional(),
  fps: z.union([z.literal('source'), z.number().finite().positive().max(120)]).optional(),
  packagingEnabled: z.boolean().optional(),
  packaging: z.object({
    aspect: z.enum(['portrait', 'landscape']).optional(), preset: z.enum(['default', 'conflict', 'clean']).optional(), title: z.string().max(240), titlePosition: z.enum(['top', 'bottom']), prompt: z.string().max(240), promptPosition: z.enum(['left', 'right']), badge: z.enum(['热门短剧', '热播中', '爆款推荐', 'none']), titleSize: z.enum(['small', 'medium', 'large']).optional(), titleTone: z.enum(['warm', 'accent']).optional(), promptStyle: z.enum(['solid', 'outline']).optional(), overlay: z.enum(['subtle', 'strong', 'none']).optional()
  }).optional()
})

const legacyRetryMessage = '该历史任务没有可恢复的导出配置。请返回候选池选择输出目录并重新导出后再重试。'

export const persistClipExportConfig = (database: Database.Database, config: ClipExportConfig): void => {
  const taskRows = database.prepare(`
    SELECT DISTINCT task.id, task.config_snapshot AS configSnapshot
    FROM production_tasks task
    JOIN task_items item ON item.task_id = task.id
    WHERE task.type = 'original_clip' AND item.id IN (${config.candidateIds.map(() => '?').join(', ')})
  `).all(...config.candidateIds) as Array<{ id: string; configSnapshot: string }>
  const storedConfig: StoredClipExportConfig = { outputDirectory: config.outputDirectory, namingPattern: config.namingPattern, encoding: config.encoding, precisionMode: config.precisionMode ?? 'final', outputSize: config.outputSize, subtitleStrategy: config.subtitleStrategy, conflictStrategy: config.conflictStrategy, qualityMode: config.qualityMode, bitrateKbps: config.bitrateKbps, targetSizeMb: config.targetSizeMb, fps: config.fps, packagingEnabled: config.packagingEnabled, packaging: config.packaging }
  const update = database.prepare('UPDATE production_tasks SET config_snapshot = ?, updated_at = ? WHERE id = ?')
  database.transaction(() => taskRows.forEach((task) => {
    let snapshot: Record<string, unknown> = {}
    try { const parsed: unknown = JSON.parse(task.configSnapshot); if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) snapshot = parsed as Record<string, unknown> } catch { /* Preserve a usable retry snapshot even if an old task stored malformed metadata. */ }
    const existing = snapshot.exportConfigsByCandidate
    const byCandidate: Record<string, unknown> = existing !== null && typeof existing === 'object' && !Array.isArray(existing) ? { ...existing } : {}
    for (const candidateId of config.candidateIds) {
      const owner = database.prepare('SELECT task_id AS taskId FROM task_items WHERE id = ?').get(candidateId) as { taskId: string } | undefined
      if (owner?.taskId === task.id) byCandidate[candidateId] = storedConfig
    }
    update.run(JSON.stringify({ ...snapshot, exportConfig: storedConfig, exportConfigsByCandidate: byCandidate }), new Date().toISOString(), task.id)
  }))()
}

export const readClipExportConfig = (database: Database.Database, taskId: string, candidateId?: string): StoredClipExportConfig => {
  const row = database.prepare("SELECT config_snapshot AS configSnapshot FROM production_tasks WHERE id = ? AND type = 'original_clip'").get(taskId) as { configSnapshot: string } | undefined
  if (!row) throw new Error('原剧切片任务不存在或已被删除。')
  try {
    const snapshot: unknown = JSON.parse(row.configSnapshot)
    const record = snapshot !== null && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot as Record<string, unknown> : {}
    const byCandidate = record.exportConfigsByCandidate
    const exportConfig = candidateId && byCandidate !== undefined
      ? byCandidate !== null && typeof byCandidate === 'object' && !Array.isArray(byCandidate) && Object.hasOwn(byCandidate, candidateId) ? (byCandidate as Record<string, unknown>)[candidateId] : undefined
      : record.exportConfig
    const parsed = storedConfigSchema.safeParse(exportConfig)
    if (parsed.success) return parsed.data
  } catch { /* Historical snapshots are handled by the same actionable error below. */ }
  throw new Error(legacyRetryMessage)
}

export const readClipExportRetryGroups = (database: Database.Database, taskId: string, candidateIds: readonly string[]): ClipExportConfig[] => {
  const groups = new Map<string, ClipExportConfig>()
  for (const candidateId of candidateIds) {
    const stored = readClipExportConfig(database, taskId, candidateId); const key = JSON.stringify(stored)
    const group = groups.get(key)
    if (group) group.candidateIds.push(candidateId)
    else groups.set(key, { ...stored, candidateIds: [candidateId] })
  }
  return [...groups.values()]
}
