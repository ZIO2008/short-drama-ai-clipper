// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MediaMonitor, toMediaUrl } from './MediaMonitor.js'

describe('toMediaUrl', () => {
  it('routes local paths through the privileged local media protocol', () => {
    const local = (path: string): string => `shortdrama-media://local/${encodeURIComponent(path)}`
    expect(toMediaUrl('C:\\media files\\episode 01.mp4')).toBe(local('C:\\media files\\episode 01.mp4'))
    expect(toMediaUrl('\\\\server\\share\\episode #1% 你好.mp4')).toBe(local('\\\\server\\share\\episode #1% 你好.mp4'))
    expect(toMediaUrl('C:\\media#1\\100%\\片段.mp4')).toBe(local('C:\\media#1\\100%\\片段.mp4'))
    expect(toMediaUrl('file:///C:/episode.mp4')).toBe(local('C:/episode.mp4'))
    expect(toMediaUrl('file:///C:/media#1/100%/片段.mp4')).toBe(local('C:/media#1/100%/片段.mp4'))
    expect(toMediaUrl('https://example.com/video.mp4')).toBe('about:blank')
  })

  it('renders prototype-style transport controls and starts preview at the selected in point', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    render(<MediaMonitor sourcePath="C:\\episode.mp4" startSeconds={12.42} endSeconds={56} />)
    expect(screen.getByRole('region', { name: '媒体审片' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '播放预览' })).toBeTruthy()
    expect(screen.getByText('00:12.420')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '播放预览' }))
    expect(play).toHaveBeenCalled()
    play.mockRestore()
  })

  it('falls back to the missing-media monitor when a selected file cannot load', () => {
    const relocate = vi.fn()
    const { container } = render(<MediaMonitor sourcePath="C:\\missing\\episode.mp4" startSeconds={12.42} endSeconds={56} episodeLabel="第 01 集 · 源片" videoWidth={1080} videoHeight={1920} onRelocate={relocate} />)
    fireEvent.error(container.querySelector('video')!)
    expect(screen.getByText('源媒体需要重新定位')).toBeTruthy()
    expect(screen.getByText('第 01 集 · 源片 · 00:12.420 — 00:56.000 · 1080 × 1920')).toBeTruthy()
    expect((container.querySelector('button.play') as HTMLButtonElement).disabled).toBe(true)
    expect((container.querySelector('.media-monitor') as HTMLElement).style.getPropertyValue('--media-aspect-ratio')).toBe('1080 / 1920')
    fireEvent.click(screen.getByRole('button', { name: '前往剧目资产重新关联' }))
    expect(relocate).toHaveBeenCalledOnce()
  })

  it('treats an absent path as missing media even when the caller still reports ready', () => {
    const view = render(<MediaMonitor startSeconds={0} endSeconds={10} state="ready" episodeLabel="第 02 集 · 源片" videoWidth={180} videoHeight={320} />)
    const monitor = within(view.container)
    expect(monitor.getByText('源媒体需要重新定位')).toBeTruthy()
    expect(monitor.getByText('第 02 集 · 源片 · 00:00.000 — 00:10.000 · 180 × 320')).toBeTruthy()
    expect((monitor.getByRole('button', { name: '播放预览' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
