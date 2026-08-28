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
}

export function IconButton({
  children,
  label,
  tooltip,
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
        'anim-press inline-flex h-9 w-9 items-center justify-center rounded-full',
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
