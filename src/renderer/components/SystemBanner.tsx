import type { ReactNode } from 'react'
import type { Capabilities } from '../../shared/types'

export interface SystemBannerProps {
  caps: Capabilities | null
  loading: boolean
  verifiedHardware: string[]
  onPickFfmpegDir: () => void
  onRetry: () => void
}

/** Shows only when something is wrong (ffmpeg missing / no GPU encoder). */
export function SystemBanner({ caps, loading, verifiedHardware, onPickFfmpegDir, onRetry }: SystemBannerProps): ReactNode {
  if (loading && !caps) {
    return <div className="banner banner--info" role="status">Checking ffmpeg and GPU encoders…</div>
  }
  if (!caps) return null
  if (!caps.ffmpegFound) {
    return (
      <div className="banner banner--error" role="alert">
        <div>
          <strong>ffmpeg wasn't found.</strong> Install it (e.g. <code>winget install ffmpeg</code>) or point to the folder containing
          ffmpeg.exe and ffprobe.exe.
          {caps.error ? <div className="banner__detail">{caps.error}</div> : null}
        </div>
        <div className="banner__actions">
          <button type="button" className="btn btn--primary" onClick={onPickFfmpegDir}>
            Locate ffmpeg…
          </button>
          <button type="button" className="btn" onClick={onRetry} disabled={loading}>
            {loading ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </div>
    )
  }
  if (verifiedHardware.length === 0) {
    return (
      <div className="banner banner--warning" role="status">
        No GPU encoder passed the hardware test — converting on the CPU (slower, same quality). Update GPU drivers and click
        “Check again” to retry.
        <div className="banner__actions">
          <button type="button" className="btn" onClick={onRetry} disabled={loading}>
            {loading ? 'Checking…' : 'Check again'}
          </button>
        </div>
      </div>
    )
  }
  return null
}
