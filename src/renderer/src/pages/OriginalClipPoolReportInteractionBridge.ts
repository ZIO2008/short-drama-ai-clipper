type Filter = 'all' | 'pending' | 'confirmed' | 'exported'
type ReportFilter = 'all' | 'exception'
type Candidate = { number: number; status: string; start: string; end: string; duration: string }
type ReportRow = { id: string; source: string; duration: string; status: string; file: string }

const isElementTarget = (target: EventTarget | null): target is Element => (
  target !== null && typeof (target as Element).closest === 'function'
)

const isInputTarget = (target: EventTarget | null, id: string): target is HTMLInputElement => (
  isElementTarget(target) && target.id === id && 'value' in target
)

const pad = (value: number, length = 2): string => String(value).padStart(length, '0')
const candidateData = (): Candidate[] => Array.from({ length: 50 }, (_, index) => {
  const number = index + 1
  return {
    number,
    status: number % 9 === 0 ? '异常' : number % 5 === 0 ? '已导出' : number % 3 === 0 ? '已确认' : '待确认',
    start: (9.2 + number * 11.7).toFixed(1),
    end: (24 + number * 11.7).toFixed(1),
    duration: (14.8 + (number % 4) * 0.4).toFixed(1)
  }
})

const reportData = (episode: number): ReportRow[] => {
  if (episode === 6) return [{ id: '—', source: '源媒体定位', duration: '—', status: '媒体缺失', file: '未生成输出' }]
  if (episode === 3) return [{ id: '—', source: '候选生成任务', duration: '—', status: '处理中', file: '等待候选生成' }]
  return Array.from({ length: 5 }, (_, index) => {
    const number = index + 1
    return {
      id: `C-${pad(number, 3)}`,
      source: `${(12.4 + index * 17.2).toFixed(1)} — ${(27.2 + index * 17.2).toFixed(1)}`,
      duration: `${(14.8 + index * 0.4).toFixed(1)} 秒`,
      status: number === 5 ? '待复核' : number % 3 === 0 ? '已确认' : '已导出',
      file: `破茧之后_E${pad(episode)}_C${pad(number, 3)}.mp4`
    }
  })
}

const statusBadge = (status: string): string => `<span class="badge ${status === '已导出' || status === '已确认' ? 'success' : status === '媒体缺失' || status === '异常' ? 'danger' : 'warning'}">${status}</span>`

const episodeState = (episode: number): string => episode === 3 ? '生成中' : episode === 6 ? '媒体缺失' : episode % 7 === 0 ? '已导出' : episode % 5 === 0 ? '待确认' : '已确认'
const episodeButtons = (episode: number, attribute: string): string => Array.from({ length: 120 }, (_, index) => {
  const number = index + 1
  return `<button class="clip-episode-row ${episode === number ? 'active' : ''}" type="button" data-${attribute}-episode="${number}"><span class="num">${pad(number)}</span><span><b>第 ${pad(number)} 集</b><small>${episodeState(number)} · 最多 50 个候选</small></span></button>`
}).join('')

const showToast = (document: Document, message: string): void => {
  const toast = document.getElementById('toast')
  if (!toast) return
  toast.textContent = message
  toast.classList.add('show')
  window.setTimeout(() => toast.classList.remove('show'), 2200)
}

const setModalOpen = (document: Document, id: string, open: boolean): void => {
  const modal = document.getElementById(id)
  if (!modal) return
  modal.classList.toggle('open', open)
  modal.setAttribute('aria-hidden', String(!open))
  if (open) modal.removeAttribute('inert')
  else modal.setAttribute('inert', '')
}

