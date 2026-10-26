export const disablePackagedE2eEnvironment = (isPackaged: boolean, environment: NodeJS.ProcessEnv = process.env): void => {
  if (!isPackaged) return
  for (const key of Object.keys(environment)) if (key.toUpperCase().startsWith('SHORTDRAMA_MATERIAL_E2E')) delete environment[key]
}

export const isE2eRuntimeEnabled = (isPackaged: boolean, channel: string, environment: NodeJS.ProcessEnv = process.env): boolean =>
  !isPackaged && channel === 'e2e' && environment.SHORTDRAMA_MATERIAL_E2E === '1'
