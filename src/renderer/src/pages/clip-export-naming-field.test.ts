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
  it('keeps the editable value, exposes errors and returns the final trimmed rule', () => {
    const doc = document.implementation.createHTMLDocument('naming')
    doc.body.innerHTML = '<section id="exportModal"><div class="modal-body"><div class="package-control"></div></div></section>'
    mountExportNamingField(doc)
    const input = doc.getElementById('exportNamingPattern') as HTMLInputElement
    expect(input.parentElement?.nextElementSibling?.className).toBe('package-control')
    expect(readExportNaming(doc)).toBe('clip_{episode}_{candidate}')
    input.value = '{unknown}'; input.dispatchEvent(new Event('input'))
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(doc.getElementById('exportNamingError')?.hidden).toBe(false)
    expect(() => readExportNaming(doc)).toThrow('仅支持')
    input.value = '  素材_{episode}_{candidate}  '; input.dispatchEvent(new Event('input'))
    mountExportNamingField(doc)
    expect(doc.querySelectorAll('#exportNamingPattern')).toHaveLength(1)
    expect(readExportNaming(doc)).toBe('素材_{episode}_{candidate}')
    expect(doc.getElementById('exportNamingHint')?.textContent).toContain('素材_01_ab12cd34.mp4')
    expect(doc.getElementById('exportNamingError')?.hidden).toBe(true)
  })
})
