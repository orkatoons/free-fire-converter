import type { Capabilities, Container, EncoderKind, SpeedPreset, VideoCodec } from './types'

export interface EncoderDef {
  id: string
  codec: VideoCodec
  kind: EncoderKind
  hardware: boolean
  label: string
  tenBit: boolean
}

export const ENCODERS: Record<string, EncoderDef> = {
  h264_nvenc: { id: 'h264_nvenc', codec: 'h264', kind: 'nvenc', hardware: true, label: 'NVIDIA NVENC', tenBit: false },
  hevc_nvenc: { id: 'hevc_nvenc', codec: 'hevc', kind: 'nvenc', hardware: true, label: 'NVIDIA NVENC', tenBit: true },
  av1_nvenc: { id: 'av1_nvenc', codec: 'av1', kind: 'nvenc', hardware: true, label: 'NVIDIA NVENC', tenBit: true },
  h264_amf: { id: 'h264_amf', codec: 'h264', kind: 'amf', hardware: true, label: 'AMD AMF', tenBit: false },
  hevc_amf: { id: 'hevc_amf', codec: 'hevc', kind: 'amf', hardware: true, label: 'AMD AMF', tenBit: true },
  av1_amf: { id: 'av1_amf', codec: 'av1', kind: 'amf', hardware: true, label: 'AMD AMF', tenBit: true },
  libx264: { id: 'libx264', codec: 'h264', kind: 'x264', hardware: false, label: 'x264 (CPU)', tenBit: false },
  libx265: { id: 'libx265', codec: 'hevc', kind: 'x265', hardware: false, label: 'x265 (CPU)', tenBit: true },
  libsvtav1: { id: 'libsvtav1', codec: 'av1', kind: 'svtav1', hardware: false, label: 'SVT-AV1 (CPU)', tenBit: true },
  'libaom-av1': { id: 'libaom-av1', codec: 'av1', kind: 'aom', hardware: false, label: 'libaom (CPU, slow)', tenBit: true },
  'libvpx-vp9': { id: 'libvpx-vp9', codec: 'vp9', kind: 'vpx', hardware: false, label: 'libvpx (CPU)', tenBit: true }
}

/** Preference order for 'auto' encoder selection. */
export const AUTO_ORDER: Record<VideoCodec, string[]> = {
  h264: ['h264_nvenc', 'h264_amf', 'libx264'],
  hevc: ['hevc_nvenc', 'hevc_amf', 'libx265'],
  av1: ['av1_nvenc', 'av1_amf', 'libsvtav1', 'libaom-av1'],
  vp9: ['libvpx-vp9']
}

export const CODEC_LABEL: Record<VideoCodec, string> = {
  h264: 'H.264',
  hevc: 'HEVC',
  av1: 'AV1',
  vp9: 'VP9'
}

/** Sensible default quality value (CQ/CRF) per output codec — roughly visually equivalent. */
export const DEFAULT_QUALITY: Record<VideoCodec, number> = {
  h264: 19,
  hevc: 22,
  av1: 28,
  vp9: 31
}

export function qualityRange(kind: EncoderKind): { min: number; max: number } {
  switch (kind) {
    case 'svtav1':
    case 'aom':
    case 'vpx':
      return { min: 0, max: 63 }
    default:
      return { min: 0, max: 51 }
  }
}

/** Codecs we can *encode* into each container. */
export const CONTAINER_ENCODE_CODECS: Record<Container, VideoCodec[]> = {
  mp4: ['h264', 'hevc', 'av1'],
  mov: ['h264', 'hevc'],
  mkv: ['h264', 'hevc', 'av1', 'vp9'],
  webm: ['vp9', 'av1']
}

/** Source video codecs (ffprobe names) that can be stream-copied into each container. null = anything. */
export const CONTAINER_COPY_VIDEO: Record<Container, string[] | null> = {
  mp4: ['h264', 'hevc', 'av1', 'mpeg4'],
  mov: ['h264', 'hevc', 'prores', 'mjpeg', 'mpeg4'],
  mkv: null,
  webm: ['vp8', 'vp9', 'av1']
}

/** Source audio codecs (ffprobe names) that can be stream-copied into each container. null = anything. */
export const CONTAINER_COPY_AUDIO: Record<Container, string[] | null> = {
  mp4: ['aac', 'mp3', 'ac3', 'eac3', 'alac', 'flac'],
  mov: ['aac', 'alac', 'mp3', 'pcm_s16le', 'pcm_s24le', 'pcm_s16be', 'pcm_s24be'],
  mkv: null,
  webm: ['opus', 'vorbis']
}

export const TEXT_SUBTITLE_CODECS = ['subrip', 'ass', 'ssa', 'webvtt', 'mov_text', 'text']

export function encoderUsable(caps: Capabilities | null, id: string): boolean {
  if (!caps) return false
  const s = caps.encoders[id]
  return !!s && s.listed && s.verified
}

export function usableEncodersFor(codec: VideoCodec, caps: Capabilities | null): EncoderDef[] {
  return AUTO_ORDER[codec].filter((id) => encoderUsable(caps, id)).map((id) => ENCODERS[id])
}

export function speedArgs(kind: EncoderKind, speed: SpeedPreset): string[] {
  const i = ['fastest', 'fast', 'balanced', 'quality', 'best'].indexOf(speed)
  const pick = <T>(arr: T[]): T => arr[i < 0 ? 2 : i]
  switch (kind) {
    case 'nvenc':
      return ['-preset', pick(['p1', 'p3', 'p5', 'p6', 'p7']), '-tune', 'hq']
    case 'amf':
      return ['-quality', pick(['speed', 'speed', 'balanced', 'quality', 'quality'])]
    case 'x264':
    case 'x265':
      return ['-preset', pick(['veryfast', 'faster', 'medium', 'slow', 'slower'])]
    case 'svtav1':
      return ['-preset', pick(['12', '10', '8', '6', '4'])]
    case 'aom':
      return ['-cpu-used', pick(['8', '6', '4', '3', '2']), '-row-mt', '1']
    case 'vpx':
      return ['-deadline', 'good', '-cpu-used', pick(['5', '4', '3', '2', '1']), '-row-mt', '1']
  }
}
