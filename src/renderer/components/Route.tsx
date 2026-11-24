import type { CSSProperties, ReactNode } from 'react'
import { IconCheck } from './icons'
import type { RouteModel } from './routeModel'

/** A file's conversion drawn as one transit line: origin -> interchanges -> terminus. */
export function Route({ route, label }: { route: RouteModel; label: string }): ReactNode {
  const { mode, origin, steps, terminus, progress, line } = route
  const style = {
    '--line': `var(--line-${line})`,
    '--p': progress ?? 0
  } as CSSProperties

  if (mode === 'probing') {
    return (
      <div className="route route--probing" style={style} aria-label="Reading file">
        <div className="route__track" />
        <p className="route__placeholder">Reading the file’s specs…</p>
      </div>
    )
  }
  if (mode === 'unreadable' || !origin) return null

  const showMarker = mode === 'running' && progress != null
  const indeterminate = mode === 'running' && progress == null
  const stationsText = [origin.title, ...steps, terminus?.title].filter(Boolean).join(', then ')

  return (
    <div
      className={`route route--${mode}${indeterminate ? ' route--indeterminate' : ''}`}
      style={style}
      role="img"
      aria-label={`${label}: ${stationsText}`}
    >
      <div className="route__track" aria-hidden="true">
        <div className="route__travelled" />
      </div>
      {showMarker ? <span className="route__marker" aria-hidden="true" /> : null}
      <ol className="route__stations" aria-hidden="true">
        <li className="station station--origin">
          <span className="station__dot" />
          <span className="station__title">{origin.title}</span>
          {origin.detail ? <span className="station__detail">{origin.detail}</span> : null}
        </li>
        {steps.map((s) => (
          <li key={s} className="station station--step">
            <span className="station__dot" />
            <span className="station__title">{s}</span>
          </li>
        ))}
        {terminus ? (
          <li className="station station--terminus">
            <span className="station__dot">{mode === 'done' ? <IconCheck size={10} strokeWidth={3} /> : null}</span>
            <span className="station__title">{terminus.title}</span>
            {terminus.detail ? <span className="station__detail">{terminus.detail}</span> : null}
          </li>
        ) : null}
      </ol>
    </div>
  )
}
