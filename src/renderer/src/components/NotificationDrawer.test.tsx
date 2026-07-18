import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { NotificationSnapshot } from '../../../shared/contracts.js'
import { NotificationDrawer } from './NotificationDrawer.js'

const snapshot: NotificationSnapshot = {
  unreadCount: 2,
  items: [
    {
      id: '3d5f3df2-8c48-4a29-9af2-38bd0b26e8d1',
      severity: 'decision',
      title: '任务需要决定',
      summary: '需要选择继续或停止。',
      actionTarget: 'tasks',
      dramaId: 'drama-1',
      dramaName: '测试剧目',
      taskId: 'task-1',
      taskItemId: null,
      taskType: 'stitch',
      occurredAt: new Date().toISOString(),
      readAt: null,
      resolvedAt: null
    }
  ]
}

describe('NotificationDrawer', () => {
  it('renders metadata, decision protection and a real target action', () => {
    const html = renderToStaticMarkup(
      <NotificationDrawer
        open
        snapshot={snapshot}
        loadState="ready"
        errorMessage={null}
        onClose={vi.fn()}
        onRetry={vi.fn()}
        onMarkRead={vi.fn()}
        onMarkAllRead={vi.fn()}
        onClearRead={vi.fn()}
        onResolve={vi.fn()}
        onOpenTarget={() => true}
      />
    )

    expect(html).toContain('测试剧目 · 多集拼接 · 需要选择继续或停止。')
    expect(html).toContain('待决策')
    expect(html).toContain('标记已解决')
    expect(html).toContain('进入来源 →')
  })
})
