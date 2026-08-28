import { isAbsolute, relative, resolve } from 'node:path'
import { lstatSync, realpathSync } from 'node:fs'

const argument = (argv: readonly string[], name: string): string | null => {
  const index = argv.indexOf(name)
  return index < 0 ? null : argv[index + 1]?.trim() || null
}

/** Allows real packaged IPC smoke tests without enabling any E2E fixture or mock. */
export const resolvePackagedSmokeUserData = (isPackaged: boolean, argv: readonly string[], temporaryRoot: string): string | null => {
  const enabled = argv.includes('--packaged-smoke')
  const requested = argument(argv, '--packaged-smoke-user-data')
  if (!enabled && !requested) return null
  if (!isPackaged || !enabled || !requested || !isAbsolute(requested)) throw new Error('打包冒烟必须在 packaged 进程中显式提供绝对临时 userData。')
  const root = realpathSync(resolve(temporaryRoot))
  const requestedTarget = resolve(requested)
  const stat = lstatSync(requestedTarget)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('打包冒烟 userData 必须是系统临时目录内的真实目录。')
  const target = realpathSync(requestedTarget)
  const child = relative(root, target)
  if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('打包冒烟 userData 必须位于系统临时目录内。')
  return target
}
