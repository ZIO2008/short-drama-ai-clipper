import type { ProviderProfile } from '../../../shared/contracts.js'
import { PROVIDER_CAPABILITY_LABELS, catalogEntriesFor, type ProviderCapability, type ProviderCatalogEntry } from '../../../shared/provider-catalog.js'

type SettingsSection = 'providers' | 'export' | 'performance' | 'data' | 'about'
type Props = {
  document: Document
  capability: ProviderCapability | null
  onNavigate: (capability: ProviderCapability | null) => void
  onSectionChange: (section: SettingsSection) => void
  onSaveSecret: (value: string, secretRef: string) => Promise<void>
}
type DraftField = 'vendor' | 'region' | 'endpoint' | 'model' | 'timeout' | 'price' | 'secret'

const prototypeKey: Record<ProviderCapability, string> = { asr: 'asr', 'text-analysis': 'textAnalysis', 'multimodal-review': 'multimodalReview' }
const capabilityForPrototypeKey = (value: string | undefined): ProviderCapability | null => value === 'asr' ? 'asr' : value === 'textAnalysis' ? 'text-analysis' : value === 'multimodalReview' ? 'multimodal-review' : null
const fields: DraftField[] = ['vendor', 'region', 'endpoint', 'model', 'timeout', 'price', 'secret']

const input = (document: Document, capability: ProviderCapability, field: DraftField): HTMLInputElement | null => document.getElementById(`supplier-${prototypeKey[capability]}-${field}`) as HTMLInputElement | null
const toast = (document: Document, message: string): void => {
  const node = document.getElementById('toast')
  if (!node) return
  node.textContent = message
  node.classList.add('show')
}
const statusCopy = (profile: ProviderProfile | undefined, secretExists: boolean | undefined): { text: string; className: string } => {
  if (!profile) return { text: '未配置', className: 'warning' }
  const local = profile.region === 'local'
  const configured = local ? Boolean(profile.endpoint) : secretExists === true
  return { text: configured ? '已配置' : local ? '需确认本机服务' : '缺少密钥', className: configured ? 'success' : 'warning' }
}

