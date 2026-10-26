type Props = { document: Document }

export const bindSubtitleAssetDetail = ({ document }: Props): void => {
  const modal = document.getElementById('subtitleAssetModal')
  if (!modal || modal.dataset.bound === 'true') return
  modal.dataset.bound = 'true'
  let trigger: HTMLButtonElement | null = null
  const setOpen = (open: boolean): void => {
    modal.classList.toggle('open', open)
    modal.setAttribute('aria-hidden', open ? 'false' : 'true')
  }
  const close = (): void => { setOpen(false); trigger?.focus() }
  document.addEventListener('click', (event) => {
    const target = event.target as Element
    const button = target.closest<HTMLButtonElement>('[data-subtitle-open-episode]')
    if (button) {
      trigger = button
      const row = button.closest('tr')
      const episode = button.dataset.subtitleOpenEpisode ?? ''
      const asset = row?.cells[1]?.textContent?.trim() ?? '—'
      const status = row?.cells[2]?.textContent?.trim() ?? '未知状态'
      const hasPicture = button.textContent?.includes('查看画面') === true
      const detailAsset = document.getElementById('subtitleDetailAsset')
      const detailEmpty = document.getElementById('subtitleDetailEmpty')
      const emptyText = document.getElementById('subtitleDetailEmptyText')
      const title = document.getElementById('subtitleAssetModalTitle')
      const meta = document.getElementById('subtitleAssetModalMeta')
      if (title) title.textContent = `第 ${episode} 集字幕资产`
      if (meta) meta.textContent = `${asset} · ${status}`
      if (detailAsset) detailAsset.hidden = !hasPicture
      if (detailEmpty) detailEmpty.hidden = hasPicture
      if (!hasPicture && emptyText) emptyText.textContent = `第 ${episode} 集当前为${status}，暂无可查看的字幕画面。`
      setOpen(true)
      return
    }
    if (target.closest('[data-subtitle-close-asset]')) close()
  })
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('open')) close() })
}
