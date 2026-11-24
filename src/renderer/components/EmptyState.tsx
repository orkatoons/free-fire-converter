import type { ReactNode } from 'react'

export function EmptyState({ onAddFiles, onAddFolder }: { onAddFiles: () => void; onAddFolder: () => void }): ReactNode {
  return (
    <div className="empty">
      <div className="empty__inner">
        <p className="empty__title">Drop videos or folders anywhere in this window</p>
        <p className="empty__sub">Specs are read from each file — resolution, frame rate, HDR, audio — and used as defaults.</p>
        <div className="empty__actions">
          <button type="button" className="btn btn--primary" onClick={onAddFiles}>
            Add files
          </button>
          <button type="button" className="btn" onClick={onAddFolder}>
            Add folder
          </button>
        </div>
        <p className="empty__keys">
          <kbd>Ctrl</kbd>+<kbd>O</kbd> add files · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> start · <kbd>Del</kbd> remove selected
        </p>
      </div>
    </div>
  )
}

export function DropOverlay({ visible }: { visible: boolean }): ReactNode {
  if (!visible) return null
  return (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay__box">Drop to add videos</div>
    </div>
  )
}
