export const RELEASE_METADATA = {
  scope: 'P1',
  channel: 'stable',
  channelLabel: '正式版'
} as const

export type ReleaseScope = typeof RELEASE_METADATA.scope
export type ReleaseChannel = typeof RELEASE_METADATA.channel
