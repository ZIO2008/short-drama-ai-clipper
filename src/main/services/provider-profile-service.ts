import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max)
const endpointSchema = z.string().trim().max(2048).url().refine((value) => {
  const parsed = new URL(value)
  return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && !parsed.username && !parsed.password
}, 'endpoint must be an http(s) URL without embedded credentials')
const profileSchema = z.object({
  capability: nonEmptyText(100),
  region: nonEmptyText(100),
  provider: nonEmptyText(100),
  endpoint: endpointSchema.nullable().optional(),
  model: z.string().trim().max(200).nullable().optional(),
  secretRef: z.string().uuid().nullable().optional(),
  timeoutMs: z.number().int().positive().max(600000).nullable().optional(),
})

export type ProviderProfile = {
  id: string
  capability: string
  region: string
  provider: string
  endpoint: string | null
  model: string | null
  secretRef: string | null
  timeoutMs: number | null
}

export class ProviderProfileService {
  constructor(private readonly database: Database.Database) {}

  save(input: unknown): string {
    const profile = profileSchema.parse(input)
    const id = randomUUID()
    const now = new Date().toISOString()
    this.database.prepare('INSERT INTO provider_profiles (id, capability, region, provider, endpoint, model, secret_ref, timeout_ms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      id,
      profile.capability,
      profile.region,
      profile.provider,
      profile.endpoint ?? null,
      profile.model ?? null,
      profile.secretRef ?? null,
      profile.timeoutMs ?? null,
      now,
      now,
    )
    return id
  }

  list(): ProviderProfile[] {
    return this.database.prepare('SELECT id, capability, region, provider, endpoint, model, secret_ref AS secretRef, timeout_ms AS timeoutMs FROM provider_profiles ORDER BY updated_at DESC').all() as ProviderProfile[]
  }
}
