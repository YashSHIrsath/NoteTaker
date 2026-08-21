import type { MouseEvent } from 'react'
import { Star } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface StarButtonProps {
  important: boolean
  onToggle: () => void
  label?: string
  compact?: boolean
}

export function StarButton({
  important,
  onToggle,
  label,
  compact = false,
}: StarButtonProps) {
  const actionLabel = label ?? (important ? 'Remove from Important' : 'Mark as Important')

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onToggle()
  }

  return (
    <button
      type="button"
      aria-label={actionLabel}
      aria-pressed={important}
      title={actionLabel}
      onClick={handleClick}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md',
        compact ? 'h-6 w-6' : 'h-7 w-7',
        important
          ? 'text-[var(--color-text)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
        'hover:bg-[var(--color-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
      )}
    >
      <Star className={cn('h-4 w-4', important && 'fill-current')} aria-hidden />
    </button>
  )
}
