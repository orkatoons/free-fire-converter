import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { runCapture } from './proc'

export interface FfmpegPaths {
  ffmpeg: string
  ffprobe: string
}

const EXE = process.platform === 'win32' ? '.exe' : ''

function pairIn(dir: string): FfmpegPaths | null {
  const ffmpeg = path.join(dir, 'ffmpeg' + EXE)
  const ffprobe = path.join(dir, 'ffprobe' + EXE)
  return existsSync(ffmpeg) && existsSync(ffprobe) ? { ffmpeg, ffprobe } : null
}

function candidateDirs(): string[] {
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  if (process.platform === 'win32') {
    const la = process.env.LOCALAPPDATA
    const up = process.env.USERPROFILE
    dirs.push(
      'C:\\ffmpeg\\bin',
      'C:\\Program Files\\ffmpeg\\bin',
      'C:\\ProgramData\\chocolatey\\bin',
      ...(la ? [path.join(la, 'Microsoft', 'WinGet', 'Links')] : []),
      ...(up ? [path.join(up, 'scoop', 'shims')] : [])
    )
  }
  return dirs
}

/**
 * Chocolatey (shimgen) shims spawn the real exe as a child. Killing the shim can orphan ffmpeg,
 * so resolve to the real binary when we can.
 */
async function resolveShim(exe: string): Promise<string> {
  if (!/chocolatey/i.test(exe)) return exe
  const r = await runCapture(exe, ['--shimgen-help'], 5000)
  const m = /Target:\s*'([^']+)'/.exec(r.stdout + r.stderr)
  return m && existsSync(m[1]) ? m[1] : exe
}

export interface LocatedFfmpeg extends FfmpegPaths {
  source: 'custom' | 'system' | 'managed'
}

/**
 * Find ffmpeg + ffprobe. Order: the user's chosen folder, then PATH and common install
 * locations, then the copy this app downloaded (`managedDir`).
 * `custom` may be a folder or a path to ffmpeg(.exe).
 */
export async function locateFfmpeg(custom: string | null, managedDir: string | null = null): Promise<LocatedFfmpeg | null> {
  let found: FfmpegPaths | null = null
  let source: LocatedFfmpeg['source'] = 'system'
  if (custom) {
    let dir = custom
    try {
      if (existsSync(custom) && statSync(custom).isFile()) dir = path.dirname(custom)
    } catch {
      /* ignore */
    }
    found = pairIn(dir) ?? pairIn(path.join(dir, 'bin'))
    if (found) source = 'custom'
  }
  if (!found) {
    for (const d of candidateDirs()) {
      found = pairIn(d)
      if (found) break
    }
  }
  if (!found && managedDir) {
    found = pairIn(managedDir)
    if (found) source = 'managed'
  }
  if (!found) return null
  return { ffmpeg: await resolveShim(found.ffmpeg), ffprobe: await resolveShim(found.ffprobe), source }
}
