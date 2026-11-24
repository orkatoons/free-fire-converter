import type { ReactNode } from 'react'
import { formatDuration } from '../../shared/format'
import type { QueueState } from '../../shared/types'
import type { Totals } from '../state/hooks'
import { ProgressBar } from './primitives'

export interface FooterProps {
  queue: QueueState
  totals: Totals
  outputLabel: string
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onCancelAll: () => void
  onClearFinished: () => void
}

export function Footer({ queue, totals, outputLabel, onStart, onPause, onResume, onCancelAll, onClearFinished }: FooterProps): ReactNode {
  return (
    <footer className="footer">
      <div className="footer__info">
        <div className="footer__output" title={outputLabel}>
          Output: {outputLabel}
        </div>
        {queue.running ? (
          <div className="footer__progress">
            <ProgressBar value={totals.overallProgress} label="Overall progress" />
            <span>
              {totals.runDone}/{totals.runCount} files
              {totals.overallProgress != null ? ` · ${Math.floor(totals.overallProgress * 100)}%` : ''}
              {totals.overallEtaSec != null ? ` · ~${formatDuration(totals.overallEtaSec)} left` : ''}
              {queue.paused ? ' · pausing after current file' : ''}
            </span>
          </div>
        ) : (
          <div className="footer__counts">
            {totals.total === 0
              ? 'No files yet'
              : `${totals.ready} ready${totals.done ? ` · ${totals.done} done` : ''}${totals.failed ? ` · ${totals.failed} failed` : ''}`}
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
                Resume
              </button>
            ) : (
              <button type="button" className="btn" onClick={onPause} title="Finish the current file(s), then stop">
                Pause after current
              </button>
            )}
            <button type="button" className="btn btn--danger" onClick={onCancelAll}>
              Cancel all
            </button>
          </>
        ) : null}
        {!queue.running || totals.ready > 0 ? (
          <button type="button" className="btn btn--primary btn--large" onClick={onStart} disabled={!totals.canStart} title="Start (Ctrl+Enter)">
            {queue.running
              ? `Add ${totals.ready} to queue`
              : totals.ready
                ? `Convert ${totals.ready} file${totals.ready === 1 ? '' : 's'}`
                : 'Convert'}
          </button>
        ) : null}
      </div>
    </footer>
  )
}
