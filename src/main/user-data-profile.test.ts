import { describe, expect, it } from 'vitest'
import { NEW_PROFILE_ARGUMENT, resolveUserDataProfile } from './user-data-profile.js'

describe('resolveUserDataProfile', () => {
  it('keeps ordinary launches on the shared profile', () => {
    expect(resolveUserDataProfile('C:\\Users\\test\\AppData\\Roaming', ['app'], null)).toBeNull()
  })

  it('selects a stable empty profile for the new-data shortcut', () => {
    expect(resolveUserDataProfile('C:\\Users\\test\\AppData\\Roaming', ['app', NEW_PROFILE_ARGUMENT], null)).toBe('C:\\Users\\test\\AppData\\Roaming\\ShortDramaMaterialStudio\\new-profile')
  })

  it('preserves explicit isolated test data over the new-data flag', () => {
    expect(resolveUserDataProfile('C:\\Users\\test\\AppData\\Roaming', ['app', NEW_PROFILE_ARGUMENT], 'C:\\Temp\\smoke')).toBe('C:\\Temp\\smoke')
  })
})
