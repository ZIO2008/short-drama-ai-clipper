import { spawn } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const [videoPath, referenceSrtPath, outputPath] = process.argv.slice(2)

if (!videoPath || !referenceSrtPath || !outputPath) {
  throw new Error('Usage: node subtitle-edit-time-axis-poc.mjs <video.mp4> <reference.srt> <output.json>')
}

// Subtitle Edit 5.1 Video OCR defaults, restricted to the known subtitle band of the fixed sample.
const config = {
  fps: 5,
  brightnessMinimum: 190,
  imageSimilarityPercent: 92,
  crop: { width: 900, height: 326, x: 86, y: 1114 },
  thumbnail: { width: 96, height: 35 },
  blankFraction: 0.002,
  minDurationSeconds: 0.25,
}

const ffmpegPath = resolve('node_modules/ffmpeg-static/ffmpeg.exe')
const runFfmpeg = async () => {
  const args = [
    '-hide_banner', '-loglevel', 'error', '-i', videoPath,
    '-vf', `crop=${config.crop.width}:${config.crop.height}:${config.crop.x}:${config.crop.y},fps=${config.fps},scale=${config.thumbnail.width}:${config.thumbnail.height},format=gray`,
    '-an', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1',
  ]
  const child = spawn(ffmpegPath, args, { windowsHide: true })
  const chunks = []
  const errors = []
  child.stdout.on('data', (chunk) => chunks.push(chunk))
  child.stderr.on('data', (chunk) => errors.push(chunk))
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject)
    child.once('close', resolveExit)
  })
  if (exitCode !== 0) throw new Error(`ffmpeg failed: ${Buffer.concat(errors).toString('utf8').trim() || exitCode}`)
  return Buffer.concat(chunks)
}

const isBlank = (frame) => {
  let bright = 0
  for (const pixel of frame) if (pixel >= config.brightnessMinimum) bright++
  return bright < frame.length * config.blankFraction
}

const maskSimilarity = (left, right) => {
  let intersection = 0
  let union = 0
  for (let index = 0; index < left.length; index++) {
    const leftBright = left[index] >= config.brightnessMinimum
    const rightBright = right[index] >= config.brightnessMinimum
    if (leftBright || rightBright) {
      union++
      if (leftBright && rightBright) intersection++
    }
  }
  return union === 0 ? 100 : Math.round((intersection * 100) / union)
}

const parseSeconds = (value) => {
  const match = value.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/)
  if (!match) return null
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000
}

const parseSrtRanges = (source) => source.replace(/\r/g, '').split('\n\n').flatMap((block) => {
  const timing = block.split('\n').find((line) => line.includes('-->'))
  if (!timing) return []
  const [startValue, endValue] = timing.split('-->').map((value) => value.trim())
  const startSeconds = parseSeconds(startValue)
  const endSeconds = parseSeconds(endValue)
  return startSeconds === null || endSeconds === null ? [] : [{ startSeconds, endSeconds }]
})

const overlaps = (left, right) => left.startSeconds < right.endSeconds && right.startSeconds < left.endSeconds

const raw = await runFfmpeg()
const frameSize = config.thumbnail.width * config.thumbnail.height
if (raw.length === 0 || raw.length % frameSize !== 0) throw new Error(`Unexpected raw frame output size: ${raw.length}`)

const groups = []
let previous = null
let current = null
for (let index = 0; index < raw.length / frameSize; index++) {
  const frame = raw.subarray(index * frameSize, (index + 1) * frameSize)
  const blank = isBlank(frame)
  const sameAsLast = current !== null && previous !== null && current.isBlank === blank && (blank || maskSimilarity(previous, frame) >= config.imageSimilarityPercent)
  if (sameAsLast) {
    current.endFrame = index
  } else {
    if (current) groups.push(current)
    current = { startFrame: index, endFrame: index, isBlank: blank }
  }
  previous = frame
}
if (current) groups.push(current)

const candidates = groups
  .filter((group) => !group.isBlank)
  .map((group) => ({
    startSeconds: Number((group.startFrame / config.fps).toFixed(3)),
    endSeconds: Number(((group.endFrame + 1) / config.fps).toFixed(3)),
    durationSeconds: Number(((group.endFrame - group.startFrame + 1) / config.fps).toFixed(3)),
    representativeSeconds: Number((((group.startFrame + group.endFrame + 1) / 2) / config.fps).toFixed(3)),
  }))
  .filter((group) => group.durationSeconds >= config.minDurationSeconds)

const referenceCues = parseSrtRanges(await readFile(referenceSrtPath, 'utf8'))
const metadata = await stat(videoPath)
const result = {
  kind: 'subtitle-edit-style-temporal-detector-poc',
  runAt: new Date().toISOString(),
  source: { videoPath, referenceSrtPath, videoBytes: metadata.size },
  boundary: 'The SRT is read only after visual grouping, for post-hoc overlap metrics. It does not select frames or alter candidate ranges.',
  config,
  sampledFrameCount: raw.length / frameSize,
  visualGroupCount: groups.length,
  blankGroupCount: groups.filter((group) => group.isBlank).length,
  visualCandidateCount: candidates.length,
  referenceCueCount: referenceCues.length,
  candidatesOverlappingReferenceCueCount: candidates.filter((candidate) => referenceCues.some((cue) => overlaps(candidate, cue))).length,
  referenceCuesOverlappingCandidateCount: referenceCues.filter((cue) => candidates.some((candidate) => overlaps(candidate, cue))).length,
  candidates,
}

await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ sampledFrameCount: result.sampledFrameCount, visualCandidateCount: result.visualCandidateCount, referenceCueCount: result.referenceCueCount, candidatesOverlappingReferenceCueCount: result.candidatesOverlappingReferenceCueCount, referenceCuesOverlappingCandidateCount: result.referenceCuesOverlappingCandidateCount }))
