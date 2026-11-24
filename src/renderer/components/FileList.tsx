import type { MouseEvent, ReactNode } from 'react'
import { formatBytes } from '../../shared/format'
import type { JobRowModel } from '../state/hooks'
import { ProgressBar } from './primitives'

export interface FileListActions {
  onSelect: (id: string, mode: 'single' | 'toggle' | 'range') => void
  onRemove: (id: string) => void
  onCancel: (id: string) => void
  onRetry: (id: string) => void
  onStartOne: (id: string) => void
  onReveal: (path: string) => void
  onOpen: (path: string) => void
  onShowLog: (id: string) => void
  onShowCommand: (id: string) => void
  onCopyCommand: (id: string) => void
}

export interface FileListProps extends FileListActions {
  rows: JobRowModel[]
  selectedCount: number
  onRemoveSelected: () => void
  onClearSelection: () => void
}

export function FileList({ rows, selectedCount, onRemoveSelected, onClearSelection, ...actions }: FileListProps): ReactNode {
  return (
    <section className="filelist" aria-label="Files">
      {selectedCount > 0 ? (
        <div className="filelist__selbar">
          <span>{selectedCount} selected</span>
          <button type="button" className="btn btn--small" onClick={onRemoveSelected}>
            Remove selected
          </button>
          <button type="button" className="btn btn--small btn--ghost" onClick={onClearSelection}>
            Clear selection
          </button>
        </div>
      ) : null}
      <ul className="filelist__items" role="listbox" aria-multiselectable="true">
        {rows.map((r) => (
          <FileRow key={r.job.id} row={r} {...actions} />
        ))}
      </ul>
    </section>
  )
}

function FileRow({ row, ...a }: { row: JobRowModel } & FileListActions): ReactNode {
  const { job } = row
  const onClick = (e: MouseEvent): void => {
    if ((e.target as HTMLElement).closest('button, a')) return
    a.onSelect(job.id, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'single')
  }
  return (
    <li
      className={`filerow filerow--${job.status}${row.selected ? ' is-selected' : ''}`}
      role="option"
      aria-selected={row.selected}
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === ' ' && e.target === e.currentTarget) {
          e.preventDefault()
          a.onSelect(job.id, 'toggle')
        }
      }}
    >
      <div className="filerow__main">
        <div className="filerow__name" title={job.inputPath}>
          {job.name}
        </div>
        <div className="filerow__status">
          <span className={`status status--${job.status}`}>{row.statusLabel}</span>
          {row.progressLabel ? <span className="filerow__progress-label">{row.progressLabel}</span> : null}
        </div>
      </div>

      {row.specs.length ? (
        <div className="filerow__specs" aria-label="Source">
          {row.specs.map((s) => (
            <span key={s} className="chip">
              {s}
            </span>
          ))}
        </div>
      ) : null}

      {row.outputSummary ? (
        <div className="filerow__output">
          <span className="filerow__arrow" aria-hidden="true">
            →
          </span>{' '}
          {row.outputSummary}
          {job.status === 'done' && job.outputSizeBytes != null ? ` · ${formatBytes(job.outputSizeBytes)}` : ''}
        </div>
      ) : null}

      {job.status === 'running' || job.status === 'queued' ? (
        <ProgressBar value={job.status === 'queued' ? 0 : job.progress} label={`Progress for ${job.name}`} />
      ) : null}

      {row.errors.length || (job.error && (job.status === 'failed' || job.status === 'probe-failed' || job.status === 'skipped')) ? (
        <div className="filerow__msgs filerow__msgs--error">
          {[...row.errors, ...(job.error && job.status !== 'ready' ? [job.error] : [])].map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      ) : null}
      {row.warnings.length ? (
        <div className="filerow__msgs filerow__msgs--warning">
          {row.warnings.map((m, i) => (
            <div key={i}>⚠ {m}</div>
          ))}
        </div>
      ) : null}
      {row.notes.length && job.status === 'ready' ? (
        <div className="filerow__msgs filerow__msgs--note">
          {row.notes.map((m, i) => (
            <div key={i}>{m}</div>
          ))}
        </div>
      ) : null}

      <div className="filerow__actions">
        {row.canStartOne ? (
          <button type="button" className="btn btn--small" onClick={() => a.onStartOne(job.id)}>
            Convert this
          </button>
        ) : null}
        {row.canCancel ? (
          <button type="button" className="btn btn--small" onClick={() => a.onCancel(job.id)}>
            Cancel
          </button>
        ) : null}
        {row.canRetry ? (
          <button type="button" className="btn btn--small" onClick={() => a.onRetry(job.id)}>
            {job.status === 'done' ? 'Convert again' : 'Retry'}
          </button>
        ) : null}
        {row.hasOutput ? (
          <>
            <button type="button" className="btn btn--small" onClick={() => a.onOpen(job.outputPath!)}>
              Play
            </button>
            <button type="button" className="btn btn--small" onClick={() => a.onReveal(job.outputPath!)}>
              Show in folder
            </button>
          </>
        ) : null}
        {job.media ? (
          <>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => a.onShowCommand(job.id)}>
              Command
            </button>
            <button type="button" className="btn btn--small btn--ghost" onClick={() => a.onCopyCommand(job.id)}>
              Copy command
            </button>
          </>
        ) : null}
        {row.hasLog ? (
          <button type="button" className="btn btn--small btn--ghost" onClick={() => a.onShowLog(job.id)}>
            Log
          </button>
        ) : null}
        {row.canRemove ? (
          <button type="button" className="btn btn--small btn--ghost" onClick={() => a.onRemove(job.id)} aria-label={`Remove ${job.name}`}>
            Remove
          </button>
        ) : null}
      </div>
    </li>
  )
}
