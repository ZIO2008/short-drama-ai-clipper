export type AppHealth = {
  appVersion: string
  databaseInitialized: boolean
  initializationErrorCode: 'DATABASE_UNAVAILABLE' | null
  isSecretStorageAvailable: boolean
}

export type SecretStatus = {
  exists: boolean
  maskedValue: string | null
  secretRef: string
}

export type DesktopApi = {
  getAppHealth: () => Promise<AppHealth>
  saveSecret: (value: string, secretRef?: string) => Promise<SecretStatus>
  getSecretStatus: (secretRef: string) => Promise<SecretStatus>
  deleteSecret: (secretRef: string) => Promise<void>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}

export {}
