import type { ReactElement } from 'react'

export const MediaMonitor = ({ sourcePath, startSeconds, endSeconds }: { sourcePath: string; startSeconds: number; endSeconds: number }): ReactElement => <div className="card" role="region" aria-label="媒体审片"><video controls preload="metadata" src={sourcePath} /><p className="meta">预览范围 {startSeconds.toFixed(2)}s - {endSeconds.toFixed(2)}s</p></div>