const setQualityMode = (document: Document, mode: string): void => {
  document.querySelectorAll<HTMLElement>('#exportModal [data-quality-mode]').forEach((button) => {
    const active = button.dataset.qualityMode === mode
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  document.querySelectorAll<HTMLElement>('#exportModal [data-quality-field]').forEach((field) => { field.hidden = field.dataset.qualityField !== mode })
}

const fieldValue = (document: Document, id: string): string => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? ''
const selectedLabel = (document: Document, id: string): string => (document.getElementById(id) as HTMLSelectElement | null)?.selectedOptions[0]?.text ?? ''

const updatePackagingPreview = (document: Document): void => {
  const preview = document.getElementById('packagePreview')
  if (!preview) return
  const titlePosition = fieldValue(document, 'packageTitlePosition').startsWith('顶部') ? 'top' : 'bottom'
  const promptPosition = fieldValue(document, 'packagePromptPosition').startsWith('左侧') ? 'left' : 'right'
  const title = fieldValue(document, 'packageTitleInput').trim() || '无标题'
  const prompt = fieldValue(document, 'packagePromptInput').trim() || '无提示语'
  const badge = fieldValue(document, 'packageBadge')
  document.getElementById('packagePreviewTitle')?.replaceChildren(document.createTextNode(title))
  document.getElementById('packagePreviewPrompt')?.replaceChildren(document.createTextNode(prompt))
  const badgePreview = document.getElementById('packagePreviewBadge')
  if (badgePreview) { badgePreview.textContent = badge; badgePreview.hidden = badge === '不显示' }
  preview.dataset.titlePosition = titlePosition
  preview.dataset.promptPosition = promptPosition
  preview.dataset.titleTone = fieldValue(document, 'packageTitleTone')
  preview.dataset.promptStyle = fieldValue(document, 'packagePromptStyle')
  preview.style.setProperty('--package-title-size', ({ small: '28px', medium: '32px', large: '38px' } as Record<string, string>)[fieldValue(document, 'packageTitleSize')] ?? '32px')
  preview.style.setProperty('--package-overlay', ({ none: '0%', subtle: '20%', strong: '44%' } as Record<string, string>)[fieldValue(document, 'packageOverlay')] ?? '20%')
}

const setPackagingAspect = (document: Document, aspect: string): void => {
  const preview = document.getElementById('packagePreview')
  if (!preview) return
  const portrait = aspect === 'portrait'
  preview.dataset.aspect = aspect
  document.getElementById('packageAspectLabel')?.replaceChildren(document.createTextNode(`画面预览 · ${portrait ? '竖屏 9:16' : '横屏 16:9'} 安全区`))
  document.querySelectorAll<HTMLElement>('[data-package-aspect]').forEach((button) => {
    const active = button.dataset.packageAspect === aspect
    button.classList.toggle('active', active)
    button.setAttribute('aria-pressed', String(active))
  })
  const titlePosition = document.getElementById('packageTitlePosition') as HTMLSelectElement | null
  const promptPosition = document.getElementById('packagePromptPosition') as HTMLSelectElement | null
  if (titlePosition) titlePosition.value = portrait ? '顶部居中' : '底部居中'
  if (promptPosition) promptPosition.value = portrait ? '左侧竖排' : '右侧竖排'
  updatePackagingPreview(document)
}

export const bindOriginalClipPoolReportInteractions = ({ document }: { document: Document }): void => {
  if (document.body.dataset.clipPoolReportInteractionsBound === 'true') return
  document.body.dataset.clipPoolReportInteractionsBound = 'true'

  let candidateEpisode = 1
  let candidateFilter: Filter = 'all'
  let candidatePage = 0
  let candidateQuery = ''
  let reportEpisode = 1
  let reportFilter: ReportFilter = 'all'
  const packagingToggle = document.getElementById('exportPackageToggle')
  if (packagingToggle) packagingToggle.setAttribute('aria-pressed', String(packagingToggle.classList.contains('on')))
  document.querySelectorAll<HTMLElement>('[data-package-aspect]').forEach((button) => button.setAttribute('aria-pressed', String(button.classList.contains('active'))))

  const renderCandidates = (): void => {
    const episodes = document.getElementById('clipCandidateEpisodes')
    const rows = document.getElementById('clipCandidateRows')
    const title = document.getElementById('clipPoolTitle')
    const meta = document.getElementById('clipPoolWindowMeta')
    if (!episodes || !rows || !title || !meta) return
    episodes.innerHTML = episodeButtons(candidateEpisode, 'clip-candidate')
    title.textContent = `第 ${pad(candidateEpisode)} 集候选`
    if (candidateEpisode === 3 || candidateEpisode === 6) {
      const missingMedia = candidateEpisode === 6
      rows.innerHTML = `<div class="clip-board-empty"><div><b>第 ${pad(candidateEpisode)} 集${missingMedia ? '源媒体缺失' : '正在生成候选'}</b><span>${missingMedia ? '请先返回项目库重新定位源文件，再生成本集候选。' : '生成结束后会按本集归档，当前不会填充演示候选。'}</span></div></div>`
      meta.textContent = '当前剧集无可审核候选'
      return
    }
    let candidates = candidateData()
    if (candidateFilter !== 'all') candidates = candidates.filter((candidate) => candidateFilter === 'pending' ? candidate.status === '待确认' : candidateFilter === 'confirmed' ? candidate.status === '已确认' : candidate.status === '已导出')
    if (candidateQuery) candidates = candidates.filter((candidate) => `C-${pad(candidate.number)} ${candidate.start} ${candidate.end}`.toLowerCase().includes(candidateQuery))
    const pages = Math.max(1, Math.ceil(candidates.length / 20))
    if (candidatePage >= pages) candidatePage = 0
    const visible = candidates.slice(candidatePage * 20, candidatePage * 20 + 20)
    meta.textContent = `${candidates.length} 个匹配候选 · 当前窗口 ${candidatePage + 1} / ${pages}`
    rows.innerHTML = `<div class="clip-board-summary"><span><b>第 ${pad(candidateEpisode)} 集</b> · 所有候选均保留独立源时码</span><span>5,000 候选基线 · 20 可见 + 8 缓冲</span></div>${visible.map((candidate) => `<div class="clip-candidate-list-row"><span class="num">C-${pad(candidate.number)}</span><span>${candidate.start} — ${candidate.end}<small>源片时间码 · 独立输出</small></span><span class="clip-candidate-duration">${candidate.duration} 秒</span><span>${statusBadge(candidate.status)}</span><button class="btn btn-secondary clip-list-action" type="button" data-r5-open="clip">打开</button></div>`).join('')}<div class="clip-window-actions"><button class="btn btn-secondary" type="button" data-clip-window="prev" ${candidatePage === 0 ? 'disabled' : ''}>上一窗口</button><button class="btn btn-secondary" type="button" data-clip-window="next" ${candidatePage >= pages - 1 ? 'disabled' : ''}>下一窗口</button></div>`
  }

  const renderReport = (): void => {
    const episodes = document.getElementById('clipReportEpisodes')
    const rows = document.getElementById('clipReportRows')
    const title = document.getElementById('clipReportTitle')
    const meta = document.getElementById('clipReportMeta')
    const summary = document.getElementById('clipReportSummary')
    if (!episodes || !rows || !title || !meta || !summary) return
    episodes.innerHTML = episodeButtons(reportEpisode, 'clip-report')
    const results = reportData(reportEpisode).filter((row) => reportFilter === 'all' || row.status === '媒体缺失' || row.status === '待复核')
    title.textContent = `第 ${pad(reportEpisode)} 集完成报告`
    meta.textContent = reportEpisode === 6 ? '本集源媒体缺失，未生成候选' : reportEpisode === 3 ? '本集候选仍在生成' : `本集 ${results.length} 条结果 · 输出均可追溯到本集`
    const stats = reportEpisode === 6 ? [['0', '已确认'], ['0', '已导出'], ['1', '媒体缺失'], ['0', '待复核']] : reportEpisode === 3 ? [['0', '已确认'], ['0', '已导出'], ['0', '媒体缺失'], ['1', '处理中']] : [['5', '已确认'], ['3', '已导出'], ['0', '媒体缺失'], ['1', '待复核']]
    summary.innerHTML = stats.map(([value, label]) => `<div><b>${value}</b><span>${label}</span></div>`).join('')
    rows.innerHTML = `<div class="clip-report-results-head"><div><span><b>本集输出明细</b><span>每项均保留候选编号、源片区间与输出文件</span></span><span>${results.length} 条结果</span></div><div class="clip-report-columns"><span>候选</span><span>源片区间 / 输出文件</span><span>时长</span><span>状态</span><span>操作</span></div></div>${results.map((row) => `<div class="clip-report-list-row"><span class="num">${row.id}</span><span class="clip-report-source">${row.source}<small>${row.file}</small></span><span class="clip-report-duration">${row.duration}</span>${statusBadge(row.status)}<button class="btn btn-secondary clip-list-action" type="button" ${row.status === '媒体缺失' ? 'data-r5-open="assets"' : 'data-r5-open="clip"'}>${row.status === '媒体缺失' ? '重新定位' : '查看'}</button></div>`).join('')}`
  }

  const openExport = (): void => {
    const modal = document.getElementById('exportModal')
    if (!modal) { showToast(document, '导出设置原型未加载。'); return }
    setModalOpen(document, 'exportModal', true)
    document.getElementById('exportTitle')?.replaceChildren(document.createTextNode('导出已确认切片'))
    modal.querySelector('.modal-head .meta')?.replaceChildren(document.createTextNode('500 项待导出 · 每项保留剧集与候选编号'))
    const save = document.getElementById('saveExport') as HTMLButtonElement | null
    if (save) save.textContent = '开始导出 500 项'
    document.getElementById('closeExport')?.focus()
  }

  document.addEventListener('input', (event) => {
    const search = isInputTarget(event.target, 'clipCandidateSearch') ? event.target : null
    if (!search) return
    candidateQuery = search.value.trim().toLowerCase()
    candidatePage = 0
    renderCandidates()
  })

  document.addEventListener('click', (event) => {
    const target = isElementTarget(event.target) ? event.target : null
    if (!target) return
    const candidateEpisodeButton = target.closest<HTMLElement>('[data-clip-candidate-episode]')
    if (candidateEpisodeButton) { candidateEpisode = Number(candidateEpisodeButton.dataset.clipCandidateEpisode); candidatePage = 0; renderCandidates(); return }
    const reportEpisodeButton = target.closest<HTMLElement>('[data-clip-report-episode]')
    if (reportEpisodeButton) { reportEpisode = Number(reportEpisodeButton.dataset.clipReportEpisode); renderReport(); return }
    const filterButton = target.closest<HTMLElement>('[data-clip-filter]')
    if (filterButton) {
      candidateFilter = filterButton.dataset.clipFilter as Filter
      candidatePage = 0
      document.querySelectorAll<HTMLElement>('[data-clip-filter]').forEach((button) => button.classList.toggle('active', button === filterButton))
      renderCandidates()
      return
    }
    const reportFilterButton = target.closest<HTMLElement>('[data-clip-report-filter]')
    if (reportFilterButton) {
      reportFilter = reportFilterButton.dataset.clipReportFilter as ReportFilter
      document.querySelectorAll<HTMLElement>('[data-clip-report-filter]').forEach((button) => button.classList.toggle('active', button === reportFilterButton))
      renderReport()
      return
    }
    const windowButton = target.closest<HTMLElement>('[data-clip-window]')
    if (windowButton) { candidatePage += windowButton.dataset.clipWindow === 'next' ? 1 : -1; renderCandidates(); return }
    if (target.closest('[data-clip-export-open]')) { event.preventDefault(); openExport(); return }
    if (target.closest('#exportModal [data-quality-mode]')) { const mode = target.closest<HTMLElement>('[data-quality-mode]')?.dataset.qualityMode; if (mode) setQualityMode(document, mode); return }
    if (target.closest('#closeExport, #cancelExport')) { setModalOpen(document, 'exportModal', false); return }
    if (target.closest('#exportPackageToggle')) {
      const toggle = document.getElementById('exportPackageToggle')
      toggle?.classList.toggle('on')
      toggle?.setAttribute('aria-pressed', String(toggle?.classList.contains('on')))
      return
    }
    if (target.closest('#configurePackagingFromExport')) { setModalOpen(document, 'exportModal', false); setModalOpen(document, 'packagingModal', true); updatePackagingPreview(document); return }
    const aspectButton = target.closest<HTMLElement>('[data-package-aspect]')
    if (aspectButton) { setPackagingAspect(document, aspectButton.dataset.packageAspect ?? 'portrait'); return }
    if (target.closest('#closePackaging, #cancelPackaging')) { setModalOpen(document, 'packagingModal', false); return }
    if (target.closest('#savePackaging')) {
      const summary = `${fieldValue(document, 'packagePreset')} · ${document.getElementById('packagePreview')?.dataset.aspect === 'portrait' ? '竖屏 9:16' : '横屏 16:9'} / ${fieldValue(document, 'packageTitlePosition')}标题 / ${fieldValue(document, 'packagePromptPosition')}提示语 / ${fieldValue(document, 'packageBadge')}角标 / ${selectedLabel(document, 'packageTitleSize')}`
      document.querySelector('#exportModal .package-summary')?.replaceChildren(document.createTextNode(summary))
      setModalOpen(document, 'packagingModal', false)
      showToast(document, '包装配置已保存到当前原型会话。')
      return
    }
    if (target.closest('#saveExport')) { setModalOpen(document, 'exportModal', false); document.querySelector<HTMLElement>('#screen-clip-report [data-r5-open="clip-report"]')?.click(); return }
    const reportRow = target.closest<HTMLElement>('#screen-clip-report .clip-report-list-row')
    if (reportRow && !target.closest('button, a, input, select, textarea')) {
      document.querySelectorAll('.clip-report-list-row.is-selected').forEach((row) => row.classList.remove('is-selected'))
      reportRow.classList.add('is-selected')
    }
  })

  document.addEventListener('input', (event) => {
    const target = isElementTarget(event.target) ? event.target : null
    if (target?.closest('#packagingModal')) updatePackagingPreview(document)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    if (document.getElementById('packagingModal')?.classList.contains('open')) setModalOpen(document, 'packagingModal', false)
    else if (document.getElementById('exportModal')?.classList.contains('open')) setModalOpen(document, 'exportModal', false)
  })

  renderCandidates()
  renderReport()
}
