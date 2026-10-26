import type { ReactElement } from 'react'

type Props = {
  onOriginalClip: () => void
  onMultiEpisode: () => void
  onAiRemix: () => void
  episodeCount: number
  readyEpisodeCount: number
  embedded?: boolean
}

export const ProductionPage = ({ onOriginalClip, onMultiEpisode, onAiRemix, episodeCount, readyEpisodeCount, embedded = false }: Props): ReactElement => {
  const canCreateClip = readyEpisodeCount > 0
  const canConfigureMultiEpisode = readyEpisodeCount >= 2
  return <section aria-labelledby={embedded ? undefined : 'production-title'} aria-label={embedded ? '素材生产入口' : undefined}>
    {!embedded && <div className="screen-head"><div><h2 id="production-title">素材生产</h2><p>选择本次要生产的确定性素材类型；每次导出都将在开始前执行预检。</p></div></div>}
    <div className="grid-3">
      <article className="card method-card"><div className="meta">人工审核</div><h2>原剧切片</h2><p>准备字幕、生成候选并人工审片微调，确认后统一导出到成果库。</p><button className="btn btn-secondary" disabled={!canCreateClip} type="button" onClick={onOriginalClip}>{canCreateClip ? '进入工作区' : '无可用剧集'}</button></article>
      <article className="card method-card"><div className="meta">批量处理</div><h2>多集拼接</h2><p>按滑动窗口批量组合连续剧集，预检时长、体积、帧率和包装后运行。</p><button className="btn btn-primary" disabled={!canConfigureMultiEpisode} type="button" onClick={onMultiEpisode}>{canConfigureMultiEpisode ? '创建拼接任务' : '至少需要 2 个可用剧集'}</button></article>
      <article className="card method-card"><div className="meta">AI 辅助剪辑</div><h2>AI 爆点前置二创</h2><p>基于字幕、分镜和剧情分析生成可解释草稿，必须经过人工审核。</p><button className="btn btn-secondary" disabled={!canCreateClip} type="button" onClick={onAiRemix}>{canCreateClip ? '查看工作台方向' : '无可用剧集'}</button></article>
    </div>
  </section>
}
