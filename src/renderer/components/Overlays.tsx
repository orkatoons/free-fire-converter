import { useEffect, useRef, type ReactNode } from 'react'
import type { Notice, QueueFinishedSummary } from '../../shared/types'
import type { DialogState } from '../state/store'

export function Dialog({ dialog, onClose, onCopy }: { dialog: DialogState | null; onClose: () => void; onCopy: (text: string) => void }): ReactNode {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (dialog && !d.open) d.showModal()
    if (!dialog && d.open) d.close()
  }, [dialog])
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose}>
      {dialog ? (
        <>
          <div className="dialog__head">
            <h2>{dialog.title}</h2>
            <div className="dialog__actions">
              <button type="button" className="btn btn--small" onClick={() => onCopy(dialog.content)}>
                Copy
              </button>
              <button type="button" className="btn btn--small btn--ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
          <pre className={`dialog__body${dialog.kind === 'command' ? ' dialog__body--wrap' : ''}`}>{dialog.content}</pre>
        </>
      ) : null}
    </dialog>
  )
}

export function Notices({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: string) => void }): ReactNode {
  if (!notices.length) return null
  return (
    <div className="notices" role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice notice--${n.level}`}>
          <span>{n.message}</span>
          <button type="button" className="notice__close" aria-label="Dismiss" onClick={() => onDismiss(n.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export function SummaryBanner({
  summary,
  onOpenFolder,
  onDismiss
}: {
  summary: QueueFinishedSummary | null
  onOpenFolder: (dir: string) => void
  onDismiss: () => void
}): ReactNode {
  if (!summary) return null
  const parts = [`${summary.done} converted`]
  if (summary.failed) parts.push(`${summary.failed} failed`)
  if (summary.cancelled) parts.push(`${summary.cancelled} cancelled`)
  if (summary.skipped) parts.push(`${summary.skipped} skipped`)
  const level = summary.failed ? 'warning' : summary.done ? 'success' : 'info'
  return (
    <div className={`banner banner--${level}`} role="status">
      <div>
        <strong>Queue finished:</strong> {parts.join(' · ')}
      </div>
      <div className="banner__actions">
        {summary.outputDirs.map((d) => (
          <button key={d} type="button" className="btn btn--small" onClick={() => onOpenFolder(d)} title={d}>
            Open {summary.outputDirs.length > 1 ? d.split(/[\\/]/).pop() : 'output folder'}
          </button>
        ))}
        <button type="button" className="btn btn--small btn--ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
