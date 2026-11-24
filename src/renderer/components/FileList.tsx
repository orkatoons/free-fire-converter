import type { MouseEvent, ReactNode } from 'react'
import { formatDuration } from '../../shared/format'
import type { Capabilities, ConvertSettings } from '../../shared/types'
import type { JobRowModel } from '../state/hooks'
import {
  IconAlert,
  IconArrowRight,
  IconCommand,
  IconCopy,
  IconError,
  IconInfo,
  IconLog,
  IconPlay,
  IconRemove,
  IconReveal,
  IconRetry,
  IconStop
} from './icons'
import { Route } from './Route'
import { buildRoute } from './routeModel'

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
  convert: ConvertSettings
  caps: Capabilities | null
  selectedCount: number
  onRemoveSelected: () => void
  onClearSelection: () => void
}

export function FileList({ rows, convert, caps, selectedCount, onRemoveSelected, onClearSelection, ...actions }: FileListProps): ReactNode {
  return (
    <section className="jobs" aria-label="Files">
      {selectedCount > 0 ? (
        <div className="jobs__selbar" role="toolbar" aria-label="Selection">
          <span className="jobs__selcount">{selectedCount} selected</span>
          <button type="button" className="btn btn--sm" onClick={onRemoveSelected}>
            <IconRemove /> Remove selected
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClearSelection}>
            Clear selection
          </button>
        </div>
      ) : null}
      <ul className="jobs__list" role="listbox" aria-multiselectable="true" aria-label="Files to convert">
        {rows.map((r) => (
          <JobRow key={r.job.id} row={r} convert={convert} caps={caps} {...actions} />
        ))}
      </ul>
    </section>
  )
}

function JobRow({ row, convert, caps, ...a }: { row: JobRowModel; convert: ConvertSettings; caps: Capabilities | null } & FileListActions): ReactNode {
  const { job } = row
  const route = buildRoute(row, convert, caps)
  const running = job.status === 'running'

  const onClick = (e: MouseEvent): void => {
    if ((e.target as HTMLElement).closest('button, a')) return
    a.onSelect(job.id, e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'single')
  }

  const errors = [...row.errors]
  if (job.error && job.status !== 'ready' && !errors.includes(job.error)) errors.push(job.error)
  const showNotes = job.status === 'ready' || job.status === 'probing'

  return (
    <li
      className={`job job--${job.status}${row.selected ? ' is-selected' : ''}`}
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
      <div className="job__head">
        <span className="job__name" title={job.inputPath}>
          {job.name}
        </span>
        <span className="job__state">
          {running && job.progress != null ? <span className="job__pct">{Math.floor(job.progress * 100)}%</span> : null}
          <span className={`status status--${job.status}`}>{row.statusLabel}</span>
          {row.progressLabel && !running ? <span className="job__meta">{row.progressLabel}</span> : null}
          {running ? <span className="job__meta">{runningMeta(row)}</span> : null}
        </span>
      </div>

      <Route route={route} label={`Conversion plan for ${job.name}`} />

      {errors.length || row.warnings.length || (showNotes && row.notes.length) ? (
        <ul className="notices-inline">
          {errors.map((m, i) => (
            <li key={`e${i}`} className="notice-line notice-line--error">
              <IconError /> <span>{m}</span>
            </li>
          ))}
          {row.warnings.map((m, i) => (
            <li key={`w${i}`} className="notice-line notice-line--warn">
              <IconAlert /> <span>{m}</span>
            </li>
          ))}
          {showNotes
            ? row.notes.map((m, i) => (
                <li key={`n${i}`} className="notice-line notice-line--note">
                  <IconInfo /> <span>{m}</span>
                </li>
              ))
            : null}
        </ul>
      ) : null}

      <div className="job__actions">
        {row.canStartOne ? (
          <button type="button" className="btn btn--sm" onClick={() => a.onStartOne(job.id)}>
            <IconArrowRight /> Convert this file
          </button>
        ) : null}
        {row.canCancel ? (
          <button type="button" className="btn btn--sm" onClick={() => a.onCancel(job.id)}>
            <IconStop /> {job.status === 'queued' ? 'Take out of queue' : 'Cancel'}
          </button>
        ) : null}
        {row.hasOutput ? (
          <>
            <button type="button" className="btn btn--sm" onClick={() => a.onOpen(job.outputPath!)}>
              <IconPlay /> Play
            </button>
            <button type="button" className="btn btn--sm" onClick={() => a.onReveal(job.outputPath!)}>
              <IconReveal /> Show in folder
            </button>
          </>
        ) : null}
        {row.canRetry ? (
          <button type="button" className="btn btn--sm" onClick={() => a.onRetry(job.id)}>
            <IconRetry /> {job.status === 'done' ? 'Convert again' : job.status === 'probe-failed' ? 'Read again' : 'Retry'}
          </button>
        ) : null}
        <span className="job__actions-gap" />
        {job.media ? (
          <>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => a.onShowCommand(job.id)}>
              <IconCommand /> Command
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => a.onCopyCommand(job.id)}>
              <IconCopy /> Copy command
            </button>
          </>
        ) : null}
        {row.hasLog ? (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => a.onShowLog(job.id)}>
            <IconLog /> Log
          </button>
        ) : null}
        {row.canRemove ? (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => a.onRemove(job.id)} aria-label={`Remove ${job.name} from the list`}>
            <IconRemove /> Remove
          </button>
        ) : null}
      </div>
    </li>
  )
}

function runningMeta(row: JobRowModel): string {
  const j = row.job
  const parts: string[] = []
  if (j.speed) parts.push(`${j.speed.toFixed(2)}×`)
  if (j.etaSec != null) parts.push(`${formatDuration(j.etaSec)} left`)
  else if (j.progress == null) parts.push('length unknown')
  return parts.join(' · ')
}
