import { spawn, type ChildProcess } from 'node:child_process'

export interface CaptureResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

/** Run a process to completion and capture its output. Never rejects for non-zero exit. */
export function runCapture(file: string, args: string[], timeoutMs = 30_000): Promise<CaptureResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let child: ChildProcess
    try {
      child = spawn(file, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      resolve({ code: -1, stdout: '', stderr: String(e), timedOut: false })
      return
    }
    const timer = setTimeout(() => {
      timedOut = true
      killTree(child)
    }, timeoutMs)
    child.stdout?.setEncoding('utf8').on('data', (d: string) => (stdout += d))
    child.stderr?.setEncoding('utf8').on('data', (d: string) => (stderr += d))
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: stderr + String(e), timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

/** Forcefully kill a process and its children (Windows shims spawn a child ffmpeg). */
export function killTree(child: ChildProcess): void {
  if (child.pid == null || child.exitCode !== null) return
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } catch {
      child.kill('SIGKILL')
    }
  } else {
    child.kill('SIGKILL')
  }
}
