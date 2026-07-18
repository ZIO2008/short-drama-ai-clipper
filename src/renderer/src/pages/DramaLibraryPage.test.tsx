// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DramaLibraryPage } from './DramaLibraryPage.js'

describe('DramaLibraryPage', () => {
  it('creates a drama and exposes edit/import entry points', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    render(<DramaLibraryPage dramas={[{ id: 'd1', name: 'Demo', episodeCount: 2, issueCount: 0, tagNames: [], updatedAt: '2026-01-01' }]} loading={false} error={null} onRetry={vi.fn()} onCreate={onCreate} tags={[]} onRename={vi.fn()} onDelete={vi.fn()} onImport={vi.fn()} onAttachTag={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('新剧名'), { target: { value: 'New drama' } })
    fireEvent.click(screen.getByRole('button', { name: '创建剧目' }))
    expect(onCreate).toHaveBeenCalledWith('New drama')
    fireEvent.click(screen.getByRole('button', { name: '编辑与导入' }))
    expect(screen.getByRole('dialog', { name: '编辑剧目' })).toBeTruthy()
  })
})
