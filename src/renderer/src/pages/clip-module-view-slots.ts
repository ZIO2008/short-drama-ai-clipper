/** Bind only the final prototype's existing context/count slots. */
export const bindClipModuleContext = (document: Document, episodeCount: number, dramaName: string): void => {
  for (const id of ['screen-clip-pool', 'screen-clip-report']) {
    const screen = document.getElementById(id)
    const count = screen?.querySelector('.clip-board-episodes-head > span')
    if (count) count.textContent = `${episodeCount} 集`
    const context = screen?.querySelector('.screen-head .meta')
    if (context) context.textContent = `${dramaName} / 素材生产 / 原剧切片`
    // The final prototype renamed this action but retained the historical target attribute.
    screen?.querySelectorAll<HTMLElement>('.screen-head [data-r5-open="assets"]').forEach(button => { button.dataset.r5Open = 'production' })
  }
  const note = document.querySelector('#screen-clip-pool .clip-inspector-note')
  if (note) note.textContent = `长列表只显示当前剧集的 20 条可见窗口，${episodeCount} 集候选不进入页面级滚动。`
  const crumb = document.getElementById('crumb')
  if (crumb) crumb.textContent = `${dramaName} / ${document.body.dataset.staticPrototypeRuntime?.endsWith('clip-report') ? '原剧切片完成报告' : '原剧切片全部候选'}`
}

export const createClipPoolSummary = (document: Document, episodeLabel: string, count: number): HTMLElement => {
  const summary = document.createElement('div'); summary.className = 'clip-board-summary'
  const source = document.createElement('span'), title = document.createElement('b')
  title.textContent = episodeLabel
  source.append(title, document.createTextNode(' · 所有候选均保留独立源时码'))
  const window = document.createElement('span'); window.textContent = `${count} 个候选 · 每窗 20 条`
  summary.append(source, window)
  return summary
}
