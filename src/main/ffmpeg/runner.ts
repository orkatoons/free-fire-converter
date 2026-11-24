import { spawn } from 'node:child_process'
import { killTree } from './proc'

export interface RunProgress {
  outTimeSec: number | null
  speed: number | null
  fps: number | null
  /** 0..1 or null when duration unknown */
  progress: number | null
  etaSec: number | null
}

export interface RunResult {
  ok: boolean
  cancelled: boolean
  code: number | null
  /** Short human-readable failure reason (last meaningful stderr lines) */
  error: string | null
}

export interface RunHandle {
  promise: Promise<RunResult>
  /** Graceful stop ('q'), then hard kill after 3s. */
  cancel(): void
}

const LOG_LIMIT = 200

/**
 * Spawn ffmpeg with machine-readable progress on stdout.
 * `args` should be a full ffmpeg argument list (inputs + outputs).
 */
export function runFfmpeg(
  ffmpeg: string,
  args: string[],
  durationSec: number | null,
  onProgress: (p: RunProgress) => void,
  onLog: (line: string) => void
): RunHandle {
  const fullArgs = ['-nostats', '-progress', 'pipe:1', ...args]
  const child = spawn(ffmpeg, fullArgs, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let cancelled = false
  let killTimer: NodeJS.Timeout | null = null
  const tail: string[] = []

  const block: Record<string, string> = {}
  let outBuf = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
    outBuf += chunk
    let nl: number
    while ((nl = outBuf.indexOf('\n')) >= 0) {
      const line = outBuf.slice(0, nl).trim()
      outBuf = outBuf.slice(nl + 1)
      const eq = line.indexOf('=')
      if (eq < 0) continue
      const k = line.slice(0, eq)
      const v = line.slice(eq + 1)
      block[k] = v
      if (k === 'progress') onProgress(toProgress(block, durationSec))
    }
  })

  let errBuf = ''
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
    errBuf += chunk
    const lines = errBuf.split(/\r?\n|\r/)
    errBuf = lines.pop() ?? ''
    for (const l of lines) {
      if (!l.trim()) continue
      tail.push(l)
      if (tail.length > LOG_LIMIT) tail.shift()
      onLog(l)
    }
  })
  child.stdin.on('error', () => {
    /* ffmpeg may have exited already */
  })

  const promise = new Promise<RunResult>((resolve) => {
    child.on('error', (e) => {
      if (killTimer) clearTimeout(killTimer)
      resolve({ ok: false, cancelled, code: -1, error: `Could not start ffmpeg: ${e.message}` })
    })
    child.on('close', (code) => {
      if (killTimer) clearTimeout(killTimer)
      if (errBuf.trim()) {
        tail.push(errBuf)
        onLog(errBuf)
      }
      const ok = code === 0 && !cancelled
      resolve({ ok, cancelled, code, error: ok || cancelled ? null : summarizeError(tail, code) })
    })
  })

  return {
    promise,
    cancel() {
      if (cancelled) return
      cancelled = true
      try {
        child.stdin.write('q')
        child.stdin.end()
      } catch {
        /* ignore */
      }
      killTimer = setTimeout(() => killTree(child), 3000)
    }
  }
}

function toProgress(b: Record<string, string>, duration: number | null): RunProgress {
  const us = Number(b.out_time_us ?? b.out_time_ms)
  const outTimeSec = Number.isFinite(us) && us >= 0 ? us / 1e6 : null
  const speedNum = parseFloat((b.speed ?? '').replace('x', ''))
  const speed = Number.isFinite(speedNum) && speedNum > 0 ? speedNum : null
  const fpsNum = Number(b.fps)
  const fps = Number.isFinite(fpsNum) && fpsNum > 0 ? fpsNum : null
  let progress: number | null = null
  let etaSec: number | null = null
  if (duration && duration > 0 && outTimeSec != null) {
    progress = Math.min(1, Math.max(0, outTimeSec / duration))
    if (b.progress === 'end') progress = 1
    if (speed) etaSec = Math.max(0, (duration - outTimeSec) / speed)
  }
  return { outTimeSec, speed, fps, progress, etaSec }
}

const NOISE = /^(\s*(Stream|Input|Output|Metadata|Duration|encoder|handler_name|vendor_id|major_brand|minor_version|compatible_brands|creation_time|Side data|cpb:|Press \[q\]|\[out#|frame=)|\s{2,}\S+\s*:)/

function summarizeError(tail: string[], code: number | null): string {
  const meaningful = tail.filter((l) => !NOISE.test(l))
  const last = (meaningful.length ? meaningful : tail).slice(-4).join('\n').trim()
  return last || `ffmpeg exited with code ${code}`
}
