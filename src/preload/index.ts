import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type RendererApi } from '../shared/ipc'

const on = <T>(channel: string, cb: (payload: T) => void): (() => void) => {
  const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: RendererApi = {
  getCapabilities: () => ipcRenderer.invoke(IPC.getCapabilities),
  refreshCapabilities: () => ipcRenderer.invoke(IPC.refreshCapabilities),
  getState: () => ipcRenderer.invoke(IPC.getState),
  addPaths: (paths) => ipcRenderer.invoke(IPC.addPaths, paths),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  pickFiles: () => ipcRenderer.invoke(IPC.pickFiles),
  pickFolderToAdd: () => ipcRenderer.invoke(IPC.pickFolderToAdd),
  pickOutputFolder: () => ipcRenderer.invoke(IPC.pickOutputFolder),
  pickFfmpegDir: () => ipcRenderer.invoke(IPC.pickFfmpegDir),
  start: (settings, ids) => ipcRenderer.invoke(IPC.start, settings, ids),
  pause: () => ipcRenderer.invoke(IPC.pause),
  resume: () => ipcRenderer.invoke(IPC.resume),
  cancel: (id) => ipcRenderer.invoke(IPC.cancel, id),
  cancelAll: () => ipcRenderer.invoke(IPC.cancelAll),
  retry: (id, settings) => ipcRenderer.invoke(IPC.retry, id, settings),
  remove: (ids) => ipcRenderer.invoke(IPC.remove, ids),
  clearFinished: () => ipcRenderer.invoke(IPC.clearFinished),
  previewCommand: (id, settings) => ipcRenderer.invoke(IPC.previewCommand, id, settings),
  getJobLog: (id) => ipcRenderer.invoke(IPC.getJobLog, id),
  reveal: (p) => ipcRenderer.invoke(IPC.reveal, p),
  openPath: (p) => ipcRenderer.invoke(IPC.openPath, p),
  loadSettings: () => ipcRenderer.invoke(IPC.loadSettings),
  saveSettings: (s) => ipcRenderer.invoke(IPC.saveSettings, s),
  getPresets: () => ipcRenderer.invoke(IPC.getPresets),
  savePreset: (name, s) => ipcRenderer.invoke(IPC.savePreset, name, s),
  deletePreset: (id) => ipcRenderer.invoke(IPC.deletePreset, id),
  onState: (cb) => on(IPC.evState, cb),
  onQueueFinished: (cb) => on(IPC.evQueueFinished, cb),
  onNotice: (cb) => on(IPC.evNotice, cb)
}

contextBridge.exposeInMainWorld('api', api)
