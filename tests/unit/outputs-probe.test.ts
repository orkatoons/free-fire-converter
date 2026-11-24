import { describe, expect, it } from 'vitest'
import { applyTemplate, reserveKey, resolveOutputTarget } from '../../src/main/outputs'
import { bitDepthFromPixFmt, parseClock, parseProbeJson, snapFps } from '../../src/main/ffmpeg/probe'
import type { OutputSettings } from '../../src/shared/types'

const out = (p: Partial<OutputSettings> = {}): OutputSettings => ({ dir: null, filenameTemplate: '{name}', conflict: 'rename', ...p })
const tokens = { res: '2160p', codec: 'h264' }

describe('output paths', () => {
  it('same folder as source by default, .part temp file', () => {
    const t = resolveOutputTarget('C:\\v\\clip.webm', 'mp4', out(), tokens, new Set(), () => false)
    expect(t.finalPath).toBe('C:\\v\\clip.mp4')
    expect(t.partPath).toBe('C:\\v\\clip.part.mp4')
  })
  it('custom folder + template tokens', () => {
    const t = resolveOutputTarget('C:\\v\\clip.webm', 'mp4', out({ dir: 'D:\\out', filenameTemplate: '{name}_{res}_{codec}' }), tokens, new Set(), () => false)
    expect(t.finalPath).toBe('D:\\out\\clip_2160p_h264.mp4')
  })
  it('rename on conflict', () => {
    const existing = new Set(['C:\\v\\clip.mp4', 'C:\\v\\clip (1).mp4'])
    const t = resolveOutputTarget('C:\\v\\clip.webm', 'mp4', out(), tokens, new Set(), (p) => existing.has(p))
    expect(t.finalPath).toBe('C:\\v\\clip (2).mp4')
  })
  it('skip on conflict', () => {
    const t = resolveOutputTarget('C:\\v\\clip.webm', 'mp4', out({ conflict: 'skip' }), tokens, new Set(), () => true)
    expect(t.finalPath).toBeNull()
    expect(t.skippedBecauseExists).toBe('C:\\v\\clip.mp4')
  })
  it('overwrite on conflict', () => {
    const t = resolveOutputTarget('C:\\v\\clip.webm', 'mp4', out({ conflict: 'overwrite' }), tokens, new Set(), () => true)
    expect(t.finalPath).toBe('C:\\v\\clip.mp4')
  })
  it('never overwrites the input itself, even with overwrite', () => {
    const t = resolveOutputTarget('C:\\v\\clip.mp4', 'mp4', out({ conflict: 'overwrite' }), tokens, new Set(), (p) => p === 'C:\\v\\clip.mp4')
    expect(t.finalPath).toBe('C:\\v\\clip (1).mp4')
  })
  it('avoids paths reserved by other running jobs (a.webm + a.mkv → a.mp4)', () => {
    const reserved = new Set([reserveKey('C:\\v\\a.mp4')])
    const t = resolveOutputTarget('C:\\v\\a.mkv', 'mp4', out({ conflict: 'overwrite' }), tokens, reserved, () => false)
    expect(t.finalPath).toBe('C:\\v\\a (1).mp4')
  })
  it('sanitizes illegal characters', () => {
    expect(applyTemplate('{name}: <x>?', { name: 'a', res: '', codec: '', date: '' })).toBe('a_ _x__')
  })
})

describe('probe parsing', () => {
  it('reads bit depth from pix_fmt', () => {
    expect(bitDepthFromPixFmt('yuv420p')).toBe(8)
    expect(bitDepthFromPixFmt('yuv420p10le')).toBe(10)
    expect(bitDepthFromPixFmt('p010le')).toBe(10)
    expect(bitDepthFromPixFmt('yuv444p12le')).toBe(12)
  })
  it('snaps fps to standard rates', () => {
    expect(snapFps(59.93)[1]).toBe('60000/1001')
    expect(snapFps(30.02)[1]).toBe('30/1')
    expect(snapFps(37.5)[1]).toBe('37500/1000')
  })
  it('parses Matroska DURATION tags', () => {
    expect(parseClock('00:01:23.500000000')).toBeCloseTo(83.5)
  })
  it('MediaRecorder-style WebM: no duration, 1000fps timebase guess, HDR flags, rotation', () => {
    const json = {
      format: { format_name: 'matroska,webm' },
      streams: [
        {
          index: 0,
          codec_type: 'video',
          codec_name: 'vp9',
          width: 2160,
          height: 3840,
          r_frame_rate: '1000/1',
          avg_frame_rate: '0/0',
          pix_fmt: 'yuv420p10le',
          color_transfer: 'smpte2084',
          color_primaries: 'bt2020',
          side_data_list: [{ side_data_type: 'Display Matrix', rotation: -90 }]
        },
        { index: 1, codec_type: 'audio', codec_name: 'opus', channels: 2, sample_rate: '48000' }
      ]
    }
    const m = parseProbeJson('x.webm', json, 1000)
    expect(m.duration).toBeNull()
    expect(m.durationSource).toBe('unknown')
    expect(m.video!.fps).toBeNull()
    expect(m.video!.bitDepth).toBe(10)
    expect(m.video!.hdr).toBe(true)
    expect(m.video!.rotation).toBe(270)
    expect(m.video!.displayWidth).toBe(3840)
    expect(m.video!.displayHeight).toBe(2160)
    expect(m.audio[0].codec).toBe('opus')
  })
  it('flags VFR when avg and r differ', () => {
    const json = {
      format: { duration: '10.0', bit_rate: '5000000' },
      streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, r_frame_rate: '60/1', avg_frame_rate: '5400/100', pix_fmt: 'yuv420p' }]
    }
    const m = parseProbeJson('x.mp4', json, 1000)
    expect(m.video!.vfr).toBe(true)
    expect(m.video!.fps).toBeCloseTo(54)
    expect(m.duration).toBe(10)
  })
  it('ignores attached cover art as the video stream', () => {
    const json = {
      format: { duration: '5' },
      streams: [
        { index: 0, codec_type: 'video', codec_name: 'mjpeg', width: 600, height: 600, disposition: { attached_pic: 1 } },
        { index: 1, codec_type: 'video', codec_name: 'h264', width: 1280, height: 720, r_frame_rate: '30/1', avg_frame_rate: '30/1', pix_fmt: 'yuv420p' }
      ]
    }
    expect(parseProbeJson('x.mp4', json, 1).video!.index).toBe(1)
  })
})
