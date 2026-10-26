import { homedir } from 'node:os'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const PACKAGE_TEXT_EXTENSIONS = new Set(['.asar', '.cfg', '.css', '.html', '.ini', '.js', '.json', '.map', '.pem', '.py', '.spec', '.toml', '.txt', '.xml', '.yaml', '.yml'])
export const FORBIDDEN_PACKAGE_NAME = /^(?:\.env(?:\..*)?|credentials?(?:\..*)?|pyvenv\.cfg|.*\.(?:sqlite|sqlite3|db|wal|shm|tlog|tsbuildinfo|key|p12|pfx))$/i

const credentialPatterns = [
  /\b(?:sk-[a-z0-9_-]{16,}|AKID[a-z0-9]{12,})\b/i,
  /(?:OPENAI|ANTHROPIC|DEEPSEEK|TENCENT|MODELSCOPE|DASHSCOPE)[_-]?(?:API[_-]?KEY|SECRET(?:ID|KEY)?|TOKEN)\s*[:=]\s*["']?(?!example|placeholder|redacted)[a-z0-9+/_=-]{12,}/i,
  /["']?(?:secretId|secretKey|apiKey|accessKeyId|accessKeySecret|privateKey|token|password|credential)["']?\s*[:=]\s*["'](?!example|placeholder|redacted)[a-z0-9+/_=-]{12,}["']/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
]

export const developmentPathStrings = (projectRoot, environment = process.env) => {
  const values = [resolve(projectRoot), environment.USERPROFILE, environment.HOME, homedir()].filter((value) => typeof value === 'string' && value.trim().length >= 4)
  return [...new Set(values.flatMap((value) => {
    const absolute = resolve(value)
    return [absolute, absolute.replaceAll('\\', '/'), absolute.replaceAll('/', '\\')]
  }))]
}

const pathTokens = (paths) => [...new Set(paths)].flatMap((value) => [Buffer.from(value, 'utf8'), Buffer.from(value, 'utf16le')])

export const redactFileDevelopmentPaths = (path, developmentPaths) => {
  const bytes = readFileSync(path)
  let replacements = 0
  for (const token of pathTokens(developmentPaths)) {
    let offset = 0
    while ((offset = bytes.indexOf(token, offset)) !== -1) {
      bytes.fill(0x20, offset, offset + token.length)
      replacements += 1
      offset += token.length
    }
  }
  if (replacements > 0) writeFileSync(path, bytes)
  return replacements
}

export const auditPackagePrivacy = (packageFiles, developmentPaths) => {
  const forbiddenFiles = packageFiles.filter((path) => FORBIDDEN_PACKAGE_NAME.test(path.split(/[\\/]/).at(-1) ?? '') || /test_temporal_ocr_runner\.py/i.test(path))
  if (forbiddenFiles.length > 0) throw new Error(`Candidate contains user/development artifacts: ${forbiddenFiles.join(', ')}`)
  const tokens = pathTokens(developmentPaths)
  for (const path of packageFiles) {
    const bytes = readFileSync(path)
    if (tokens.some((token) => bytes.includes(token))) throw new Error(`Candidate contains a development path: ${path}`)
    const extension = path.includes('.') ? path.slice(path.lastIndexOf('.')).toLowerCase() : ''
    if (!PACKAGE_TEXT_EXTENSIONS.has(extension)) continue
    const utf8 = bytes.toString('utf8')
    const utf16 = bytes.toString('utf16le')
    if (credentialPatterns.some((pattern) => pattern.test(utf8) || pattern.test(utf16))) throw new Error(`Candidate contains a possible credential value: ${path}`)
  }
}
