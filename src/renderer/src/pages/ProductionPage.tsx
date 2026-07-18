import type { ReactElement } from 'react'

export const ProductionPage = ({ onOriginalClip, onMultiEpisode }: { onOriginalClip: () => void; onMultiEpisode: () => void }): ReactElement => <section aria-labelledby="production-title"><div className="screen-head"><div><h1 id="production-title">素材生产</h1><p>选择一种生产方式开始配置。</p></div></div><div className="drama-grid"><button className="card" type="button" onClick={onOriginalClip}><h2>原剧切片</h2><p>选择起止点、人工确认并导出。</p></button><button className="card" type="button" onClick={onMultiEpisode}><h2>多集拼接</h2><p>连续集窗口与批量输出。</p></button></div></section>
