// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderProviderCredentialFields } from './provider-settings-bridge-support.js'
import { providerAuthSchemaForId } from '../../../shared/provider-auth-schema.js'

describe('renderProviderCredentialFields', () => {
  it('renders every field declared by a multi-field schema without a supplier-specific branch', () => {
    const document = window.document.implementation.createHTMLDocument('provider-fields')
    document.body.innerHTML = '<input id="supplier-asr-secret"><button data-save-provider="asr">保存</button>'
    renderProviderCredentialFields(document, 'asr', {
      id: 'api-key',
      requiresCredentialOnInitialSave: false,
      fields: [
        { key: 'tenant', label: 'Tenant', placeholder: 'tenant', required: true },
        { key: 'clientId', label: 'Client ID', placeholder: 'client id', required: true },
        { key: 'clientSecret', label: 'Client Secret', placeholder: 'client secret', required: true }
      ]
    }, false)

    expect([...document.querySelectorAll('[data-provider-credential-field]')].map((element) => element.getAttribute('data-provider-credential-field'))).toEqual(['tenant', 'clientId', 'clientSecret'])
    expect((document.getElementById('supplier-asr-secret') as HTMLInputElement).hidden).toBe(true)
  })

  it('mounts Tencent credential fields outside the legacy secret field that the prototype hides', () => {
    const document = window.document.implementation.createHTMLDocument('tencent-fields')
    document.body.innerHTML = '<div class="field" data-asr-generic-secret><input id="supplier-asr-secret"></div><button data-save-provider="asr">保存并设为默认</button>'

    renderProviderCredentialFields(document, 'asr', providerAuthSchemaForId('tencent-cloud-secret-pair'), false)

    const container = document.querySelector<HTMLElement>('[data-provider-credential-fields]')!
    expect(container.closest('[data-asr-generic-secret]')).toBeNull()
    expect(container.nextElementSibling).toBe(document.querySelector('[data-save-provider="asr"]'))
    expect(container.classList.contains('form-grid')).toBe(true)
    expect([...container.children].every((wrapper) => wrapper.classList.contains('field'))).toBe(true)
    expect([...container.querySelectorAll('input')].every((input) => input.classList.contains('input'))).toBe(true)
    expect([...container.querySelectorAll('input')].map((input) => input.dataset.providerCredentialField)).toEqual(['secretId', 'secretKey'])
  })

  it('reuses the prototype Tencent pair instead of rendering duplicate credential fields', () => {
    const document = window.document.implementation.createHTMLDocument('prototype-tencent-fields')
    document.body.innerHTML = '<div class="field" data-asr-generic-secret><input id="supplier-asr-secret"></div><div data-tencent-asr-credentials hidden><label>SecretId<input id="supplier-asr-secret-id"></label><label>SecretKey<input id="supplier-asr-secret-key" type="password"></label></div><button data-save-provider="asr">保存并设为默认</button>'

    renderProviderCredentialFields(document, 'asr', providerAuthSchemaForId('tencent-cloud-secret-pair'), false)

    const pair = document.querySelector<HTMLElement>('[data-tencent-asr-credentials]')!
    expect(pair.hidden).toBe(false)
    expect(pair.style.display).toBe('contents')
    expect(document.querySelector('[data-provider-credential-fields]')).toBeNull()
    expect([...pair.querySelectorAll('input')].map((input) => input.dataset.providerCredentialField)).toEqual(['secretId', 'secretKey'])
  })
})
