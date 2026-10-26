export const DEFAULT_CLIP_NAMING = '第{episode}集_切片{sequence}'
export class ClipNamingInputError extends Error {}

export const validateClipNaming = (raw: string): string | null => {
  const value = raw.trim()
  if (!value) return '请输入文件命名规则。'
  if (value.length > 160) return '命名规则不能超过 160 个字符。'
  if (/[\\/:*?"<>|\u0000-\u001f]/.test(value)) return '名称不能包含路径或文件名非法字符。'
  if (/[{}]/.test(value.replaceAll('{episode}', '').replaceAll('{candidate}', '').replaceAll('{sequence}', ''))) return '名称不能包含大括号，请直接填写文字。'
  if (/\.$/.test(value)) return '名称不能以点号结尾。'
  if (/\.mp4$/i.test(value)) return '无需填写 .mp4，系统会自动添加扩展名。'
  if (/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(value)) return '该名称为系统保留名称，请换一个。'
  return null
}

const namingFor = (mode: string, rawPrefix: string): string => {
  if (mode === 'episode') return DEFAULT_CLIP_NAMING
  if (mode !== 'prefix') throw new Error('请选择命名方式。')
  const prefix = rawPrefix.trim()
  if (!prefix) throw new Error('请输入剧名或前缀，或者选择默认命名。')
  if (prefix.length > 120) throw new Error('剧名或前缀不能超过 120 个字。')
  if (/[{}]/.test(prefix)) throw new Error('请直接填写剧名或前缀，不用填写大括号规则。')
  const error = validateClipNaming(prefix)
  if (error) throw new Error(error)
  return `${prefix}_${DEFAULT_CLIP_NAMING}`
}

export const mountExportNamingField = (document: Document): void => {
  const modal = document.getElementById('exportModal')
  if (!modal || document.getElementById('exportNamingMode')) return
  const body = modal.querySelector('.modal-body') ?? modal
  const field = document.createElement('div'); field.className = 'field'; field.style.marginTop = '14px'
  field.id = 'exportNamingFields'
  const label = document.createElement('label'); label.htmlFor = 'exportNamingMode'; label.textContent = '文件命名'
  const mode = document.createElement('select'); mode.id = 'exportNamingMode'; mode.className = 'select'
  mode.setAttribute('aria-describedby', 'exportNamingHint exportNamingError')
  for (const [value, text] of [['episode', '按分集命名（默认）'], ['prefix', '加剧名或前缀']]) { const option = document.createElement('option'); option.value = value!; option.textContent = text!; mode.append(option) }
  const prefixGroup = document.createElement('div'); prefixGroup.className = 'field'
  const prefixLabel = document.createElement('label'); prefixLabel.htmlFor = 'exportNamingPrefix'; prefixLabel.textContent = '剧名或前缀'
  const input = document.createElement('input'); input.id = 'exportNamingPrefix'; input.className = 'input'; input.type = 'text'; input.maxLength = 120; input.placeholder = '例如：破茧之后'; input.setAttribute('aria-describedby', 'exportNamingHint exportNamingError')
  prefixGroup.append(prefixLabel, input)
  const hint = document.createElement('span'); hint.id = 'exportNamingHint'; hint.className = 'helper'; hint.style.overflowWrap = 'anywhere'
  const error = document.createElement('span'); error.id = 'exportNamingError'; error.className = 'helper'; error.setAttribute('role', 'alert'); error.hidden = true
  field.append(label, mode, prefixGroup, hint, error)
  body.insertBefore(field, body.querySelector(':scope > .package-control'))
  const update = (): void => {
    const custom = mode.value === 'prefix'; prefixGroup.hidden = !custom; prefixGroup.style.display = custom ? '' : 'none'; input.disabled = !custom
    let message: string | null = null; let pattern = DEFAULT_CLIP_NAMING
    try { pattern = namingFor(mode.value, input.value) } catch (cause) { message = cause instanceof Error ? cause.message : '请检查命名方式。' }
    error.hidden = !message; error.textContent = message ?? ''; input.setAttribute('aria-invalid', String(Boolean(message)))
    hint.textContent = message ? '系统自动补分集号、切片编号和扩展名。' : `文件名示例：${pattern.replaceAll('{episode}', '01').replaceAll('{sequence}', '01')}.mp4；重复导出另加“再次导出”标记。`
  }
  mode.addEventListener('change', update); input.addEventListener('input', update); update()
}

export const readExportNaming = (document: Document): string => {
  const mode = document.getElementById('exportNamingMode') as HTMLSelectElement | null
  const input = document.getElementById('exportNamingPrefix') as HTMLInputElement | null
  if (!mode || !input) throw new Error('文件命名配置未加载，请重新打开导出设置。')
  try { return namingFor(mode.value, input.value) }
  catch (error) { input.dispatchEvent(new Event('input')); (mode.value === 'prefix' ? input : mode).focus(); throw new ClipNamingInputError(error instanceof Error ? error.message : '请检查命名方式。') }
}
