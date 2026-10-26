import { basename, extname } from 'node:path'

export const extractEpisodeNoFromSubtitlePath = (sourcePath: string): number | null => {
  const filename = basename(sourcePath, extname(sourcePath)).trim()
  const match = /^(?:第\s*)?0*(\d+)(?:\s*集)?(?:\s*[（(][^()（）]*[)）])?$/u.exec(filename)
  if (!match) return null
  const episodeNo = Number(match[1])
  return Number.isSafeInteger(episodeNo) && episodeNo > 0 ? episodeNo : null
}
