// Pure conversion planning: (source MediaInfo + settings + capabilities) -> ResolvedPlan.
// No I/O. Used by main (to build ffmpeg args) and renderer (to preview output + warnings).

import {
  AUTO_ORDER,
  CODEC_LABEL,
  CONTAINER_COPY_AUDIO,
  CONTAINER_COPY_VIDEO,
  CONTAINER_ENCODE_CODECS,
  ENCODERS,
  TEXT_SUBTITLE_CODECS,
  encoderUsable,
  qualityRange,
  usableEncodersFor,
  type EncoderDef
} from './encoders'
import { formatFps } from './format'
import type { Capabilities, Container, ConvertSettings, MediaInfo, SpeedPreset, VideoCodec, VideoStreamInfo } from './types'

export interface ColorTags {
  primaries: string | null
  trc: string | null
  space: string | null
}

export interface VideoPlanEncode {
  mode: 'encode'
  codec: VideoCodec
  encoder: EncoderDef
  width: number
  height: number
  filters: string[]
  pixFmt: string
  tenBit: boolean
  tonemap: boolean
  fps: { mode: 'keep' } | { mode: 'cfr'; rate: string; value: number }
  rate: { type: 'cq'; value: number } | { type: 'bitrate'; kbps: number }
  speed: SpeedPreset
  color: ColorTags | null
}

export interface VideoPlanCopy {
  mode: 'copy'
  codec: string
  width: number
  height: number
}

export type AudioPlan =
  | { mode: 'none' }
  | { mode: 'copy' }
  | { mode: 'encode'; codec: 'aac' | 'opus'; kbps: number; channels: number }

export interface SubtitlePlan {
  indexes: number[]
  codec: 'copy' | 'mov_text' | 'webvtt'
}

export interface ResolvedPlan {
  ok: boolean
  errors: string[]
  /** Things the user should look at */
  warnings: string[]
  /** Informational */
  notes: string[]
  container: Container
  video: VideoPlanEncode | VideoPlanCopy | null
  audio: AudioPlan
  subtitles: SubtitlePlan
  /** '-hwaccel' method or null */
  hwDecode: string | null
  /** Human summary, e.g. "3840×2160 · H.264 (NVIDIA NVENC) · 59.94 fps · CQ 19 · AAC 192k · .mp4" */
  summary: string
  /** For {res} filename token, e.g. "2160p" */
  resLabel: string
  /** For {codec} filename token, e.g. "h264" */
  codecLabel: string
}

export interface PlanOptions {
  forceNoHwDecode?: boolean
}

const BAD_COLOR_VALUES = new Set(['unknown', 'reserved', 'unspecified', ''])

/** Relative compression efficiency (higher = needs fewer bits for same quality). */
const CODEC_EFFICIENCY: Record<string, number> = {
  h264: 1,
  mpeg4: 0.75,
  vp8: 0.9,
  vp9: 1.45,
  hevc: 1.45,
  av1: 1.8
}

export function even(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2)
}

export function resolvePlan(
  media: MediaInfo,
  s: ConvertSettings,
  caps: Capabilities | null,
  opts: PlanOptions = {}
): ResolvedPlan {
  const errors: string[] = []
  const warnings: string[] = []
  const notes: string[] = []
  const container = s.container
  const v = media.video

  let video: VideoPlanEncode | VideoPlanCopy | null = null

  if (!v) {
    errors.push('No video stream found in this file.')
  } else {
    if (s.videoMode === 'copy') {
      const allowed = CONTAINER_COPY_VIDEO[container]
      if (allowed === null || allowed.includes(v.codec)) {
        video = { mode: 'copy', codec: v.codec, width: v.displayWidth, height: v.displayHeight }
        if (s.resolution !== 'source' || s.fpsMode !== 'source') {
          notes.push('Copy mode keeps the original resolution and frame rate — those settings are ignored.')
        }
      } else {
        warnings.push(`Can't copy ${v.codec.toUpperCase()} video into .${container} — it will be re-encoded.`)
      }
    }
    if (!video) video = planEncode(media, v, s, caps, errors, warnings, notes)
  }

  const audio = planAudio(media, s, container, warnings, notes)
  const subtitles = planSubtitles(media, container, notes)

  let hwDecode: string | null = null
  if (video?.mode === 'encode' && s.hwDecode && !opts.forceNoHwDecode && caps) {
    const hasNvidia = ['h264_nvenc', 'hevc_nvenc', 'av1_nvenc'].some((id) => encoderUsable(caps, id))
    if (hasNvidia && caps.hwaccels.includes('cuda')) hwDecode = 'cuda'
    else if (caps.hwaccels.includes('d3d11va')) hwDecode = 'd3d11va'
  }

  if (media.duration == null) notes.push('Duration unknown — progress will be indeterminate.')

  const resLabel = video ? `${Math.min(video.width, video.height)}p` : 'src'
  const codecLabel = video ? (video.mode === 'copy' ? video.codec : video.codec) : 'none'

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    notes,
    container,
    video,
    audio,
    subtitles,
    hwDecode,
    summary: summarize(video, audio, container, v),
    resLabel,
    codecLabel
  }
}

