import type { EpisodeAsset } from '../../../shared/contracts.js'
import { asrTrack, importedTrack, visualTrack } from './subtitle-evidence-presentation.js'
import { renderThreeSourceEvidence, syncThreeSourceEvidencePlayback } from './subtitle-three-source-evidence.js'

type Props = { document: Document; dramaId: string; episodes: EpisodeAsset[] }
type OpenDetail = { episodeId?: string; kind?: 'view' | 'status' }

const isOpenDetail = (value: unknown): value is OpenDetail => Boolean(value && typeof value === 'object')

export const bindSubtitleStaticDetailReadOnly = ({ document, dramaId, episodes }: Props): void => {
  if (document.body.dataset.subtitleStaticDetailReadOnlyBound === 'true') return
  document.body.dataset.subtitleStaticDetailReadOnlyBound = 'true'
  const episodeById = new Map(episodes.map((episode) => [episode.id, episode]))
  let request = 0
  let activeEvidence: HTMLElement | null = null

  document.addEventListener('subtitle-preview:position', (event) => {
    const detail = (event as CustomEvent<{ seconds?: unknown; isPlaying?: unknown }>).detail
    if (!activeEvidence || typeof detail?.seconds !== 'number' || typeof detail.isPlaying !== 'boolean') return
    syncThreeSourceEvidencePlayback(activeEvidence, { seconds: detail.seconds, isPlaying: detail.isPlaying })
  })

  document.addEventListener('subtitle-static-detail:opened', (event) => {
    const detail = (event as CustomEvent<unknown>).detail
    if (!isOpenDetail(detail) || detail.kind !== 'view' || !detail.episodeId) return
    const episode = episodeById.get(detail.episodeId)
    const evidence = document.querySelector<HTMLElement>('#subtitleAssetModal #subtitleDetailAsset .r5-evidence')
    if (!episode || !evidence) return
    document.querySelectorAll<HTMLElement>('#subtitleAssetModal [data-subtitle-open-settings]').forEach((button) => { button.dataset.subtitleEpisodeId = episode.id })
    activeEvidence = evidence
    const currentRequest = ++request
    evidence.innerHTML = '<div class="subtitle-position-note" role="status">正在读取三源字幕证据。</div>'
    void loadEvidence({ document, dramaId, episode, evidence, currentRequest, isCurrent: () => currentRequest === request })
  })
}

const loadEvidence = async ({ document, dramaId, episode, evidence, currentRequest, isCurrent }: {
  document: Document; dramaId: string; episode: EpisodeAsset; evidence: HTMLElement; currentRequest: number; isCurrent: () => boolean
}): Promise<void> => {
  try {
    const tracks = await window.desktopApi.listSubtitleEvidenceTracks(dramaId, episode.id)
    const asr = asrTrack(tracks)
    const imported = importedTrack(tracks)
    const ocr = visualTrack(tracks)
    const [asrCues, importedCues, ocrCues] = await Promise.all([
      asr ? window.desktopApi.listSubtitleEvidenceCues(asr.id) : Promise.resolve([]),
      imported ? window.desktopApi.listSubtitleEvidenceCues(imported.id) : Promise.resolve([]),
      ocr ? window.desktopApi.listSubtitleEvidenceCues(ocr.id) : Promise.resolve([])
    ])
    if (!isCurrent() || !document.getElementById('subtitleAssetModal')?.contains(evidence)) return
    renderThreeSourceEvidence(evidence, episode.episodeNo, { asr: asrCues, import: importedCues, ocr: ocrCues })
    const video = document.querySelector<HTMLVideoElement>('#subtitleAssetModal video[data-subtitle-preview]')
    if (video) syncThreeSourceEvidencePlayback(evidence, { seconds: video.currentTime, isPlaying: !video.paused })
  } catch (cause) {
    if (!isCurrent() || !document.getElementById('subtitleAssetModal')?.contains(evidence)) return
    const message = cause instanceof Error ? cause.message : '未知错误'
    evidence.innerHTML = `<div class="subtitle-position-note" role="status">三源字幕证据读取失败：${message}</div>`
  }
}
