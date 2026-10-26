import { access, mkdir } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

export const createUniqueOutputPath = async (directory: string, startEpisode: number, endEpisode: number, date = new Date(), dramaName = '短剧', taskName = '多集拼接'): Promise<string> => {
  const root = resolve(directory); const safeDrama = sanitizePathSegment(dramaName); const safeTask = sanitizePathSegment(taskName); const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, ''); const folder = resolve(root, safeDrama, `${safeTask}_${stamp}`)
  if (!isPathWithin(root, folder)) throw new Error('输出路径必须位于用户选择的目录内。')
  await mkdir(folder, { recursive: true }); const base = `${safeDrama}_第${String(startEpisode).padStart(3, '0')}-${String(endEpisode).padStart(3, '0')}集`
  for (let index = 0; index < 1000; index += 1) { const suffix = index === 0 ? '' : `_${String(index + 1).padStart(2, '0')}`; const candidate = join(folder, `${base}${suffix}.mp4`); try { await access(candidate) } catch { return candidate } }
  throw new Error('Unable to allocate a unique output path')
}

export const sanitizePathSegment = (value: string): string => {
  const cleaned = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/\.{2,}/g, '_').replace(/^\.+$/, '_')
  return cleaned || '_'
}

export const isPathWithin = (rootInput: string, targetInput: string): boolean => {
  const root = resolve(rootInput); const target = resolve(targetInput); const prefix = root.endsWith(sep) ? root : `${root}${sep}`
  return target === root || target.startsWith(prefix)
}
