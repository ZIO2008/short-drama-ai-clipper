import type { ReactElement } from 'react'
type PreflightItem = { startEpisode: number; endEpisode: number; reason: string | null; ok: boolean; checks: { media: boolean; disk: boolean } }

export const PreflightTable = ({ items }: { items: PreflightItem[] }): ReactElement => <div className="table-wrap"><table><thead><tr><th>范围</th><th>素材</th><th>磁盘</th><th>结果</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.startEpisode}-${item.endEpisode}`}><td>{item.startEpisode}-{item.endEpisode}</td><td>{item.checks.media ? '通过' : '阻塞'}</td><td>{item.checks.disk ? '通过' : '阻塞'}</td><td>{item.ok ? '可输出' : item.reason ?? '不可输出'}</td></tr>)}</tbody></table></div>
