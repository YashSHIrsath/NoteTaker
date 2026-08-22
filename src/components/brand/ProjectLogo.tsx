import { cn } from '../../lib/cn'

export interface ProjectLogoProps {
  className?: string
  /** Set when the mark stands alone, with no wordmark beside it to name the app. */
  label?: string
}

/**
 * The Mindstack mark, inlined rather than an `<img>` so it inherits `currentColor` — that's what
 * lets one file be dark on the light theme, light on the dark one, accent-coloured on a tinted
 * panel and white on the accent hero, with no second asset and no theme branching.
 *
 * The viewBox is cropped to the bars themselves (the source art carries empty margin around them),
 * so the mark fills the box it's given and sits on the same baseline as text beside it.
 */
export function ProjectLogo({ className, label }: ProjectLogoProps) {
  return (
    <svg
      viewBox="48 22 196 136"
      className={cn('shrink-0', className)}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <g fill="currentColor">
        <rect x="54" y="28" width="28" height="47" rx="6" />
        <rect x="54" y="84" width="28" height="68" rx="6" />
        <rect x="93" y="64" width="28" height="88" rx="6" />
        <rect x="132" y="100" width="28" height="52" rx="6" />
        <rect x="171" y="64" width="28" height="51" rx="6" />
        <rect x="171" y="122" width="28" height="30" rx="6" />
        <rect x="210" y="28" width="28" height="124" rx="6" />
      </g>
    </svg>
  )
}
