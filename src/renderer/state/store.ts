// ALL renderer state + behavior lives here. Components never call window.api directly.

import { create } from 'zustand'
import { BUILT_IN_PRESETS, DEFAULT_APP_SETTINGS } from '../../shared/defaults'
import { CONTAINER_ENCODE_CODECS, DEFAULT_QUALITY, ENCODERS } from '../../shared/encoders'
import type {
  AddResult,
  AppSettings,
  Capabilities,
  ConvertSettings,
  FfmpegInstallProgress,
  Job,
  Notice,
  OutputSettings,
  Preset,
  QueueFinishedSummary,
  QueueState
} from '../../shared/types'

const api = window.api

export interface DialogState {
  kind: 'log' | 'command'
  jobId: string
  title: string
  content: string
}

export interface AppState {
  ready: boolean
  caps: Capabilities | null
  capsLoading: boolean
  settings: AppSettings
  presets: Preset[]
  jobs: Job[]
  queue: QueueState
  selected: string[]
  notices: Notice[]
  summary: QueueFinishedSummary | null
  dragOver: boolean
  dialog: DialogState | null
  appVersion: string | null
  /** Progress of the in-app ffmpeg download; null when none has run this session */
  ffmpegInstall: FfmpegInstallProgress | null

  init(): Promise<void>
  refreshCaps(): Promise<void>
  installFfmpeg(): Promise<void>
  cancelFfmpegInstall(): Promise<void>

  addPaths(paths: string[]): Promise<void>
  addDroppedFiles(files: File[]): Promise<void>
  pickFiles(): Promise<void>
  pickFolderToAdd(): Promise<void>

  updateConvert(patch: Partial<ConvertSettings>): void
  updateOutput(patch: Partial<OutputSettings>): void
  updateApp(patch: Partial<Pick<AppSettings, 'concurrency' | 'notifyOnFinish' | 'openFolderOnFinish'>>): void
  pickOutputFolder(): Promise<void>
  useSourceFolder(): void
  pickFfmpegDir(): Promise<void>
  clearFfmpegDir(): Promise<void>

  applyPreset(id: string): void
  savePreset(name: string): Promise<void>
  deletePreset(id: string): Promise<void>

  start(ids?: string[]): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  cancel(id: string): Promise<void>
  cancelAll(): Promise<void>
  retry(id: string): Promise<void>
  remove(ids: string[]): Promise<void>
  removeSelected(): Promise<void>
  clearFinished(): Promise<void>

  select(id: string, mode: 'single' | 'toggle' | 'range'): void
  selectAll(): void
  clearSelection(): void

  showLog(id: string): Promise<void>
  showCommand(id: string): Promise<void>
  copyCommand(id: string): Promise<void>
  copyText(text: string): Promise<void>
  closeDialog(): void

  reveal(path: string): void
  openPath(path: string): void

  pushNotice(level: Notice['level'], message: string): void
  dismissNotice(id: string): void
  dismissSummary(): void
  setDragOver(v: boolean): void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSelected: string | null = null

function persist(settings: AppSettings): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void api.saveSettings(settings), 400)
}

function noticeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Keep convert settings internally consistent after a change. */
export function reconcileConvert(prev: ConvertSettings, patch: Partial<ConvertSettings>): ConvertSettings {
  const next = { ...prev, ...patch }
  const allowed = CONTAINER_ENCODE_CODECS[next.container]
  if (!allowed.includes(next.videoCodec)) next.videoCodec = allowed[0]
  if (next.videoCodec !== prev.videoCodec) {
    if (patch.quality === undefined) next.quality = DEFAULT_QUALITY[next.videoCodec]
  }
  if (next.encoder !== 'auto' && ENCODERS[next.encoder]?.codec !== next.videoCodec) next.encoder = 'auto'
  if (next.container === 'webm' && next.audio === 'aac') next.audio = 'opus'
  if ((next.container === 'mp4' || next.container === 'mov') && next.audio === 'opus' && prev.container !== next.container) next.audio = 'aac'
  return next
}

