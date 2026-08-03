import { describe, expect, it } from 'vitest'
import { createVideoFileDialogOptions, createVideoFolderDialogOptions, videoFileDialogOptions, videoFolderDialogOptions } from './video-file-dialog.js'

describe('video file dialog', () => {
  it('shows supported video files instead of switching Windows into directory-only mode', () => {
    expect(videoFileDialogOptions.properties).toEqual(['openFile', 'multiSelections'])
    expect(videoFileDialogOptions.filters).toEqual([{ name: 'Video files', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }])
  })

  it('opens a separate folder-only picker for folder imports', () => {
    expect(videoFolderDialogOptions.properties).toEqual(['openDirectory'])
  })

  it('uses a remembered directory without mixing the two picker modes', () => {
    expect(createVideoFileDialogOptions('D:\\Drama')).toMatchObject({ defaultPath: 'D:\\Drama', properties: ['openFile', 'multiSelections'] })
    expect(createVideoFolderDialogOptions('D:\\Drama')).toMatchObject({ defaultPath: 'D:\\Drama', properties: ['openDirectory'] })
  })
})
