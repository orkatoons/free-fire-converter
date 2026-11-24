// Download, verify and unpack an official Windows ffmpeg build into an app-managed folder.
// Electron-free: the caller supplies the destination and (optionally) a fetch implementation.

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, promises as fsp, readFileSync } from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { FfmpegInstallProgress } from '../../shared/types'

export const FFMPEG_SOURCE = {
  /** gyan.dev "release essentials": stable ffmpeg with NVENC/AMF/QSV, libvpx, libaom, zimg */
  zip: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
  sha256: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip.sha256'
}

const EXE = process.platform === 'win32' ? '.exe' : ''
const MANIFEST = 'installed.json'

interface Manifest {
  version: string
  binDir: string
  sha256: string
  source: string
  installedAt: string
}

/** The bin folder of a previously installed managed ffmpeg, or null. */
export function managedFfmpegDir(root: string): string | null {
  try {
    const m = JSON.parse(readFileSync(path.join(root, MANIFEST), 'utf8')) as Manifest
    const ok = existsSync(path.join(m.binDir, 'ffmpeg' + EXE)) && existsSync(path.join(m.binDir, 'ffprobe' + EXE))
    return ok ? m.binDir : null
  } catch {
    return null
  }
}

export interface InstallOptions {
  root: string
  onProgress: (p: FfmpegInstallProgress) => void
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  source?: { zip: string; sha256: string }
}

export async function installFfmpeg(opts: InstallOptions): Promise<{ binDir: string; version: string }> {
  const { root, onProgress, signal } = opts
  const doFetch = opts.fetchImpl ?? fetch
  const source = opts.source ?? FFMPEG_SOURCE
  const work = path.join(root, '.download')
  await fsp.rm(work, { recursive: true, force: true })
  await fsp.mkdir(work, { recursive: true })

  try {
    onProgress({ phase: 'downloading', received: 0, total: null, version: null, error: null })

    // 1. Published checksum
    const shaRes = await doFetch(source.sha256, { signal })
    if (!shaRes.ok) throw new Error(`Couldn't get the ffmpeg checksum (HTTP ${shaRes.status}).`)
    const expected = (await shaRes.text()).trim().split(/\s+/)[0].toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('The ffmpeg checksum file was not in the expected format.')

    // 2. Download while hashing
    const res = await doFetch(source.zip, { signal })
    if (!res.ok || !res.body) throw new Error(`ffmpeg download failed (HTTP ${res.status}).`)
    const total = Number(res.headers.get('content-length')) || null
    const version = /ffmpeg-([\d.]+)-essentials/.exec(res.url)?.[1] ?? null
    const zipPath = path.join(work, 'ffmpeg.zip')
    const hash = createHash('sha256')
    let received = 0
    let last = 0
    const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>)
    body.on('data', (chunk: Buffer) => {
      hash.update(chunk)
      received += chunk.length
      const now = Date.now()
      if (now - last > 150) {
        last = now
        onProgress({ phase: 'downloading', received, total, version, error: null })
      }
    })
    await pipeline(body, createWriteStream(zipPath), { signal })
    onProgress({ phase: 'verifying', received, total, version, error: null })

    // 3. Verify
    const actual = hash.digest('hex')
    if (actual !== expected) {
      throw new Error("The downloaded ffmpeg didn't match its published checksum, so it was discarded. Try again in a minute.")
    }

    // 4. Extract (Windows 10+ ships bsdtar, which reads zip)
    onProgress({ phase: 'extracting', received, total, version, error: null })
    const out = path.join(work, 'x')
    await fsp.mkdir(out, { recursive: true })
    await extractZip(zipPath, out)

    // 5. Locate bin/ and move it into place
    const bin = await findBinDir(out)
    if (!bin) throw new Error('The ffmpeg package did not contain ffmpeg and ffprobe.')
    // The package root is the top-level folder in the zip that holds bin/ (or the zip root itself).
    const rel = path.relative(out, bin)
    const pkgRoot = rel ? path.join(out, rel.split(path.sep)[0]) : out
    const finalRoot = path.join(root, `ffmpeg-${version ?? 'release'}`)
    await fsp.rm(finalRoot, { recursive: true, force: true })
    await fsp.rename(pkgRoot, finalRoot)
    const binDir = path.join(finalRoot, path.relative(pkgRoot, bin))

    const manifest: Manifest = {
      version: version ?? 'release',
      binDir,
      sha256: actual,
      source: res.url || source.zip,
      installedAt: new Date().toISOString()
    }
    await fsp.writeFile(path.join(root, MANIFEST), JSON.stringify(manifest, null, 2), 'utf8')
    await removeOtherVersions(root, path.basename(finalRoot))
    onProgress({ phase: 'done', received, total, version, error: null })
    return { binDir, version: manifest.version }
  } catch (e) {
    const aborted = signal?.aborted || (e instanceof Error && e.name === 'AbortError')
    onProgress({
      phase: aborted ? 'cancelled' : 'error',
      received: 0,
      total: null,
      version: null,
      error: aborted ? null : e instanceof Error ? e.message : String(e)
    })
    throw e
  } finally {
    await fsp.rm(work, { recursive: true, force: true }).catch(() => undefined)
  }
}

function extractZip(zip: string, dest: string): Promise<void> {
  const run = (cmd: string, args: string[]): Promise<number> =>
    new Promise((resolve) => {
      const p = spawn(cmd, args, { windowsHide: true, stdio: 'ignore' })
      p.on('error', () => resolve(-1))
      p.on('close', (code) => resolve(code ?? -1))
    })
  return (async () => {
    if ((await run('tar', ['-xf', zip, '-C', dest])) === 0) return
    const ps = `Expand-Archive -LiteralPath '${zip.replace(/'/g, "''")}' -DestinationPath '${dest.replace(/'/g, "''")}' -Force`
    if ((await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps])) === 0) return
    throw new Error('Could not unpack the ffmpeg download.')
  })()
}

async function findBinDir(dir: string, depth = 4): Promise<string | null> {
  if (existsSync(path.join(dir, 'ffmpeg' + EXE)) && existsSync(path.join(dir, 'ffprobe' + EXE))) return dir
  if (depth === 0) return null
  for (const e of await fsp.readdir(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const found = await findBinDir(path.join(dir, e.name), depth - 1)
    if (found) return found
  }
  return null
}

async function removeOtherVersions(root: string, keep: string): Promise<void> {
  for (const e of await fsp.readdir(root, { withFileTypes: true })) {
    if (e.isDirectory() && e.name.startsWith('ffmpeg-') && e.name !== keep) {
      await fsp.rm(path.join(root, e.name), { recursive: true, force: true }).catch(() => undefined)
    }
  }
}