export const bindProviderSettingsPrototype = ({ document, capability, onNavigate, onSectionChange, onSaveSecret }: Props): (() => void) => {
  let profiles = new Map<ProviderCapability, ProviderProfile>()
  let secretExists = new Map<ProviderCapability, boolean>()
  let edited = new Set<DraftField>()
  let saving = false
  let profileReadGeneration = 0
  const updateOverview = (): void => {
    for (const current of ['asr', 'text-analysis', 'multimodal-review'] as ProviderCapability[]) {
      const badge = document.getElementById(`provider-status-${prototypeKey[current]}`)
      if (!badge) continue
      const state = statusCopy(profiles.get(current), secretExists.get(current))
      badge.textContent = state.text
      badge.className = `badge ${state.className}`
    }
  }
  const fillDraft = (current: ProviderCapability): void => {
    const profile = profiles.get(current)
    if (!profile) return
    const values: Partial<Record<DraftField, string>> = {
      vendor: profile.provider,
      region: profile.region,
      endpoint: profile.endpoint ?? '',
      model: profile.model ?? '',
      timeout: String(Math.round((profile.timeoutMs ?? 60_000) / 1000)),
      price: profile.pricing ?? ''
    }
    for (const field of fields) if (field !== 'secret' && !edited.has(field)) { const node = input(document, current, field); if (node) node.value = values[field] ?? '' }
    const state = statusCopy(profile, secretExists.get(current))
    const message = document.getElementById(`supplier-draft-status-${prototypeKey[current]}`)
    if (message) message.innerHTML = `<strong>${state.text}</strong><br>当前 P1 仍只运行受控本地实现，不会自动调用云端。`
  }
  const applyCatalog = (current: ProviderCapability, entry: ProviderCatalogEntry): void => {
    const values: Partial<Record<DraftField, string>> = { vendor: entry.name, region: entry.region, endpoint: entry.endpoint ?? '', model: entry.model ?? '', timeout: String(Math.round(entry.timeoutMs / 1000)), price: `${entry.costLabel}；${entry.costNotice}` }
    for (const field of fields) if (field !== 'secret' && !edited.has(field)) { const node = input(document, current, field); if (node) node.value = values[field] ?? '' }
    const message = document.getElementById(`supplier-draft-status-${prototypeKey[current]}`)
    if (message) message.innerHTML = `<strong>已预填 ${entry.name}</strong><br>尚未保存，不会覆盖已有密钥。`
    toast(document, `已预填 ${entry.name}；请确认后保存。`)
  }
  const applySupplierFilter = (button: HTMLElement): void => {
    const supplier = button.dataset.supplier
    const cost = button.dataset.supplierFilter
    if (!supplier || !cost) return
    document.querySelectorAll<HTMLElement>(`[data-supplier-filter][data-supplier="${supplier}"]`).forEach((item) => {
      const active = item === button
      item.classList.toggle('active', active)
      item.setAttribute('aria-pressed', String(active))
    })
    let visible = 0
    document.querySelectorAll<HTMLElement>(`[data-supplier-candidate][data-supplier="${supplier}"]`).forEach((card) => {
      const match = cost === 'all' || card.dataset.cost === cost
      card.hidden = !match
      if (match) visible += 1
    })
    const empty = document.querySelector<HTMLElement>(`[data-supplier-empty="${supplier}"]`)
    if (empty) empty.hidden = visible !== 0
  }
  const markCatalogSelection = (button: HTMLElement): void => {
    const supplier = button.dataset.supplier
    if (!supplier) return
    document.querySelectorAll<HTMLElement>(`[data-use-provider][data-supplier="${supplier}"]`).forEach((item) => {
      const selected = item === button
      item.setAttribute('aria-pressed', String(selected))
      item.textContent = selected ? '已预填' : '预填此方案'
      item.closest('.supplier-candidate')?.classList.toggle('is-selected', selected)
    })
  }
  const refreshProfiles = async (): Promise<void> => {
    const generation = ++profileReadGeneration
    const loaded = await window.desktopApi.listProviderProfiles()
    const nextProfiles = new Map(loaded.filter((item) => item.capability === 'asr' || item.capability === 'text-analysis' || item.capability === 'multimodal-review').map((item) => [item.capability as ProviderCapability, item]))
    const nextSecrets = new Map<ProviderCapability, boolean>()
    await Promise.all([...nextProfiles.entries()].map(async ([current, profile]) => { if (profile.secretRef) nextSecrets.set(current, (await window.desktopApi.getSecretStatus(profile.secretRef)).exists) }))
    if (generation !== profileReadGeneration) return
    profiles = nextProfiles
    secretExists = nextSecrets
    updateOverview(); if (capability) fillDraft(capability)
  }
  const save = async (current: ProviderCapability): Promise<void> => {
    if (saving) return
    const vendor = input(document, current, 'vendor')?.value.trim() ?? ''
    const region = input(document, current, 'region')?.value.trim() ?? 'local'
    const endpoint = input(document, current, 'endpoint')?.value.trim() ?? ''
    const model = input(document, current, 'model')?.value.trim() ?? ''
    const timeoutSeconds = Number(input(document, current, 'timeout')?.value ?? '60')
    const pricing = input(document, current, 'price')?.value.trim() ?? ''
    const secret = input(document, current, 'secret')?.value.trim() ?? ''
    if (!vendor) { toast(document, `${PROVIDER_CAPABILITY_LABELS[current]}需要填写供应商。`); return }
    if (endpoint) { try { const parsed = new URL(endpoint); if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error() } catch { toast(document, 'API 地址必须是没有内嵌凭据的 http(s) 地址。'); return } }
    if (region === 'local' && !endpoint) { toast(document, '本机方案需要填写本地服务地址。'); return }
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 600) { toast(document, '超时必须是 1–600 秒。'); return }
    saving = true
    let createdSecretRef: string | null = null
    try {
      let secretRef = profiles.get(current)?.secretRef ?? null
      if (secret) {
        secretRef = crypto.randomUUID()
        createdSecretRef = secretRef
        await onSaveSecret(secret, secretRef)
      }
      await window.desktopApi.saveProviderProfile({ capability: current, region: region === 'cn' || region === 'global' ? region : 'local', provider: vendor, endpoint: endpoint || null, model: model || null, secretRef, timeoutMs: timeoutSeconds * 1000, pricing: pricing || null })
      createdSecretRef = null
      await refreshProfiles()
      const secretInput = input(document, current, 'secret'); if (secretInput) secretInput.value = ''
      edited = new Set()
      updateOverview(); fillDraft(current)
      toast(document, `${PROVIDER_CAPABILITY_LABELS[current]}方案已保存；云端调用仍未启用。`)
    } catch (error) {
      if (createdSecretRef) await window.desktopApi.deleteSecret(createdSecretRef).catch(() => undefined)
      toast(document, error instanceof Error ? error.message : '方案保存失败。')
    } finally { saving = false }
  }
  const onInput = (event: Event): void => {
    if (!capability) return
    const target = event.target as HTMLInputElement
    const prefix = `supplier-${prototypeKey[capability]}-`
    if (!target.id.startsWith(prefix)) return
    const field = target.id.slice(prefix.length) as DraftField
    if (fields.includes(field)) edited.add(field)
  }
  const onClick = (event: Event): void => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-settings], [data-open], [data-supplier-filter], [data-use-provider], [data-save-provider], [data-reference-link]')
    if (!target) return
    const section = target.dataset.settings as SettingsSection | undefined
    if (section && ['providers', 'export', 'performance', 'data', 'about'].includes(section)) {
      event.preventDefault(); event.stopImmediatePropagation(); onSectionChange(section); return
    }
    const openCapability = capabilityForPrototypeKey(target.dataset.open)
    if (openCapability || target.dataset.open === 'settings') { event.preventDefault(); event.stopImmediatePropagation(); onNavigate(openCapability); return }
    if (!capability) return
    if (target.hasAttribute('data-supplier-filter')) {
      event.preventDefault(); event.stopImmediatePropagation(); applySupplierFilter(target); return
    }
    if (target.hasAttribute('data-use-provider')) {
      event.preventDefault(); event.stopImmediatePropagation()
      const index = Number(target.dataset.candidate)
      const entry = Number.isInteger(index) ? catalogEntriesFor(capability)[index] : undefined
      if (entry) { applyCatalog(capability, entry); markCatalogSelection(target) }
      return
    }
    if (target.hasAttribute('data-save-provider')) { event.preventDefault(); event.stopImmediatePropagation(); void save(capability); return }
    if (target.hasAttribute('data-reference-link')) {
      event.preventDefault(); event.stopImmediatePropagation()
      const candidate = target.closest<HTMLElement>('[data-supplier-candidate]')?.querySelector<HTMLElement>('[data-use-provider]')
      const index = Number(candidate?.dataset.candidate)
      const entry = Number.isInteger(index) ? catalogEntriesFor(capability)[index] : undefined
      if (entry) void window.desktopApi.openExternalUrl(target.dataset.referenceLink === '价格/额度' ? entry.pricingUrl : entry.officialDocsUrl).then(() => toast(document, '已交由系统默认浏览器打开外部资料。')).catch((error: unknown) => toast(document, error instanceof Error ? error.message : '无法打开外部资料。'))
    }
  }
  document.addEventListener('input', onInput)
  document.addEventListener('click', onClick, true)
  void refreshProfiles().catch((error: unknown) => toast(document, error instanceof Error ? error.message : '供应商配置读取失败。'))
  if (capability) fillDraft(capability)
  return () => { document.removeEventListener('input', onInput); document.removeEventListener('click', onClick, true) }
}