function planEncode(
  media: MediaInfo,
  v: VideoStreamInfo,
  s: ConvertSettings,
  caps: Capabilities | null,
  errors: string[],
  warnings: string[],
  notes: string[]
): VideoPlanEncode | null {
  const container = s.container
  let codec = s.videoCodec
  if (!CONTAINER_ENCODE_CODECS[container].includes(codec)) {
    errors.push(`${CODEC_LABEL[codec]} can't be written to .${container}.`)
    return null
  }

  const highDepth = v.bitDepth > 8 || v.hdr
  let codecSwitched = false
  if (highDepth && s.highBitDepth === 'preserve' && codec === 'h264' && CONTAINER_ENCODE_CODECS[container].includes('hevc')) {
    if (usableEncodersFor('hevc', caps).some((e) => e.tenBit)) {
      codec = 'hevc'
      codecSwitched = true
      warnings.push(
        `Source is ${v.hdr ? 'HDR' : '10-bit'} — using HEVC 10-bit instead of H.264 to preserve it. Choose "Convert to SDR / 8-bit" to force H.264.`
      )
    }
  }

  // Encoder selection
  let enc: EncoderDef | undefined
  if (s.encoder !== 'auto') {
    const def = ENCODERS[s.encoder]
    if (def && def.codec === codec && encoderUsable(caps, def.id)) enc = def
    else if (!codecSwitched) {
      const fallback = usableEncodersFor(codec, caps)[0]
      if (fallback) warnings.push(`${s.encoder} isn't available — using ${fallback.id}.`)
    }
  }
  if (!enc) enc = usableEncodersFor(codec, caps)[0]
  if (!enc) {
    const tried = AUTO_ORDER[codec].join(', ')
    errors.push(`No working ${CODEC_LABEL[codec]} encoder found (tried ${tried}).`)
    return null
  }

  // Bit depth / HDR
  let tenBit = false
  let tonemap = false
  if (highDepth) {
    if (s.highBitDepth === 'preserve' && enc.tenBit) {
      tenBit = true
    } else if (v.hdr) {
      if (caps?.filters.zscale && caps.filters.tonemap) {
        tonemap = true
        if (s.highBitDepth === 'tonemap') notes.push('HDR will be tone-mapped to SDR (BT.709).')
        else warnings.push(`${enc.id} can't do 10-bit — HDR will be tone-mapped to SDR.`)
      } else {
        warnings.push('HDR source → 8-bit output without tone-mapping: colours will look washed out.')
      }
    } else {
      notes.push('10-bit source will be converted to 8-bit.')
    }
  }

  // Resolution
  const srcW = v.displayWidth
  const srcH = v.displayHeight
  let w = srcW
  let h = srcH
  let upscaleBlocked = false
  if (s.resolution === 'custom') {
    const cw = Math.max(0, Math.round(s.customWidth || 0))
    const ch = Math.max(0, Math.round(s.customHeight || 0))
    if (cw > 0 && ch > 0) {
      w = cw
      h = ch
    } else if (cw > 0) {
      w = cw
      h = (srcH * cw) / srcW
    } else if (ch > 0) {
      h = ch
      w = (srcW * ch) / srcH
    }
    if (w * h > srcW * srcH && !s.allowUpscale) {
      upscaleBlocked = true
      w = srcW
      h = srcH
    }
  } else if (s.resolution !== 'source') {
    const target = Number(s.resolution)
    const short = Math.min(srcW, srcH)
    if (target !== short) {
      if (target > short && !s.allowUpscale) {
        upscaleBlocked = true
      } else {
        const f = target / short
        w = srcW * f
        h = srcH * f
      }
    }
  }
  if (upscaleBlocked) notes.push(`Source is smaller than the chosen resolution — kept at ${srcW}×${srcH} (upscaling is off).`)
  w = even(w)
  h = even(h)

  const filters: string[] = []
  if (w !== srcW || h !== srcH) filters.push(`scale=${w}:${h}:flags=lanczos`)
  if (tonemap) {
    filters.push(
      'zscale=t=linear:npl=100',
      'format=gbrpf32le',
      'zscale=p=bt709',
      'tonemap=tonemap=hable:desat=0',
      'zscale=t=bt709:m=bt709:r=tv',
      'format=yuv420p'
    )
  }

  const pixFmt = tenBit ? (enc.kind === 'nvenc' || enc.kind === 'amf' ? 'p010le' : 'yuv420p10le') : 'yuv420p'

  // Frame rate
  let fps: VideoPlanEncode['fps'] = { mode: 'keep' }
  if (s.fpsMode === 'cfr-source') {
    if (v.fpsRational && v.fps) fps = { mode: 'cfr', rate: v.fpsRational, value: v.fps }
    else warnings.push("Source frame rate is unknown — keeping the original timing instead of forcing constant fps.")
  } else if (s.fpsMode === 'fixed') {
    const f = s.fixedFps > 0 ? s.fixedFps : 30
    fps = { mode: 'cfr', rate: String(f), value: f }
    if (v.fps && f > v.fps + 0.5) notes.push(`${f} fps is higher than the source (${formatFps(v.fps)}) — frames will be duplicated.`)
  } else if (v.vfr) {
    notes.push('Variable frame rate is kept (fine for playback). Use "Constant" frame rate if you plan to edit it.')
  }

  // Rate control
  const range = qualityRange(enc.kind)
  const qualityFor = (): { type: 'cq'; value: number } => {
    let q = s.quality
    if (codecSwitched) q += 3 // HEVC is more efficient; keep file sizes comparable to the H.264 setting
    return { type: 'cq', value: Math.min(range.max, Math.max(range.min, Math.round(q))) }
  }
  let rate: VideoPlanEncode['rate']
  if (s.qualityMode === 'bitrate') {
    rate = { type: 'bitrate', kbps: Math.max(100, Math.round(s.bitrateMbps * 1000)) }
  } else if (s.qualityMode === 'source-bitrate') {
    const srcBps = sourceVideoBitrate(media)
    if (srcBps == null) {
      warnings.push('Source bitrate is unknown — using constant quality instead.')
      rate = qualityFor()
    } else {
      const eff = (CODEC_EFFICIENCY[v.codec] ?? 1) / (CODEC_EFFICIENCY[codec] ?? 1)
      const pixelRatio = (w * h) / (srcW * srcH)
      const kbps = Math.max(100, Math.round(((srcBps * eff * pixelRatio) / 1000) * 1.05))
      rate = { type: 'bitrate', kbps }
      if (v.codec !== codec) {
        notes.push(
          `Matching source quality: ${(srcBps / 1e6).toFixed(1)} Mbps ${v.codec.toUpperCase()} → ~${(kbps / 1000).toFixed(1)} Mbps ${CODEC_LABEL[codec]} (adjusted for codec efficiency).`
        )
      }
    }
  } else {
    rate = qualityFor()
  }

  // Colour tags
  let color: ColorTags | null = null
  if (tonemap) {
    color = { primaries: 'bt709', trc: 'bt709', space: 'bt709' }
  } else {
    const clean = (x: string | null): string | null => (x && !BAD_COLOR_VALUES.has(x) ? x : null)
    const c = { primaries: clean(v.colorPrimaries), trc: clean(v.colorTransfer), space: clean(v.colorSpace) }
    if (c.primaries || c.trc || c.space) color = c
  }

  return { mode: 'encode', codec, encoder: enc, width: w, height: h, filters, pixFmt, tenBit, tonemap, fps, rate, speed: s.speed, color }
}

