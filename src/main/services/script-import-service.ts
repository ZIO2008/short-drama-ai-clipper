import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'
import { PDFParse } from 'pdf-parse'

export type ScriptFormat = 'txt' | 'docx' | 'pdf'
export type ScriptEpisodePreview = { segmentId?: string; episodeNo: number; title: string; text: string }

export class ScriptImportError extends Error {
  constructor(public readonly code: 'UNSUPPORTED_FORMAT' | 'SCANNED_PDF_UNSUPPORTED' | 'EMPTY_SCRIPT', message: string) { super(message) }
}

export const readScriptFile = async (filePath: string): Promise<{ format: ScriptFormat; text: string }> => {
  const extension = extname(filePath).toLowerCase()
  if (extension === '.txt') return { format: 'txt', text: await readFile(filePath, 'utf8') }
  if (extension !== '.docx' && extension !== '.pdf') throw new ScriptImportError('UNSUPPORTED_FORMAT', '仅支持 TXT、DOCX 和可提取文本的 PDF')
  const bytes = await readFile(filePath)
  if (extension === '.docx') return { format: 'docx', text: extractDocxText(bytes) }
  if (extension === '.pdf') return { format: 'pdf', text: await extractPdfText(bytes) }
  throw new ScriptImportError('UNSUPPORTED_FORMAT', '仅支持 TXT、DOCX 和可提取文本的 PDF')
}

export const importScript = async (filePath: string): Promise<{ format: ScriptFormat; text: string; episodes: ScriptEpisodePreview[] }> => {
  const result = await readScriptFile(filePath)
  const text = result.text.replace(/\r\n/g, '\n').trim()
  if (!text) throw new ScriptImportError(result.format === 'pdf' ? 'SCANNED_PDF_UNSUPPORTED' : 'EMPTY_SCRIPT', result.format === 'pdf' ? '扫描版 PDF 暂不支持 OCR' : '剧本文本为空')
  const episodes = splitScriptByEpisode(text)
  return { ...result, text, episodes: episodes.length > 0 ? episodes : [{ episodeNo: 0, title: '整部剧本（待手工关联）', text }] }
}

export const splitScriptByEpisode = (text: string): ScriptEpisodePreview[] => {
  const lines = text.split('\n'); const heading = /^\s*(?:第\s*)?0*(\d{1,4})\s*(?:集|episode|ep)(?:\b|\s|$).*$/i
  const sections: Array<{ episodeNo: number; title: string; lines: string[] }> = []
  for (const line of lines) {
    const match = line.match(heading)
    if (match?.[1]) sections.push({ episodeNo: Number(match[1]), title: line.trim(), lines: [] })
    else if (sections.length > 0) sections[sections.length - 1]?.lines.push(line)
  }
  return sections.map((section) => ({ episodeNo: section.episodeNo, title: section.title, text: section.lines.join('\n').trim() }))
}

const extractDocxText = (bytes: Uint8Array): string => {
  const document = unzipSync(bytes)['word/document.xml']
  if (!document) return ''
  return strFromU8(document)
    .replace(/<\/w:p\s*>/g, '\n')
    .replace(/<w:tab\s*\/?\s*>/g, '\t')
    .replace(/<w:br\s*\/?\s*>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n').trim()
}

const extractPdfText = async (bytes: Uint8Array): Promise<string> => {
  const parser = new PDFParse({ data: bytes })
  try { const result = await parser.getText(); return result.text.trim() } catch { return '' } finally { await parser.destroy() }
}
