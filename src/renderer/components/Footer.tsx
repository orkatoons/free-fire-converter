import type { CSSProperties, ReactNode } from 'react'
import { formatDuration } from '../../shared/format'
import type { Container, QueueState } from '../../shared/types'
import type { JobRowModel, Totals } from '../state/hooks'
import { IconArrowRight, IconFolder, IconPause, IconPlay, IconStop } from './icons'
import { ProgressLine } from './primitives'

export interface FooterProps {
  queue: QueueState
  totals: Totals
  rows: JobRowModel[]
  container: Container
  outputLabel: string
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onCancelAll: () => void
  onClearFinished: () => void
}

export function Footer({ queue, totals, rows, container, outputLabel, onStart, onPause, onResume, onCancelAll, onClearFinished }: FooterProps): ReactNode {
  const run = rows.filter((r) => queue.runIds.includes(r.job.id))
  const startLabel = queue.running
    ? `Add ${totals.ready} to queue`
    : totals.ready
      ? `Convert ${totals.ready} file${totals.ready === 1 ? '' : 's'}`
      : 'Convert'

  return (
    <footer className="footer">
      <div className="footer__info">
        {queue.running ? (
          <>
            <div className="runline" style={{ '--line': `var(--line-${container})` } as CSSProperties} aria-hidden="true">
              {run.map((r) => (
                <span key={r.job.id} className={`runline__stop runline__stop--${r.job.status}`} title={r.job.name} />
              ))}
            </div>
            <div className="footer__progress">
              <ProgressLine value={totals.overallProgress} label="Overall progress" />
              <span className="footer__figures">
                {totals.runDone} of {totals.runCount} done
                {totals.overallProgress != null ? ` · ${Math.floor(totals.overallProgress * 100)}%` : ''}
                {totals.overallEtaSec != null ? ` · about ${formatDuration(totals.overallEtaSec)} left` : ''}
              </span>
              {queue.paused ? <span className="footer__paused">Pausing after the current file</span> : null}
            </div>
          </>
        ) : (
          <div className="footer__idle">
            <span className="footer__figures">
              {totals.total === 0
                ? 'No files yet'
                : `${totals.ready} ready${totals.done ? ` · ${totals.done} done` : ''}${totals.failed ? ` · ${totals.failed} failed` : ''}`}
            </span>
            <span className="footer__output" title={outputLabel}>
              <IconFolder /> {outputLabel}
            </span>
          </div>
        )}
      </div>
      <div className="footer__actions">
        {totals.finished > 0 && !queue.running ? (
          <button type="button" className="btn btn--ghost" onClick={onClearFinished}>
            Clear finished
          </button>
        ) : null}
        {queue.running ? (
          <>
            {queue.paused ? (
              <button type="button" className="btn" onClick={onResume}>
                <IconPlay /> Resume
              </button>
            ) : (
              <button type="button" className="btn" onClick={onPause} title="Finish the current file, then stop">
                <IconPause /> Pause after this file
              </button>
            )}
            <button type="button" className="btn btn--danger" onClick={onCancelAll}>
              <IconStop /> Cancel all
            </button>
          </>
        ) : null}
        {!queue.running || totals.ready > 0 ? (
          <button type="button" className="btn btn--primary btn--lg" onClick={onStart} disabled={!totals.canStart} title="Convert (Ctrl+Enter)">
            {startLabel} <IconArrowRight />
          </button>
        ) : null}
      </div>
    </footer>
  )
}
