import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('./secret-store.js', () => ({
  canStoreSecrets: () => true,
  encryptSecret: () => Buffer.from('mocked-encrypted-bytes', 'utf8')
}))

import { INITIAL_SCHEMA } from '../db/schema.js'
import { SecretService } from './secret-service.js'

const databases: Database.Database[] = []

afterEach(() => {
  for (const database of databases.splice(0)) {
    database.close()
  }
})

describe('SecretService', () => {
  it('stores encrypted bytes, returns only a mask, and deletes the reference', () => {
    const database = new Database(':memory:')
    databases.push(database)
    for (const statement of INITIAL_SCHEMA) {
      database.exec(statement)
    }
    const service = new SecretService(database)

    const result = service.save({ value: 'super-secret-value' })
    const record = database.prepare('SELECT encrypted_value FROM secret_records WHERE id = ?').get(result.secretRef) as { encrypted_value: Buffer }

    expect(result.maskedValue).toBe('••••••••••••••alue')
    expect(record.encrypted_value.toString('utf8')).toBe('mocked-encrypted-bytes')
    expect(record.encrypted_value.toString('utf8')).not.toContain('super-secret-value')
    expect(service.getStatus(result.secretRef)).toEqual({ exists: true, maskedValue: '已配置', secretRef: result.secretRef })

    service.delete(result.secretRef)
    expect(service.getStatus(result.secretRef).exists).toBe(false)
  })
})
