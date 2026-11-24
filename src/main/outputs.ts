import { existsSync } from 'node:fs'
import path from 'node:path'
import type { OutputSettings } from '../shared/types'

const ILLEGAL = /[<>:"/\\|?*\x00-\x1f]/g
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

export function applyTemplate(
  template: string,
  tokens: { name: string; res: string; codec: string; date: string }
): string {
  let out = (template || '{name}')
    .replace(/\{name\}/g, tokens.name)
    .replace(/\{res\}/g, tokens.res)
    .replace(/\{codec\}/g, tokens.codec)
    .replace(/\{date\}/g, tokens.date)
  out = out.replace(ILLEGAL, '_').replace(/[. ]+$/, '').trim()
  if (!out || RESERVED.test(out)) out = `${tokens.name || 'output'}_converted`
  return out
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface OutputTarget {
  /** Final path, or null when skipped due to conflict policy */
  finalPath: string | null
  /** Temporary path ffmpeg writes to */
  partPath: string | null
  skippedBecauseExists?: string
}

const norm = (p: string): string => path.resolve(p).toLowerCase()

/**
 * Decide where a job writes. `reserved` holds final paths already claimed by other active jobs
 * (two inputs "a.webm" and "a.mkv" must not both become "a.mp4").
 */
export function resolveOutputTarget(
  inputPath: string,
  ext: string,
  output: OutputSettings,
  tokens: { res: string; codec: string },
  reserved: Set<string>,
  exists: (p: string) => boolean = existsSync
): OutputTarget {
  const dir = output.dir || path.dirname(inputPath)
  const name = path.basename(inputPath, path.extname(inputPath))
  const base = applyTemplate(output.filenameTemplate, { name, res: tokens.res, codec: tokens.codec, date: today() })
  const candidate = (i: number): string => path.join(dir, i === 0 ? `${base}.${ext}` : `${base} (${i}).${ext}`)

  const taken = (p: string): boolean => reserved.has(norm(p)) || norm(p) === norm(inputPath)
  let finalPath = candidate(0)

  if (taken(finalPath) || exists(finalPath)) {
    const onlyExistsOnDisk = !taken(finalPath)
    if (onlyExistsOnDisk && output.conflict === 'overwrite') {
      // keep finalPath; we'll replace it on success
    } else if (onlyExistsOnDisk && output.conflict === 'skip') {
      return { finalPath: null, partPath: null, skippedBecauseExists: finalPath }
    } else {
      let i = 1
      while (taken(candidate(i)) || exists(candidate(i))) i++
      finalPath = candidate(i)
    }
  }
  const partPath = path.join(dir, `${path.basename(finalPath, `.${ext}`)}.part.${ext}`)
  return { finalPath, partPath }
}

export function reserveKey(p: string): string {
  return norm(p)
}
