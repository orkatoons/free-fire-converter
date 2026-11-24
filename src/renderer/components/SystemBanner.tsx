import type { ReactNode } from 'react'
import { formatBytes } from '../../shared/format'
import type { Capabilities, FfmpegInstallProgress } from '../../shared/types'
import { IconAlert, IconArrowRight, IconError, IconFolder, IconInfo, IconRetry, IconStop } from './icons'
import { ProgressLine } from './primitives'

export interface SystemBannerProps {
  caps: Capabilities | null
  loading: boolean
  verifiedHardware: string[]
  install: FfmpegInstallProgress | null
  onDownloadFfmpeg: () => void
  onCancelDownload: () => void
  onPickFfmpegDir: () => void
  onRetry: () => void
}

const ACTIVE: Array<FfmpegInstallProgress['phase']> = ['downloading', 'verifying', 'extracting']

/** Shows only when something needs attention: ffmpeg missing or downloading, no GPU encoder, or still checking. */
export function SystemBanner({ caps, loading, verifiedHardware, install, onDownloadFfmpeg, onCancelDownload, onPickFfmpegDir, onRetry }: SystemBannerProps): ReactNode {
  if (install && ACTIVE.includes(install.phase)) {
    const pct = install.total ? install.received / install.total : null
    const what =
      install.phase === 'downloading'
        ? `Downloading ffmpeg${install.version ? ` ${install.version}` : ''}${install.total ? ` — ${formatBytes(install.received)} of ${formatBytes(install.total)}` : ''}`
        : install.phase === 'verifying'
          ? 'Checking the download against its published checksum…'
          : 'Unpacking ffmpeg…'
    return (
      <div className="banner banner--info banner--install" role="status" aria-live="polite">
        <IconInfo className="banner__icon" />
        <div className="banner__body">
          <div>{what}</div>
          <ProgressLine value={install.phase === 'downloading' ? pct : null} label="ffmpeg download progress" />
        </div>
        <div className="banner__actions">
          {install.phase === 'downloading' ? (
            <button type="button" className="btn btn--sm" onClick={onCancelDownload}>
              <IconStop /> Cancel
            </button>
          ) : null}
        </div>
      </div>
    )
  }
  if (loading && !caps) {
    return (
      <div className="banner banner--info" role="status">
        <IconInfo className="banner__icon" />
        <div className="banner__body">Checking ffmpeg and testing your GPU encoders…</div>
      </div>
    )
  }
  if (!caps) return null
  if (!caps.ffmpegFound) {
    const failed = install?.phase === 'error'
    return (
      <div className="banner banner--error" role="alert">
        <IconError className="banner__icon" />
        <div className="banner__body">
          <strong>This app needs ffmpeg to convert files.</strong> Download it now (about 115 MB, one time, from gyan.dev’s official
          Windows builds), or point to a copy you already have.
          {failed ? <div className="banner__detail">The last download didn’t finish: {install?.error}</div> : null}
        </div>
        <div className="banner__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={onDownloadFfmpeg}>
            {failed ? <IconRetry /> : <IconArrowRight />} {failed ? 'Try download again' : 'Download ffmpeg'}
          </button>
          <button type="button" className="btn btn--sm" onClick={onPickFfmpegDir}>
            <IconFolder /> I have it…
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onRetry} disabled={loading}>
            <IconRetry /> {loading ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </div>
    )
  }
  if (verifiedHardware.length === 0) {
    return (
      <div className="banner banner--warn" role="status">
        <IconAlert className="banner__icon" />
        <div className="banner__body">
          No GPU encoder passed its test, so files will convert on the CPU: same quality, slower. Updating your graphics driver
          usually fixes this.
        </div>
        <div className="banner__actions">
          <button type="button" className="btn btn--sm" onClick={onRetry} disabled={loading}>
            <IconRetry /> {loading ? 'Checking…' : 'Test again'}
          </button>
        </div>
      </div>
    )
  }
  return null
}
