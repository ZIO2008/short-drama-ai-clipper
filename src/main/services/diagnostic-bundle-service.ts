import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sanitizePrivacyRecord } from './privacy-sanitizer.js'

export type DiagnosticManifest = {
  createdAt: string
  files: string[]
  excluded: string[]
}

const EXCLUDED_CONTENT = ['videos', 'audio', 'subtitles', 'scripts', 'api request bodies', 'secret values'] as const

export function createDiagnosticManifest(createdAt = new Date().toISOString(), files: string[] = ['manifest.json']): DiagnosticManifest {
  return { createdAt, files: [...files].sort(), excluded: [...EXCLUDED_CONTENT] }
}

export async function writeDiagnosticManifest(directory: string, details: Record<string, unknown>): Promise<string> {
  await mkdir(directory, { recursive: true })
  const path = join(directory, 'manifest.json')
  const safeDetails = sanitizePrivacyRecord(details)
  const files = (await readdir(directory)).filter((file) => file !== 'manifest.json').sort()
  const manifest = createDiagnosticManifest(undefined, ['manifest.json', ...files])
  await writeFile(path, JSON.stringify({ manifest, details: safeDetails }, null, 2), 'utf8')
  return path
}
