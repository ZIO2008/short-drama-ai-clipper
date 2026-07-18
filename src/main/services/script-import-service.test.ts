import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { importScript, ScriptImportError, splitScriptByEpisode } from './script-import-service.js'

describe('script import', () => {
  it('splits a TXT script by episode headings', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'short-drama-script-')); const path = join(folder, 'script.txt')
    try { await writeFile(path, '第01集\n开场\n第2集\n冲突', 'utf8'); const result = await importScript(path); expect(result.episodes.map(({ episodeNo }) => episodeNo)).toEqual([1, 2]); expect(result.episodes[0]?.text).toContain('开场') } finally { await rm(folder, { recursive: true, force: true }) }
  })
  it('rejects a PDF without extractable text as unsupported OCR', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'short-drama-script-pdf-')); const path = join(folder, 'scan.pdf')
    try { await writeFile(path, '%PDF-1.4 binary image', 'utf8'); await expect(importScript(path)).rejects.toMatchObject({ code: 'SCANNED_PDF_UNSUPPORTED' }) } finally { await rm(folder, { recursive: true, force: true }) }
  })
  it('returns an empty preview when a script has no recognizable headings', () => { expect(splitScriptByEpisode('人物：甲\n对白')).toEqual([]) })
  it('rejects unsupported extensions', async () => { await expect(importScript('script.doc')).rejects.toBeInstanceOf(ScriptImportError) })
})
