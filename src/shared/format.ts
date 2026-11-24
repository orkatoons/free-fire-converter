import type { MediaInfo } from './types'

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 || i === 0 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}

export function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return '—'
  const s = Math.max(0, Math.round(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? h + ':' : ''}${mm}:${String(r).padStart(2, '0')}`
}

export function formatFps(fps: number | null | undefined): string {
  if (fps == null || !Number.isFinite(fps)) return '?'
  const rounded = Math.round(fps * 100) / 100
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

export function formatBitrate(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps)) return '—'
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`
  return `${Math.round(bps / 1000)} kbps`
}

export function formatChannels(n: number): string {
  if (n === 1) return 'mono'
  if (n === 2) return 'stereo'
  if (n === 6) return '5.1'
  if (n === 8) return '7.1'
  return `${n}ch`
}

/** Spec chips for a probed file, e.g. ["3840×2160", "VP9", "59.94 fps VFR", "10-bit HDR", "Opus stereo", "12:34", "1.8 GB"] */
export function mediaSpecs(m: MediaInfo): string[] {
  const out: string[] = []
  const v = m.video
  if (v) {
    out.push(`${v.displayWidth}×${v.displayHeight}`)
    out.push(v.codec.toUpperCase())
    out.push(`${formatFps(v.fps)} fps${v.vfr ? ' VFR' : ''}`)
    if (v.bitDepth > 8 || v.hdr) out.push(`${v.bitDepth}-bit${v.hdr ? ' HDR' : ''}`)
  } else {
    out.push('no video')
  }
  const a = m.audio[0]
  if (a) out.push(`${a.codec === 'opus' ? 'Opus' : a.codec.toUpperCase()} ${formatChannels(a.channels)}${m.audio.length > 1 ? ` +${m.audio.length - 1}` : ''}`)
  else out.push('no audio')
  out.push(m.duration != null ? formatDuration(m.duration) : 'duration ?')
  out.push(formatBytes(m.sizeBytes))
  return out
}
