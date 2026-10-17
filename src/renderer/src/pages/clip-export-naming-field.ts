export const DEFAULT_CLIP_NAMING = 'clip_{episode}_{candidate}'

export const validateClipNaming = (raw: string): string | null => {
  const value = raw.trim()
  if (!value) return '请输入文件命名规则。'
  if (value.length > 160) return '命名规则不能超过 160 个字符。'
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(value)) return '名称不能包含路径或文件名非法字符。'
  if (/[{}]/.test(value.replaceAll('{episode}', '').replaceAll('{candidate}', ''))) return '仅支持 {episode} 和 {candidate}，请检查变量是否完整。'
  if (/\.$/.test(value)) return '名称不能以点号结尾。'
  if (/\.mp4$/i.test(value)) return '无需填写 .mp4，系统会自动添加扩展名。'
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(value)) return '请勿使用 Windows 保留文件名。'
  return null
}

export const mountExportNamingField = (document: Document): void => {
  const modal = document.getElementById('exportModal')
  if (!modal || document.getElementById('exportNamingPattern')) return
  const body = modal.querySelector('.modal-body') ?? modal
  const field = document.createElement('div'); field.className = 'field'; field.style.marginTop = '14px'
  const label = document.createElement('label'); label.htmlFor = 'exportNamingPattern'; label.textContent = '文件命名'
  const input = document.createElement('input'); input.id = 'exportNamingPattern'; input.className = 'input'; input.type = 'text'; input.maxLength = 160; input.value = DEFAULT_CLIP_NAMING; input.setAttribute('aria-describedby', 'exportNamingHint exportNamingError')
  const hint = document.createElement('span'); hint.id = 'exportNamingHint'; hint.className = 'helper'; hint.style.overflowWrap = 'anywhere'
  const error = document.createElement('span'); error.id = 'exportNamingError'; error.className = 'helper'; error.setAttribute('role', 'alert'); error.hidden = true
  field.append(label, input, hint, error)
  body.insertBefore(field, body.querySelector(':scope > .package-control'))
  const update = (): void => {
    const message = validateClipNaming(input.value)
    error.hidden = !message; error.textContent = message ?? ''; input.setAttribute('aria-invalid', String(Boolean(message)))
    hint.textContent = message ? '支持 {episode} 分集号、{candidate} 候选编号；同名自动追加编号。' : `示例：${input.value.trim().replaceAll('{episode}', '01').replaceAll('{candidate}', 'ab12cd34')}.mp4；同名自动追加编号。`
  }
  input.addEventListener('input', update); update()
}

export const readExportNaming = (document: Document): string => {
  const input = document.getElementById('exportNamingPattern') as HTMLInputElement | null
  if (!input) throw new Error('文件命名配置未加载，请重新打开导出设置。')
  const error = validateClipNaming(input.value)
  if (error) { input.dispatchEvent(new Event('input')); input.focus(); throw new Error(error) }
  return input.value.trim()
}
