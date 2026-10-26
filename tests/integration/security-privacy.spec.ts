import { describe, expect, it } from 'vitest'
import { sanitizePrivacyRecord } from '../../src/main/services/privacy-sanitizer.js'

describe('P0 security privacy integration', () => {
  it('removes secrets and media paths from task-like payloads', () => {
    const safe = sanitizePrivacyRecord({ apiKey: 'sk-live-secret', nested: { path: 'D:/video.mp4', status: 'failed' }, report: 'ok' })
    expect(safe).toEqual({ nested: { status: 'failed' }, report: 'ok' })
    expect(JSON.stringify(safe)).not.toContain('sk-live-secret')
    expect(JSON.stringify(safe)).not.toContain('video.mp4')
  })
})
