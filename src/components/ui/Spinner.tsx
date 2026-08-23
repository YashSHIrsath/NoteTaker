import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface SpinnerProps {
  className?: string
  /** Announced by screen readers. Omit where adjacent text already says what's happening. */
  label?: string
}

/**
 * The inline wait: a button mid-submit, a banner while a save is in flight. Distinct from
 * LoadingSplash on purpose — the brand animation belongs to the whole screen stopping, and
 * putting it inside a 20px button would only make it unreadable.
 *
 * It inherits `currentColor` and its size from the class it's given, so one component covers the
 * white-on-accent button, the muted banner, and everything between.
 */
export function Spinner({ className, label }: SpinnerProps) {
  return (
    <Loader2
      className={cn('h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none', className)}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}
