import type Database from 'better-sqlite3'
import type { ProjectLibraryIntegrity } from '../../shared/contracts.js'

type CountRow = { count: number }

export class ProjectLibraryIntegrityService {
  constructor(private readonly database: Database.Database) {}

  inspect(): ProjectLibraryIntegrity {
    const duplicateDramaNames = this.count(`
      SELECT COUNT(*) AS count FROM (
        SELECT lower(trim(name)) FROM dramas GROUP BY lower(trim(name)) HAVING COUNT(*) > 1
      )
    `)
    const foreignKeyViolations = this.count('SELECT COUNT(*) AS count FROM pragma_foreign_key_check')
    const crossProjectReferences = this.count(`
      SELECT COUNT(*) AS count FROM generated_materials material
      JOIN production_tasks task ON task.id = material.task_id
      WHERE material.drama_id <> task.drama_id
    `) + this.count(`
      SELECT COUNT(*) AS count FROM generated_materials material
      JOIN task_items item ON item.id = material.task_item_id
      WHERE material.task_item_id IS NOT NULL AND item.task_id <> material.task_id
    `) + this.count(`
      SELECT COUNT(*) AS count FROM script_assets asset
      JOIN episodes episode ON episode.id = asset.episode_id
      WHERE asset.episode_id IS NOT NULL AND asset.drama_id <> episode.drama_id
    `) + this.count(`
      SELECT COUNT(*) AS count FROM script_asset_segments segment
      JOIN script_assets asset ON asset.id = segment.script_asset_id
      JOIN episodes episode ON episode.id = segment.episode_id
      WHERE segment.episode_id IS NOT NULL AND asset.drama_id <> episode.drama_id
    `) + this.count(`
      SELECT COUNT(*) AS count FROM subtitle_assets subtitle
      JOIN episodes episode ON episode.id = subtitle.episode_id
      WHERE subtitle.episode_id IS NOT NULL AND subtitle.drama_id <> episode.drama_id
    `) + this.count(`
      SELECT COUNT(*) AS count FROM ai_evidence evidence
      JOIN episodes episode ON episode.id = evidence.episode_id
      WHERE evidence.episode_id IS NOT NULL AND evidence.drama_id <> episode.drama_id
    `) + this.count(`
      SELECT COUNT(*) AS count FROM ai_drafts draft
      JOIN production_tasks task ON task.id = draft.task_id
      JOIN ai_evidence evidence ON evidence.id = draft.evidence_id
      WHERE draft.evidence_id IS NOT NULL AND task.drama_id <> evidence.drama_id
    `)

    return {
      foreignKeyViolations,
      duplicateDramaNames,
      crossProjectReferences,
      warningCount: foreignKeyViolations + duplicateDramaNames + crossProjectReferences
    }
  }

  private count(sql: string): number {
    return (this.database.prepare(sql).get() as CountRow).count
  }
}
