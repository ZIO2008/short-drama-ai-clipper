import type { ReactElement } from 'react'
import type { AssetHealth } from '../../../shared/contracts.js'

export const AssetHealthSummary = ({ health }: { health: AssetHealth }): ReactElement => (
  <div className="card" role="status">
    <strong>资产健康：{health.issueCount === 0 ? '正常' : `${health.issueCount} 项需要处理`}</strong>
    {health.missingEpisodeNumbers.length > 0 && <p>缺集：{health.missingEpisodeNumbers.join('、')}</p>}
    {health.duplicateEpisodeNumbers.length > 0 && <p>重复集号：{health.duplicateEpisodeNumbers.join('、')}</p>}
    {health.missing.length > 0 && <p>失联文件：{health.missing.join('、')}</p>}
    {health.unreadable.length > 0 && <p>无权限文件：{health.unreadable.join('、')}</p>}
    {health.unsupported.length > 0 && <p>格式不支持：{health.unsupported.join('、')}</p>}
  </div>
)
