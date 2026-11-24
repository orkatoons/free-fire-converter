import { describe, expect, it } from 'vitest'
import { buildArgsFor, buildConversion } from '../../src/main/ffmpeg/args'
import { DEFAULT_CONVERT } from '../../src/shared/defaults'
import type { ConvertSettings } from '../../src/shared/types'
import { argAfter, makeCaps, makeMedia } from './fixtures'

const OUT = 'C:\\out\\clip.part.mp4'
const S = (p: Partial<ConvertSettings> = {}): ConvertSettings => ({ ...DEFAULT_CONVERT, ...p })

describe('4K VP9 + Opus WebM → MP4 (default preset)', () => {
  const args = buildArgsFor(makeMedia(), S(), makeCaps(), OUT)

  it('uses NVENC H.264 with constant quality', () => {
    expect(argAfter(args, '-c:v')).toBe('h264_nvenc')
    expect(argAfter(args, '-rc')).toBe('vbr')
    expect(argAfter(args, '-cq')).toBe('19')
    expect(argAfter(args, '-b:v')).toBe('0')
    expect(argAfter(args, '-preset')).toBe('p5')
    expect(argAfter(args, '-profile:v')).toBe('high')
  })
  it('keeps resolution and timing (no scale, no -r)', () => {
    expect(args).not.toContain('-vf')
    expect(args).not.toContain('-r')
    expect(args).not.toContain('-fps_mode')
  })
  it('outputs 8-bit 4:2:0 for compatibility', () => {
    expect(argAfter(args, '-pix_fmt')).toBe('yuv420p')
  })
  it('hardware-decodes with CUDA', () => {
    expect(argAfter(args, '-hwaccel')).toBe('cuda')
    expect(args.indexOf('-hwaccel')).toBeLessThan(args.indexOf('-i'))
  })
  it('converts Opus → AAC 192k and maps all audio', () => {
    expect(argAfter(args, '-c:a')).toBe('aac')
    expect(argAfter(args, '-b:a')).toBe('192k')
    expect(args.join(' ')).toContain('-map 0:a?')
    expect(args.join(' ')).toContain('-map 0:0')
  })
  it('writes faststart MP4 to the given path', () => {
    expect(argAfter(args, '-movflags')).toBe('+faststart')
    expect(argAfter(args, '-f')).toBe('mp4')
    expect(args[args.length - 1]).toBe(OUT)
  })
})

describe('10-bit / HDR sources', () => {
  const hdr = makeMedia({}, {
    pixFmt: 'yuv420p10le',
    bitDepth: 10,
    hdr: true,
    colorPrimaries: 'bt2020',
    colorTransfer: 'smpte2084',
    colorSpace: 'bt2020nc'
  })

  it('preserve → switches to HEVC Main10 with colour metadata', () => {
    const { plan, args } = buildConversion(hdr, S(), makeCaps(), OUT)
    expect(args).not.toBeNull()
    expect(argAfter(args!, '-c:v')).toBe('hevc_nvenc')
    expect(argAfter(args!, '-profile:v')).toBe('main10')
    expect(argAfter(args!, '-pix_fmt')).toBe('p010le')
    expect(argAfter(args!, '-color_primaries')).toBe('bt2020')
    expect(argAfter(args!, '-color_trc')).toBe('smpte2084')
    expect(argAfter(args!, '-colorspace')).toBe('bt2020nc')
    expect(argAfter(args!, '-tag:v')).toBe('hvc1')
    expect(argAfter(args!, '-cq')).toBe('22') // 19 + 3 offset for HEVC
    expect(plan.warnings.join(' ')).toMatch(/HEVC 10-bit/)
  })

  it('tonemap → H.264 8-bit with zscale/tonemap and BT.709 tags', () => {
    const args = buildArgsFor(hdr, S({ highBitDepth: 'tonemap' }), makeCaps(), OUT)
    expect(argAfter(args, '-c:v')).toBe('h264_nvenc')
    expect(argAfter(args, '-vf')).toMatch(/tonemap=tonemap=hable/)
    expect(argAfter(args, '-pix_fmt')).toBe('yuv420p')
    expect(argAfter(args, '-color_trc')).toBe('bt709')
  })

  it('software HEVC 10-bit uses yuv420p10le + main10', () => {
    const args = buildArgsFor(hdr, S(), makeCaps({ hw: false }), OUT)
    expect(argAfter(args, '-c:v')).toBe('libx265')
    expect(argAfter(args, '-pix_fmt')).toBe('yuv420p10le')
    expect(argAfter(args, '-profile:v')).toBe('main10')
  })
})

