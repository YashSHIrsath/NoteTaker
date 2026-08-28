import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  label: string
  /**
   * The hover tooltip, when it should be shorter than the label.
   *
   * `label` is what a screen reader announces, and there it has to be unambiguous among everything
   * else on the page — "Invite someone to Team Of Aeres" rather than "Invite". But the browser draws
   * `title` as an unwrapped native box at the pointer, so a label that long spilled off the edge of
   * the screen from a button already sitting near it. Sighted users have the card's own name three
   * inches away; they only need the verb.
   */
  tooltip?: string
  /**
   * 'responsive' (the default) is 32px on a phone and 36 from `sm` up. 'compact' is 32 everywhere,
   * for the places sized to fit something else — the sidebar footer's pill, built around a 28px
   * avatar. 'none' emits no size at all, for a caller that sets its own.
   *
   * A prop rather than a className override, because `cn` is a plain join with no Tailwind-aware
   * merging: a caller passing `h-6 w-6` keeps the base's `sm:h-9` as well, and the responsive
   * variant then wins at every width above the breakpoint. That is exactly what happened to the two
   * 24px triggers on the cards when the responsive default arrived — they grew to 36px on desktop.
   */
  box?: 'responsive' | 'compact' | 'none'
}

const BOX_CLASSES: Record<'responsive' | 'compact' | 'none', string> = {
  responsive: 'h-8 w-8 sm:h-9 sm:w-9',
  compact: 'h-8 w-8',
  none: '',
}

export function IconButton({
  children,
  label,
  tooltip,
  box = 'responsive',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={tooltip ?? label}
      className={cn(
        // Four of these sit in the header — spaces, history, theme, the way out — beside a logo and
        // a search field, which do not fit a narrow screen at 36px without squeezing the search box:
        // the one control there that actually needs the room.
        'anim-press inline-flex items-center justify-center rounded-full',
        BOX_CLASSES[box],
        'text-[var(--color-text-muted)] transition-colors',
        'hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
