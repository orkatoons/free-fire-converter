import { BrowserWindow, Notification, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import { VIDEO_EXTENSIONS } from '../shared/defaults'
import { IPC } from '../shared/ipc'
import type { AppSettings, Capabilities, ConvertSettings, Notice, QueueFinishedSummary, StateSnapshot } from '../shared/types'
import { detectCapabilities } from './ffmpeg/capabilities'
import { JobQueue } from './queue'
import { deletePreset, listPresets, loadSettings, saveSettings, savePreset } from './settings'

let capsPromise: Promise<Capabilities> | null = null
let capsDir: string | null | undefined

function getCapabilities(): Promise<Capabilities> {
  const dir = loadSettings().ffmpegDir
  if (!capsPromise || capsDir !== dir) {
    capsDir = dir
    capsPromise = detectCapabilities(dir)
  }
  return capsPromise
}

function refreshCapabilities(): Promise<Capabilities> {
  capsPromise = null
  return getCapabilities()
}

export const queue = new JobQueue({ getCapabilities })

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const send = (channel: string, payload: unknown): void => {
    const w = getWindow()
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload)
  }
  const notice = (level: Notice['level'], message: string): void =>
    send(IPC.evNotice, { id: String(Date.now() + Math.random()), level, message } satisfies Notice)

  queue.on('state', (s: StateSnapshot) => send(IPC.evState, s))
  queue.on('finished', (summary: QueueFinishedSummary) => {
    send(IPC.evQueueFinished, summary)
    const settings = loadSettings()
    const w = getWindow()
    if (settings.notifyOnFinish && Notification.isSupported() && !(w?.isFocused() ?? false)) {
      const parts = [`${summary.done} converted`]
      if (summary.failed) parts.push(`${summary.failed} failed`)
      if (summary.cancelled) parts.push(`${summary.cancelled} cancelled`)
      if (summary.skipped) parts.push(`${summary.skipped} skipped`)
      const n = new Notification({ title: 'Conversion finished', body: parts.join(' · ') })
      n.on('click', () => {
        if (summary.outputDirs[0]) void shell.openPath(summary.outputDirs[0])
        w?.show()
        w?.focus()
      })
      n.show()
    }
    if (settings.openFolderOnFinish && summary.done > 0 && summary.outputDirs[0]) void shell.openPath(summary.outputDirs[0])
    if (w && !w.isFocused()) w.flashFrame(true)
  })

  ipcMain.handle(IPC.getCapabilities, () => getCapabilities())
  ipcMain.handle(IPC.refreshCapabilities, async () => {
    const caps = await refreshCapabilities()
    if (caps.ffmpegFound) queue.reprobeFailed()
    return caps
  })
  ipcMain.handle(IPC.getState, () => queue.snapshot())

  ipcMain.handle(IPC.addPaths, (_e, paths: string[]) => queue.addPaths(Array.isArray(paths) ? paths.filter((p) => typeof p === 'string') : []))

  ipcMain.handle(IPC.pickFiles, async () => {
    const w = getWindow()
    const r = await dialog.showOpenDialog(w!, {
      title: 'Add videos',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Videos', extensions: VIDEO_EXTENSIONS },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    return r.canceled ? null : queue.addPaths(r.filePaths)
  })
  ipcMain.handle(IPC.pickFolderToAdd, async () => {
    const r = await dialog.showOpenDialog(getWindow()!, { title: 'Add a folder of videos', properties: ['openDirectory'] })
    return r.canceled ? null : queue.addPaths(r.filePaths)
  })
  ipcMain.handle(IPC.pickOutputFolder, async () => {
    const r = await dialog.showOpenDialog(getWindow()!, { title: 'Choose output folder', properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })
  ipcMain.handle(IPC.pickFfmpegDir, async () => {
    const r = await dialog.showOpenDialog(getWindow()!, {
      title: 'Locate the folder containing ffmpeg.exe and ffprobe.exe',
      properties: ['openDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle(IPC.start, (_e, settings: AppSettings, ids?: string[]) => {
    void saveSettings(settings)
    queue.start(settings, ids)
  })
  ipcMain.handle(IPC.pause, () => queue.pause())
  ipcMain.handle(IPC.resume, () => queue.resume())
  ipcMain.handle(IPC.cancel, (_e, id: string) => queue.cancel(id))
  ipcMain.handle(IPC.cancelAll, () => queue.cancelAll())
  ipcMain.handle(IPC.retry, (_e, id: string, settings: AppSettings) => queue.retry(id, settings))
  ipcMain.handle(IPC.remove, (_e, ids: string[]) => queue.remove(ids))
  ipcMain.handle(IPC.clearFinished, () => queue.clearFinished())
  ipcMain.handle(IPC.previewCommand, (_e, id: string, settings: AppSettings) => queue.previewCommand(id, settings))
  ipcMain.handle(IPC.getJobLog, (_e, id: string) => queue.getLog(id))

  ipcMain.handle(IPC.reveal, (_e, p: string) => shell.showItemInFolder(path.resolve(p)))
  ipcMain.handle(IPC.openPath, async (_e, p: string) => {
    const err = await shell.openPath(path.resolve(p))
    if (err) notice('error', err)
  })

  ipcMain.handle(IPC.loadSettings, () => loadSettings())
  ipcMain.handle(IPC.saveSettings, async (_e, s: AppSettings) => {
    const prevDir = loadSettings().ffmpegDir
    await saveSettings(s)
    if (s.ffmpegDir !== prevDir) {
      const caps = await refreshCapabilities()
      if (caps.ffmpegFound) queue.reprobeFailed()
    }
  })
  ipcMain.handle(IPC.getPresets, () => listPresets())
  ipcMain.handle(IPC.savePreset, (_e, name: string, s: ConvertSettings) => savePreset(name, s))
  ipcMain.handle(IPC.deletePreset, (_e, id: string) => deletePreset(id))
}
