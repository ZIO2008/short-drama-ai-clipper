// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mountExportNamingField, readExportNaming, validateClipNaming } from './clip-export-naming-field.js'

describe('export naming input', () => {
  it.each(['', '   ', '../escape', 'bad:name', '{drama}', '{episode', 'NUL', 'con.txt', 'COM¹', 'COM².txt', 'LPT³', 'lpt¹.log', 'name.', 'name.mp4', 'x'.repeat(161)])('rejects unusable filename rule %s', (value) => {
    expect(validateClipNaming(value)).not.toBeNull()
  })
  it.each(['素材_{episode}_{candidate}', '自定义固定名称', 'COM10', '首集_{episode}'])('accepts supported filename rule %s', (value) => {
    expect(validateClipNaming(value)).toBeNull()
  })
  it('provides Chinese default naming without filling any input', () => {
    const doc = document.implementation.createHTMLDocument('naming')
    doc.body.innerHTML = '<section id="exportModal"><div class="modal-body"><div class="package-control"></div></div></section>'
    mountExportNamingField(doc)
    const input = doc.getElementById('exportNamingPrefix') as HTMLInputElement
    expect(doc.getElementById('exportNamingFields')?.nextElementSibling?.className).toBe('package-control')
    expect(readExportNaming(doc)).toBe('第{episode}集_切片{sequence}')
    expect(input.value).toBe('')
    expect(input.disabled).toBe(true)
    expect(input.parentElement?.hidden).toBe(true)
    expect(doc.getElementById('exportNamingHint')?.textContent).toContain('第01集_切片01.mp4')
    expect(doc.getElementById('exportNamingFields')?.textContent).not.toMatch(/\{episode\}|\{candidate\}|clip_/)
  })
  it('takes only ordinary prefix text and retains the selected mode on remount', () => {
    const doc = document.implementation.createHTMLDocument('naming')
    doc.body.innerHTML = '<section id="exportModal"><div class="modal-body"><div class="package-control"></div></div></section>'
    mountExportNamingField(doc)
    const mode = doc.getElementById('exportNamingMode') as HTMLSelectElement
    const input = doc.getElementById('exportNamingPrefix') as HTMLInputElement
    mode.value = 'prefix'; mode.dispatchEvent(new Event('change'))
    input.value = '{unknown}'; input.dispatchEvent(new Event('input'))
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(doc.getElementById('exportNamingError')?.hidden).toBe(false)
    expect(() => readExportNaming(doc)).toThrow('不用填写大括号')
    input.value = '  破茧之后  '; input.dispatchEvent(new Event('input'))
    mountExportNamingField(doc)
    expect(doc.querySelectorAll('#exportNamingMode')).toHaveLength(1)
    expect(mode.value).toBe('prefix')
    expect(readExportNaming(doc)).toBe('破茧之后_第{episode}集_切片{sequence}')
    expect(doc.getElementById('exportNamingHint')?.textContent).toContain('破茧之后_第01集_切片01.mp4')
    expect(doc.getElementById('exportNamingError')?.hidden).toBe(true)
    input.value = '../invalid'; input.dispatchEvent(new Event('input'))
    mode.value = 'episode'; mode.dispatchEvent(new Event('change'))
    expect(readExportNaming(doc)).toBe('第{episode}集_切片{sequence}')
    expect(input.disabled).toBe(true)
    expect(doc.getElementById('exportNamingError')?.hidden).toBe(true)
  })
  it.each(['', '   ', 'x'.repeat(121)])('rejects empty or overly long custom prefix %s', (prefix) => {
    const doc = document.implementation.createHTMLDocument('naming')
    doc.body.innerHTML = '<section id="exportModal"><div class="modal-body"></div></section>'
    mountExportNamingField(doc)
    const mode = doc.getElementById('exportNamingMode') as HTMLSelectElement
    mode.value = 'prefix'; mode.dispatchEvent(new Event('change'))
    const input = doc.getElementById('exportNamingPrefix') as HTMLInputElement
    input.value = prefix
    expect(() => readExportNaming(doc)).toThrow()
  })
})
