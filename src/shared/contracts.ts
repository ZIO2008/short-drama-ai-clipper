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

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'error' | 'decision'

export type NotificationItem = {
  id: string
  severity: NotificationSeverity
  title: string
  summary: string
  actionTarget: string | null
  dramaId: string | null
  dramaName: string | null
  taskId: string | null
  taskItemId: string | null
  taskType: string | null
  occurredAt: string
  readAt: string | null
  resolvedAt: string | null
}

export type NotificationSnapshot = {
  items: NotificationItem[]
  unreadCount: number
}

export type DesktopApi = {
  getAppHealth: () => Promise<AppHealth>
  saveSecret: (value: string, secretRef?: string) => Promise<SecretStatus>
  getSecretStatus: (secretRef: string) => Promise<SecretStatus>
  deleteSecret: (secretRef: string) => Promise<void>
  getNotifications: () => Promise<NotificationSnapshot>
  markNotificationRead: (notificationId: string) => Promise<NotificationSnapshot>
  markAllNotificationsRead: () => Promise<NotificationSnapshot>
  clearReadNotifications: () => Promise<NotificationSnapshot>
  resolveNotification: (notificationId: string) => Promise<NotificationSnapshot>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}

export {}
