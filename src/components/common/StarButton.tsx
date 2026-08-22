import type { MouseEvent } from 'react'
import { Star } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useToggleFeedback } from '../../hooks/useToggleFeedback'

export interface StarButtonProps {
  important: boolean
  onToggle: () => void
  label?: string
  compact?: boolean
  className?: string
}

export function StarButton({
  important,
  onToggle,
  label,
  compact = false,
  className,
}: StarButtonProps) {
  const actionLabel = label ?? (important ? 'Remove from Important' : 'Mark as Important')
  // Pops in both directions: starring and unstarring are both worth acknowledging.
  const popping = useToggleFeedback(important)

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
      onClick={handleClick}
      className={cn(
        'anim-press inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
        compact ? 'h-6 w-6' : 'h-7 w-7',
        important
          ? 'text-[var(--color-accent)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
        'hover:bg-[var(--color-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
        className,
      )}
    >
      <Star className={cn('h-4 w-4', important && 'fill-current', popping && 'anim-pop')} aria-hidden />
    </button>
  )
}
