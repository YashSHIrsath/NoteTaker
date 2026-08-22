import type { MouseEvent } from 'react'
import { Pin } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useToggleFeedback } from '../../hooks/useToggleFeedback'

export interface PinButtonProps {
  pinned: boolean
  onToggle: () => void
  label?: string
  compact?: boolean
}

export function PinButton({ pinned, onToggle, label, compact = false }: PinButtonProps) {
  const actionLabel = label ?? (pinned ? 'Unpin task' : 'Pin task')
  const popping = useToggleFeedback(pinned)

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    onToggle()
  }

  return (
    <button
      type="button"
      aria-label={actionLabel}
      aria-pressed={pinned}
      onClick={handleClick}
      className={cn(
        'anim-press inline-flex shrink-0 items-center justify-center rounded-full transition-colors',
        compact ? 'h-6 w-6' : 'h-7 w-7',
        pinned
          ? 'text-[var(--color-accent)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]',
        'hover:bg-[var(--color-hover)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/20',
      )}
    >
      <Pin className={cn('h-4 w-4', pinned && 'fill-current', popping && 'anim-pop')} aria-hidden />
    </button>
  )
}
