import type { OpenDialogOptions } from 'electron'

const fileOptions: OpenDialogOptions = {
  properties: ['openFile', 'multiSelections'],
  filters: [{ name: 'Video files', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm'] }]
}

const folderOptions: OpenDialogOptions = {
  properties: ['openDirectory']
}

export const createVideoFileDialogOptions = (defaultPath?: string): OpenDialogOptions => defaultPath ? { ...fileOptions, defaultPath } : { ...fileOptions }
export const createVideoFolderDialogOptions = (defaultPath?: string): OpenDialogOptions => defaultPath ? { ...folderOptions, defaultPath } : { ...folderOptions }

export const videoFileDialogOptions = createVideoFileDialogOptions()
export const videoFolderDialogOptions = createVideoFolderDialogOptions()
