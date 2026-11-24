import type { ReactNode } from 'react'

/** Thin progress line in the current --line ink; null = indeterminate. */
export function ProgressLine({ value, label }: { value: number | null; label?: string }): ReactNode {
  const indeterminate = value == null
  return (
    <div
      className={`pline${indeterminate ? ' pline--indeterminate' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
    >
      <div className="pline__fill" style={indeterminate ? undefined : { transform: `scaleX(${Math.max(0, Math.min(1, value))})` }} />
    </div>
  )
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }): ReactNode {
  return (
    <div className="field">
      <label className="field__label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="field__control">{children}</div>
      {hint ? <div className="field__hint">{hint}</div> : null}
    </div>
  )
}

export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  disabled,
  ariaLabel
}: {
  id?: string
  value: T
  options: Array<{ value: T; label: string; disabled?: boolean }>
  onChange: (v: T) => void
  disabled?: boolean
  ariaLabel?: string
}): ReactNode {
  return (
    <select id={id} aria-label={ariaLabel} className="select" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function NumberInput({
  id,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
  ariaLabel
}: {
  id?: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (v: number) => void
  suffix?: string
  ariaLabel?: string
}): ReactNode {
  return (
    <span className="number-input">
      <input
        id={id}
        aria-label={ariaLabel}
        type="number"
        className="input input--number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
      {suffix ? <span className="number-input__suffix">{suffix}</span> : null}
    </span>
  )
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }): ReactNode {
  return (
    <label className={`checkbox${disabled ? ' checkbox--disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (v: T) => void
  ariaLabel: string
}): ReactNode {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`segmented__item${value === o.value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
