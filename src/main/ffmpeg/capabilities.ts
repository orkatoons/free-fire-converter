import { ENCODERS } from '../../shared/encoders'
import type { Capabilities, EncoderStatus } from '../../shared/types'
import { locateFfmpeg } from './locate'
import { runCapture } from './proc'

/**
 * Detect ffmpeg, list encoders/hwaccels/filters, and verify hardware encoders with a real
 * 1-frame test encode (an encoder being *listed* doesn't mean the driver/GPU can use it).
 */
export async function detectCapabilities(customDir: string | null): Promise<Capabilities> {
  const empty: Capabilities = {
    ffmpegFound: false,
    ffmpegPath: null,
    ffprobePath: null,
    version: null,
    encoders: {},
    hwaccels: [],
    filters: { zscale: false, tonemap: false }
  }

  const paths = await locateFfmpeg(customDir)
  if (!paths) return { ...empty, error: 'ffmpeg/ffprobe not found on PATH or in the configured folder.' }

  const [ver, enc, hw, filt] = await Promise.all([
    runCapture(paths.ffmpeg, ['-hide_banner', '-version']),
    runCapture(paths.ffmpeg, ['-hide_banner', '-encoders']),
    runCapture(paths.ffmpeg, ['-hide_banner', '-hwaccels']),
    runCapture(paths.ffmpeg, ['-hide_banner', '-filters'])
  ])
  if (ver.code !== 0) {
    return { ...empty, ffmpegPath: paths.ffmpeg, ffprobePath: paths.ffprobe, error: `ffmpeg failed to run: ${ver.stderr.slice(0, 300)}` }
  }

  const version = /ffmpeg version (\S+)/.exec(ver.stdout)?.[1] ?? 'unknown'
  const listed = new Set<string>()
  for (const line of enc.stdout.split(/\r?\n/)) {
    const m = /^\s*[VAS][A-Z.]{5}\s+(\S+)/.exec(line)
    if (m) listed.add(m[1])
  }
  const hwaccels = hw.stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.endsWith(':'))
  const filters = { zscale: /\szscale\s/.test(filt.stdout), tonemap: /\stonemap\s/.test(filt.stdout) }

  const encoders: Record<string, EncoderStatus> = {}
  const checks = Object.values(ENCODERS).map(async (def) => {
    if (!listed.has(def.id)) {
      encoders[def.id] = { listed: false, verified: false }
      return
    }
    if (!def.hardware) {
      encoders[def.id] = { listed: true, verified: true }
      return
    }
    const r = await runCapture(
      paths.ffmpeg,
      ['-hide_banner', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=256x256:r=30', '-frames:v', '1', '-c:v', def.id, '-f', 'null', '-'],
      20_000
    )
    encoders[def.id] = r.code === 0 ? { listed: true, verified: true } : { listed: true, verified: false, error: lastLines(r.stderr, 3) }
  })
  // AMF and NVENC tests in parallel is fine; they're tiny.
  await Promise.all(checks)

  return {
    ffmpegFound: true,
    ffmpegPath: paths.ffmpeg,
    ffprobePath: paths.ffprobe,
    version,
    encoders,
    hwaccels,
    filters
  }
}

function lastLines(s: string, n: number): string {
  return s.trim().split(/\r?\n/).slice(-n).join('\n')
}