describe('copy mode', () => {
  it('copies AV1 into MP4 without decoding', () => {
    const media = makeMedia({}, { codec: 'av1' })
    const args = buildArgsFor(media, S({ videoMode: 'copy' }), makeCaps(), OUT)
    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(args).not.toContain('-hwaccel')
    expect(args).not.toContain('-pix_fmt')
    expect(argAfter(args, '-c:a')).toBe('aac')
  })
  it('re-encodes VP9 when MP4 is the target, with a warning', () => {
    const { plan, args } = buildConversion(makeMedia(), S({ videoMode: 'copy' }), makeCaps(), OUT)
    expect(argAfter(args!, '-c:v')).toBe('h264_nvenc')
    expect(plan.warnings.join(' ')).toMatch(/Can't copy VP9/)
  })
  it('MKV accepts VP9 copy and keeps all subtitles', () => {
    const media = makeMedia({ subtitles: [{ index: 2, codec: 'hdmv_pgs_subtitle', language: 'eng' }] })
    const args = buildArgsFor(media, S({ videoMode: 'copy', container: 'mkv', audio: 'copy' }), makeCaps(), 'x.mkv')
    expect(argAfter(args, '-c:v')).toBe('copy')
    expect(argAfter(args, '-c:a')).toBe('copy')
    expect(args.join(' ')).toContain('-map 0:2')
    expect(argAfter(args, '-c:s')).toBe('copy')
    expect(argAfter(args, '-f')).toBe('matroska')
  })
})

describe('resolution', () => {
  it('downscales 4K → 1080p keeping aspect', () => {
    const args = buildArgsFor(makeMedia(), S({ resolution: '1080' }), makeCaps(), OUT)
    expect(argAfter(args, '-vf')).toBe('scale=1920:1080:flags=lanczos')
  })
  it('uses the short side for portrait video', () => {
    const media = makeMedia({}, { width: 1080, height: 1920 })
    const args = buildArgsFor(media, S({ resolution: '720' }), makeCaps(), OUT)
    expect(argAfter(args, '-vf')).toBe('scale=720:1280:flags=lanczos')
  })
  it('handles ultrawide with even dimensions', () => {
    const media = makeMedia({}, { width: 3440, height: 1440 })
    const args = buildArgsFor(media, S({ resolution: '1080' }), makeCaps(), OUT)
    expect(argAfter(args, '-vf')).toBe('scale=2580:1080:flags=lanczos')
  })
  it('does not upscale unless allowed', () => {
    const media = makeMedia({}, { width: 1280, height: 720 })
    const { plan, args } = buildConversion(media, S({ resolution: '2160' }), makeCaps(), OUT)
    expect(args).not.toContain('-vf')
    expect(plan.notes.join(' ')).toMatch(/upscaling is off/)
    const up = buildArgsFor(media, S({ resolution: '2160', allowUpscale: true }), makeCaps(), OUT)
    expect(argAfter(up, '-vf')).toBe('scale=3840:2160:flags=lanczos')
  })
  it('forces even dimensions on odd sources', () => {
    const media = makeMedia({}, { width: 1919, height: 1079 })
    const args = buildArgsFor(media, S(), makeCaps(), OUT)
    expect(argAfter(args, '-vf')).toBe('scale=1920:1080:flags=lanczos')
  })
  it('custom width keeps aspect', () => {
    const args = buildArgsFor(makeMedia(), S({ resolution: 'custom', customWidth: 2560, customHeight: 0 }), makeCaps(), OUT)
    expect(argAfter(args, '-vf')).toBe('scale=2560:1440:flags=lanczos')
  })
})

describe('frame rate', () => {
  it('constant at source fps uses the source rational', () => {
    const media = makeMedia({}, { vfr: true })
    const args = buildArgsFor(media, S({ fpsMode: 'cfr-source' }), makeCaps(), OUT)
    expect(argAfter(args, '-fps_mode')).toBe('cfr')
    expect(argAfter(args, '-r')).toBe('60000/1001')
  })
  it('keeps VFR timing by default and notes it', () => {
    const media = makeMedia({}, { vfr: true })
    const { plan, args } = buildConversion(media, S(), makeCaps(), OUT)
    expect(args).not.toContain('-r')
    expect(plan.notes.join(' ')).toMatch(/Variable frame rate/)
  })
  it('falls back to keeping timing when fps is unknown', () => {
    const media = makeMedia({}, { fps: null, fpsRational: null, fpsSource: 'unknown' })
    const { plan, args } = buildConversion(media, S({ fpsMode: 'cfr-source' }), makeCaps(), OUT)
    expect(args).not.toContain('-r')
    expect(plan.warnings.join(' ')).toMatch(/frame rate is unknown/)
  })
  it('fixed fps', () => {
    const args = buildArgsFor(makeMedia(), S({ fpsMode: 'fixed', fixedFps: 30 }), makeCaps(), OUT)
    expect(argAfter(args, '-r')).toBe('30')
  })
})

describe('audio', () => {
  it('none → -an and no audio map', () => {
    const args = buildArgsFor(makeMedia(), S({ audio: 'none' }), makeCaps(), OUT)
    expect(args).toContain('-an')
    expect(args.join(' ')).not.toContain('0:a?')
  })
  it('copy of Opus into MP4 falls back to AAC with a warning', () => {
    const { plan, args } = buildConversion(makeMedia(), S({ audio: 'copy' }), makeCaps(), OUT)
    expect(argAfter(args!, '-c:a')).toBe('aac')
    expect(plan.warnings.join(' ')).toMatch(/Can't copy opus/)
  })
  it('copy of AAC into MP4 is a real copy', () => {
    const media = makeMedia({ audio: [{ index: 1, codec: 'aac', channels: 2, channelLayout: null, sampleRate: 48000, bitrate: 128000, language: null }] })
    const args = buildArgsFor(media, S({ audio: 'copy' }), makeCaps(), OUT)
    expect(argAfter(args, '-c:a')).toBe('copy')
  })
  it('Opus 5.1 uses mapping family 1', () => {
    const media = makeMedia({ audio: [{ index: 1, codec: 'opus', channels: 6, channelLayout: '5.1', sampleRate: 48000, bitrate: null, language: null }] })
    const args = buildArgsFor(media, S({ audio: 'opus', container: 'mkv' }), makeCaps(), 'x.mkv')
    expect(argAfter(args, '-c:a')).toBe('libopus')
    expect(argAfter(args, '-mapping_family')).toBe('1')
  })
})

describe('encoder selection & fallbacks', () => {
  it('software fallback uses libx264 CRF and no hwaccel', () => {
    const args = buildArgsFor(makeMedia(), S(), makeCaps({ hw: false }), OUT)
    expect(argAfter(args, '-c:v')).toBe('libx264')
    expect(argAfter(args, '-crf')).toBe('19')
    expect(argAfter(args, '-preset')).toBe('medium')
    expect(args).not.toContain('-hwaccel')
  })
  it('forceNoHwDecode drops -hwaccel (retry path)', () => {
    const args = buildArgsFor(makeMedia(), S(), makeCaps(), OUT, { forceNoHwDecode: true })
    expect(args).not.toContain('-hwaccel')
    expect(argAfter(args, '-c:v')).toBe('h264_nvenc')
  })
  it('hwDecode off drops -hwaccel', () => {
    const args = buildArgsFor(makeMedia(), S({ hwDecode: false }), makeCaps(), OUT)
    expect(args).not.toContain('-hwaccel')
  })
  it('unavailable explicit encoder falls back with a warning', () => {
    const caps = makeCaps()
    caps.encoders.h264_amf = { listed: true, verified: false }
    const { plan, args } = buildConversion(makeMedia(), S({ encoder: 'h264_amf' }), caps, OUT)
    expect(argAfter(args!, '-c:v')).toBe('h264_nvenc')
    expect(plan.warnings.join(' ')).toMatch(/h264_amf isn't available/)
  })
  it('H.264 into WebM is an error', () => {
    const { plan, args } = buildConversion(makeMedia(), S({ container: 'webm', videoCodec: 'h264' }), makeCaps(), 'x.webm')
    expect(args).toBeNull()
    expect(plan.errors[0]).toMatch(/can't be written to .webm/)
  })
  it('no video stream is an error', () => {
    const { plan } = buildConversion(makeMedia({ video: null }), S(), makeCaps(), OUT)
    expect(plan.ok).toBe(false)
  })
})

describe('bitrate modes', () => {
  it('target bitrate on NVENC sets VBV', () => {
    const args = buildArgsFor(makeMedia(), S({ qualityMode: 'bitrate', bitrateMbps: 40 }), makeCaps(), OUT)
    expect(argAfter(args, '-b:v')).toBe('40000k')
    expect(argAfter(args, '-maxrate')).toBe('60000k')
    expect(argAfter(args, '-bufsize')).toBe('80000k')
    expect(args).not.toContain('-cq')
  })
  it('match source bitrate compensates VP9 → H.264 efficiency', () => {
    // 20 Mbps overall − 128k assumed audio ≈ 19.872 Mbps video; ×1.45 efficiency ×1.05 headroom
    const { plan, args } = buildConversion(makeMedia(), S({ qualityMode: 'source-bitrate' }), makeCaps(), OUT)
    const kbps = Number(argAfter(args!, '-b:v')!.replace('k', ''))
    expect(kbps).toBeGreaterThan(29_000)
    expect(kbps).toBeLessThan(31_000)
    expect(plan.notes.join(' ')).toMatch(/codec efficiency/)
  })
})

describe('summary', () => {
  it('describes the default 4K conversion', () => {
    const { plan } = buildConversion(makeMedia(), S(), makeCaps(), OUT)
    expect(plan.summary).toBe('3840×2160 · H.264 (NVIDIA NVENC) · 59.94 fps · CQ 19 · AAC 192k · .mp4')
    expect(plan.resLabel).toBe('2160p')
  })
})
