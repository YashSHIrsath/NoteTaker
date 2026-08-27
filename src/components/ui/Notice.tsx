import { AlertCircle, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * A one-or-two-line note under a field — a validation message, or something worth knowing.
 *
 * There were four of these in the scheduling flow and no two looked alike: one was bare red text
 * under the date field, one a tinted slab, one a grey slab, each at its own size. Red body copy
 * sitting loose in a dialog reads as loudly as a heading, which is how the date-field message came
 * to be the largest thing on that screen while saying the smallest thing on it.
 *
 * One shape for all of them: a tinted strip, an icon to carry the tone so the colour isn't doing
 * that job alone, and text a step below the body.
 */
export interface NoticeProps {
  tone?: 'danger' | 'muted'
  children: ReactNode
  className?: string
}

export function Notice({ tone = 'muted', children, className }: NoticeProps) {
  const Icon = tone === 'danger' ? AlertCircle : Info
  return (
    <p
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-1.5 rounded-lg px-2 py-1.5 text-[11px] leading-snug',
        tone === 'danger'
          ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]'
          : 'bg-[var(--color-hover)] text-[var(--color-text-muted)]',
        className,
      )}
    >
      <Icon className="mt-px h-3 w-3 shrink-0" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  )
}
