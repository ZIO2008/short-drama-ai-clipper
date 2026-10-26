// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NotificationSnapshot } from '../../../shared/contracts.js'
import { NotificationDrawer } from './NotificationDrawer.js'

const decisionSnapshot: NotificationSnapshot = {
  unreadCount: 1,
  items: [{
    id: '3d5f3df2-8c48-4a29-9af2-38bd0b26e8d1', severity: 'decision', title: '任务需要决定', summary: '选择继续或停止。',
    actionTarget: 'tasks', dramaId: null, dramaName: '测试剧目', taskId: null, taskItemId: null, taskType: 'stitch',
    occurredAt: new Date().toISOString(), readAt: null, resolvedAt: null
  }]
}

afterEach(() => cleanup())

const renderDrawer = (overrides: Partial<ComponentProps<typeof NotificationDrawer>> = {}) => {
  const props: ComponentProps<typeof NotificationDrawer> = {
    open: true, snapshot: decisionSnapshot, loadState: 'ready', errorMessage: null,
    onClose: vi.fn(), onRetry: vi.fn(), onMarkRead: vi.fn(), onMarkAllRead: vi.fn(), onClearRead: vi.fn(),
    onResolve: vi.fn(), onOpenTarget: vi.fn(() => true), ...overrides
  }
  return { ...render(<NotificationDrawer {...props} />), props }
}

describe('NotificationDrawer interactions', () => {
  it('marks an unread item and opens its supported target', () => {
    const { props } = renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: '待决策：任务需要决定' }))
    expect(props.onMarkRead).toHaveBeenCalledWith(decisionSnapshot.items[0].id)
    expect(props.onOpenTarget).toHaveBeenCalledWith('tasks')
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('resolves a decision with its own keyboard-focusable action', () => {
    const { props } = renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: '标记已解决' }))
    expect(props.onResolve).toHaveBeenCalledWith(decisionSnapshot.items[0].id)
    expect(props.onMarkRead).not.toHaveBeenCalled()
  })

  it('closes on Escape without changing notification state', () => {
    const { props } = renderDrawer()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
    expect(props.onMarkRead).not.toHaveBeenCalled()
  })
})
