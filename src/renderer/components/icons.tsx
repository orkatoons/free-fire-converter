// One authored icon set: 20px grid, 1.75 stroke, round caps. Decorative by default (aria-hidden).
import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconPlus = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M10 4v12M4 10h12" />
  </Svg>
)
export const IconFolder = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M2.75 5.5a1.5 1.5 0 0 1 1.5-1.5h3.3l1.7 2h6.5a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H4.25a1.5 1.5 0 0 1-1.5-1.5z" />
  </Svg>
)
export const IconArrowRight = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M4 10h12M11 5l5 5-5 5" />
  </Svg>
)
export const IconAlert = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M10 3 2.5 16.25h15z" />
    <path d="M10 8v3.5M10 14v.01" />
  </Svg>
)
export const IconError = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.25" />
    <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" />
  </Svg>
)
export const IconInfo = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.25" />
    <path d="M10 9v4.5M10 6.5v.01" />
  </Svg>
)
export const IconCheck = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </Svg>
)
export const IconClose = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M5 5l10 10M15 5 5 15" />
  </Svg>
)
export const IconPlay = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M6.5 4.5v11l9-5.5z" />
  </Svg>
)
export const IconReveal = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M2.75 5.5a1.5 1.5 0 0 1 1.5-1.5h3.3l1.7 2h6.5a1.5 1.5 0 0 1 1.5 1.5v1.5" />
    <path d="M2.75 5.5v9a1.5 1.5 0 0 0 1.5 1.5h5" />
    <path d="M12.5 15.5h5M15 13l2.5 2.5L15 18" />
  </Svg>
)
export const IconCommand = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M3.5 6l4 4-4 4M9.5 14.5h7" />
  </Svg>
)
export const IconCopy = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <rect x="7" y="7" width="9.5" height="9.5" rx="1.5" />
    <path d="M13 7V4.75A1.25 1.25 0 0 0 11.75 3.5h-7A1.25 1.25 0 0 0 3.5 4.75v7A1.25 1.25 0 0 0 4.75 13H7" />
  </Svg>
)
export const IconLog = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M5.5 2.75h6.25L15 6v11.25H5.5z" />
    <path d="M8 9.5h4.5M8 12.5h4.5" />
  </Svg>
)
export const IconRemove = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M3.5 5.5h13M8 5.5V3.75h4V5.5M5.5 5.5l.75 11h7.5l.75-11" />
  </Svg>
)
export const IconRetry = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M3.75 10a6.25 6.25 0 1 0 1.9-4.5" />
    <path d="M3.5 3.5v3.5H7" />
  </Svg>
)
export const IconStop = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <rect x="5" y="5" width="10" height="10" rx="1.5" />
  </Svg>
)
export const IconPause = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M7.5 4.5v11M12.5 4.5v11" />
  </Svg>
)
export const IconChevron = (p: IconProps): ReactNode => (
  <Svg {...p}>
    <path d="M6 8l4 4 4-4" />
  </Svg>
)

/** Wordmark glyph: four line inks converging into one interchange. */
export function LineMark({ size = 22 }: { size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2 6h7l5 6" stroke="var(--line-mp4)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 10h6.5l5.5 2" stroke="var(--line-mkv)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 14h6.5l5.5-2" stroke="var(--line-mov)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 18h7l5-6" stroke="var(--line-webm)" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17" cy="12" r="4.2" fill="var(--ground)" stroke="var(--ink)" strokeWidth="2.2" />
    </svg>
  )
}
