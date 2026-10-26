import { safeStorage } from 'electron'

export const canStoreSecrets = (): boolean => safeStorage.isEncryptionAvailable()

export const encryptSecret = (secret: string): Buffer => {
  if (!canStoreSecrets()) {
    throw new Error('当前 Windows 账户的密钥加密不可用，无法保存供应商密钥。')
  }

  return safeStorage.encryptString(secret)
}

export const decryptSecret = (encryptedSecret: Buffer): string => {
  if (!canStoreSecrets()) {
    throw new Error('当前 Windows 账户的密钥加密不可用，无法读取供应商密钥。')
  }

  return safeStorage.decryptString(encryptedSecret)
}
