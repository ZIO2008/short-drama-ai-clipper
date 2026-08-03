export const RELEASE_METADATA = {
  scope: 'P1',
  channel: 'internal-trial',
  channelLabel: '内部试点'
} as const

export type ReleaseScope = typeof RELEASE_METADATA.scope
export type ReleaseChannel = typeof RELEASE_METADATA.channel
