import type { ReactNode } from 'react'
import type { Capabilities } from '../../shared/types'
import { IconAlert, IconError, IconFolder, IconInfo, IconRetry } from './icons'

export interface SystemBannerProps {
  caps: Capabilities | null
  loading: boolean
  verifiedHardware: string[]
  onPickFfmpegDir: () => void
  onRetry: () => void
}

/** Shows only when something is wrong (ffmpeg missing / no GPU encoder) or still being checked. */
export function SystemBanner({ caps, loading, verifiedHardware, onPickFfmpegDir, onRetry }: SystemBannerProps): ReactNode {
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
    return (
      <div className="banner banner--error" role="alert">
        <IconError className="banner__icon" />
        <div className="banner__body">
          <strong>ffmpeg isn’t installed or can’t be found.</strong> Nothing can be converted until it is. Install it with{' '}
          <code>winget install ffmpeg</code>, or point to the folder that contains ffmpeg.exe and ffprobe.exe.
          {caps.error ? <div className="banner__detail">{caps.error}</div> : null}
        </div>
        <div className="banner__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={onPickFfmpegDir}>
            <IconFolder /> Locate ffmpeg…
          </button>
          <button type="button" className="btn btn--sm" onClick={onRetry} disabled={loading}>
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