function planAudio(media: MediaInfo, s: ConvertSettings, container: Container, warnings: string[], notes: string[]): AudioPlan {
  if (media.audio.length === 0 || s.audio === 'none') return { mode: 'none' }
  const channels = Math.max(...media.audio.map((a) => a.channels || 2))
  const kbps = Math.max(32, Math.round(s.audioBitrateKbps))

  if (s.audio === 'copy') {
    const allowed = CONTAINER_COPY_AUDIO[container]
    const bad = allowed ? media.audio.filter((a) => !allowed.includes(a.codec)) : []
    if (bad.length === 0) return { mode: 'copy' }
    const fallback = container === 'webm' ? 'opus' : 'aac'
    warnings.push(`Can't copy ${bad[0].codec} audio into .${container} — converting to ${fallback.toUpperCase()} ${kbps}k.`)
    return { mode: 'encode', codec: fallback, kbps, channels }
  }

  let codec: 'aac' | 'opus' = s.audio
  if (codec === 'aac' && container === 'webm') {
    codec = 'opus'
    notes.push('WebM requires Opus audio — using Opus.')
  } else if (codec === 'opus' && container === 'mov') {
    codec = 'aac'
    notes.push('MOV doesn\'t support Opus — using AAC.')
  } else if (codec === 'opus' && container === 'mp4') {
    warnings.push("Opus inside MP4 isn't supported by some players (older Apple devices, some TVs). AAC is safer.")
  }
  return { mode: 'encode', codec, kbps, channels }
}

