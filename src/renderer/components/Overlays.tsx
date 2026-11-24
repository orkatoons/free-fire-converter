import { useEffect, useRef, type ReactNode } from 'react'
import type { Notice, QueueFinishedSummary } from '../../shared/types'
import type { DialogState } from '../state/store'
import { IconAlert, IconCheck, IconClose, IconCopy, IconError, IconFolder, IconInfo } from './icons'

export function Dialog({ dialog, onClose, onCopy }: { dialog: DialogState | null; onClose: () => void; onCopy: (text: string) => void }): ReactNode {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (dialog && !d.open) d.showModal()
    if (!dialog && d.open) d.close()
  }, [dialog])
  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onCancel={onClose} aria-labelledby="dialog-title">
      {dialog ? (
        <>
          <div className="dialog__head">
            <h2 id="dialog-title" className="dialog__title">
              {dialog.title}
            </h2>
            <div className="dialog__actions">
              <button type="button" className="btn btn--sm" onClick={() => onCopy(dialog.content)}>
                <IconCopy /> Copy
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={onClose} aria-label="Close">
                <IconClose /> Close
              </button>
            </div>
          </div>
          <pre className={`dialog__body${dialog.kind === 'command' ? ' dialog__body--wrap' : ''}`}>{dialog.content}</pre>
        </>
      ) : null}
    </dialog>
  )
}

const NOTICE_ICON = { info: IconInfo, success: IconCheck, warning: IconAlert, error: IconError } as const

export function Notices({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: string) => void }): ReactNode {
  if (!notices.length) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {notices.map((n) => {
        const Icon = NOTICE_ICON[n.level]
        return (
          <div key={n.id} className={`toast toast--${n.level}`}>
            <Icon className="toast__icon" />
            <span className="toast__text">{n.message}</span>
            <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => onDismiss(n.id)}>
              <IconClose />
            </button>
          </div>
        )
      })}
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
  const level = summary.failed ? 'warn' : summary.done ? 'ok' : 'info'
  const Icon = summary.failed ? IconAlert : summary.done ? IconCheck : IconInfo
  return (
    <div className={`banner banner--${level}`} role="status">
      <Icon className="banner__icon" />
      <div className="banner__body">
        <strong>All done.</strong> {parts.join(' · ')}
        {summary.failed ? ' — open a failed file’s Log to see why.' : ''}
      </div>
      <div className="banner__actions">
        {summary.outputDirs.map((d) => (
          <button key={d} type="button" className="btn btn--sm" onClick={() => onOpenFolder(d)} title={d}>
            <IconFolder /> Open {summary.outputDirs.length > 1 ? d.split(/[\\/]/).pop() : 'output folder'}
          </button>
        ))}
        <button type="button" className="btn btn--sm btn--ghost" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
