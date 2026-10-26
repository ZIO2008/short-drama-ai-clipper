// @vitest-environment jsdom
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage.js'

describe('SettingsPage provider route', () => {
  afterEach(() => cleanup())

  it('mounts only the finalized prototype surface for capability providers', async () => {
    Object.assign(window, { desktopApi: {
      listProviderProfiles: vi.fn().mockResolvedValue([]),
      getAppHealth: vi.fn().mockResolvedValue({ appVersion: '0.1.0', databaseInitialized: true, initializationErrorCode: null, initializationErrorMessage: null, isSecretStorageAvailable: true, recoveryNotice: null })
    } })

    const { container } = render(<SettingsPage onSaveSecret={vi.fn()} />)

    await waitFor(() => expect(container.querySelector('iframe.static-prototype-surface')).not.toBeNull())
    expect(container.querySelector('.providers-overview')).toBeNull()
    expect(container.querySelector('.provider-capability-page')).toBeNull()
    expect(container.querySelector('iframe.static-prototype-surface')?.getAttribute('title')).toBe('设置')
  })
})
