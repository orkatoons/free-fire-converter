// Real download of ffmpeg (~115 MB). Opt-in: set FFMPEG_DOWNLOAD_TEST=1.
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { installFfmpeg, managedFfmpegDir } from '../../src/main/ffmpeg/install'
import { runCapture } from '../../src/main/ffmpeg/proc'
import type { FfmpegInstallProgress } from '../../src/shared/types'

const run = process.env.FFMPEG_DOWNLOAD_TEST === '1'

describe.skipIf(!run)('ffmpeg download', () => {
  it('downloads, verifies, unpacks and runs ffmpeg', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'fc-ffmpeg-'))
    const phases = new Set<FfmpegInstallProgress['phase']>()
    try {
      const { binDir, version } = await installFfmpeg({ root, onProgress: (p) => phases.add(p.phase) })
      expect(phases).toEqual(new Set(['downloading', 'verifying', 'extracting', 'done']))
      expect(managedFfmpegDir(root)).toBe(binDir)
      const r = await runCapture(path.join(binDir, 'ffmpeg.exe'), ['-hide_banner', '-version'])
      expect(r.stdout).toContain(`ffmpeg version ${version}`)
      console.log('installed ffmpeg', version, 'at', binDir)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 600_000)

  it('rejects a checksum mismatch and leaves nothing installed', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'fc-ffmpeg-bad-'))
    const fakeFetch: typeof fetch = async (input, init) => {
      if (String(input).endsWith('.sha256')) return new Response('0'.repeat(64))
      return fetch(input, init)
    }
    let error: string | null = null
    try {
      await expect(
        installFfmpeg({ root, fetchImpl: fakeFetch, onProgress: (p) => p.error && (error = p.error) })
      ).rejects.toThrow(/checksum/)
      expect(error).toMatch(/checksum/)
      expect(managedFfmpegDir(root)).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 600_000)
})
