// Single source of truth for data shapes shared by main, preload and renderer.

export type Container = 'mp4' | 'mkv' | 'mov' | 'webm'
export type VideoCodec = 'h264' | 'hevc' | 'av1' | 'vp9'
export type EncoderKind = 'nvenc' | 'amf' | 'x264' | 'x265' | 'svtav1' | 'aom' | 'vpx'
export type SpeedPreset = 'fastest' | 'fast' | 'balanced' | 'quality' | 'best'
export type ResolutionChoice = 'source' | '2160' | '1440' | '1080' | '720' | 'custom'
export type FpsMode = 'source' | 'cfr-source' | 'fixed'
export type HighBitDepthPolicy = 'preserve' | 'tonemap'
export type AudioChoice = 'aac' | 'opus' | 'copy' | 'none'
export type ConflictPolicy = 'rename' | 'overwrite' | 'skip'
export type QualityMode = 'cq' | 'bitrate' | 'source-bitrate'

// ---------- Probe ----------

export interface VideoStreamInfo {
  index: number
  codec: string
  profile: string | null
  /** Coded size */
  width: number
  height: number
  /** Size after applying rotation (what the viewer sees) */
  displayWidth: number
  displayHeight: number
  rotation: number
  /** Frames per second; null when unknown/implausible */
  fps: number | null
  /** Rational string to feed back to ffmpeg (-r), e.g. "60000/1001" */
  fpsRational: string | null
  /** Where fps came from */
  fpsSource: 'avg' | 'r' | 'measured' | 'unknown'
  vfr: boolean
  pixFmt: string | null
  bitDepth: number
  colorPrimaries: string | null
  colorTransfer: string | null
  colorSpace: string | null
  colorRange: string | null
  hdr: boolean
  /** bits per second, null when unknown */
  bitrate: number | null
}

export interface AudioStreamInfo {
  index: number
  codec: string
  channels: number
  channelLayout: string | null
  sampleRate: number | null
  bitrate: number | null
  language: string | null
}

export interface SubtitleStreamInfo {
  index: number
  codec: string
  language: string | null
}

export interface MediaInfo {
  path: string
  name: string
  sizeBytes: number
  formatName: string
  /** seconds; null when unknown even after scanning */
  duration: number | null
  durationSource: 'metadata' | 'scan' | 'unknown'
  /** overall bits per second */
  bitrate: number | null
  video: VideoStreamInfo | null
  audio: AudioStreamInfo[]
  subtitles: SubtitleStreamInfo[]
}

// ---------- Capabilities ----------

export interface EncoderStatus {
  listed: boolean
  verified: boolean
  error?: string
}

export interface Capabilities {
  ffmpegFound: boolean
  ffmpegPath: string | null
  ffprobePath: string | null
  version: string | null
  encoders: Record<string, EncoderStatus>
  hwaccels: string[]
  filters: { zscale: boolean; tonemap: boolean }
  error?: string
}

// ---------- Settings ----------

/** Everything that defines *how* a file is converted. Presets store exactly this. */
export interface ConvertSettings {
  container: Container
  videoMode: 'encode' | 'copy'
  videoCodec: VideoCodec
  /** 'auto' or an encoder id like 'h264_nvenc' */
  encoder: string
  qualityMode: QualityMode
  /** CQ/CRF/QP value, lower = better */
  quality: number
  /** Used when qualityMode === 'bitrate' */
  bitrateMbps: number
  speed: SpeedPreset
  resolution: ResolutionChoice
  customWidth: number
  customHeight: number
  allowUpscale: boolean
  fpsMode: FpsMode
  fixedFps: number
  highBitDepth: HighBitDepthPolicy
  hwDecode: boolean
  audio: AudioChoice
  audioBitrateKbps: number
}

export interface OutputSettings {
  /** null = same folder as each source */
  dir: string | null
  /** tokens: {name} {res} {codec} {date} */
  filenameTemplate: string
  conflict: ConflictPolicy
}

export interface Preset {
  id: string
  name: string
  builtIn: boolean
  settings: ConvertSettings
}

export interface AppSettings {
  convert: ConvertSettings
  output: OutputSettings
  concurrency: number
  /** Folder containing ffmpeg.exe/ffprobe.exe, or null to use PATH */
  ffmpegDir: string | null
  notifyOnFinish: boolean
  openFolderOnFinish: boolean
  activePresetId: string | null
  userPresets: Preset[]
}

// ---------- Jobs ----------

export type JobStatus =
  | 'probing'
  | 'probe-failed'
  | 'ready'
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'cancelled'
  | 'skipped'

export interface Job {
  id: string
  inputPath: string
  name: string
  media: MediaInfo | null
  status: JobStatus
  /** 0..1, null = indeterminate */
  progress: number | null
  /** encode speed multiplier (2.3 = 2.3x realtime) */
  speed: number | null
  fps: number | null
  etaSec: number | null
  elapsedSec: number | null
  outputPath: string | null
  /** Summary of the plan actually used (set when the job starts) */
  planSummary: string | null
  /** Warnings from the plan actually used (set when the job starts) */
  planWarnings: string[]
  command: string | null
  error: string | null
  attempt: number
  usedHwDecode: boolean
  startedAt: number | null
  finishedAt: number | null
  outputSizeBytes: number | null
}

export interface QueueState {
  running: boolean
  paused: boolean
  /** Jobs that are part of the current run (for overall progress) */
  runIds: string[]
}

export interface StateSnapshot {
  jobs: Job[]
  queue: QueueState
}

export interface QueueFinishedSummary {
  done: number
  failed: number
  cancelled: number
  skipped: number
  outputDirs: string[]
}

export interface AddResult {
  added: number
  duplicates: number
  unsupported: string[]
}

export interface Notice {
  id: string
  level: 'info' | 'warning' | 'error' | 'success'
  message: string
}
