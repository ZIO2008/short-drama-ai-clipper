import { stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

export const overlapRatio = (start: number, end: number, otherStart: number, otherEnd: number): number => {
  const overlap = Math.max(0, Math.min(end, otherEnd) - Math.max(start, otherStart))
  return overlap / Math.max(0.001, Math.min(end - start, otherEnd - otherStart))
}

export const uniqueOutputPath = async (directory: string, fileName: string): Promise<string> => {
  let index = 0
  while (true) {
    const suffix = index === 0 ? '' : `_${String(index + 1).padStart(2, '0')}`
    const path = join(directory, `${basename(fileName, extname(fileName))}${suffix}${extname(fileName)}`)
    try { await stat(path); index += 1 } catch { return path }
  }
}
