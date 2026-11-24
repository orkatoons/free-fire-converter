import { statSync } from 'node:fs'
import path from 'node:path'
import type { AudioStreamInfo, MediaInfo, SubtitleStreamInfo, VideoStreamInfo } from '../../shared/types'
import type { FfmpegPaths } from './locate'
import { runCapture } from './proc'

/* eslint-disable @typescript-eslint/no-explicit-any */

const HDR_TRANSFERS = new Set(['smpte2084', 'arib-std-b67'])
const COMMON_RATES: Array<[number, string]> = [
  [23.976, '24000/1001'],
  [24, '24/1'],
  [25, '25/1'],
  [29.97, '30000/1001'],
  [30, '30/1'],
  [48, '48/1'],
  [50, '50/1'],
  [59.94, '60000/1001'],
  [60, '60/1'],
  [90, '90/1'],
  [100, '100/1'],
  [119.88, '120000/1001'],
  [120, '120/1'],
  [144, '144/1'],
  [165, '165/1'],
  [240, '240/1']
]

export function parseRational(r: string | undefined | null): number | null {
  if (!r) return null
  const [a, b] = r.split('/').map(Number)
  if (!Number.isFinite(a)) return null
  const v = b === undefined ? a : b === 0 ? NaN : a / b
  return Number.isFinite(v) && v > 0 ? v : null
}

export function plausibleFps(f: number | null): f is number {
  return f != null && f >= 1 && f <= 240
}

/** Snap a measured fps to a standard rate when close; returns [fps, rational]. */
export function snapFps(f: number): [number, string] {
  let best: [number, string] | null = null
  let bestErr = 0.004
  for (const [rate, rational] of COMMON_RATES) {
    const err = Math.abs(f - rate) / rate
    if (err < bestErr) {
      bestErr = err
      best = [parseRational(rational)!, rational]
    }
  }
  if (best) return best
  const r = Math.round(f * 1000)
  return [r / 1000, `${r}/1000`]
}

export function bitDepthFromPixFmt(pixFmt: string | null, rawBits?: string | number): number {
  const raw = Number(rawBits)
  if (Number.isFinite(raw) && raw >= 8 && raw <= 16) return raw
  if (!pixFmt) return 8
  if (/^p0(10|12|16)/.test(pixFmt)) return Number(pixFmt.slice(2, 4))
  const m = /(\d+)(le|be)$/.exec(pixFmt)
  if (m) {
    const n = Number(m[1])
    if ([9, 10, 12, 14, 16].includes(n)) return n
  }
  return 8
}

/** Parses "HH:MM:SS.fffffffff" (Matroska DURATION tag) into seconds. */
export function parseClock(s: string | undefined): number | null {
  if (!s) return null
  const m = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(s.trim())
  if (!m) return null
  const v = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  return v > 0 ? v : null
}

function num(x: unknown): number | null {
  const n = Number(x)
  return Number.isFinite(n) && n > 0 ? n : null
}

function rotationOf(s: any): number {
  const sd = Array.isArray(s.side_data_list) ? s.side_data_list.find((d: any) => d.rotation != null) : null
  const r = sd ? Number(sd.rotation) : Number(s.tags?.rotate ?? 0)
  return Number.isFinite(r) ? ((Math.round(r) % 360) + 360) % 360 : 0
}

export interface ScanResult {
  duration: number | null
  frames: number | null
}

/** Demux-only pass over the first video stream to measure duration and frame count. */
export async function scanStream(ffmpeg: string, file: string, timeoutMs = 180_000): Promise<ScanResult> {
  const r = await runCapture(
    ffmpeg,
    ['-hide_banner', '-nostdin', '-v', 'error', '-progress', 'pipe:1', '-nostats', '-i', file, '-map', '0:v:0', '-c', 'copy', '-f', 'null', '-'],
    timeoutMs
  )
  let us: number | null = null
  let frames: number | null = null
  for (const line of r.stdout.split(/\r?\n/)) {
    const [k, v] = line.split('=')
    if (k === 'out_time_us' || k === 'out_time_ms') {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) us = n
    } else if (k === 'frame') {
      const n = Number(v)
      if (Number.isFinite(n) && n > 0) frames = n
    }
  }
  return { duration: us != null ? us / 1e6 : null, frames }
}