function planSubtitles(media: MediaInfo, container: Container, notes: string[]): SubtitlePlan {
  if (media.subtitles.length === 0) return { indexes: [], codec: 'copy' }
  if (container === 'mkv') return { indexes: media.subtitles.map((x) => x.index), codec: 'copy' }
  const text = media.subtitles.filter((x) => TEXT_SUBTITLE_CODECS.includes(x.codec))
  const dropped = media.subtitles.length - text.length
  if (dropped > 0) notes.push(`${dropped} image-based subtitle track(s) can't go in .${container} and will be dropped.`)
  return { indexes: text.map((x) => x.index), codec: container === 'webm' ? 'webvtt' : 'mov_text' }
}

export function sourceVideoBitrate(media: MediaInfo): number | null {
  const v = media.video
  if (!v) return null
  if (v.bitrate && v.bitrate > 0) return v.bitrate
  const audioBps = media.audio.reduce((sum, a) => sum + (a.bitrate ?? 128_000), 0)
  let total = media.bitrate
  if ((!total || total <= 0) && media.duration && media.duration > 0) total = (media.sizeBytes * 8) / media.duration
  if (!total || total <= 0) return null
  return Math.max(100_000, total - audioBps)
}

function summarize(
  video: VideoPlanEncode | VideoPlanCopy | null,
  audio: AudioPlan,
  container: Container,
  v: VideoStreamInfo | null
): string {
  const parts: string[] = []
  if (video?.mode === 'copy') {
    parts.push(`${video.width}×${video.height}`, `${video.codec.toUpperCase()} (copied)`)
  } else if (video) {
    parts.push(`${video.width}×${video.height}`)
    parts.push(`${CODEC_LABEL[video.codec]}${video.tenBit ? ' 10-bit' : ''} (${video.encoder.label})`)
    if (video.fps.mode === 'cfr') parts.push(`${formatFps(video.fps.value)} fps CFR`)
    else parts.push(`${formatFps(v?.fps)} fps${v?.vfr ? ' VFR' : ''}`)
    if (video.rate.type === 'cq') {
      const k = video.encoder.kind
      parts.push(`${k === 'nvenc' ? 'CQ' : k === 'amf' ? 'QP' : 'CRF'} ${video.rate.value}`)
    } else parts.push(`${(video.rate.kbps / 1000).toFixed(1)} Mbps`)
    if (video.tonemap) parts.push('HDR→SDR')
  }
  if (audio.mode === 'none') parts.push('no audio')
  else if (audio.mode === 'copy') parts.push('audio copied')
  else parts.push(`${audio.codec === 'aac' ? 'AAC' : 'Opus'} ${audio.kbps}k`)
  parts.push(`.${container}`)
  return parts.join(' · ')
}
