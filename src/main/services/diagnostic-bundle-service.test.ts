import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { writeDiagnosticManifest } from './diagnostic-bundle-service.js'

describe('diagnostic bundle privacy', () => {
  it('sanitizes nested details and keeps a truthful manifest', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'material-diagnostic-'))
    try {
      await writeFile(join(directory, 'runtime.json'), '{}', 'utf8')
      const path = await writeDiagnosticManifest(directory, { nested: { secret: 'never', keep: true }, list: [{ apiKey: 'hidden' }] })
      const payload = JSON.parse(await readFile(path, 'utf8')) as { manifest: { files: string[] }; details: Record<string, unknown> }
      expect(payload.manifest.files).toEqual(['manifest.json'])
      expect(JSON.stringify(payload)).not.toContain('runtime.json')
      expect(payload.details).toEqual({ nested: { keep: true }, list: [{}] })
      expect(JSON.stringify(payload)).not.toContain('hidden')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
