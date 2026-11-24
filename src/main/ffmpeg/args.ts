// Pure: (MediaInfo + settings + capabilities + output path) -> ffmpeg argument list. No I/O.

import { speedArgs } from '../../shared/encoders'
import { resolvePlan, type PlanOptions, type ResolvedPlan, type VideoPlanEncode } from '../../shared/plan'
import type { Capabilities, Container, ConvertSettings, MediaInfo } from '../../shared/types'

const MUXER: Record<Container, string> = { mp4: 'mp4', mov: 'mov', mkv: 'matroska', webm: 'webm' }

export interface BuiltConversion {
  plan: ResolvedPlan
  /** null when the plan has errors */
  args: string[] | null
}

export function buildConversion(
  media: MediaInfo,
  settings: ConvertSettings,
  caps: Capabilities | null,
  outPath: string,
  opts: PlanOptions = {}
): BuiltConversion {
  const plan = resolvePlan(media, settings, caps, opts)
  if (!plan.ok) return { plan, args: null }
  return { plan, args: buildArgs(media, plan, outPath) }
}

/** Convenience wrapper used by tests: returns args or throws with the plan errors. */
export function buildArgsFor(
  media: MediaInfo,
  settings: ConvertSettings,
  caps: Capabilities | null,
  outPath: string,
  opts: PlanOptions = {}
): string[] {
  const { plan, args } = buildConversion(media, settings, caps, outPath, opts)
  if (!args) throw new Error(plan.errors.join('; '))
  return args
}

export function buildArgs(media: MediaInfo, plan: ResolvedPlan, outPath: string): string[] {
  const v = media.video!
  const video = plan.video!
  const a: string[] = ['-hide_banner', '-y']

  if (plan.hwDecode) a.push('-hwaccel', plan.hwDecode)
  a.push('-i', media.path)

  // Mapping: chosen video stream, all audio, compatible subtitles
  a.push('-map', `0:${v.index}`)
  if (plan.audio.mode !== 'none') a.push('-map', '0:a?')
  for (const i of plan.subtitles.indexes) a.push('-map', `0:${i}`)
  a.push('-map_metadata', '0')

  // Video
  if (video.mode === 'copy') {
    a.push('-c:v', 'copy')
    if (video.codec === 'hevc' && (plan.container === 'mp4' || plan.container === 'mov')) a.push('-tag:v', 'hvc1')
  } else {
    a.push(...videoEncodeArgs(video))
    if (video.filters.length) a.push('-vf', video.filters.join(','))
    a.push('-pix_fmt', video.pixFmt)
    if (video.fps.mode === 'cfr') a.push('-fps_mode', 'cfr', '-r', video.fps.rate)
    if (video.color) {
      if (video.color.primaries) a.push('-color_primaries', video.color.primaries)
      if (video.color.trc) a.push('-color_trc', video.color.trc)
      if (video.color.space) a.push('-colorspace', video.color.space)
    }
    if (video.codec === 'hevc' && (plan.container === 'mp4' || plan.container === 'mov')) a.push('-tag:v', 'hvc1')
  }

  // Audio
  if (plan.audio.mode === 'none') a.push('-an')
  else if (plan.audio.mode === 'copy') a.push('-c:a', 'copy')
  else if (plan.audio.codec === 'aac') a.push('-c:a', 'aac', '-b:a', `${plan.audio.kbps}k`)
  else {
    a.push('-c:a', 'libopus', '-b:a', `${plan.audio.kbps}k`)
    if (plan.audio.channels > 2) a.push('-mapping_family', '1')
  }

  // Subtitles
  if (plan.subtitles.indexes.length) a.push('-c:s', plan.subtitles.codec)

  // Container
  if (plan.container === 'mp4' || plan.container === 'mov') a.push('-movflags', '+faststart')
  a.push('-max_muxing_queue_size', '1024')
  a.push('-f', MUXER[plan.container], outPath)
  return a
}

function videoEncodeArgs(p: VideoPlanEncode): string[] {
  const e = p.encoder
  const out: string[] = ['-c:v', e.id, ...speedArgs(e.kind, p.speed)]
  const cq = p.rate.type === 'cq' ? String(p.rate.value) : null
  const kbps = p.rate.type === 'bitrate' ? p.rate.kbps : 0
  const vbv = (): string[] => ['-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 2}k`]

  switch (e.kind) {
    case 'nvenc':
      out.push(...(cq ? ['-rc', 'vbr', '-cq', cq, '-b:v', '0'] : ['-rc', 'vbr', ...vbv()]))
      if (p.codec === 'h264') out.push('-profile:v', 'high')
      if (p.codec === 'hevc') out.push('-profile:v', p.tenBit ? 'main10' : 'main')
      break
    case 'amf': {
      if (cq) {
        const q = p.codec === 'av1' ? String(Math.round((Number(cq) * 255) / 51)) : cq
        out.push('-rc', 'cqp', '-qp_i', q, '-qp_p', q)
        if (p.codec !== 'av1') out.push('-qp_b', q)
      } else out.push('-rc', 'vbr_peak', ...vbv())
      if (p.codec === 'h264') out.push('-profile:v', 'high')
      if (p.codec === 'hevc') out.push('-profile:v', p.tenBit ? 'main10' : 'main')
      break
    }
    case 'x264':
      out.push(...(cq ? ['-crf', cq] : vbv()), '-profile:v', 'high')
      break
    case 'x265':
      out.push(...(cq ? ['-crf', cq] : vbv()), '-x265-params', 'log-level=error')
      if (p.tenBit) out.push('-profile:v', 'main10')
      break
    case 'svtav1':
      out.push(...(cq ? ['-crf', cq] : ['-b:v', `${kbps}k`]))
      break
    case 'aom':
      out.push(...(cq ? ['-crf', cq, '-b:v', '0'] : ['-b:v', `${kbps}k`]))
      break
    case 'vpx':
      out.push(...(cq ? ['-crf', cq, '-b:v', '0'] : ['-b:v', `${kbps}k`]))
      if (p.tenBit) out.push('-profile:v', '2')
      break
  }
  return out
}

/** Quote args for display / copy-paste into a terminal. */
export function formatCommand(ffmpegPath: string, args: string[]): string {
  const q = (s: string): string => (/^[\w@%+=:,./\\-]+$/.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`)
  return [q(ffmpegPath), ...args.map(q)].join(' ')
}