function addResultNotice(get: () => AppState, r: AddResult | null): void {
  if (!r) return
  const parts: string[] = []
  if (r.unsupported.length) {
    const names = r.unsupported.slice(0, 3).join(', ') + (r.unsupported.length > 3 ? ` +${r.unsupported.length - 3} more` : '')
    parts.push(`Skipped non-video: ${names}`)
  }
  if (r.duplicates) parts.push(`${r.duplicates} already in the list`)
  if (r.added === 0 && parts.length === 0) parts.push('No video files found there.')
  if (parts.length) get().pushNotice(r.added ? 'info' : 'warning', parts.join(' · '))
}

export const useAppStore = create<AppState>()((set, get) => ({
  ready: false,
  caps: null,
  capsLoading: true,
  settings: DEFAULT_APP_SETTINGS,
  presets: BUILT_IN_PRESETS,
  jobs: [],
  queue: { running: false, paused: false, runIds: [] },
  selected: [],
  notices: [],
  summary: null,
  dragOver: false,
  dialog: null,
  appVersion: null,
  ffmpegInstall: null,

  async init() {
    api.onState((s) => {
      const ids = new Set(s.jobs.map((j) => j.id))
      set((st) => ({ jobs: s.jobs, queue: s.queue, selected: st.selected.filter((id) => ids.has(id)) }))
    })
    api.onQueueFinished((summary) => set({ summary }))
    api.onNotice((n) => set((st) => ({ notices: [...st.notices, n] })))
    api.onFfmpegInstall((p) => set({ ffmpegInstall: p }))
    const [settings, presets, state, info] = await Promise.all([api.loadSettings(), api.getPresets(), api.getState(), api.getAppInfo()])
    set({ settings, presets, jobs: state.jobs, queue: state.queue, appVersion: info.version, ready: true })
    const caps = await api.getCapabilities()
    set({ caps, capsLoading: false })
  },

  async refreshCaps() {
    set({ capsLoading: true })
    const caps = await api.refreshCapabilities()
    set({ caps, capsLoading: false })
  },

  async installFfmpeg() {
    set({ ffmpegInstall: { phase: 'downloading', received: 0, total: null, version: null, error: null } })
    try {
      const caps = await api.installFfmpeg()
      set({ caps })
      if (caps.ffmpegFound) get().pushNotice('success', 'ffmpeg is installed. You can convert now.')
    } catch {
      // The progress event already carries the error or cancellation for the banner.
    }
  },

  async cancelFfmpegInstall() {
    await api.cancelFfmpegInstall()
  },

  async addPaths(paths) {
    if (!paths.length) return
    set({ summary: null })
    addResultNotice(get, await api.addPaths(paths))
  },

  async addDroppedFiles(files) {
    const paths = files.map((f) => api.getPathForFile(f)).filter(Boolean)
    if (!paths.length) {
      get().pushNotice('warning', "Couldn't read those items — drop files or folders from Explorer.")
      return
    }
    await get().addPaths(paths)
  },

  async pickFiles() {
    const r = await api.pickFiles()
    if (r) set({ summary: null })
    addResultNotice(get, r)
  },

  async pickFolderToAdd() {
    const r = await api.pickFolderToAdd()
    if (r) set({ summary: null })
    addResultNotice(get, r)
  },

  updateConvert(patch) {
    const s = get().settings
    const settings = { ...s, convert: reconcileConvert(s.convert, patch), activePresetId: null }
    set({ settings })
    persist(settings)
  },

  updateOutput(patch) {
    const s = get().settings
    const settings = { ...s, output: { ...s.output, ...patch } }
    set({ settings })
    persist(settings)
  },

  updateApp(patch) {
    const settings = { ...get().settings, ...patch }
    set({ settings })
    persist(settings)
  },

  async pickOutputFolder() {
    const dir = await api.pickOutputFolder()
    if (dir) get().updateOutput({ dir })
  },

  useSourceFolder() {
    get().updateOutput({ dir: null })
  },

  async pickFfmpegDir() {
    const dir = await api.pickFfmpegDir()
    if (!dir) return
    const settings = { ...get().settings, ffmpegDir: dir }
    set({ settings, capsLoading: true })
    await api.saveSettings(settings)
    await get().refreshCaps()
    const caps = get().caps
    if (!caps?.ffmpegFound) get().pushNotice('error', `ffmpeg.exe and ffprobe.exe weren't both found in ${dir}.`)
  },

  async clearFfmpegDir() {
    const settings = { ...get().settings, ffmpegDir: null }
    set({ settings })
    await api.saveSettings(settings)
    await get().refreshCaps()
  },

  applyPreset(id) {
    const p = get().presets.find((x) => x.id === id)
    if (!p) return
    const settings = { ...get().settings, convert: { ...p.settings }, activePresetId: p.id }
    set({ settings })
    persist(settings)
  },

  async savePreset(name) {
    const presets = await api.savePreset(name, get().settings.convert)
    const saved = presets.find((p) => !p.builtIn && p.name.toLowerCase() === name.trim().toLowerCase())
    set((st) => ({ presets, settings: { ...st.settings, activePresetId: saved?.id ?? null } }))
    get().pushNotice('success', `Preset "${name.trim()}" saved.`)
  },

  async deletePreset(id) {
    const presets = await api.deletePreset(id)
    set((st) => ({
      presets,
      settings: { ...st.settings, activePresetId: st.settings.activePresetId === id ? null : st.settings.activePresetId }
    }))
  },

  async start(ids) {
    if (saveTimer) clearTimeout(saveTimer)
    set({ summary: null })
    await api.start(get().settings, ids)
  },
  pause: () => api.pause(),
  resume: () => api.resume(),
  cancel: (id) => api.cancel(id),
  cancelAll: () => api.cancelAll(),
  async retry(id) {
    set({ summary: null })
    await api.retry(id, get().settings)
  },
  remove: (ids) => api.remove(ids),
  async removeSelected() {
    const { selected, jobs } = get()
    const removable = selected.filter((id) => jobs.find((j) => j.id === id)?.status !== 'running')
    if (removable.length) await api.remove(removable)
  },
  clearFinished: () => api.clearFinished(),

  select(id, mode) {
    const { selected, jobs } = get()
    if (mode === 'single') set({ selected: [id] })
    else if (mode === 'toggle') set({ selected: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id] })
    else {
      const ids = jobs.map((j) => j.id)
      const a = ids.indexOf(lastSelected ?? id)
      const b = ids.indexOf(id)
      const [lo, hi] = a < b ? [a, b] : [b, a]
      set({ selected: Array.from(new Set([...selected, ...ids.slice(lo, hi + 1)])) })
      return
    }
    lastSelected = id
  },
  selectAll: () => set({ selected: get().jobs.map((j) => j.id) }),
  clearSelection: () => set({ selected: [] }),

  async showLog(id) {
    const job = get().jobs.find((j) => j.id === id)
    const lines = await api.getJobLog(id)
    const content = [job?.error ? `ERROR:\n${job.error}\n` : '', lines.length ? lines.join('\n') : '(no log yet)'].filter(Boolean).join('\n')
    set({ dialog: { kind: 'log', jobId: id, title: `Log — ${job?.name ?? ''}`, content } })
  },

  async showCommand(id) {
    const job = get().jobs.find((j) => j.id === id)
    const cmd = await api.previewCommand(id, get().settings)
    set({ dialog: { kind: 'command', jobId: id, title: `ffmpeg command — ${job?.name ?? ''}`, content: cmd ?? '(not available until the file is probed)' } })
  },

  async copyCommand(id) {
    const cmd = await api.previewCommand(id, get().settings)
    if (cmd) await get().copyText(cmd)
  },

  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text)
      get().pushNotice('success', 'Copied to clipboard.')
    } catch {
      get().pushNotice('error', 'Could not access the clipboard.')
    }
  },

  closeDialog: () => set({ dialog: null }),

  reveal: (p) => void api.reveal(p),
  openPath: (p) => void api.openPath(p),

  pushNotice(level, message) {
    const n: Notice = { id: noticeId(), level, message }
    set((st) => ({ notices: [...st.notices.slice(-4), n] }))
  },
  dismissNotice: (id) => set((st) => ({ notices: st.notices.filter((n) => n.id !== id) })),
  dismissSummary: () => set({ summary: null }),
  setDragOver: (v) => {
    if (get().dragOver !== v) set({ dragOver: v })
  }
}))
