import { isAbsolute, relative, resolve } from 'node:path'

export const BASELINE_MANIFEST_SHA256 = '6cf8d83d12837c3bcfeb8eac341b8ce814005607359bcd3a3fdaf76302845339'

export const assertFrozenBaselineManifest = (hash: string): void => {
  if (hash.toLowerCase() !== BASELINE_MANIFEST_SHA256) throw new Error('Baseline v1 manifest 哈希不匹配，拒绝执行。')
}

export const resolveFrozenMediaPath = (mediaRoot: string, relativePath: string): string => {
  if (!mediaRoot || !relativePath || isAbsolute(relativePath)) throw new Error('Baseline v1 媒体路径不合法。')
  const root = resolve(mediaRoot)
  const source = resolve(root, relativePath)
  const traversal = relative(root, source)
  if (traversal === '' || traversal === '..' || traversal.startsWith('../') || traversal.startsWith('..\\') || isAbsolute(traversal)) throw new Error('Baseline v1 媒体路径越界。')
  return source
}
