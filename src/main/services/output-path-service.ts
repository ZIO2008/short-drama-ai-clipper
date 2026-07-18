import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export const createUniqueOutputPath = async (directory: string, startEpisode: number, endEpisode: number, date = new Date()): Promise<string> => {
  await mkdir(directory, { recursive: true }); const day = date.toISOString().slice(0, 10); const folder = join(directory, day); await mkdir(folder, { recursive: true }); const base = `episodes-${String(startEpisode).padStart(2, '0')}-${String(endEpisode).padStart(2, '0')}`
  for (let index = 0; index < 1000; index += 1) { const suffix = index === 0 ? '' : `_${String(index + 1).padStart(2, '0')}`; const candidate = join(folder, `${base}${suffix}.mp4`); try { await access(candidate) } catch { return candidate } }
  throw new Error('Unable to allocate a unique output path')
}
