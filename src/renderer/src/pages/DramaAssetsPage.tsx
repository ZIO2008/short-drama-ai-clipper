import { useState, type ReactElement } from 'react'
import type { DramaDetail, ScriptAssetSummary } from '../../../shared/contracts.js'

type Props = { drama: DramaDetail; scripts: ScriptAssetSummary[]; onImportScript: () => Promise<void>; onRelink: (episodeId: string, path: string) => Promise<void> }
export const DramaAssetsPage = ({ drama, scripts, onImportScript, onRelink }: Props): ReactElement => {
  const [busy, setBusy] = useState(false); const runImport = async (): Promise<void> => { setBusy(true); try { await onImportScript() } finally { setBusy(false) } }
  return <section aria-labelledby="assets-title"><div className="screen-head"><div><h1 id="assets-title">剧目资产</h1><p>检查原片、剧本关联、缺集和失联状态。</p></div><button className="btn btn-primary" disabled={busy} type="button" onClick={() => void runImport()}>导入剧本</button></div><div className="card table-wrap"><table><thead><tr><th>集号</th><th>文件</th><th>状态</th><th>时长</th><th>帧率</th></tr></thead><tbody>{drama.episodes.map((episode) => <tr key={episode.id}><td>{episode.episodeNo ?? '待填写'}</td><td>{episode.sourcePath}</td><td>{episode.status}</td><td>{episode.durationSeconds ?? '—'}</td><td>{episode.fps ?? '—'}</td></tr>)}</tbody></table></div><div className="card"><h2>剧本资产</h2>{scripts.length === 0 ? <p>尚未导入剧本。</p> : <ul>{scripts.map((script) => <li key={script.id}>{script.sourcePath} · {script.linkStatus}</li>)}</ul>}</div><button className="btn" type="button" onClick={() => { const episode = drama.episodes[0]; if (episode) void onRelink(episode.id, episode.sourcePath) }}>批量重新定位</button></section>
}
