import type { CSSProperties, ReactNode } from 'react'
import type { Container } from '../../shared/types'
import { IconFolder, IconPlus } from './icons'

const TERMINUS: Record<Container, string> = {
  mp4: 'plays everywhere',
  mkv: 'holds any codec',
  mov: 'for Apple and editors',
  webm: 'for the web'
}

export function EmptyState({ container, onAddFiles, onAddFolder }: { container: Container; onAddFiles: () => void; onAddFolder: () => void }): ReactNode {
  return (
    <div className="empty">
      <div className="empty__inner">
        <h2 className="empty__title">Drop videos or folders anywhere in this window</h2>
        <p className="empty__sub">
          Each file’s real specs are read first. You see the whole route before anything is converted, and the original is never touched.
        </p>

        <div className="route route--ready route--explainer" style={{ '--line': `var(--line-${container})` } as CSSProperties} aria-hidden="true">
          <div className="route__track">
            <div className="route__travelled" />
          </div>
          <ol className="route__stations">
            <li className="station station--origin">
              <span className="station__dot" />
              <span className="station__title">Your video</span>
              <span className="station__detail">WebM, MKV, MOV, MP4 and more</span>
            </li>
            <li className="station station--step">
              <span className="station__dot" />
              <span className="station__title">Match source</span>
              <span className="station__detail">resolution, frame rate, HDR</span>
            </li>
            <li className="station station--terminus">
              <span className="station__dot" />
              <span className="station__title">{container.toUpperCase()}</span>
              <span className="station__detail">{TERMINUS[container]}</span>
            </li>
          </ol>
        </div>

        <div className="empty__actions">
          <button type="button" className="btn btn--primary" onClick={onAddFiles}>
            <IconPlus /> Add files
          </button>
          <button type="button" className="btn" onClick={onAddFolder}>
            <IconFolder /> Add folder
          </button>
        </div>
        <p className="empty__keys">
          <kbd>Ctrl</kbd> <kbd>O</kbd> add files <span aria-hidden="true">·</span> <kbd>Ctrl</kbd> <kbd>Enter</kbd> convert{' '}
          <span aria-hidden="true">·</span> <kbd>Del</kbd> remove selected
        </p>
      </div>
    </div>
  )
}

export function DropOverlay({ visible }: { visible: boolean }): ReactNode {
  if (!visible) return null
  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay__frame">
        <span className="drop-overlay__text">Drop to add</span>
        <span className="drop-overlay__sub">Videos and folders of videos</span>
      </div>
    </div>
  )
}
