import { z } from 'zod'

const externalUrlInput = z.string().trim().min(1).max(2048)

export const parseExternalUrl = (input: unknown): string => {
  const parsed = new URL(externalUrlInput.parse(input))
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('只能打开不含账号信息的 http(s) 官方链接。')
  return parsed.toString()
}

export const openExternalUrl = (openExternal: (url: string) => Promise<void>, input: unknown): Promise<void> => openExternal(parseExternalUrl(input))
