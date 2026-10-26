import { basename } from 'node:path'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import { DramaService } from './drama-service.js'

const relinkCandidatesSchema = z.array(z.string().trim().min(1)).max(10000)

export const parseRelinkCandidates = (input: unknown): string[] => relinkCandidatesSchema.parse(input)

export class RelinkService {
  constructor(private readonly database: Database.Database, private readonly dramaService: DramaService) {}
  async relink(dramaId: string, candidatesInput: unknown): Promise<{ relinked: number; unresolved: string[] }> {
    const candidates = parseRelinkCandidates(candidatesInput)
    const episodes = this.database.prepare('SELECT id, source_path FROM episodes WHERE drama_id = ?').all(dramaId) as Array<{ id: string; source_path: string }>
    const byName = new Map(candidates.map((path) => [basename(path).toLowerCase(), path])); let relinked = 0; const unresolved: string[] = []
    for (const episode of episodes) { const path = byName.get(basename(episode.source_path).toLowerCase()); if (!path) { unresolved.push(episode.source_path); continue } const current = this.database.prepare('SELECT episode_no, sort_order FROM episodes WHERE id = ?').get(episode.id) as { episode_no: number | null; sort_order: number }; await this.dramaService.updateEpisode(dramaId, episode.id, { episodeNo: current.episode_no, sortOrder: current.sort_order, sourcePath: path }); relinked += 1 }
    return { relinked, unresolved }
  }
}
