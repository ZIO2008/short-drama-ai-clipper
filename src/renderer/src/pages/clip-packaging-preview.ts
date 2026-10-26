const value = (document: Document, id: string): string => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? ''

export const syncClipPackagingPreview = (document: Document, recommend = false): void => {
  const preview = document.getElementById('packagePreview')
  if (!preview) return
  const portrait = document.querySelector('[data-package-aspect="portrait"]')?.classList.contains('active') !== false
  preview.dataset.aspect = portrait ? 'portrait' : 'landscape'
  const label = document.getElementById('packageAspectLabel')
  if (label) label.textContent = `画面预览 · ${portrait ? '竖屏 9:16' : '横屏 16:9'} 安全区`
  if (recommend) {
    const title = document.getElementById('packageTitlePosition') as HTMLSelectElement | null
    const prompt = document.getElementById('packagePromptPosition') as HTMLSelectElement | null
    if (title) title.value = portrait ? '顶部居中' : '底部居中'
    if (prompt) prompt.value = portrait ? '左侧竖排' : '右侧竖排'
  }
  const title = document.getElementById('packagePreviewTitle')
  const prompt = document.getElementById('packagePreviewPrompt')
  const badge = document.getElementById('packagePreviewBadge')
  if (title) title.textContent = value(document, 'packageTitleInput').trim() || '无标题'
  if (prompt) prompt.textContent = value(document, 'packagePromptInput').trim() || '无提示语'
  if (badge) { badge.textContent = value(document, 'packageBadge'); badge.hidden = badge.textContent === '不显示' }
  preview.dataset.titlePosition = value(document, 'packageTitlePosition').startsWith('顶部') ? 'top' : 'bottom'
  preview.dataset.promptPosition = value(document, 'packagePromptPosition').startsWith('左侧') ? 'left' : 'right'
  preview.dataset.titleTone = value(document, 'packageTitleTone')
  preview.dataset.promptStyle = value(document, 'packagePromptStyle')
  preview.style.setProperty('--package-title-size', ({ small: '28px', medium: '32px', large: '38px' } as Record<string, string>)[value(document, 'packageTitleSize')] ?? '32px')
  preview.style.setProperty('--package-overlay', ({ none: '0%', subtle: '20%', strong: '44%' } as Record<string, string>)[value(document, 'packageOverlay')] ?? '20%')
}

export const bindClipPackagingPreview = (document: Document): (() => void) => {
  const sync = (event: Event): void => {
    const target = event.target as Element | null
    if (target?.closest?.('#packagingModal')) syncClipPackagingPreview(document)
  }
  const click = (event: MouseEvent): void => {
    const target = event.target as Element | null
    if (target?.closest?.('#configurePackagingFromExport')) {
      syncClipPackagingPreview(document)
      document.getElementById('packagePreset')?.focus()
    }
    if (target?.closest?.('[data-package-aspect]')) syncClipPackagingPreview(document, true)
    if (target?.closest?.('#closePackaging, #cancelPackaging, #savePackaging')) document.getElementById('configurePackagingFromExport')?.focus()
  }
  const keydown = (event: KeyboardEvent): void => {
    const modal = document.querySelector<HTMLElement>('#packagingModal.open, #exportModal.open')
    if (!modal) return
    if (event.key === 'Escape') {
      event.preventDefault()
      document.getElementById(modal.id === 'packagingModal' ? 'closePackaging' : 'closeExport')?.click()
    }
    if (event.key !== 'Tab') return
    const controls = [...modal.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]')].filter(node => !node.hasAttribute('disabled') && node.tabIndex >= 0 && node.getClientRects().length > 0)
    const next = event.shiftKey ? controls.at(-1) : controls[0]
    if (controls.length && (!modal.contains(document.activeElement) || document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1)))) {
      event.preventDefault(); next?.focus()
    }
  }
  document.addEventListener('input', sync)
  document.addEventListener('change', sync)
  document.addEventListener('click', click, true)
  document.addEventListener('keydown', keydown)
  return () => {
    document.removeEventListener('input', sync)
    document.removeEventListener('change', sync)
    document.removeEventListener('click', click, true)
    document.removeEventListener('keydown', keydown)
  }
}
