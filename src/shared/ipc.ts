import type {
  AddResult,
  AppSettings,
  Capabilities,
  ConvertSettings,
  Notice,
  Preset,
  QueueFinishedSummary,
  StateSnapshot
} from './types'

export const IPC = {
  getCapabilities: 'caps:get',
  refreshCapabilities: 'caps:refresh',
  getState: 'state:get',
  addPaths: 'jobs:addPaths',
  pickFiles: 'dialog:pickFiles',
  pickFolderToAdd: 'dialog:pickFolderToAdd',
  pickOutputFolder: 'dialog:pickOutputFolder',
  pickFfmpegDir: 'dialog:pickFfmpegDir',
  start: 'queue:start',
  pause: 'queue:pause',
  resume: 'queue:resume',
  cancel: 'job:cancel',
  cancelAll: 'queue:cancelAll',
  retry: 'job:retry',
  remove: 'jobs:remove',
  clearFinished: 'jobs:clearFinished',
  previewCommand: 'job:previewCommand',
  getJobLog: 'job:log',
  reveal: 'shell:reveal',
  openPath: 'shell:openPath',
  loadSettings: 'settings:load',
  saveSettings: 'settings:save',
  getPresets: 'presets:list',
  savePreset: 'presets:save',
  deletePreset: 'presets:delete',
  // main -> renderer events
  evState: 'ev:state',
  evQueueFinished: 'ev:queueFinished',
  evNotice: 'ev:notice'
} as const

export type Unsubscribe = () => void

/** The API exposed on window.api by the preload script. */
export interface RendererApi {
  getCapabilities(): Promise<Capabilities>
  refreshCapabilities(): Promise<Capabilities>
  getState(): Promise<StateSnapshot>
  /** Accepts files and folders (folders are scanned recursively for videos). */
  addPaths(paths: string[]): Promise<AddResult>
  /** Synchronous: resolves a dropped File to its absolute path. */
  getPathForFile(file: File): string
  pickFiles(): Promise<AddResult | null>
  pickFolderToAdd(): Promise<AddResult | null>
  pickOutputFolder(): Promise<string | null>
  pickFfmpegDir(): Promise<string | null>

  /** Queue all 'ready' jobs (or just `ids`) and start, using this settings snapshot. */
  start(settings: AppSettings, ids?: string[]): Promise<void>
  /** Finish running jobs but don't start new ones. */
  pause(): Promise<void>
  resume(): Promise<void>
  cancel(id: string): Promise<void>
  cancelAll(): Promise<void>
  retry(id: string, settings: AppSettings): Promise<void>
  remove(ids: string[]): Promise<void>
  clearFinished(): Promise<void>
  previewCommand(id: string, settings: AppSettings): Promise<string | null>
  getJobLog(id: string): Promise<string[]>
  reveal(path: string): Promise<void>
  openPath(path: string): Promise<void>

  loadSettings(): Promise<AppSettings>
  saveSettings(settings: AppSettings): Promise<void>
  getPresets(): Promise<Preset[]>
  savePreset(name: string, settings: ConvertSettings): Promise<Preset[]>
  deletePreset(id: string): Promise<Preset[]>

  onState(cb: (s: StateSnapshot) => void): Unsubscribe
  onQueueFinished(cb: (s: QueueFinishedSummary) => void): Unsubscribe
  onNotice(cb: (n: Notice) => void): Unsubscribe
}
