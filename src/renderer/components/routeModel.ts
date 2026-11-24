// Pure presentation mapping: a job + the shared planner -> the stations of its route line.
// No I/O and no state; the planner is the same pure function main uses to build ffmpeg args.

import { CODEC_LABEL } from '../../shared/encoders'
import { formatBytes, formatChannels, formatDuration, formatFps } from '../../shared/format'
import { resolvePlan, type ResolvedPlan } from '../../shared/plan'
import type { Capabilities, Container, ConvertSettings, MediaInfo } from '../../shared/types'
import type { JobRowModel } from '../state/hooks'

export type RouteMode =
  | 'probing'
  | 'unreadable'
  | 'ready'
  | 'blocked'
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'stopped'

export interface Station {
  title: string
  detail?: string
}

export interface RouteModel {
  line: Container
  mode: RouteMode
  origin: Station | null
  steps: string[]
  terminus: Station | null
  /** 0..1, null = unknown */
  progress: number | null
}

const CONTAINERS: Container[] = ['mp4', 'mkv', 'mov', 'webm']

function audioName(codec: string): string {
  if (codec === 'opus') return 'Opus'
  if (codec === 'vorbis') return 'Vorbis'
  return codec.toUpperCase()
}

export function originOf(m: MediaInfo): Station {
  const v = m.video
  const detail: string[] = []
  if (v) {
    detail.push(`${formatFps(v.fps)} fps${v.vfr ? ' VFR' : ''}`)
    if (v.bitDepth > 8 || v.hdr) detail.push(`${v.bitDepth}-bit${v.hdr ? ' HDR' : ''}`)
  }
  const a = m.audio[0]
  if (a) detail.push(`${audioName(a.codec)} ${formatChannels(a.channels)}${m.audio.length > 1 ? ` +${m.audio.length - 1}` : ''}`)
  else detail.push('no audio')
  detail.push(m.duration != null ? formatDuration(m.duration) : 'length unknown')
  detail.push(formatBytes(m.sizeBytes))
  return {
    title: v ? `${v.codec.toUpperCase()} · ${v.displayWidth}×${v.displayHeight}` : 'No video stream',
    // Keep each fact on one line; wrap only between facts.
    detail: detail.map((d) => d.replace(/ /g, ' ')).join(' · ')
  }
}

function stepsOf(m: MediaInfo, plan: ResolvedPlan, hwDecode: boolean): string[] {
  const steps: string[] = []
  const v = plan.video
  const src = m.video
  if (hwDecode) steps.push('GPU decode')
  if (v?.mode === 'copy') steps.push('Copy video')
  else if (v && src) {
    if (v.width !== src.displayWidth || v.height !== src.displayHeight) steps.push(`Scale to ${v.width}×${v.height}`)
    if (v.tonemap) steps.push('HDR → SDR')
    else if (v.tenBit) steps.push(src.hdr ? 'Keep HDR 10-bit' : 'Keep 10-bit')
    if (v.fps.mode === 'cfr') steps.push(`Constant ${formatFps(v.fps.value)} fps`)
  }
  const a = plan.audio
  const srcAudio = m.audio[0]
  if (srcAudio) {
    if (a.mode === 'none') steps.push('Drop audio')
    else if (a.mode === 'copy') steps.push('Copy audio')
    else {
      const target = a.codec === 'aac' ? 'AAC' : 'Opus'
      const from = audioName(srcAudio.codec)
      steps.push(from.toLowerCase() === target.toLowerCase() ? `${target} ${a.kbps}k` : `${from} → ${target} ${a.kbps}k`)
    }
  }
  if (plan.subtitles.indexes.length) steps.push('Keep subtitles')
  return steps
}

function terminusOf(plan: ResolvedPlan): Station | null {
  const v = plan.video
  if (!v) return null
  if (v.mode === 'copy') {
    return { title: `${v.codec.toUpperCase()} · ${v.width}×${v.height}`, detail: `video copied untouched · .${plan.container}` }
  }
  const k = v.encoder.kind
  const rate =
    v.rate.type === 'cq'
      ? `${k === 'nvenc' ? 'CQ' : k === 'amf' ? 'QP' : 'CRF'} ${v.rate.value}`
      : `${(v.rate.kbps / 1000).toFixed(1)} Mbps`
  return {
    title: `${CODEC_LABEL[v.codec]}${v.tenBit ? ' 10-bit' : ''} · ${v.width}×${v.height}`,
    detail: `${v.encoder.label} · ${rate} · .${plan.container}`
  }
}

function containerFromSummary(summary: string | null): Container | null {
  const last = summary?.split(' · ').pop()?.replace('.', '') as Container | undefined
  return last && CONTAINERS.includes(last) ? last : null
}

export function buildRoute(row: JobRowModel, convert: ConvertSettings, caps: Capabilities | null): RouteModel {
  const { job } = row
  const base: RouteModel = { line: convert.container, mode: 'probing', origin: null, steps: [], terminus: null, progress: null }
  if (job.status === 'probing') return base
  if (job.status === 'probe-failed' || !job.media) return { ...base, mode: 'unreadable' }

  const media = job.media
  const origin = originOf(media)
  const started = job.planSummary != null && job.status !== 'ready'
  const preview = resolvePlan(media, convert, caps)

  if (!started) {
    return {
      line: convert.container,
      mode: preview.ok ? 'ready' : 'blocked',
      origin,
      steps: preview.ok ? stepsOf(media, preview, !!preview.hwDecode) : [],
      terminus: preview.ok ? terminusOf(preview) : { title: "Can't convert", detail: 'see the reason below' },
      progress: null
    }
  }

  // A started job keeps the plan it ran with. The current settings' plan is only reused when it is
  // provably the same (identical summary); otherwise the route shows origin -> recorded output only.
  const same = preview.ok && preview.summary === job.planSummary
  const line = containerFromSummary(job.planSummary) ?? convert.container
  const mode: RouteMode =
    job.status === 'queued' ? 'queued'
    : job.status === 'running' ? 'running'
    : job.status === 'done' ? 'done'
    : job.status === 'failed' ? 'failed'
    : 'stopped'
  let terminus: Station | null = same ? terminusOf(preview) : { title: 'Output', detail: job.planSummary ?? '' }
  if (terminus && job.status === 'done' && job.outputSizeBytes != null) {
    terminus = { ...terminus, detail: `${terminus.detail} · ${formatBytes(job.outputSizeBytes)}` }
  }
  return {
    line,
    mode,
    origin,
    steps: same ? stepsOf(media, preview, job.usedHwDecode) : [],
    terminus,
    progress: job.status === 'done' ? 1 : job.progress
  }
}
