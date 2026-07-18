import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export const createUniqueOutputPath = async (directory: string, startEpisode: number, endEpisode: number, date = new Date(), dramaName = '短剧', taskName = '多集拼接'): Promise<string> => {
  await mkdir(directory, { recursive: true }); const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, ''); const folder = join(directory, dramaName, `${taskName}_${stamp}`); await mkdir(folder, { recursive: true }); const base = `${dramaName}_第${String(startEpisode).padStart(3, '0')}-${String(endEpisode).padStart(3, '0')}集`
  for (let index = 0; index < 1000; index += 1) { const suffix = index === 0 ? '' : `_${String(index + 1).padStart(2, '0')}`; const candidate = join(folder, `${base}${suffix}.mp4`); try { await access(candidate) } catch { return candidate } }
  throw new Error('Unable to allocate a unique output path')
}
