import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type DiagnosticManifest = { createdAt: string; files: string[]; excluded: string[] }
export const writeDiagnosticManifest = async (directory: string, details: Record<string, unknown>): Promise<string> => { await mkdir(directory, { recursive: true }); const manifest: DiagnosticManifest = { createdAt: new Date().toISOString(), files: ['manifest.json'], excluded: ['videos', 'audio', 'subtitles', 'scripts', 'api request bodies', 'secret values'] }; const path = join(directory, 'manifest.json'); await writeFile(path, JSON.stringify({ manifest, details }, null, 2), 'utf8'); return path }
