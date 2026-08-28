import { createHash } from 'node:crypto'
import { realpathSync, statSync } from 'node:fs'

export const fingerprintMediaSource = (sourcePath: string): string | null => {
  try {
    const resolvedPath = realpathSync(sourcePath)
    const stat = statSync(resolvedPath)
    if (!stat.isFile()) return null
    return createHash('sha256').update(`${resolvedPath}\u0000${stat.size}\u0000${stat.mtimeMs}`).digest('hex')
  } catch { return null }
}
