// End-to-end: real ffmpeg, real fixtures, real queue (everything except Electron/UI).
// Run with `npm run e2e` (generates fixtures first).

import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { detectCapabilities } from '../../src/main/ffmpeg/capabilities'
import { probeFile } from '../../src/main/ffmpeg/probe'
import { runCapture } from '../../src/main/ffmpeg/proc'
import { JobQueue } from '../../src/main/queue'
import { DEFAULT_APP_SETTINGS } from '../../src/shared/defaults'
import type { AppSettings, Capabilities, ConvertSettings, Job } from '../../src/shared/types'

const FIX = path.resolve('test-fixtures')
const OUT = path.join(FIX, 'out')
const f = (name: string): string => path.join(FIX, name)

let caps: Capabilities

function settings(convert: Partial<ConvertSettings> = {}, extra: Partial<AppSettings> = {}): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    convert: { ...DEFAULT_APP_SETTINGS.convert, ...convert },
    output: { dir: OUT, filenameTemplate: '{name}', conflict: 'rename' },
    ...extra
  }
}

async function waitFor(q: JobQueue, pred: (jobs: Job[]) => boolean, timeoutMs = 60_000): Promise<Job[]> {
  const start = Date.now()
  for (;;) {
    const jobs = q.snapshot().jobs
    if (pred(jobs)) return jobs
    if (Date.now() - start > timeoutMs) throw new Error(`timeout; states: ${jobs.map((j) => `${j.name}:${j.status}:${j.error ?? ''}`).join(', ')}`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

async function convertOne(file: string, s: AppSettings): Promise<Job> {
  const q = new JobQueue({ getCapabilities: async () => caps })
  await q.addPaths([file])
  await waitFor(q, (js) => js.every((j) => j.status !== 'probing'))
  const idle = new Promise((r) => q.once('finished', r))
  q.start(s)
  await idle
  return q.snapshot().jobs[0]
}

interface ProbeOut {
  streams: Array<Record<string, string | number>>
  format: Record<string, string>
}
async function ffprobeJson(file: string): Promise<ProbeOut> {
  const r = await runCapture(caps.ffprobePath!, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file])
  return JSON.parse(r.stdout)
}
const vstream = (p: ProbeOut): Record<string, string | number> => p.streams.find((s) => s.codec_type === 'video')!
const astream = (p: ProbeOut): Record<string, string | number> | undefined => p.streams.find((s) => s.codec_type === 'audio')

beforeAll(async () => {
  for (const n of ['4k-vp9-opus.webm', 'vfr.webm', 'no-duration.webm', 'hdr10.webm']) {
    if (!existsSync(f(n))) throw new Error(`Missing fixture ${n} — run "npm run fixtures"`)
  }
  rmSync(OUT, { recursive: true, force: true })
  mkdirSync(OUT, { recursive: true })
  caps = await detectCapabilities(null)
  expect(caps.ffmpegFound).toBe(true)
  console.log(
    'verified encoders:',
    Object.entries(caps.encoders).filter(([, s]) => s.verified).map(([id]) => id).join(', ')
  )
})

describe('probe', () => {
  it('4K VP9 + Opus', async () => {
    const m = await probeFile({ ffmpeg: caps.ffmpegPath!, ffprobe: caps.ffprobePath! }, f('4k-vp9-opus.webm'))
    expect(m.video).toMatchObject({ codec: 'vp9', displayWidth: 3840, displayHeight: 2160, bitDepth: 8, hdr: false, vfr: false })
    expect(m.video!.fps).toBeCloseTo(30, 1)
    expect(m.audio[0].codec).toBe('opus')
    expect(m.duration).toBeCloseTo(5, 1)
  })
  it('missing duration is recovered by scanning', async () => {
    const m = await probeFile({ ffmpeg: caps.ffmpegPath!, ffprobe: caps.ffprobePath! }, f('no-duration.webm'))
    expect(m.durationSource).toBe('scan')
    expect(m.duration!).toBeGreaterThan(3.8)
    expect(m.duration!).toBeLessThan(4.2)
    expect(m.video!.fps).toBeCloseTo(30, 0)
  })
  it('detects VFR in WebM despite nominal 30 fps metadata', async () => {
    const m = await probeFile({ ffmpeg: caps.ffmpegPath!, ffprobe: caps.ffprobePath! }, f('vfr.webm'))
    expect(m.video!.vfr).toBe(true)
    expect(m.video!.fps!).toBeLessThan(25) // 60 + 30 frames over 4 s ≈ 22.5
  })
  it('detects 10-bit HDR', async () => {
    const m = await probeFile({ ffmpeg: caps.ffmpegPath!, ffprobe: caps.ffprobePath! }, f('hdr10.webm'))
    expect(m.video).toMatchObject({ bitDepth: 10, hdr: true, colorTransfer: 'smpte2084' })
  })
})

describe('convert', () => {
  it('4K WebM → MP4 matches source (default preset)', async () => {
    const job = await convertOne(f('4k-vp9-opus.webm'), settings())
    expect(job.status, job.error ?? '').toBe('done')
    expect(job.outputPath).toBe(path.join(OUT, '4k-vp9-opus.mp4'))
    const p = await ffprobeJson(job.outputPath!)
    const v = vstream(p)
    expect(v.codec_name).toBe('h264')
    expect(v.width).toBe(3840)
    expect(v.height).toBe(2160)
    expect(v.pix_fmt).toBe('yuv420p')
    expect(v.avg_frame_rate).toBe('30/1')
    expect(astream(p)!.codec_name).toBe('aac')
    expect(Math.abs(Number(p.format.duration) - 5)).toBeLessThan(0.2)
    expect(p.format.format_name).toContain('mp4')
    console.log('4K plan:', job.planSummary, '| took', job.elapsedSec?.toFixed(1), 's')
  })

  it('second run of same file auto-renames, leaves no .part files', async () => {
    const job = await convertOne(f('4k-vp9-opus.webm'), settings({ videoMode: 'encode', resolution: '1080' }))
    expect(job.status, job.error ?? '').toBe('done')
    expect(path.basename(job.outputPath!)).toBe('4k-vp9-opus (1).mp4')
    expect(vstream(await ffprobeJson(job.outputPath!)).height).toBe(1080)
    expect(readdirSync(OUT).filter((n) => n.includes('.part.'))).toEqual([])
  })

  it('no-duration WebM converts with correct duration', async () => {
    const job = await convertOne(f('no-duration.webm'), settings())
    expect(job.status, job.error ?? '').toBe('done')
    const p = await ffprobeJson(job.outputPath!)
    expect(Math.abs(Number(p.format.duration) - 4)).toBeLessThan(0.2)
  })

  it('VFR → constant fps for editing', async () => {
    const job = await convertOne(f('vfr.webm'), settings({ fpsMode: 'cfr-source' }))
    expect(job.status, job.error ?? '').toBe('done')
    const v = vstream(await ffprobeJson(job.outputPath!))
    expect(v.avg_frame_rate).toBe(v.r_frame_rate)
  })

  it('HDR10 → HEVC Main10 keeping HDR metadata', async () => {
    const job = await convertOne(f('hdr10.webm'), settings())
    expect(job.status, job.error ?? '').toBe('done')
    const v = vstream(await ffprobeJson(job.outputPath!))
    expect(v.codec_name).toBe('hevc')
    expect(v.profile).toBe('Main 10')
    expect(v.color_transfer).toBe('smpte2084')
    expect(v.color_primaries).toBe('bt2020')
    expect(v.codec_tag_string).toBe('hvc1')
  })

  it('HDR10 → SDR H.264 with tone-mapping', async () => {
    const job = await convertOne(f('hdr10.webm'), settings({ highBitDepth: 'tonemap' }, { output: { dir: OUT, filenameTemplate: '{name}_sdr', conflict: 'overwrite' } }))
    expect(job.status, job.error ?? '').toBe('done')
    const v = vstream(await ffprobeJson(job.outputPath!))
    expect(v.codec_name).toBe('h264')
    expect(v.pix_fmt).toBe('yuv420p')
    expect(v.color_transfer).toBe('bt709')
  })

  it('copy mode: VP9 → MKV is a stream copy', async () => {
    const job = await convertOne(f('4k-vp9-opus.webm'), settings({ container: 'mkv', videoMode: 'copy', audio: 'copy' }))
    expect(job.status, job.error ?? '').toBe('done')
    const p = await ffprobeJson(job.outputPath!)
    expect(vstream(p).codec_name).toBe('vp9')
    expect(astream(p)!.codec_name).toBe('opus')
  })

  it('skip policy skips existing output', async () => {
    const s = settings()
    s.output.conflict = 'skip'
    const job = await convertOne(f('4k-vp9-opus.webm'), s)
    expect(job.status).toBe('skipped')
  })

  it('cancel stops ffmpeg and deletes the partial file', async () => {
    const q = new JobQueue({ getCapabilities: async () => caps })
    await q.addPaths([f('4k-vp9-opus.webm')])
    await waitFor(q, (js) => js[0].status === 'ready')
    const s = settings({ encoder: 'libx264', speed: 'best' }, { output: { dir: OUT, filenameTemplate: 'cancel-me', conflict: 'overwrite' } })
    const idle = new Promise((r) => q.once('finished', r))
    q.start(s)
    const [running] = await waitFor(q, (js) => js[0].status === 'running' && (js[0].progress ?? 0) > 0, 60_000)
    q.cancel(running.id)
    await idle
    expect(q.snapshot().jobs[0].status).toBe('cancelled')
    await new Promise((r) => setTimeout(r, 500))
    expect(readdirSync(OUT).filter((n) => n.startsWith('cancel-me'))).toEqual([])
  })

  it('multiple files in one queue run sequentially', async () => {
    const q = new JobQueue({ getCapabilities: async () => caps })
    const r = await q.addPaths([f('no-duration.webm'), f('vfr.webm'), f('no-duration.webm'), path.join(FIX, 'nope.txt')])
    expect(r.added).toBe(2)
    expect(r.duplicates).toBe(1)
    expect(r.unsupported).toEqual(['nope.txt'])
    await waitFor(q, (js) => js.every((j) => j.status === 'ready'))
    const done = new Promise<{ done: number }>((res) => q.once('finished', res))
    q.start(settings({}, { output: { dir: OUT, filenameTemplate: 'multi_{name}', conflict: 'overwrite' } }))
    const summary = await done
    expect(summary.done).toBe(2)
  })
})
