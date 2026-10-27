import { join } from 'node:path'

export const NEW_PROFILE_ARGUMENT = '--new-profile'

export const resolveUserDataProfile = (appDataPath: string, argv: readonly string[], isolatedRuntimeDataPath: string | null): string | null => {
  if (isolatedRuntimeDataPath) return isolatedRuntimeDataPath
  if (argv.includes(NEW_PROFILE_ARGUMENT)) return join(appDataPath, 'ShortDramaMaterialStudio', 'new-profile')
  return null
}
