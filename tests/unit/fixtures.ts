import { ENCODERS } from '../../src/shared/encoders'
import type { Capabilities, MediaInfo, VideoStreamInfo } from '../../src/shared/types'

export function makeCaps(opts: { hw?: boolean; listed?: string[] } = {}): Capabilities {
  const hw = opts.hw ?? true
  const listed = new Set(opts.listed ?? Object.keys(ENCODERS).filter((id) => id !== 'libsvtav1'))
  const encoders: Capabilities['encoders'] = {}
  for (const def of Object.values(ENCODERS)) {
    const isListed = listed.has(def.id)
    encoders[def.id] = { listed: isListed, verified: isListed && (!def.hardware || hw) }
  }
  return {
    ffmpegFound: true,
    ffmpegPath: 'ffmpeg',
    ffprobePath: 'ffprobe',
    version: 'test',
    encoders,
    hwaccels: hw ? ['cuda', 'd3d11va'] : [],
    filters: { zscale: true, tonemap: true }
  }
}

export function makeVideo(p: Partial<VideoStreamInfo> = {}): VideoStreamInfo {
  return {
    index: 0,
    codec: 'vp9',
    profile: 'Profile 0',
    width: 3840,
    height: 2160,
    displayWidth: p.width ?? 3840,
    displayHeight: p.height ?? 2160,
    rotation: 0,
    fps: 59.94005994005994,
    fpsRational: '60000/1001',
    fpsSource: 'avg',
    vfr: false,
    pixFmt: 'yuv420p',
    bitDepth: 8,
    colorPrimaries: 'bt709',
    colorTransfer: 'bt709',
    colorSpace: 'bt709',
    colorRange: 'tv',
    hdr: false,
    bitrate: null,
    ...p
  }
}

export function makeMedia(p: Partial<MediaInfo> = {}, v: Partial<VideoStreamInfo> = {}): MediaInfo {
  return {
    path: 'C:\\videos\\clip.webm',
    name: 'clip.webm',
    sizeBytes: 500_000_000,
    formatName: 'matroska,webm',
    duration: 200,
    durationSource: 'metadata',
    bitrate: 20_000_000,
    video: makeVideo(v),
    audio: [{ index: 1, codec: 'opus', channels: 2, channelLayout: 'stereo', sampleRate: 48000, bitrate: null, language: null }],
    subtitles: [],
    ...p
  }
}

/** Returns the value following `flag` in args (first occurrence). */
export function argAfter(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}
