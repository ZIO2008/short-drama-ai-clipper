import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import type { AppHealth } from '../../../shared/contracts.js'
import type { ProviderCapability } from '../../../shared/provider-catalog.js'
import { StaticPrototypeSurface, type StaticPrototypeScreen } from './StaticPrototypeSurface.js'
import { bindProviderSettingsPrototype } from './ProviderSettingsPrototypeBridge.js'

type Capability = ProviderCapability
type Section = 'providers' | 'export' | 'performance' | 'data' | 'about'
const sectionLabels: Record<Section, string> = { providers: '能力供应商', export: '导出默认值', performance: '性能', data: '数据与日志', about: '关于' }
const providerScreens: Record<Capability, StaticPrototypeScreen> = {
  asr: 'provider-asr',
  'text-analysis': 'provider-text-analysis',
  'multimodal-review': 'provider-multimodal-review'
}
const readPreference = (key: string): string => { try { return window.localStorage.getItem(key) ?? '' } catch { return '' } }
const writePreference = (key: string, value: string): void => { try { window.localStorage.setItem(key, value) } catch { /* local defaults are optional when storage is unavailable */ } }

export const SettingsPage = ({ onSaveSecret }: { onSaveSecret: (value: string, secretRef: string) => Promise<void> }): ReactElement => {
  const [section, setSection] = useState<Section>('providers')
  const [editingProvider, setEditingProvider] = useState<Capability | null>(null)
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState<'logs' | 'diagnostics' | null>(null)
  const [error, setError] = useState<string | null>(null); const [message, setMessage] = useState<string | null>(null)
  const [outputDirectory, setOutputDirectory] = useState(''); const [qualityMode, setQualityMode] = useState<'original' | 'bitrate' | 'size'>('original'); const [fps, setFps] = useState<'source' | '25'>('source'); const [performanceMode, setPerformanceMode] = useState<'background' | 'speed'>('background'); const [health, setHealth] = useState<AppHealth | null>(null)

  useEffect(() => {
    setOutputDirectory(readPreference('shortdrama.defaultOutputDirectory'))
    setQualityMode((readPreference('shortdrama.qualityMode') as 'original' | 'bitrate' | 'size') || 'original')
    setFps((readPreference('shortdrama.fps') as 'source' | '25') || 'source')
    setPerformanceMode(readPreference('shortdrama.performanceMode') === 'speed' ? 'speed' : 'background')
    let cancelled = false
    const load = async (): Promise<void> => {
      try {
        const appHealth = await window.desktopApi.getAppHealth()
        if (!cancelled) { setHealth(appHealth); setError(null) }
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : '设置读取失败，请重试。') }
      finally { if (!cancelled) setLoading(false) }
    }
    void load(); return () => { cancelled = true }
  }, [])

  const saveDefaults = (): void => { writePreference('shortdrama.defaultOutputDirectory', outputDirectory.trim()); writePreference('shortdrama.qualityMode', qualityMode); writePreference('shortdrama.fps', fps); writePreference('shortdrama.performanceMode', performanceMode); setMessage('导出、质量、帧率和性能默认值已保存在本机。') }
  const clearLogs = async (): Promise<void> => { setBusy('logs'); setMessage(null); try { const count = await window.desktopApi.clearLogs(); setMessage(`已清理 ${count} 条本地日志。`) } catch (cause) { setError(cause instanceof Error ? cause.message : '日志清理失败。') } finally { setBusy(null) } }
  const exportDiagnostics = async (): Promise<void> => { setBusy('diagnostics'); setMessage(null); try { const directory = await window.desktopApi.chooseOutputDirectory(); if (!directory) return; const path = await window.desktopApi.exportDiagnostics(directory); setMessage(`诊断包已导出：${path}`) } catch (cause) { setError(cause instanceof Error ? cause.message : '诊断包导出失败。') } finally { setBusy(null) } }

  // Provider UI is not reimplemented here: the finalized Open Design document is
  // the rendered page. This component only supplies route state and real desktop
  // APIs to its runtime bridge. Other settings areas keep their existing product
  // behavior and become reachable from the prototype's left navigation.
  if (section === 'providers') {
    const screen = editingProvider ? providerScreens[editingProvider] : 'settings'
    return <section className="static-prototype-stage settings-prototype-stage" aria-label="能力供应商">
      <StaticPrototypeSurface
        key={screen}
        screen={screen}
        onBack={() => setEditingProvider(null)}
        onNavigate={(target) => {
          if (target === 'settings') setEditingProvider(null)
        }}
        onReady={(document) => bindProviderSettingsPrototype({
          document,
          capability: editingProvider,
          onNavigate: (next) => { setEditingProvider(next); setError(null); setMessage(null) },
          onSectionChange: (next) => { setSection(next); setEditingProvider(null); setError(null); setMessage(null) },
          onSaveSecret
        })}
      />
    </section>
  }

  return <section aria-labelledby="settings-title" aria-busy={loading}><div className="screen-head"><div><h1 id="settings-title">设置</h1><p>供应商密钥、导出默认值、性能与本地数据分别管理。</p></div><span className="meta">设置自动保存</span></div><nav className="tabs settings-tabs" aria-label="设置分区">{(Object.keys(sectionLabels) as Section[]).map((item) => <button className={`tab${section === item ? ' active' : ''}`} aria-selected={section === item} key={item} type="button" onClick={() => { setSection(item); setEditingProvider(null); setMessage(null); setError(null) }}>{sectionLabels[item]}</button>)}</nav>
    {error && <div className="state-panel state-panel-error" role="alert"><p>{error}</p><button className="btn" type="button" onClick={() => window.location.reload()}>重试读取</button></div>}
    {!loading && section === 'export' && <SettingsCard title="导出默认值" description="默认值只影响新建任务；已经创建的任务保留自己的快照。"><label className="field">默认输出目录<input className="input path" value={outputDirectory} onChange={(event) => setOutputDirectory(event.target.value)} placeholder="可留空，在任务中选择" /></label><label className="field">默认质量模式<select className="select" value={qualityMode} onChange={(event) => setQualityMode(event.target.value as 'original' | 'bitrate' | 'size')}><option value="original">原质量</option><option value="bitrate">固定码率</option><option value="size">目标文件大小</option></select></label><label className="field">默认帧率<select className="select" value={fps} onChange={(event) => setFps(event.target.value as 'source' | '25')}><option value="source">跟随原片</option><option value="25">25 FPS</option></select></label><p className="helper">原片和导出视频不会复制到应用数据目录。</p><button className="btn btn-primary" type="button" onClick={saveDefaults}>保存导出默认值</button>{message && <p role="status">{message}</p>}</SettingsCard>}
    {!loading && section === 'performance' && <SettingsCard title="性能" description="后台优先是默认模式；速度优先只提高新任务的并发度。"><label className="field">默认性能模式<select className="select" value={performanceMode} onChange={(event) => setPerformanceMode(event.target.value as 'background' | 'speed')}><option value="background">后台优先（串行，默认）</option><option value="speed">速度优先（并发处理）</option></select></label><p className="helper">每个多集任务也可以在任务配置中覆盖默认值，模式会写入任务快照。</p><button className="btn btn-primary" type="button" onClick={saveDefaults}>保存性能默认值</button>{message && <p role="status">{message}</p>}</SettingsCard>}
    {!loading && section === 'data' && <SettingsCard title="数据与日志" description="所有运行数据保存在本机；诊断包只在你主动选择目录后导出。"><ul className="helper-list"><li>包含：应用版本、数据库初始化状态和脱敏诊断清单。</li><li>不包含：原片、导出视频、字幕、剧本、请求正文和明文密钥。</li><li>日志默认保留 30 天，清理不会删除剧目、成果或任务记录。</li></ul><div className="toolbar"><button className="btn" type="button" disabled={busy !== null} onClick={() => void clearLogs()}>{busy === 'logs' ? '清理中…' : '一键清空日志'}</button><button className="btn btn-primary" type="button" disabled={busy !== null} onClick={() => void exportDiagnostics()}>{busy === 'diagnostics' ? '导出中…' : '导出诊断包'}</button></div>{message && <p role="status">{message}</p>}</SettingsCard>}
    {!loading && section === 'about' && <SettingsCard title="关于" description="短剧投流素材生成平台 Windows 桌面版。"><dl className="settings-facts"><div><dt>版本</dt><dd>{health?.appVersion ?? '—'}</dd></div><div><dt>发布范围</dt><dd>{health ? `${health.releaseScope} · ${health.releaseChannelLabel}` : '—'}</dd></div><div><dt>项目库健康</dt><dd>{health?.projectLibraryIntegrity ? health.projectLibraryIntegrity.warningCount === 0 ? '未发现关联异常' : `${health.projectLibraryIntegrity.warningCount} 项需处理` : '—'}</dd></div><div><dt>密钥存储</dt><dd>{health?.isSecretStorageAvailable ? 'Windows 当前账户级加密' : '不可用，无法保存密钥'}</dd></div><div><dt>AI 云端调用</dt><dd>未接入（供应商仅配置骨架）</dd></div></dl>{health?.projectLibraryIntegrity && health.projectLibraryIntegrity.warningCount > 0 && <p className="helper" role="alert">检测到历史项目库关联异常；系统不会自动删除数据，请先导出诊断包后处理。</p>}{message && <p role="status">{message}</p>}</SettingsCard>}
  </section>
}

const SettingsCard = ({ title, description, children }: { title: string; description: string; children: ReactNode }): ReactElement => <div className="card card-pad settings-card"><h2>{title}</h2><p className="helper">{description}</p>{children}</div>
