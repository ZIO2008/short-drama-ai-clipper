import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { SecretStatus } from '../../shared/contracts.js'
import { canStoreSecrets, encryptSecret } from './secret-store.js'

const secretInputSchema = z.object({
  secretRef: z.string().uuid().optional(),
  value: z.string().trim().min(1).max(4096)
})

const secretReferenceSchema = z.string().uuid()

export class SecretService {
  constructor(private readonly database: Database.Database) {}

  save(input: unknown): SecretStatus {
    const { secretRef, value } = secretInputSchema.parse(input)
    const id = secretRef ?? randomUUID()
    const now = new Date().toISOString()
    const encryptedValue = encryptSecret(value)

    this.database.prepare(`
      INSERT INTO secret_records (id, encrypted_value, created_at, updated_at)
      VALUES (@id, @encryptedValue, @createdAt, @updatedAt)
      ON CONFLICT(id) DO UPDATE SET encrypted_value = excluded.encrypted_value, updated_at = excluded.updated_at
    `).run({ id, encryptedValue, createdAt: now, updatedAt: now })

    return { exists: true, maskedValue: maskSecret(value), secretRef: id }
  }

  getStatus(secretRef: unknown): SecretStatus {
    const id = secretReferenceSchema.parse(secretRef)
    const record = this.database.prepare('SELECT id FROM secret_records WHERE id = ?').get(id) as { id: string } | undefined

    return { exists: record !== undefined, maskedValue: record ? '已配置' : null, secretRef: id }
  }

  delete(secretRef: unknown): void {
    const id = secretReferenceSchema.parse(secretRef)
    this.database.prepare('DELETE FROM secret_records WHERE id = ?').run(id)
  }

  isAvailable(): boolean {
    return canStoreSecrets()
  }
}

const maskSecret = (secret: string): string => {
  const visibleSuffix = secret.slice(-4)
  return `${'•'.repeat(Math.max(4, secret.length - visibleSuffix.length))}${visibleSuffix}`
}
