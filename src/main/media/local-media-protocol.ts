import { protocol } from 'electron'
import { extname, isAbsolute } from 'node:path'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Readable } from 'node:stream'

export const LOCAL_MEDIA_SCHEME = 'shortdrama-media'

const playableExtensions = new Set(['.mp4', '.m4v', '.mov', '.webm', '.avi', '.mkv'])
const contentTypes: Record<string, string> = { '.mp4': 'video/mp4', '.m4v': 'video/x-m4v', '.mov': 'video/quicktime', '.webm': 'video/webm', '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska' }

export const registerLocalMediaScheme = (): void => {
  protocol.registerSchemesAsPrivileged([{
    scheme: LOCAL_MEDIA_SCHEME,
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true }
  }])
}

const badRequest = (): Response => new Response('Invalid local media request.', { status: 400 })
const unavailable = (): Response => new Response('Local media is unavailable.', { status: 404 })

const rangeFor = (header: string | null, size: number): { start: number; end: number } | null => {
  if (!header) return { start: 0, end: size - 1 }
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match) return null
  const [, startText, endText] = match
  const suffix = startText === '' ? Number(endText) : null
  const start = suffix === null ? Number(startText) : Math.max(0, size - suffix)
  const end = suffix === null ? (endText === '' ? size - 1 : Number(endText)) : size - 1
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return null
  return { start, end: Math.min(end, size - 1) }
}

export const registerLocalMediaProtocol = (): void => {
  protocol.handle(LOCAL_MEDIA_SCHEME, async (request) => {
    try {
      const requestUrl = new URL(request.url)
      if (requestUrl.hostname !== 'local') return badRequest()
      const filePath = decodeURIComponent(requestUrl.pathname.slice(1))
      if (!isAbsolute(filePath) || !playableExtensions.has(extname(filePath).toLowerCase())) return badRequest()
      const details = await stat(filePath)
      if (!details.isFile()) return unavailable()
      const range = rangeFor(request.headers.get('range'), details.size)
      if (!range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${details.size}` } })
      const length = range.end - range.start + 1
      const headers = new Headers({
        'Accept-Ranges': 'bytes',
        'Content-Length': String(length),
        'Content-Type': contentTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'Content-Range': `bytes ${range.start}-${range.end}/${details.size}`
      })
      if (request.method === 'HEAD') return new Response(null, { status: request.headers.has('range') ? 206 : 200, headers })
      const stream = Readable.toWeb(createReadStream(filePath, { start: range.start, end: range.end })) as ReadableStream<Uint8Array>
      return new Response(stream, { status: request.headers.has('range') ? 206 : 200, headers })
    } catch {
      return unavailable()
    }
  })
}