export function parseProbeJson(file: string, json: any, sizeBytes: number): MediaInfo {
  const streams: any[] = Array.isArray(json.streams) ? json.streams : []
  const fmt = json.format ?? {}

  const vs = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic)
  let video: VideoStreamInfo | null = null
  if (vs) {
    const rotation = rotationOf(vs)
    const swap = rotation % 180 === 90
    const avg = parseRational(vs.avg_frame_rate)
    const r = parseRational(vs.r_frame_rate)
    let fps: number | null = null
    let fpsRational: string | null = null
    let fpsSource: VideoStreamInfo['fpsSource'] = 'unknown'
    if (plausibleFps(avg)) {
      ;[fps, fpsRational] = snapFps(avg)
      fpsSource = 'avg'
    } else if (plausibleFps(r)) {
      ;[fps, fpsRational] = snapFps(r)
      fpsSource = 'r'
    }
    const vfr =
      (plausibleFps(avg) && plausibleFps(r) && Math.abs(avg - r) / r > 0.01) ||
      (plausibleFps(avg) && r != null && !plausibleFps(r))
    const pixFmt: string | null = vs.pix_fmt ?? null
    const transfer: string | null = vs.color_transfer ?? null
    const width = Number(vs.width) || 0
    const height = Number(vs.height) || 0
    video = {
      index: Number(vs.index),
      codec: String(vs.codec_name ?? 'unknown'),
      profile: vs.profile ?? null,
      width,
      height,
      displayWidth: swap ? height : width,
      displayHeight: swap ? width : height,
      rotation,
      fps,
      fpsRational,
      fpsSource,
      vfr,
      pixFmt,
      bitDepth: bitDepthFromPixFmt(pixFmt, vs.bits_per_raw_sample),
      colorPrimaries: vs.color_primaries ?? null,
      colorTransfer: transfer,
      colorSpace: vs.color_space ?? null,
      colorRange: vs.color_range ?? null,
      hdr: transfer != null && HDR_TRANSFERS.has(transfer),
      bitrate: num(vs.bit_rate) ?? num(vs.tags?.BPS)
    }
  }

  const audio: AudioStreamInfo[] = streams
    .filter((s) => s.codec_type === 'audio')
    .map((s) => ({
      index: Number(s.index),
      codec: String(s.codec_name ?? 'unknown'),
      channels: Number(s.channels) || 2,
      channelLayout: s.channel_layout ?? null,
      sampleRate: num(s.sample_rate),
      bitrate: num(s.bit_rate) ?? num(s.tags?.BPS),
      language: s.tags?.language ?? null
    }))

  const subtitles: SubtitleStreamInfo[] = streams
    .filter((s) => s.codec_type === 'subtitle')
    .map((s) => ({ index: Number(s.index), codec: String(s.codec_name ?? 'unknown'), language: s.tags?.language ?? null }))

  const duration =
    num(fmt.duration) ?? num(vs?.duration) ?? parseClock(vs?.tags?.DURATION) ?? parseClock(fmt.tags?.DURATION) ?? null

  return {
    path: file,
    name: path.basename(file),
    sizeBytes,
    formatName: String(fmt.format_name ?? 'unknown'),
    duration,
    durationSource: duration != null ? 'metadata' : 'unknown',
    bitrate: num(fmt.bit_rate),
    video,
    audio,
    subtitles
  }
}

/** Probe a file. Falls back to a demux scan when duration or frame rate is missing (common for WebM). */
export async function probeFile(paths: FfmpegPaths, file: string): Promise<MediaInfo> {
  const size = statSync(file).size
  const r = await runCapture(
    paths.ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    60_000
  )
  if (r.code !== 0) {
    throw new Error(r.stderr.trim().split(/\r?\n/).slice(-3).join('\n') || `ffprobe exited with code ${r.code}`)
  }
  let json: unknown
  try {
    json = JSON.parse(r.stdout)
  } catch {
    throw new Error('ffprobe returned unreadable output')
  }
  const info = parseProbeJson(file, json, size)

  // Matroska/WebM only stores a nominal frame rate (and often no duration), so measure the real
  // timing with a demux-only pass. Other containers only need it when metadata is missing.
  const isMatroska = /matroska|webm/.test(info.formatName)
  const needsScan = info.video && (isMatroska || info.duration == null || info.video.fps == null)
  if (needsScan) applyScan(info, await scanStream(paths.ffmpeg, file))
  if (info.bitrate == null && info.duration) info.bitrate = (size * 8) / info.duration
  return info
}

/** Merge a demux scan into probe info: real duration, measured average fps, VFR detection. */
export function applyScan(info: MediaInfo, scan: ScanResult): void {
  const v = info.video
  if (!v || scan.duration == null || !scan.frames || scan.frames < 2) {
    if (info.duration == null && scan.duration != null) {
      info.duration = scan.duration
      info.durationSource = 'scan'
    }
    return
  }
  // scan.duration is the timestamp of the last frame; frames-1 intervals precede it.
  const measured = (scan.frames - 1) / scan.duration
  if (info.duration == null) {
    info.duration = scan.duration + (plausibleFps(measured) ? 1 / measured : 0)
    info.durationSource = 'scan'
  }
  if (!plausibleFps(measured)) return
  const nominal = v.fpsSource === 'avg' || v.fpsSource === 'r' ? v.fps : null
  const differs = nominal != null && Math.abs(measured - nominal) / nominal > 0.015
  if (v.fps == null || differs) {
    const [f, rational] = snapFps(measured)
    v.fps = f
    v.fpsRational = rational
    v.fpsSource = 'measured'
  }
  if (differs || nominal == null) v.vfr = v.vfr || differs || nominal == null
}
