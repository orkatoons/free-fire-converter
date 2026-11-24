import type { AppSettings, ConvertSettings, Preset } from './types'

export const DEFAULT_CONVERT: ConvertSettings = {
  container: 'mp4',
  videoMode: 'encode',
  videoCodec: 'h264',
  encoder: 'auto',
  qualityMode: 'cq',
  quality: 19,
  bitrateMbps: 40,
  speed: 'balanced',
  resolution: 'source',
  customWidth: 0,
  customHeight: 0,
  allowUpscale: false,
  fpsMode: 'source',
  fixedFps: 30,
  highBitDepth: 'preserve',
  hwDecode: true,
  audio: 'aac',
  audioBitrateKbps: 192
}

export const BUILT_IN_PRESETS: Preset[] = [
  {
    id: 'builtin:webm-mp4-gpu',
    name: 'WebM → MP4 (match source, GPU)',
    builtIn: true,
    settings: { ...DEFAULT_CONVERT }
  },
  {
    id: 'builtin:mp4-copy',
    name: 'Fast remux to MP4 (copy video if possible)',
    builtIn: true,
    settings: { ...DEFAULT_CONVERT, videoMode: 'copy' }
  },
  {
    id: 'builtin:mp4-editing',
    name: 'MP4 for editing (constant fps, high quality)',
    builtIn: true,
    settings: { ...DEFAULT_CONVERT, fpsMode: 'cfr-source', quality: 17, speed: 'quality', audioBitrateKbps: 256 }
  },
  {
    id: 'builtin:hevc-small',
    name: 'HEVC — smaller files, match source',
    builtIn: true,
    settings: { ...DEFAULT_CONVERT, videoCodec: 'hevc', quality: 24, speed: 'quality' }
  },
  {
    id: 'builtin:1080p-h264',
    name: '1080p H.264 (share-friendly)',
    builtIn: true,
    settings: { ...DEFAULT_CONVERT, resolution: '1080', quality: 22, audioBitrateKbps: 160 }
  }
]

export const DEFAULT_APP_SETTINGS: AppSettings = {
  convert: { ...DEFAULT_CONVERT },
  output: { dir: null, filenameTemplate: '{name}', conflict: 'rename' },
  concurrency: 1,
  ffmpegDir: null,
  notifyOnFinish: true,
  openFolderOnFinish: false,
  activePresetId: BUILT_IN_PRESETS[0].id,
  userPresets: []
}

export const VIDEO_EXTENSIONS = [
  'webm', 'mkv', 'mp4', 'm4v', 'mov', 'avi', 'wmv', 'flv', 'ts', 'm2ts', 'mts',
  'mpg', 'mpeg', '3gp', 'ogv', 'gif', 'asf', 'vob'
]

/** Merge possibly-partial/old persisted settings onto defaults so new fields always exist. */
export function normalizeSettings(raw: unknown): AppSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppSettings>
  return {
    ...DEFAULT_APP_SETTINGS,
    ...r,
    convert: { ...DEFAULT_CONVERT, ...(r.convert ?? {}) },
    output: { ...DEFAULT_APP_SETTINGS.output, ...(r.output ?? {}) },
    concurrency: clampInt(r.concurrency ?? 1, 1, 4),
    userPresets: Array.isArray(r.userPresets)
      ? r.userPresets.map((p) => ({ ...p, builtIn: false, settings: { ...DEFAULT_CONVERT, ...p.settings } }))
      : []
  }
}

export function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.round(n)))
}
