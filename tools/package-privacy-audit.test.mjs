import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditPackagePrivacy, developmentPathStrings, redactFileDevelopmentPaths } from './package-privacy-audit.mjs'

describe('package privacy audit', () => {
  it('derives project and user paths instead of relying on one developer name', () => {
    const paths = developmentPathStrings('E:\\work\\project', { USERPROFILE: 'C:\\Users\\another-user' })
    expect(paths).toContain('E:\\work\\project')
    expect(paths).toContain('C:\\Users\\another-user')
  })

  it('redacts dynamic UTF-8 and UTF-16 build paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'package-privacy-'))
    const file = join(root, 'binding.node')
    try {
      const path = 'E:\\work\\another-user\\project'
      writeFileSync(file, Buffer.concat([Buffer.from(path), Buffer.from('|'), Buffer.from(path, 'utf16le')]))
      expect(redactFileDevelopmentPaths(file, [path])).toBe(2)
      const bytes = readFileSync(file)
      expect(bytes.includes(Buffer.from(path))).toBe(false)
      expect(bytes.includes(Buffer.from(path, 'utf16le'))).toBe(false)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('rejects Tencent credentials, generic credential packages and private keys', () => {
    const root = mkdtempSync(join(tmpdir(), 'package-privacy-'))
    try {
      const cases = [
        'AKID' + 'A'.repeat(16),
        JSON.stringify({ secretKey: 'B'.repeat(24) }),
        ['-----BEGIN ', 'PRIVATE KEY-----'].join('') + 'C'.repeat(24),
      ]
      for (const [index, value] of cases.entries()) {
        const file = join(root, `case-${index}.json`)
        writeFileSync(file, value)
        expect(() => auditPackagePrivacy([file], [])).toThrow('credential')
      }
    } finally { rmSync(root, { recursive: true, force: true }) }
  })

  it('allows a public CA certificate pem while still scanning pem text', () => {
    const root = mkdtempSync(join(tmpdir(), 'package-privacy-'))
    const file = join(root, 'cacert.pem')
    try { writeFileSync(file, ['-----BEGIN CERTIFICATE-----', 'PUBLICCERTIFICATE', '-----END CERTIFICATE-----'].join('\n')); expect(() => auditPackagePrivacy([file], [])).not.toThrow() } finally { rmSync(root, { recursive: true, force: true }) }
  })
})
